import { ArgumentsHost, BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

function createHost() {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = {
    method: 'POST',
    url: '/api/test',
    headers: {},
    ip: '127.0.0.1',
    user: { id: 'user-1', tenant_id: 'tenant-1' },
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, response };
}

describe('GlobalExceptionFilter API contract', () => {
  it.each([
    ['CXP_FX_BOOK_REVIEW_REQUIRED', /proveedor.*moneda extranjera.*No se aplicó.*contable/i],
    ['SUPPLIER_CREDIT_FX_BOOK_REVIEW_REQUIRED', /crédito del proveedor.*No se aplicó.*contable/i],
    ['SUPPLIER_NOTE_FX_BOOK_REVIEW_REQUIRED', /nota del proveedor.*No se registró.*contable/i],
    ['BANK_FX_BOOK_REVIEW_REQUIRED', /banco.*moneda extranjera.*No se aplicó.*contable/i],
    ['CXC_FX_BOOK_REVIEW_REQUIRED', /moneda extranjera.*No se aplicó.*contable/i],
    ['CPE_ACCOUNTING_CURRENCY_REVIEW_REQUIRED', /factura.*redondeo.*No se emitió.*contable/i],
    ['CPE_ACCOUNTING_CURRENCY_SNAPSHOT_INVALID', /tipo de cambio.*No se emitió.*Revisa/i],
    ['RMA_FX_CREDIT_REVIEW_REQUIRED', /conversión.*No se emitió.*tipo de cambio/i],
    ['RMA_CREDIT_NOTE_PRIOR_ROUNDING_REVIEW_REQUIRED', /notas.*anteriores.*No se emitió.*responsable contable/i],
    ['RMA_SOURCE_LINE_TOTALS_INCONSISTENT', /factura original.*cabecera.*No se emitió/i],
    ['RMA_CREDIT_NOTE_SOURCE_AMOUNTS_INVALID', /cantidades.*importes.*No se emitió/i],
  ])('D25 explica %s sin ocultar su código', (code, expected) => {
    const { host, response } = createHost();
    new GlobalExceptionFilter().catch(new BadRequestException(code), host);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 400, code, message: expect.stringMatching(expected),
    }));
  });
  it('B-09 explica el rechazo de factura por período cerrado y la acción siguiente', () => {
    const { host, response } = createHost();
    new GlobalExceptionFilter().catch(new BadRequestException('SUPPLIER_INVOICE_PERIOD_NOT_OPEN'), host);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 400, code: 'SUPPLIER_INVOICE_PERIOD_NOT_OPEN',
      message: expect.stringMatching(/período contable.*abierto.*fecha.*abierto/i),
    }));
  });
  it('D-13 conserva el código repetido de validación monetaria y explica cómo corregirlo', () => {
    const { host, response } = createHost();
    new GlobalExceptionFilter().catch(new BadRequestException([
      'SUPPLIER_INVOICE_AMOUNT_OUT_OF_RANGE', 'SUPPLIER_INVOICE_AMOUNT_OUT_OF_RANGE',
    ]), host);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 400, code: 'SUPPLIER_INVOICE_AMOUNT_OUT_OF_RANGE',
      message: expect.stringContaining('999.999.999.999,99'),
    }));
  });
  it('preserva 409 para conflictos de dominio', () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = createHost();

    filter.catch(new ConflictException('El registro ya existe'), host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message: 'El registro ya existe',
        error: 'Conflict',
      }),
    );
  });

  it('mapea duplicados de base de datos a 409 en vez de 500', () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = createHost();

    filter.catch(new Error('duplicate key value violates unique constraint "proveedores_ruc_key"'), host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message: 'Ya existe un registro con estos datos',
        error: 'CONFLICT',
      }),
    );
  });

  it('preserva 400 con mensaje util para errores de validacion', () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = createHost();

    filter.catch(new BadRequestException(['fecha_desde debe ser una fecha valida']), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'fecha_desde debe ser una fecha valida',
      }),
    );
  });

  it('reemplaza un código interno por un texto en español y lo conserva en code', () => {
    const filter = new GlobalExceptionFilter();
    const missing = createHost();
    filter.catch(new NotFoundException('ADMIN_USER_NOT_FOUND'), missing.host);
    expect(missing.response.json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 404,
      message: 'No se encontró el registro solicitado',
      code: 'ADMIN_USER_NOT_FOUND',
    }));

    const legible = createHost();
    filter.catch(new NotFoundException('Pedido no encontrado'), legible.host);
    expect(legible.response.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Pedido no encontrado' }));
  });

  it('explica el motivo de un código que el usuario puede corregir y conserva code', () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = createHost();
    filter.catch(new BadRequestException('BANK_STATEMENT_OPENING_BALANCE_MISMATCH_REQUIRES_PRIOR_PERIOD'), host);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 400,
      message: expect.stringContaining('saldo inicial del extracto no coincide'),
      code: 'BANK_STATEMENT_OPENING_BALANCE_MISMATCH_REQUIRES_PRIOR_PERIOD',
    }));
  });

  describe('en producción', () => {
    it('explica la revisión de caja en divisa y conserva su código', () => {
      const filter = new GlobalExceptionFilter();
      const { host, response } = createHost();
      filter.catch(new BadRequestException('CASH_FX_BOOK_REVIEW_REQUIRED'), host);
      expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 400, code: 'CASH_FX_BOOK_REVIEW_REQUIRED', message: expect.stringContaining('No se aplicó el pago'),
      }));
    });
    const previous = process.env.NODE_ENV;
    beforeEach(() => { process.env.NODE_ENV = 'production'; });
    afterEach(() => { process.env.NODE_ENV = previous; });

    it('oculta el detalle de un 5xx con un texto en español que dice qué hacer', () => {
      const filter = new GlobalExceptionFilter();
      const unavailable = createHost();
      filter.catch(new ServiceUnavailableException('detalle interno de la base'), unavailable.host);
      expect(unavailable.response.json).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 503,
        message: 'El servicio no está disponible en este momento. Inténtalo de nuevo en unos minutos.',
      }));

      const crashed = createHost();
      filter.catch(new Error('relation "x" does not exist'), crashed.host);
      expect(crashed.response.json).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 500,
        message: 'Ocurrió un error inesperado. Inténtalo de nuevo más tarde.',
      }));
    });
  });
});
