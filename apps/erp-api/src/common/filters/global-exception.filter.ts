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
  timestamp: string;
  path: string;
  tenantId?: string;
  userId?: string;
  requestId?: string;
}

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
      if (normalizedMessage.includes('duplicate key value') || normalizedMessage.includes('unique constraint')) {
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
    const errorResponse: ErrorResponse = {
      statusCode,
      message: this.sanitizeMessage(message, statusCode),
      error,
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
    // Convert array messages to string
    if (Array.isArray(message)) {
      message = message.join(', ');
    }

    // In production, don't expose internal server error details
    if (process.env.NODE_ENV === 'production' && statusCode >= 500) {
      return 'An unexpected error occurred. Please try again later.';
    }

    // Sanitize database error messages
    if (message.includes('duplicate key value')) {
      return 'A record with this information already exists';
    }

    if (message.includes('foreign key constraint')) {
      return 'Cannot perform this operation due to related records';
    }

    if (message.includes('violates check constraint')) {
      return 'Invalid data provided';
    }

    return message;
  }
}
