import { TipoDocumento } from '@erp-suite/dtos';
import { CpeDeliveryService } from '../../cpe/cpe-delivery.service';
import { CPEIntegrationService } from './cpe-integration.service';

type Country = 'PE' | 'AR' | 'CO';

function mapWithRealPublicCpeMapper(row: Record<string, unknown>) {
  const mapper = Object.create(CpeDeliveryService.prototype) as CpeDeliveryService;
  return mapper.mapToDto(row);
}

function buildCpeQuery(result: { data: Record<string, unknown> | null; error: any }) {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.maybeSingle = jest.fn().mockResolvedValue(result);
  return chain;
}

describe('CPEIntegrationService — procedencia persistida para la respuesta comercial', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const pedido = {
    id: '22222222-2222-4222-8222-222222222222',
    tenant_id: tenantId,
    cliente_id: '33333333-3333-4333-8333-333333333333',
    subtotal: 100,
    igv: 19,
    total: 119,
    detalle: [],
  } as any;

  const cases: Array<{
    label: string;
    country: Country;
    tenantIsDemo: boolean;
    simulatedOrigin: boolean;
    authority: 'SUNAT' | 'ARCA' | 'DIAN';
    demoWarning: boolean;
  }> = [
    {
      label: 'CO demo', country: 'CO', tenantIsDemo: true,
      simulatedOrigin: true, authority: 'DIAN', demoWarning: true,
    },
    {
      label: 'CO real', country: 'CO', tenantIsDemo: false,
      simulatedOrigin: false, authority: 'DIAN', demoWarning: false,
    },
    {
      label: 'PE real', country: 'PE', tenantIsDemo: false,
      simulatedOrigin: false, authority: 'SUNAT', demoWarning: false,
    },
    {
      label: 'AR real', country: 'AR', tenantIsDemo: false,
      simulatedOrigin: false, authority: 'ARCA', demoWarning: false,
    },
    {
      label: 'AR demo', country: 'AR', tenantIsDemo: true,
      simulatedOrigin: true, authority: 'ARCA', demoWarning: true,
    },
  ];

  it.each(cases)(
    'rehidrata $label desde el CPE tenant-scoped aunque el mapper omita el snapshot y pais sea NULL',
    async ({ country, tenantIsDemo, simulatedOrigin, authority, demoWarning }) => {
      const persisted = {
        id: `cpe-${country.toLowerCase()}-${tenantIsDemo ? 'demo' : 'real'}`,
        tenant_id: tenantId,
        documento_id: `documento-${country.toLowerCase()}`,
        tipo_documento: '01',
        serie: country === 'CO' ? 'FV' : country === 'AR' ? '00001' : 'F001',
        numero: 41,
        fecha_emision: '2026-09-04',
        moneda: country === 'CO' ? 'COP' : country === 'AR' ? 'ARS' : 'PEN',
        total_venta: 119,
        estado: 'FIRMADO',
        pais: null,
        simulated_origin: simulatedOrigin,
        issuer_snapshot: {
          contract_version: '525',
          country_code: country,
          tax_id: '9012345671',
          legal_name: `EMISOR ${country}`,
        },
        metadata: { fiscal_country: country },
      };
      // Esta es exactamente la frontera que causaba el P1: el mapper público
      // conserva pais=NULL y simulated_origin, pero omite los dos JSON internos.
      const publicDto = mapWithRealPublicCpeMapper(persisted) as any;
      expect(publicDto.pais).toBeNull();
      expect(publicDto).not.toHaveProperty('issuer_snapshot');
      expect(publicDto).not.toHaveProperty('metadata');

      const cpeQuery = buildCpeQuery({ data: persisted, error: null });
      const client = {
        from: jest.fn((table: string) => {
          expect(table).toBe('cpe');
          return cpeQuery;
        }),
      };
      const create = jest.fn().mockResolvedValue(publicDto);
      const validateCertificate = jest.fn().mockResolvedValue({
        isValid: true,
        warnings: [],
        errors: [],
      });
      const recordSuccess = jest.fn().mockResolvedValue(undefined);
      const recordError = jest.fn().mockResolvedValue(undefined);
      const service = new CPEIntegrationService(
        { getClient: () => client } as any,
        { create } as any,
        { validateCertificate } as any,
        { recordSuccess, recordError } as any,
        {} as any,
      );
      const config = {
        ruc: '9012345671',
        razon_social: `EMISOR ${country}`,
        moneda_defecto: persisted.moneda,
        pais: country,
        is_demo: tenantIsDemo,
        dian_resolucion_prefijo: country === 'CO' ? 'FV' : null,
      };
      jest.spyOn(service as any, 'obtenerEmpresaConfig').mockResolvedValue(config);
      jest.spyOn(service as any, 'obtenerCliente').mockResolvedValue({
        documento_tipo: country === 'AR' ? 'CUIT' : 'RUC',
        documento_numero: '20123456789',
        razon_social: 'CLIENTE QA',
      });
      jest.spyOn(service as any, 'mapearPedidoACPE').mockResolvedValue({
        tipo_documento: TipoDocumento.FACTURA,
        serie: persisted.serie,
        numero: 0,
        moneda: persisted.moneda,
        fecha_emision: persisted.fecha_emision,
        total_venta: 119,
        items: [],
      });
      jest.spyOn(service as any, 'congelarPagoDianPedido').mockResolvedValue({
        pedido,
        cliente: { documento_tipo: 'NIT', documento_numero: '9001234568' },
        empresaConfig: config,
      });
      const consume = jest.spyOn(service as any, 'consumirSnapshotDianPedido')
        .mockResolvedValue(undefined);

      const result = await service.generarFacturaDesdePedido(
        pedido,
        tenantId,
        country === 'CO' ? `ventas.cpe.factura:${tenantId}:${pedido.id}` : undefined,
        '44444444-4444-4444-8444-444444444444',
      );

      expect(cpeQuery.eq).toHaveBeenNthCalledWith(1, 'id', persisted.id);
      expect(cpeQuery.eq).toHaveBeenNthCalledWith(2, 'tenant_id', tenantId);
      expect(result).toEqual(expect.objectContaining({
        factura_id: persisted.id,
        cpe_id: persisted.id,
        documento_id: persisted.documento_id,
        is_demo_representation: demoWarning,
        moneda: persisted.moneda,
        total: 119,
      }));
      expect(result.warnings).toEqual(demoWarning
        ? [`Comprobante demo generado localmente: muestra sin transmisión ni validez ${authority}`]
        : [`La factura fue firmada pero debe ser enviada manualmente a ${authority} desde el módulo CPE`]);
      expect(validateCertificate).toHaveBeenCalledTimes(
        tenantIsDemo && ['CO', 'AR'].includes(country) ? 0 : 1,
      );
      expect(consume).toHaveBeenCalledTimes(country === 'CO' ? 1 : 0);
      expect(recordSuccess).toHaveBeenCalledWith(expect.objectContaining({
        tenantId,
        metadata: { factura_id: persisted.id },
      }));
      expect(recordError).not.toHaveBeenCalled();
    },
  );

  it('falla cerrado si el CPE no puede releerse dentro del tenant', async () => {
    const cpeQuery = buildCpeQuery({ data: null, error: null });
    const service = new CPEIntegrationService(
      { getClient: () => ({ from: jest.fn(() => cpeQuery) }) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      (service as any).obtenerCpePersistidoParaRespuesta('cpe-ajeno', tenantId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CPE_PERSISTED_PROVENANCE_UNAVAILABLE',
      }),
    });
    expect(cpeQuery.eq).toHaveBeenNthCalledWith(1, 'id', 'cpe-ajeno');
    expect(cpeQuery.eq).toHaveBeenNthCalledWith(2, 'tenant_id', tenantId);
  });
});
