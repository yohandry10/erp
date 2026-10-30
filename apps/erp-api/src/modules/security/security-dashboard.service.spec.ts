import { ServiceUnavailableException } from '@nestjs/common';
import { SecurityDashboardService } from './security-dashboard.service';

const metrics = [
  { metric: 'periodo', value: '7' },
  { metric: 'total_violations', value: '1502' },
  { metric: 'critical_violations', value: '3' },
  { metric: 'unique_users', value: '1201' },
  { metric: 'tables_affected', value: '2' },
];

function build() {
  const alerts = { count: 4, error: null } as any;
  const pending = { count: 2, error: null } as any;
  const rows = { data: [], error: null } as any;
  const chain: any = {
    select: jest.fn(() => chain),
    order: jest.fn(() => chain),
    gte: jest.fn(async () => alerts),
    eq: jest.fn(async () => pending),
    limit: jest.fn(async () => rows),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  const client = { from: jest.fn(() => chain), rpc: jest.fn().mockResolvedValue({ data: metrics, error: null }) };
  const service = new SecurityDashboardService({ getClient: () => client } as any);
  return { service, client, chain, alerts, pending, rows };
}

describe('SecurityDashboardService', () => {
  it('conserva estadísticas SQL completas, incluso más de1000usuarios', async () => {
    const { service, client } = build();
    await expect(service.getDashboardStats(7)).resolves.toEqual({ period: '7 días', totalViolations: 1502, criticalViolations: 3, uniqueUsers: 1201, tablesAffected: 2, totalAlerts: 4, unacknowledgedAlerts: 2 });
    expect(client.rpc).toHaveBeenCalledWith('generate_rls_security_report', { p_days: 7 });
  });

  it.each(['alerts', 'pending'] as const)('rechaza error de %s sin inventar ceros', async (source) => {
    const state = build(); state[source].error = { message: 'provider-private-detail' };
    await expect(state.service.getDashboardStats()).rejects.toThrow(ServiceUnavailableException);
    await expect(state.service.getDashboardStats()).rejects.not.toThrow('provider-private-detail');
  });

  it.each([null, undefined, -1, 1.5])('rechaza un conteo incompleto o inválido: %s', async (count) => {
    const state = build(); state.alerts.count = count;
    await expect(state.service.getDashboardStats()).rejects.toThrow(ServiceUnavailableException);
  });

  it.each([null, {}, [{ metric: 'total_violations', value: '0' }], [...metrics.slice(0, 3), { metric: 'unique_users', value: 'NaN' }]])('rechaza informe incompleto o malformado', async (data) => {
    const state = build(); state.client.rpc.mockResolvedValue({ data, error: null } as any);
    await expect(state.service.getDashboardStats()).rejects.toThrow(ServiceUnavailableException);
  });

  it('distingue un informe vacío válido de una consulta fallida', async () => {
    const state = build(); state.alerts.count = 0; state.pending.count = 0;
    state.client.rpc.mockResolvedValue({ data: metrics.map(row => ({ ...row, value: '0' })), error: null });
    await expect(state.service.getDashboardStats()).resolves.toEqual({ period: '7 días', totalViolations: 0, criticalViolations: 0, uniqueUsers: 0, tablesAffected: 0, totalAlerts: 0, unacknowledgedAlerts: 0 });
  });

  it.each(['getViolationsByTable','getRecentViolations','getViolationsByUser','getViolationsHourly','getRecentAlerts','getUnacknowledgedAlerts'] as const)('%s no confunde una fuente fallida con una lista vacía', async (method) => {
    const state = build(); state.rows.error = { message: 'provider-private-detail' };
    await expect(state.service[method]()).rejects.toThrow(ServiceUnavailableException);
    state.rows.error = null; state.rows.data = null;
    await expect(state.service[method]()).rejects.toThrow(ServiceUnavailableException);
    state.rows.data = [];
    await expect(state.service[method]()).resolves.toEqual([]);
  });
});
