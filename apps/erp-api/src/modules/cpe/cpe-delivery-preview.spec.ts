import { CpeDeliveryService } from './cpe-delivery.service';
import { buildArcaQrRepresentation, buildDianQrRepresentation } from './fiscal-qr.util';
import { perfilPaisDelTenant } from './pais-del-tenant';

jest.mock('./sunat-qr.util', () => ({
  buildSunatQrContent: jest.fn(() => 'qr-demo'),
  buildSunatQrDataUrl: jest.fn(async () => 'data:image/png;base64,AA=='),
}));

jest.mock('./fiscal-qr.util', () => ({
  resolveAcceptedDianEvidence: jest.fn((cpe) => cpe.fiscal_authority_evidence?.status === 'ACCEPTED'
    ? cpe.fiscal_authority_evidence : null),
  buildDianQrRepresentation: jest.fn(async () => ({
    content: 'qr-dian-demo',
    dataUrl: 'data:image/png;base64,RElBTg==',
  })),
  buildArcaQrRepresentation: jest.fn(async () => ({
    content: 'qr-arca-demo',
    dataUrl: 'data:image/png;base64,QVJDQQ==',
  })),
}));

jest.mock('./pais-del-tenant', () => ({
  perfilPaisDelTenant: jest.fn(async () => ({ codigo: 'PE' })),
}));

describe('CpeDeliveryService - datos de la vista A4', () => {
  it('entrega el emisor del mismo tenant junto al CPE', async () => {
    const cpeChain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'cpe-a4',
          tenant_id: 'tenant-a4',
          tipo_documento: '01',
          serie: 'F001',
          numero: 1,
          ruc_emisor: '20600000021',
        },
        error: null,
      }),
    };
    const configChain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          ruc: '20600000021',
          razon_social: 'Comercial Andina Demo S.A.C.',
          direccion_fiscal: 'Av. Emisor 456, Lima',
          telefono: '01 555 0101',
          email: 'ventas@demo.invalid',
          logo_url: null,
        },
        error: null,
      }),
    };
    const client = {
      from: jest.fn((table: string) => table === 'cpe' ? cpeChain : configChain),
    };
    const service = new CpeDeliveryService(
      { getClient: () => client } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.getCpeById('cpe-a4', 'tenant-a4')).resolves.toMatchObject({
      id: 'cpe-a4',
      pais_codigo: 'PE',
      fiscal_qr_content: 'qr-demo',
      fiscal_qr_data_url: 'data:image/png;base64,AA==',
      sunat_qr_content: 'qr-demo',
      sunat_qr_data_url: 'data:image/png;base64,AA==',
      emisor: {
        ruc: '20600000021',
        razon_social: 'Comercial Andina Demo S.A.C.',
        direccion_fiscal: 'Av. Emisor 456, Lima',
      },
    });
    expect(cpeChain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a4');
    expect(configChain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a4');
    expect(configChain.select).toHaveBeenCalledWith(expect.stringContaining('logo_url'));
  });

  it('expone el contrato QR fiscal genérico para Colombia sin alias SUNAT', async () => {
    (perfilPaisDelTenant as jest.Mock).mockResolvedValueOnce({ codigo: 'CO' });
    const cpeChain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'cpe-co',
          tenant_id: 'tenant-co',
          tipo_documento: '01',
          serie: 'FV01',
          numero: 9,
          hash: 'CUFE-CO-9',
          fecha_emision: '2026-08-29T10:15:00-05:00',
          condicion_pago: 'CONTADO',
          medio_pago: 'EFECTIVO',
          simulated_origin: false,
          fiscal_authority_evidence: {
            status: 'ACCEPTED', authority: 'DIAN', country_code: 'CO',
            code_kind: 'CUFE', unique_code: 'A'.repeat(96),
            authorization: {
              number: '18760000001', prefix: 'FV', range_from: 1, range_to: 50000,
              valid_from: '2026-01-01', valid_to: '2027-12-31', software_id: 'SOFTWARE-DIAN-01',
            },
          },
        },
        error: null,
      }),
    };
    const configChain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: {
        dian_resolucion_numero: '18760000001', dian_resolucion_prefijo: 'FV',
        dian_resolucion_desde: 1, dian_resolucion_hasta: 50000,
        dian_resolucion_fecha_inicio: '2026-01-01', dian_resolucion_fecha_fin: '2027-12-31',
        dian_software_id: 'SOFTWARE-DIAN-01', dian_tipo_contribuyente: 'PERSONA_JURIDICA',
        dian_regimen_fiscal: 'RESPONSABLE_IVA',
      }, error: null }),
    };
    const client = {
      from: jest.fn((table: string) => table === 'cpe' ? cpeChain : configChain),
    };
    const service = new CpeDeliveryService(
      { getClient: () => client } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.getCpeById('cpe-co', 'tenant-co')).resolves.toMatchObject({
      pais_codigo: 'CO',
      fiscal_qr_content: 'qr-dian-demo',
      fiscal_qr_data_url: 'data:image/png;base64,RElBTg==',
      fiscal_print_info: expect.objectContaining({ authorizationNumber: '18760000001' }),
      sunat_qr_content: null,
      sunat_qr_data_url: null,
    });
    expect(buildDianQrRepresentation).toHaveBeenCalledWith(expect.objectContaining({
      fiscal_authority_evidence: expect.objectContaining({ unique_code: 'A'.repeat(96) }),
    }));
  });

  it('expone el QR ARCA autorizado mediante el mismo contrato fiscal genérico', async () => {
    (perfilPaisDelTenant as jest.Mock).mockResolvedValueOnce({ codigo: 'AR' });
    const cpeChain: any = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'cpe-ar', tenant_id: 'tenant-ar', tipo_documento: '001',
          serie: '00012', numero: 9, fecha_emision: '2026-08-29', hash: '70417054367476',
          simulated_origin: false,
          metadata: {
            fiscal_country: 'AR',
            arca_cae: '70417054367476', arca_cae_vencimiento: '20260910',
            arca_punto_venta: 12, arca_cbte_tipo: 1, arca_cbte_numero: 9,
          },
        },
        error: null,
      }),
    };
    const configChain: any = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { is_demo: false }, error: null }),
    };
    const client = { from: jest.fn((table: string) => table === 'cpe' ? cpeChain : configChain) };
    const service = new CpeDeliveryService(
      { getClient: () => client } as any, {} as any, {} as any, {} as any,
    );

    await expect(service.getCpeById('cpe-ar', 'tenant-ar')).resolves.toMatchObject({
      pais_codigo: 'AR',
      fiscal_qr_content: 'qr-arca-demo',
      fiscal_qr_data_url: 'data:image/png;base64,QVJDQQ==',
      tipo_documento_fiscal: '001',
      fiscal_print_info: expect.objectContaining({ authorizationCode: '70417054367476' }),
      sunat_qr_content: null,
    });
    expect(buildArcaQrRepresentation).toHaveBeenCalledWith(
      expect.objectContaining({ hash: '70417054367476' }),
      { allowMissingAuthorization: false },
    );
  });

  it('conserva el país y la condición demo del CPE después de convertir el tenant', async () => {
    (perfilPaisDelTenant as jest.Mock).mockResolvedValueOnce({ codigo: 'PE' });
    const cpeChain: any = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'cpe-ar-demo-historico', tenant_id: 'tenant-convertido',
          pais: 'AR', tipo_documento: '011', serie: '00001', numero: 1,
          fecha_emision: '2026-08-29', simulated_origin: true,
          metadata: { arca_cbte_tipo: 11, arca_punto_venta: 1, arca_cbte_numero: 1 },
          issuer_snapshot: {
            contract_version: 525, country_code: 'AR', tax_id: '30700000001',
            legal_name: 'Emisor demo histórico',
          },
          fiscal_authority_evidence: {
            contract_version: 525, authority: 'ARCA', country_code: 'AR', status: 'SIMULATED',
          },
        },
        error: null,
      }),
    };
    const configChain: any = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { is_demo: false, arca_condicion_iva: 'MONOTRIBUTO' }, error: null,
      }),
    };
    const client = { from: jest.fn((table: string) => table === 'cpe' ? cpeChain : configChain) };
    const service = new CpeDeliveryService(
      { getClient: () => client } as any, {} as any, {} as any, {} as any,
    );

    await expect(service.getCpeById('cpe-ar-demo-historico', 'tenant-convertido'))
      .resolves.toMatchObject({
        pais_codigo: 'AR', simulated: true, simulated_origin: true,
        tipo_documento_fiscal: '011',
      });
    expect(buildArcaQrRepresentation).toHaveBeenLastCalledWith(
      expect.objectContaining({ simulated_origin: true }),
      { allowMissingAuthorization: true },
    );
  });
});
