import { ArgumentsHost, BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
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
        message: 'A record with this information already exists',
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

  describe('en producción', () => {
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
