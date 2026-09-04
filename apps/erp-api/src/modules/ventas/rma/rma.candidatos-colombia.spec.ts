import { RmaService } from './rma.service';

type QueryResponse = { data: any; error: any };

function query(response: QueryResponse) {
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(response)),
    then: (resolve: (value: QueryResponse) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return builder;
}

function buildService(fixtures: Record<string, QueryResponse>) {
  const client = {
    from: jest.fn((table: string) => {
      const fixture = fixtures[table];
      if (!fixture) throw new Error(`Unexpected table ${table}`);
      return query(fixture);
    }),
  };
  return new RmaService({ getClient: () => client } as any);
}

const pedido = {
  id: 'pedido-1',
  numero: 'PED-1',
  estado: 'FACTURADO',
  cliente_id: 'cliente-1',
};
const detalle = {
  id: 'detalle-pedido-1',
  pedido_id: 'pedido-1',
  producto_id: 'producto-1',
  descripcion: 'Producto',
  cantidad: 1,
  cantidad_despachada: 1,
  cantidad_facturada: 1,
  precio_unitario: 100,
  productos: { es_servicio: false, controla_stock: true },
};

describe('RmaService - candidatos fiscales Colombia', () => {
  it('ofrece en un tenant real sólo una factura 01 aceptada con CUFE DIAN verificable', async () => {
    const acceptedEvidence = {
      authority: 'DIAN',
      status: 'ACCEPTED',
      code_kind: 'CUFE',
      unique_code: 'A'.repeat(96),
    };
    const service = buildService({
      empresa_config: { data: { pais: 'CO', is_demo: false }, error: null },
      pedidos_venta: { data: [pedido], error: null },
      pedidos_venta_detalle: { data: [detalle], error: null },
      documentos: {
        data: [
          { id: 'documento-valido', pedido_id: 'pedido-1', tipo_documento: 'FACTURA', estado: 'EMITIDO' },
          { id: 'documento-simulado', pedido_id: 'pedido-1', tipo_documento: 'FACTURA', estado: 'EMITIDO' },
          { id: 'documento-boleta', pedido_id: 'pedido-1', tipo_documento: 'BOLETA', estado: 'EMITIDO' },
        ],
        error: null,
      },
      cpe: {
        data: [
          {
            id: 'cpe-valido',
            documento_id: 'documento-valido',
            tipo_documento: '01',
            estado: 'ACEPTADO',
            estado_sunat: 'ACEPTADO',
            sunat_status: 'ACCEPTED',
            simulated_origin: false,
            issuer_snapshot: { country_code: 'CO' },
            fiscal_authority_evidence: acceptedEvidence,
          },
          {
            id: 'cpe-simulado',
            documento_id: 'documento-simulado',
            tipo_documento: '01',
            estado: 'ACEPTADO',
            estado_sunat: 'ACEPTADO',
            sunat_status: 'ACCEPTED',
            simulated_origin: true,
            issuer_snapshot: { country_code: 'CO' },
            fiscal_authority_evidence: acceptedEvidence,
          },
          {
            id: 'cpe-boleta',
            documento_id: 'documento-boleta',
            tipo_documento: '03',
            estado: 'ACEPTADO',
            estado_sunat: 'ACEPTADO',
            sunat_status: 'ACCEPTED',
            simulated_origin: false,
            issuer_snapshot: { country_code: 'CO' },
            fiscal_authority_evidence: acceptedEvidence,
          },
        ],
        error: null,
      },
      rma_items: { data: [], error: null },
    });

    const result = await service.listarCandidatos('tenant-co-real');

    expect(result).toHaveLength(1);
    expect(result[0].documentos).toEqual([
      expect.objectContaining({ id: 'documento-valido' }),
    ]);
  });

  it('conserva en la demo Colombia candidatos físicos sin presentarlos como aceptación DIAN', async () => {
    const service = buildService({
      empresa_config: { data: { pais: 'CO', is_demo: true }, error: null },
      pedidos_venta: { data: [pedido], error: null },
      pedidos_venta_detalle: { data: [detalle], error: null },
      documentos: {
        data: [{ id: 'documento-demo', pedido_id: 'pedido-1', tipo_documento: 'BOLETA', estado: 'EMITIDO' }],
        error: null,
      },
      cpe: {
        data: [{
          id: 'cpe-demo',
          documento_id: 'documento-demo',
          tipo_documento: '03',
          estado: 'FIRMADO',
          estado_sunat: 'PENDIENTE',
          sunat_status: 'READY',
          simulated_origin: true,
          issuer_snapshot: { country_code: 'CO' },
          fiscal_authority_evidence: { authority: 'DIAN', status: 'SIMULATED' },
        }],
        error: null,
      },
      rma_items: { data: [], error: null },
    });

    const result = await service.listarCandidatos('tenant-co-demo');

    expect(result[0].documentos).toEqual([
      expect.objectContaining({ id: 'documento-demo' }),
    ]);
  });
});
