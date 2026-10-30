import { ServiceUnavailableException } from '@nestjs/common';
import { PlanillasService } from './planillas.service';
function harness(banks: any, sessions: any) {
  const queries: any = {};
  const from = jest.fn((table: string) => {
    const q: any = { select: jest.fn(() => q), eq: jest.fn(() => q), ilike: jest.fn(() => q), or: jest.fn(() => q), order: jest.fn(() => q),
      then: (resolve: any) => Promise.resolve(table === 'cuentas_bancarias' ? banks : sessions).then(resolve) };
    queries[table] = q;return q;
  });
  const service = Object.create(PlanillasService.prototype);
  service.supabaseService = { getClient: () => ({ from }) };
  return { service, queries };
}
describe('Destinos de pago de planilla: dos fuentes completas', () => {
  it.each(['banks', 'sessions'])('rechaza fallo de %s sin devolver destinos parciales', async source => {
    const fail = { data: [], error: { code: '08006' } }, ok = { data: [], error: null };
    const h = harness(source === 'banks' ? fail : ok, source === 'sessions' ? fail : ok);
    await expect(h.service.getDestinosTesoreriaPlanilla('tenant', 'actor')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each([null, undefined, {}])('rechaza bancos incompletos %s', async data => {
    await expect(harness({ data, error: null }, { data: [], error: null }).service.getDestinosTesoreriaPlanilla('tenant', 'actor')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each([null, undefined, {}])('rechaza sesiones incompletas %s', async data => {
    await expect(harness({ data: [], error: null }, { data, error: null }).service.getDestinosTesoreriaPlanilla('tenant', 'actor')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('acepta dos fuentes vacías confirmadas', async () => {
    await expect(harness({ data: [], error: null }, { data: [], error: null }).service.getDestinosTesoreriaPlanilla('tenant', 'actor')).resolves.toEqual({ success: true, data: { cuentas_bancarias: [], sesiones_caja: [] } });
  });
  it('filtra bancos por empresa/actividad y sesiones abiertas no congeladas del pagador', async () => {
    const banks = [{ id: 'bank' }], sessions = [{ id: 'session' }];const h = harness({ data: banks, error: null }, { data: sessions, error: null });
    await expect(h.service.getDestinosTesoreriaPlanilla('tenant', 'actor')).resolves.toEqual({ success: true, data: { cuentas_bancarias: banks, sesiones_caja: sessions } });
    expect(h.queries.cuentas_bancarias.eq).toHaveBeenCalledWith('tenant_id', 'tenant');
    expect(h.queries.cuentas_bancarias.eq).toHaveBeenCalledWith('activa', true);expect(h.queries.cuentas_bancarias.eq).toHaveBeenCalledWith('activo', true);
    expect(h.queries.sesiones_caja.eq).toHaveBeenCalledWith('tenant_id', 'tenant');expect(h.queries.sesiones_caja.eq).toHaveBeenCalledWith('congelada', false);expect(h.queries.sesiones_caja.ilike).toHaveBeenCalledWith('estado', 'abierta');
    expect(h.queries.sesiones_caja.or).toHaveBeenCalledWith('cajero_id.eq.actor,usuario_id.eq.actor,abierto_por.eq.actor,usuario_apertura.eq.actor');
  });
});
