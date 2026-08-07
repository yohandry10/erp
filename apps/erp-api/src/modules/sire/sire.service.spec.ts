import { BadRequestException } from '@nestjs/common';
import { SireService } from './sire.service';

const tenantId = '11111111-1111-4111-8111-111111111111';

class QueryMock {
  filters: Array<{ op: string; column: string; value?: unknown; operator?: string }> = [];
  selected = '';
  orderedBy = '';
  inserted: unknown;
  updated: unknown;

  constructor(
    readonly table: string,
    private readonly rows: any[] = [],
    private readonly error: any = null,
  ) {}

  select(columns = '*') {
    this.selected = String(columns);
    return this;
  }

  insert(payload: unknown) {
    this.inserted = payload;
    return this;
  }

  update(payload: unknown) {
    this.updated = payload;
    return this;
  }

  limit() {
    return this;
  }

  order(column: string) {
    this.orderedBy = column;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ op: 'eq', column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ op: 'gte', column, value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ op: 'lt', column, value });
    return this;
  }

  in(column: string, value: unknown) {
    this.filters.push({ op: 'in', column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    this.filters.push({ op: 'not', column, operator, value });
    return this;
  }

  single() {
    return Promise.resolve({ data: this.rows[0] ?? null, error: this.error });
  }

  maybeSingle() {
    return Promise.resolve({ data: this.rows[0] ?? null, error: this.error });
  }

  then(resolve: (value: { data: any[]; error: any }) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve({ data: this.rows, error: this.error }).then(resolve, reject);
  }
}

function createService(rowsByTable: Record<string, any[]> = {}) {
  const queries: QueryMock[] = [];
  const client = {
    from: jest.fn((table: string) => {
      const query = new QueryMock(table, rowsByTable[table] ?? []);
      queries.push(query);
      return query;
    }),
  };
  const supabaseService = {
    getClient: jest.fn(() => client),
  };
  const eventBus = {
    onComprobanteCreadoEvent: jest.fn(),
  };
  const tenantContext = {
    getTenantId: jest.fn(() => tenantId),
  };
  const sireApiClient = {
    aceptarPropuesta: jest.fn(),
    consultarTicket: jest.fn(),
  };

  return {
    service: new SireService(
      supabaseService as any,
      eventBus as any,
      tenantContext as any,
      sireApiClient as any,
    ),
    queries,
    sireApiClient,
  };
}

describe('SireService', () => {
  it('usa la fecha del comprobante para el periodo SIRE, no la fecha actual del servidor', () => {
    const { service } = createService();

    const periodo = (service as any).getPeriodoFromComprobante({
      fecha_emision: '2026-04-15T10:20:00.000Z',
    });

    expect(periodo).toBe('2026-04');
  });

  it('genera registro de ventas filtrando por tenant, periodo y documentos no anulados', async () => {
    const { service, queries } = createService({
      cpe: [{
        fecha_emision: '2026-05-10T00:00:00.000Z',
        tipo_documento: '03',
        serie: 'B001',
        numero: 123,
        documento_receptor: '12345678',
        razon_social_receptor: 'Cliente SIRE',
        total_venta: 118,
        total_igv: 18,
        moneda: 'PEN',
      }],
    });

    const contenido = await service.generarContenidoSire({ periodo: '2026-05', tipo: 'REG_VEN', metadata: {} }, tenantId);
    const cpeQuery = queries.find((query) => query.table === 'cpe');

    expect(contenido).toContain('2026-05|2026-05-10|03|B001|00000123');
    expect(cpeQuery?.filters).toEqual(expect.arrayContaining([
      { op: 'eq', column: 'tenant_id', value: tenantId },
      { op: 'gte', column: 'fecha_emision', value: '2026-05-01T00:00:00.000Z' },
      { op: 'lt', column: 'fecha_emision', value: '2026-06-01T00:00:00.000Z' },
      { op: 'eq', column: 'estado', value: 'ACEPTADO' },
    ]));
  });

  it('genera registro de compras desde CxP del periodo solicitado', async () => {
    const { service, queries } = createService({
      cuentas_por_pagar: [{
        fecha_emision: '2026-05-11T00:00:00.000Z',
        numero_documento: 'FC01-55',
        tipo_documento: 'FACTURA',
        subtotal: 200,
        igv: 36,
        total: 236,
        moneda: 'PEN',
        fiscal_metadata: { tipo_cambio: 1 },
        proveedores: {
          ruc: '20512345671',
          razon_social: 'Proveedor SIRE SAC',
        },
      }],
    });

    const contenido = await service.generarContenidoSire({ periodo: '2026-05', tipo: 'REG_COM', metadata: {} }, tenantId);
    const comprasQuery = queries.find((query) => query.table === 'cuentas_por_pagar');

    expect(contenido).toContain('2026-05|2026-05-11|FACTURA|FC01-55|20512345671|Proveedor SIRE SAC');
    expect(comprasQuery?.filters).toEqual(expect.arrayContaining([
      { op: 'eq', column: 'tenant_id', value: tenantId },
      { op: 'gte', column: 'fecha_emision', value: '2026-05-01T00:00:00.000Z' },
      { op: 'lt', column: 'fecha_emision', value: '2026-06-01T00:00:00.000Z' },
      { op: 'in', column: 'tipo_documento', value: ['FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'RECIBO_HONORARIOS'] },
    ]));
  });

  it('solo anuncia recepción SIRE cuando SUNAT devuelve un ticket persistible', async () => {
    const { service, queries, sireApiClient } = createService({
      sire_files: [{
        id: 'report-1',
        tenant_id: tenantId,
        estado: 'GENERADO',
        tipo: 'REG_VEN',
        periodo: '2026-05',
      }],
      sire_operaciones: [{ id: 'operation-1' }],
    });
    sireApiClient.aceptarPropuesta.mockResolvedValue({
      ticket: 'ticket-sunat-1',
      httpStatus: 200,
      responseSummary: { accepted: true },
    });

    await expect(service.enviarSunat('report-1', tenantId)).resolves.toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          ticket: 'ticket-sunat-1',
          estado: 'PENDIENTE',
        }),
      }),
    );
    expect(sireApiClient.aceptarPropuesta).toHaveBeenCalledWith(
      tenantId,
      'REG_VEN',
      '202605',
    );
    expect(queries.some((query) =>
      query.table === 'sire_files'
      && (query.updated as any)?.sunat_ticket === 'ticket-sunat-1')).toBe(true);
  });

  it('aplica filtros de periodo, tipo y estado al listado de reportes', async () => {
    const { service, queries } = createService({
      sire_files: [{
        id: 'report-1',
        tenant_id: tenantId,
        periodo: '2026-05',
        tipo: 'REG_VEN',
        estado: 'ENVIADO',
      }],
    });

    const result = await service.getReportes({
      periodo: '2026-05',
      tipoReporte: 'REGISTRO_VENTAS',
      estado: 'ENVIADO',
    }, tenantId);
    const reportesQuery = queries.find((query) => query.table === 'sire_files');

    expect(result.success).toBe(true);
    expect(result.data[0].tipo_display).toBe('Registro de Ventas');
    expect(reportesQuery?.filters).toEqual(expect.arrayContaining([
      { op: 'eq', column: 'tenant_id', value: tenantId },
      { op: 'eq', column: 'periodo', value: '2026-05' },
      { op: 'eq', column: 'tipo', value: 'REG_VEN' },
      { op: 'eq', column: 'estado', value: 'ENVIADO' },
    ]));
  });

  it('rechaza periodos SIRE con formato inválido', async () => {
    const { service } = createService();

    await expect(
      service.generarContenidoSire({ periodo: 'mayo-2026', tipo: 'REG_VEN', metadata: {} }, tenantId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza meses fuera del rango calendario', async () => {
    const { service } = createService();

    await expect(
      service.generarContenidoSire({ periodo: '2026-13', tipo: 'REG_VEN', metadata: {} }, tenantId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no presenta libros distintos de RVIE o RCE como SIRE', () => {
    const { service } = createService();

    expect(() => (service as any).mapTipoReporte('LIBRO_DIARIO'))
      .toThrow(BadRequestException);
  });
});
