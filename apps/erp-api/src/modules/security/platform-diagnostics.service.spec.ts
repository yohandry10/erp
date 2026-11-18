import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PlatformDiagnosticsService } from './platform-diagnostics.service';
import * as sentry from '../../shared/observability/sentry';

describe('PlatformDiagnosticsService', () => {
  function build(env: Record<string, string | undefined>, email: Partial<{ isConfigured: jest.Mock; sendEmail: jest.Mock }> = {}) {
    const emailService = {
      isConfigured: jest.fn().mockReturnValue(true),
      sendEmail: jest.fn().mockResolvedValue(true),
      ...email,
    };
    const config = { get: jest.fn((key: string) => env[key]) };
    return { service: new PlatformDiagnosticsService(emailService as any, config as any), emailService };
  }

  afterEach(() => jest.restoreAllMocks());

  it('envía la prueba sólo al dominio del remitente configurado', async () => {
    const { service, emailService } = build({ EMAIL_FROM_ADDRESS: 'web@empresa.test' });
    const result = await service.enviarCorreoPrueba(' Operaciones@Empresa.test ');
    expect(emailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'operaciones@empresa.test' }));
    expect(result.data).toMatchObject({ destinatario: 'operaciones@empresa.test', remitente: 'web@empresa.test' });
  });

  it('no sirve de relay hacia otros dominios', async () => {
    const { service, emailService } = build({ EMAIL_FROM_ADDRESS: 'web@empresa.test' });
    await expect(service.enviarCorreoPrueba('alguien@otro.test')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.enviarCorreoPrueba('x@empresa.test.otro.test')).rejects.toBeInstanceOf(BadRequestException);
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('rechaza sin remitente configurado', async () => {
    const { service } = build({});
    await expect(service.enviarCorreoPrueba('a@empresa.test')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('informa si el correo no está configurado o el servidor rechaza', async () => {
    const sinTransporte = build({ EMAIL_FROM_ADDRESS: 'web@empresa.test' }, { isConfigured: jest.fn().mockReturnValue(false) });
    await expect(sinTransporte.service.enviarCorreoPrueba('a@empresa.test')).rejects.toBeInstanceOf(ServiceUnavailableException);
    const rechazado = build({ EMAIL_FROM_ADDRESS: 'web@empresa.test' }, { sendEmail: jest.fn().mockResolvedValue(false) });
    await expect(rechazado.service.enviarCorreoPrueba('a@empresa.test')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('devuelve el id del evento de Sentry con entorno y release del despliegue', async () => {
    jest.spyOn(sentry, 'sendDiagnosticEvent').mockResolvedValue({ eventId: 'abc123', delivered: true });
    const { service } = build({ APP_COMMIT_SHA: 'a'.repeat(40) });
    await expect(service.enviarEventoSentry()).resolves.toMatchObject({
      data: { event_id: 'abc123', tipo: 'PlatformDiagnosticError', entorno: 'production', release: 'a'.repeat(40) },
    });
  });

  it('informa si Sentry no está configurado o no confirma la entrega', async () => {
    const { service } = build({});
    jest.spyOn(sentry, 'sendDiagnosticEvent').mockResolvedValueOnce(null);
    await expect(service.enviarEventoSentry()).rejects.toBeInstanceOf(ServiceUnavailableException);
    jest.spyOn(sentry, 'sendDiagnosticEvent').mockResolvedValueOnce({ eventId: 'x', delivered: false });
    await expect(service.enviarEventoSentry()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
