import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  code?: string;
  timestamp: string;
  path: string;
  tenantId?: string;
  userId?: string;
  requestId?: string;
}

/**
 * Códigos internos cuyo motivo el usuario necesita para poder corregir algo.
 * El resto se reemplaza por un texto genérico según el estado HTTP.
 */
const MENSAJES_POR_CODIGO: Record<string, string> = {
  SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED:
    'La nota del proveedor no concilia con el valor contable de la factura, los pagos o las notas anteriores. No se registró la nota. Solicita al responsable contable revisar el origen y su distribución.',
  SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED:
    'El crédito del proveedor no concilia con su valor contable y sus movimientos anteriores. No se aplicó la operación. Solicita al responsable contable revisar la nota, las aplicaciones y los reembolsos.',
  CASH_FX_BOOK_REVIEW_REQUIRED:
    'La caja en moneda extranjera no concilia con su valor contable y sus movimientos anteriores. No se aplicó el pago. Solicita al responsable contable revisar la apertura, las operaciones y sus asientos.',
  CXP_FX_BOOK_REVIEW_REQUIRED:
    'La deuda del proveedor en moneda extranjera no concilia con su valor contable y sus pagos anteriores. No se aplicó el pago. Solicita al responsable contable revisar la apertura o factura y sus movimientos.',
  BANK_FX_BOOK_REVIEW_REQUIRED:
    'El banco en moneda extranjera no concilia con su valor contable y sus movimientos anteriores. No se aplicó el pago. Solicita al responsable contable revisar la apertura, las operaciones y sus asientos.',
  CXC_FX_BOOK_REVIEW_REQUIRED:
    'La deuda en moneda extranjera no concilia con su valor contable y sus movimientos anteriores. No se aplicó la operación. Solicita al responsable contable revisar el origen y los cobros o notas previos.',
  CPE_ACCOUNTING_CURRENCY_REVIEW_REQUIRED:
    'La factura y sus ajustes no concilian con el tipo de cambio por redondeo. No se emitió el comprobante. Solicita al responsable contable revisar los importes.',
  CPE_ACCOUNTING_CURRENCY_SNAPSHOT_INVALID:
    'Los importes o el tipo de cambio de la factura no son válidos. No se emitió el comprobante. Revisa los datos antes de volver a emitir.',
  RMA_FX_CREDIT_REVIEW_REQUIRED:
    'La conversión de esta devolución no concilia con los importes originales o las notas anteriores. No se emitió la nota de crédito. Solicita al responsable contable revisar el tipo de cambio y los saldos acumulados.',
  RMA_CREDIT_NOTE_PRIOR_ROUNDING_REVIEW_REQUIRED:
    'Las notas de crédito anteriores no concilian con los importes de la línea original. No se emitió otra nota. Solicita al responsable contable revisar esas notas antes de continuar.',
  RMA_SOURCE_LINE_TOTALS_INCONSISTENT:
    'Los importes de las líneas de la factura original no coinciden con su cabecera. No se emitió la nota de crédito. Solicita revisar el comprobante original.',
  RMA_CREDIT_NOTE_SOURCE_AMOUNTS_INVALID:
    'Las cantidades o los importes de la devolución no concilian con la línea original. No se emitió la nota de crédito. Recarga la devolución y solicita revisar su origen.',
  SUPPLIER_INVOICE_PERIOD_NOT_OPEN:
    'El período contable de la fecha del documento no está abierto. No se registró la factura. Elige una fecha de un período abierto o solicita al responsable contable revisar el cierre.',
  SUPPLIER_INVOICE_AMOUNT_OUT_OF_RANGE:
    'El documento supera el máximo admitido de 999.999.999.999,99. No se registró; corrige los importes e inténtalo nuevamente.',
  BANK_STATEMENT_OPENING_BALANCE_MISMATCH_REQUIRES_PRIOR_PERIOD:
    'El saldo inicial del extracto no coincide con el saldo de apertura que el sistema calcula para este período '
    + '(saldo inicial de la cuenta más los movimientos anteriores). Revisa el saldo inicial de la cuenta bancaria '
    + 'o concilia primero el período anterior.',
  BANK_STATEMENT_ALREADY_IMPORTED: 'Este período ya tiene un extracto importado.',
  BANK_RECONCILIATION_DIFFERENCE_REQUIRES_EXPLICIT_ACCOUNTED_ADJUSTMENT:
    'Los saldos del banco y del sistema no cuadran; registra el ajuste contable antes de cerrar la conciliación.',
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Extract tenant and user context from request
    const tenantId = (request as any).user?.tenant_id;
    const userId = (request as any).user?.sub || (request as any).user?.id;
    const requestId = request.headers['x-request-id'] as string;

    // Determine status code and error message
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'INTERNAL_SERVER_ERROR';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || message;
        error = (exceptionResponse as any).error || exception.name;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;

      const normalizedMessage = message.toLowerCase();
      const parserError = exception as Error & { type?: string; status?: number };
      if (parserError.type === 'entity.too.large' && parserError.status === 413) {
        statusCode = HttpStatus.PAYLOAD_TOO_LARGE;
        message = 'El archivo o solicitud supera el tamaño permitido';
        error = 'PAYLOAD_TOO_LARGE';
      } else if (parserError.type === 'entity.parse.failed' && parserError.status === 400) {
        statusCode = HttpStatus.BAD_REQUEST;
        message = 'El cuerpo JSON de la solicitud no es válido';
        error = 'BAD_REQUEST';
      } else if (normalizedMessage.includes('duplicate key value') || normalizedMessage.includes('unique constraint')) {
        statusCode = HttpStatus.CONFLICT;
        error = 'CONFLICT';
      } else if (
        normalizedMessage.includes('foreign key constraint') ||
        normalizedMessage.includes('violates check constraint') ||
        normalizedMessage.includes('invalid input syntax')
      ) {
        statusCode = HttpStatus.BAD_REQUEST;
        error = 'BAD_REQUEST';
      }
    }

    // Build error response
    const internalCode = this.internalCode(message);
    const errorResponse: ErrorResponse = {
      statusCode,
      message: this.sanitizeMessage(message, statusCode),
      error,
      // El código interno sigue disponible para quien lo necesite, fuera del texto.
      ...(internalCode ? { code: internalCode } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Add context for logging but not for client response
    const logContext = {
      ...errorResponse,
      tenantId,
      userId,
      requestId,
      method: request.method,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    };

    // Log error with full context
    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${statusCode} - ${message}`,
        exception instanceof Error ? exception.stack : undefined,
        JSON.stringify(logContext)
      );
    } else if (statusCode >= 400) {
      this.logger.warn(
        `${request.method} ${request.url} - ${statusCode} - ${message}`,
        JSON.stringify(logContext)
      );
    }

    // Send response to client (without sensitive internal details)
    response.status(statusCode).json(errorResponse);
  }

  /**
   * Sanitize error messages to avoid exposing internal details in production
   */
  private sanitizeMessage(message: string | string[], statusCode: number): string {
    const internalCode = this.internalCode(message);
    // Convert array messages to string
    if (Array.isArray(message)) {
      message = message.join(', ');
    }

    // En producción un 5xx no expone detalles internos, pero el texto llega a una
    // UI en español y debe decir qué hacer: un 503 es reintentable. Antes todo
    // 5xx (incluidos los 503 legibles) se volvía un mensaje genérico en inglés.
    if (process.env.NODE_ENV === 'production' && statusCode >= 500) {
      return statusCode === 503
        ? 'El servicio no está disponible en este momento. Inténtalo de nuevo en unos minutos.'
        : 'Ocurrió un error inesperado. Inténtalo de nuevo más tarde.';
    }

    // Textos de PostgreSQL: llegan a una UI en español (antes se traducían al inglés).
    if (message.includes('duplicate key value')) {
      return 'Ya existe un registro con estos datos';
    }

    if (message.includes('foreign key constraint')) {
      return 'No se puede completar la operación porque hay registros relacionados';
    }

    if (message.includes('violates check constraint')) {
      return 'Los datos enviados no son válidos';
    }

    if (/invalid input syntax for type uuid/i.test(message)) {
      return 'El identificador no es válido';
    }

    // Un código interno (p. ej. INVENTORY_MASTER_PRODUCT_NOT_FOUND) no es un texto
    // para el usuario: se reemplaza según el estado y se conserva en `code`.
    if (internalCode && MENSAJES_POR_CODIGO[internalCode]) {
      return MENSAJES_POR_CODIGO[internalCode];
    }
    if (internalCode) {
      if (statusCode === 404) return 'No se encontró el registro solicitado';
      if (statusCode === 409) return 'La operación no es compatible con el estado actual del registro';
      if (statusCode === 403) return 'No tienes permiso para realizar esta operación';
      return 'La solicitud no se pudo procesar con los datos enviados';
    }

    return message;
  }

  private internalCode(message: string | string[]): string | null {
    if (Array.isArray(message) && message.length > 0 && message.every(value => value === message[0])) {
      return this.internalCode(message[0]);
    }
    const text = Array.isArray(message) ? message.join(', ') : String(message ?? '');
    return /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(text.trim()) ? text.trim() : null;
  }
}
