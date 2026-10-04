import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DocumentosService } from './documentos.service';

/** Cliente Supabase mínimo: rpc por nombre y tablas por nombre con resultados encolados. */
function cliente(rpcResults: Record<string, any[]>, tables: Record<string, any>) {
  const rpc = jest.fn(async (name: string) => (rpcResults[name] ?? []).shift() ?? { data: null, error: null });
  const from = jest.fn((table: string) => {
    const query: any = {
      select: jest.fn(() => query), eq: jest.fn(() => query), order: jest.fn(() => query),
      maybeSingle: jest.fn(async () => tables[table]),
      then: (ok: any) => Promise.resolve(tables[table]).then(ok),
    };
    return query;
  });
  return { rpc, from };
}

const servicio = (client: any) => new DocumentosService(
  { getClient: () => client } as any,
  { onDocumentoCreated: jest.fn() } as any,
  {} as any,
);
const body: any = {
  tipo_documento: 'FACTURA', receptor_tipo_doc: '6', receptor_numero_doc: '20100070970', receptor_razon_social: 'Cliente',
  fecha_emision: '2026-10-04', moneda: 'PEN', detalles: [{ descripcion: 'x', unidad_medida: 'ZZ', cantidad: 1, precio_unitario: 1 }],
  idempotency_key: 'doc-key-1',
};
const sinSerie = { data: null, error: { code: 'P0001', message: 'DOCUMENT_MANUAL_SERIES_NOT_CONFIGURED: FACTURA/F001' } };
const creado = { data: { documento: { id: 'd-1' }, detalles: [], idempotent: false }, error: null };

describe('DocumentosService: serie configurada en la empresa', () => {
  it('registra con el writer auditado la serie del asistente y reintenta el alta una vez', async () => {
    const client = cliente(
      { crear_documento_manual_tx: [sinSerie, creado], crear_serie_documento_tx: [{ data: { serie: {} }, error: null }] },
      { empresa_config: { data: { serie_factura: 'F001', serie_boleta: 'B001' }, error: null } },
    );
    const result = await servicio(client).crearDocumento(body, 't-1', 'u-1');
    expect(result.data.id).toBe('d-1');
    expect(client.rpc).toHaveBeenCalledWith('crear_serie_documento_tx', expect.objectContaining({
      p_tenant_id: 't-1', p_actor_id: 'u-1', p_tipo_documento: 'FACTURA', p_serie: 'F001',
      p_idempotency_key: 'configured-series:t-1:factura:f001',
    }));
    expect(client.rpc.mock.calls.filter(([n]) => n === 'crear_documento_manual_tx')).toHaveLength(2);
  });

  it('no registra series distintas de la configurada', async () => {
    const client = cliente(
      { crear_documento_manual_tx: [{ data: null, error: { code: 'P0001', message: 'DOCUMENT_MANUAL_SERIES_NOT_CONFIGURED: FACTURA/F777' } }] },
      { empresa_config: { data: { serie_factura: 'F001' }, error: null } },
    );
    await expect(servicio(client).crearDocumento({ ...body, serie: 'F777' }, 't-1', 'u-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(client.rpc).not.toHaveBeenCalledWith('crear_serie_documento_tx', expect.anything());
  });

  it('un writer caído responde 503', async () => {
    const client = cliente({ crear_documento_manual_tx: [{ data: null, error: { message: 'fetch failed' } }] }, {});
    await expect(servicio(client).crearDocumento(body, 't-1', 'u-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('la auditoría de un documento ajeno o inexistente responde 404', async () => {
    const client = cliente({}, { documentos: { data: null, error: null }, documento_auditoria: { data: [], error: null } });
    await expect(servicio(client).getAuditoria('d-ajeno', 't-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('una lectura caída del listado responde 503', async () => {
    const client = cliente({}, { documentos: { data: null, error: { code: '42501', message: 'permission denied for table documentos' } } });
    await expect(servicio(client).getDocumentos({}, 't-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
