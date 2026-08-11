import { BadRequestException } from '@nestjs/common';
import { SireService } from './sire.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const reportId = '33333333-3333-4333-8333-333333333333';
const cpeId = '44444444-4444-4444-8444-444444444444';
const eventId = '55555555-5555-4555-8555-555555555555';

class QueryMock {
  readonly filters: Array<{ op: string; column: string; value: unknown }> = [];

  constructor(private readonly result: { data: any; error: any; count?: number }) {}

  select() { return this; }
  order() { return this; }
  eq(column: string, value: unknown) { this.filters.push({ op: 'eq', column, value }); return this; }
  gte(column: string, value: unknown) { this.filters.push({ op: 'gte', column, value }); return this; }
  lt(column: string, value: unknown) { this.filters.push({ op: 'lt', column, value }); return this; }
  in(column: string, value: unknown) { this.filters.push({ op: 'in', column, value }); return this; }
  maybeSingle() { return Promise.resolve(this.result); }
  then(resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve(this.result).then(resolve, reject);
  }
}

function createService(options: {
  rpc?: jest.Mock;
  tableResults?: Record<string, { data: any; error: any; count?: number }>;
} = {}) {
  const queries: Record<string, QueryMock[]> = {};
  const rpc = options.rpc ?? jest.fn(async () => ({ data: {}, error: null }));
  const client = {
    rpc,
    from: jest.fn((table: string) => {
      const query = new QueryMock(
        options.tableResults?.[table] ?? { data: [], error: null },
      );
      queries[table] = [...(queries[table] ?? []), query];
      return query;
    }),
  };
  const eventBus = { onComprobanteCreadoEvent: jest.fn() };
  const api = { aceptarPropuesta: jest.fn(), consultarTicket: jest.fn() };
  const service = new SireService(
    { getClient: jest.fn(() => client) } as any,
    eventBus as any,
    { getTenantId: jest.fn(() => tenantId) } as any,
    api as any,
  );
  return { service, client, rpc, eventBus, api, queries };
}

describe('SireService contrato atómico 463', () => {
  it('registra el CPE y congela el reporte usando sólo las dos RPC del evento', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: { report: { id: reportId } }, error: null })
      .mockResolvedValueOnce({ data: { id: reportId, estado: 'GENERADO' }, error: null });
    const { service, client } = createService({ rpc });

    await service.procesarComprobanteParaSire({ tenantId, cpeId, eventId });

    expect(rpc).toHaveBeenNthCalledWith(1, 'registrar_comprobante_sire_tx', {
      p_tenant_id: tenantId,
      p_cpe_id: cpeId,
      p_event_id: eventId,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'finalizar_generacion_sire_evento_tx', {
      p_tenant_id: tenantId,
      p_reporte_id: reportId,
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('propaga al worker durable un fallo de la proyección para que el outbox reintente', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { code: 'XX001', message: 'fallo inducido' },
    });
    const { eventBus } = createService({ rpc });
    const listener = eventBus.onComprobanteCreadoEvent.mock.calls[0][0];

    await expect(listener({
      module: 'outbox-worker',
      data: { tenantId, cpeId, eventId },
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('genera el snapshot con actor, metadatos y clave idempotente exactos', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { id: reportId, estado: 'GENERADO', idempotent: false },
      error: null,
    });
    const { service, client } = createService({ rpc });

    const result = await service.generarReporte({
      tipoReporte: 'REGISTRO_VENTAS',
      periodo: '2026-08',
      formato: 'TXT',
      incluirAnulados: true,
    }, tenantId, actorId, 'sire-generate-2026-08-rvie');

    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith('generar_reporte_sire_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_tipo: 'REG_VEN',
      p_periodo: '2026-08',
      p_metadata: { formato: 'TXT', incluirAnulados: true },
      p_idempotency_key: 'sire-generate-2026-08-rvie',
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('descarga la instantánea congelada y no reconstruye contenido desde CPE/CxP vivos', async () => {
    const { service, client } = createService({
      tableResults: {
        sire_files: {
          data: {
            id: reportId,
            filename: 'SIRE_REG_VEN_2026-08.txt',
            estado: 'GENERADO',
            contenido_local: 'HEADER\nROW',
            contenido_sha256: 'abc123',
            source_cutoff_at: '2026-08-31T23:59:59Z',
            source_fingerprint: 'fingerprint',
          },
          error: null,
        },
      },
    });

    const result = await service.downloadReporte(reportId, tenantId);

    expect(result.data).toBe('HEADER\nROW');
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledWith('sire_files');
  });

  it('aplica filtros canónicos y no anuncia libros ajenos a RVIE/RCE', async () => {
    const { service, queries } = createService({
      tableResults: {
        sire_files: {
          data: [{ id: reportId, periodo: '2026-08', tipo: 'REG_COM', estado: 'ENVIADO' }],
          error: null,
        },
      },
    });

    const result = await service.getReportes({
      periodo: '2026-08',
      tipoReporte: 'REGISTRO_COMPRAS',
      estado: 'ENVIADO',
    }, tenantId);

    expect(result.data[0].tipo_display).toBe('Registro de Compras');
    expect(queries.sire_files[0].filters).toEqual(expect.arrayContaining([
      { op: 'eq', column: 'tenant_id', value: tenantId },
      { op: 'eq', column: 'periodo', value: '2026-08' },
      { op: 'eq', column: 'tipo', value: 'REG_COM' },
      { op: 'eq', column: 'estado', value: 'ENVIADO' },
    ]));
    await expect(service.generarReporte({
      tipoReporte: 'LIBRO_DIARIO' as any,
      periodo: '2026-08',
    }, tenantId, actorId, 'sire-invalid-book')).rejects.toBeInstanceOf(BadRequestException);
  });
});
