import { SecurityDashboardService } from './security-dashboard.service';

describe('SecurityDashboardService', () => {
  it('construye estadísticas desde auditoría RLS y alertas', async () => {
    const tableCalls: Record<string, number> = {};
    const client = {
      from: jest.fn((table: string) => {
        tableCalls[table] = (tableCalls[table] || 0) + 1;
        const callIndex = tableCalls[table];
        const chain: any = {
          select: jest.fn((select?: string, options?: any) => {
            chain.__select = select;
            chain.__isCount = options?.count === 'exact';
            return chain;
          }),
          eq: jest.fn(() => {
            chain.__eq = true;
            return chain;
          }),
          gte: jest.fn(() => {
            if (table === 'rls_audit_log' && chain.__isCount) {
              return Promise.resolve({ count: chain.__eq ? 3 : 7 });
            }
            if (table === 'rls_alert_history' && chain.__isCount) {
              return Promise.resolve({ count: 4 });
            }
            if (table === 'rls_audit_log' && chain.__select === 'user_id') {
              return Promise.resolve({ data: [{ user_id: 'u1' }, { user_id: 'u1' }, { user_id: 'u2' }] });
            }
            if (table === 'rls_audit_log' && chain.__select === 'table_name') {
              return Promise.resolve({ data: [{ table_name: 'ventas' }, { table_name: 'compras' }, { table_name: 'ventas' }] });
            }
            return Promise.resolve({});
          }),
          then: (resolve: any) => {
            if (table === 'rls_alert_history' && chain.__eq) {
              return Promise.resolve({ count: 2 }).then(resolve);
            }
            return Promise.resolve({}).then(resolve);
          },
        };
        return chain;
      }),
    };

    const service = new SecurityDashboardService({ getClient: () => client } as any);
    const stats = await service.getDashboardStats(7);

    expect(stats.period).toBe('7 días');
    expect(stats.totalViolations).toBe(7);
    expect(stats.criticalViolations).toBe(3);
    expect(stats.uniqueUsers).toBe(2);
    expect(stats.tablesAffected).toBe(2);
    expect(stats.totalAlerts).toBe(4);
    expect(stats.unacknowledgedAlerts).toBe(2);
  });
});
