import { SireService } from './sire.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const reportId = '22222222-2222-4222-8222-222222222222';

class FlowQuery {
  private action: 'select' | 'insert' | 'update' = 'select';
  private payload: any;
  private filters: Array<[string, any]> = [];

  constructor(
    private readonly table: string,
    private readonly state: { report: any; operations: any[] },
  ) {}

  select() { return this; }
  eq(column: string, value: any) { this.filters.push([column, value]); return this; }
  in() { return this; }
  order() { return this; }
  limit() { return this; }
  insert(payload: any) { this.action = 'insert'; this.payload = payload; return this; }
  update(payload: any) { this.action = 'update'; this.payload = payload; return this; }

  async single() {
    if (this.action === 'insert') {
      const row = { ...this.payload };
      this.state.operations.push(row);
      return { data: row, error: null };
    }
    if (this.table === 'sire_files') return { data: { ...this.state.report }, error: null };
    return { data: this.state.operations.at(-1) || null, error: null };
  }

  async maybeSingle() { return this.single(); }

  then(resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) {
    const execute = async () => {
      if (this.action === 'insert') {
        this.state.operations.push({ ...this.payload });
      } else if (this.action === 'update') {
        if (this.table === 'sire_files') {
          Object.assign(this.state.report, this.payload);
        } else {
          const id = this.filters.find(([column]) => column === 'id')?.[1];
          const operation = this.state.operations.find((row) => row.id === id);
          if (operation) Object.assign(operation, this.payload);
        }
      }
      return { data: null, error: null };
    };
    return execute().then(resolve, reject);
  }
}

function createFlowService() {
  const state = {
    report: {
      id: reportId,
      tenant_id: tenantId,
      tipo: 'REG_VEN',
      periodo: '2026-08',
      estado: 'GENERADO',
      sunat_ticket: null,
    } as any,
    operations: [] as any[],
  };
  const client = { from: jest.fn((table: string) => new FlowQuery(table, state)) };
  const api = {
    aceptarPropuesta: jest.fn(async () => ({
      ticket: '20260100000001',
      httpStatus: 200,
      responseSummary: { numTicket: '20260100000001' },
    })),
    consultarTicket: jest.fn(),
  };
  const service = new SireService(
    { getClient: jest.fn(() => client) } as any,
    { onComprobanteCreadoEvent: jest.fn() } as any,
    { getTenantId: jest.fn(() => tenantId) } as any,
    api as any,
  );
  return { service, api, state };
}

describe('SireService flujo SUNAT', () => {
  it('un ticket recién recibido queda PENDIENTE y nunca se presenta como ENVIADO', async () => {
    const { service, state } = createFlowService();

    const result = await service.enviarSunat(reportId, tenantId, 'user-1');

    expect(result.data.estado).toBe('PENDIENTE');
    expect(state.report.estado).toBe('PENDIENTE');
    expect(state.report.sunat_ticket).toBe('20260100000001');
    expect(state.operations[0].estado).toBe('PROCESANDO');
  });

  it('sólo cambia a ENVIADO cuando SUNAT confirma estado 06 Terminado', async () => {
    const { service, api, state } = createFlowService();
    await service.enviarSunat(reportId, tenantId, 'user-1');
    api.consultarTicket.mockResolvedValue({
      ticket: '20260100000001',
      codigoEstado: '06',
      descripcionEstado: 'Terminado',
      terminado: true,
      conErrores: false,
      httpStatus: 200,
      responseSummary: { registros: [] },
    });

    const result = await service.consultarTicket(reportId, tenantId, 'user-1');

    expect(result.data.estado).toBe('ENVIADO');
    expect(state.report.estado).toBe('ENVIADO');
    expect(state.report.sunat_aceptado_at).toBeTruthy();
  });
});
