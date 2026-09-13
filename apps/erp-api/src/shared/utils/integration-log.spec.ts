import { appendIntegrationLog } from './integration-log';
import { IntegrationAlertsService } from '../../modules/notifications/integration-alerts.service';
import { RecepcionesService } from '../../modules/compras/services/recepciones.service';
import { CxcService } from '../../modules/finanzas/cxc/cxc.service';
import { CxpService } from '../../modules/finanzas/cxp/cxp.service';
import { InventarioService } from '../../modules/inventario/inventario.service';
import { BackgroundJobsService } from '../jobs/background-jobs.service';

describe('registro canónico de integraciones', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';
  const entry = { tenant_id: tenant, servicio: 'SUNAT', operacion: 'SEND', status: 'ERROR',
    error_message: 'Authorization: Bearer private-token', metadata: { solPassword: 'private-password' } };
  const accepted = (_name: string, args: any) => Promise.resolve({ data: { id: args.p_event_id, idempotent: false }, error: null });

  it('conserva identidad tras perder una respuesta después del commit y depura secretos', async () => {
    const rpc = jest.fn(accepted).mockRejectedValueOnce(new Error('connection lost'));
    await appendIntegrationLog({ rpc }, entry);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/private-token|private-password/);
    expect(entry.metadata.solPassword).toBe('private-password');
  });

  it.each([{}, { data: {} }, { data: { id: 'wrong', idempotent: false } }])('rechaza confirmación incompleta %j', async result => {
    const rpc = jest.fn().mockResolvedValue(result);
    await expect(appendIntegrationLog({ rpc }, entry)).rejects.toThrow('INTEGRATION_LOG_WRITE_UNCONFIRMED');
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('no reintenta permisos denegados ni expone el mensaje del proveedor', async () => {
    const rpc = jest.fn().mockResolvedValue({ error: { code: '42501', message: 'password=private-value' } });
    await expect(appendIntegrationLog({ rpc }, entry)).rejects.toThrow(/^INTEGRATION_LOG_WRITE_UNCONFIRMED$/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('admite reintento confirmado como idempotente y normaliza metadatos nulos', async () => {
    const rpc = jest.fn(async (_name, args) => ({ data: { id: args.p_event_id, idempotent: true } }));
    await appendIntegrationLog({ rpc }, { ...entry, metadata: null });
    expect(rpc.mock.calls[0][1].p_event.metadata).toEqual({});
  });

  it.each([
    ['recepciones', RecepcionesService, 'registrarIntegrationLog'],
    ['CxC', CxcService, 'registrarIntegrationLog'],
    ['CxP', CxpService, 'registrarIntegrationLog'],
    ['inventario', InventarioService, 'registrarIntegrationLog'],
    ['alertas', IntegrationAlertsService, 'recordSuccess'],
    ['jobs', BackgroundJobsService, 'logJob'],
  ] as const)('%s persiste por RPC sin reabrir escrituras directas', async (_name, Service, method) => {
    const rpc = jest.fn(accepted);
    const from = jest.fn(() => { throw new Error('Escritura directa prohibida'); });
    const service: any = Object.create(Service.prototype);
    service.supabase = { getClient: () => ({ rpc, from }), getPublicClient: () => ({ rpc, from }) };
    service.notifications = { createNotification: jest.fn() };
    service.logger = { error: jest.fn() };
    if (method === 'logJob') await service[method]('job', tenant, 'SUCCESS');
    else await service[method]({ tenantId: tenant, servicio: 'TEST', operacion: 'TEST', status: 'SUCCESS' });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('registrar_auditoria_backend_tx', expect.objectContaining({ p_tenant_id: tenant, p_kind: 'integration' }));
    expect(service.logger.error).not.toHaveBeenCalled();
  });

  it('la alerta al usuario también oculta credenciales de un error externo', async () => {
    const rpc = jest.fn(accepted);
    const notifications = { createNotification: jest.fn() };
    const service = new IntegrationAlertsService({ getClient: () => ({ rpc }) } as any, notifications as any);
    await service.recordError({ tenantId: tenant, servicio: 'SUNAT', operacion: 'SEND', errorMessage: entry.error_message });
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(notifications.createNotification.mock.calls)).not.toContain('private-token');
  });
});
