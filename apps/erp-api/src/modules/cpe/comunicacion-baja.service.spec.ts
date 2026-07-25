import { ComunicacionBajaService } from './comunicacion-baja.service';

describe('ComunicacionBajaService SUNAT XML builders', () => {
  const tenantId = 'tenant-1';
  let service: ComunicacionBajaService;
  let client: any;

  beforeEach(() => {
    const empresaChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          ruc: '20100066603',
          razon_social: 'EMPRESA DEMO SAC',
        },
        error: null,
      }),
    };

    client = {
      from: jest.fn(() => empresaChain),
    };

    service = new ComunicacionBajaService(
      { getClient: jest.fn(() => client) } as any,
      {} as any,
      { get: jest.fn() } as any,
    );
  });

  it('genera VoidedDocuments RA con lineas reales SUNAT y datos del emisor', async () => {
    const xml = await (service as any).generarXmlComunicacionBaja(
      {
        numero_comunicacion: 'RA-20260616-1',
        fecha_generacion: '2026-06-16',
        fecha_comunicacion: '2026-06-16',
      },
      [
        {
          tipo_documento: '01',
          serie: 'F001',
          numero: '00000001',
        },
      ],
      'ERROR EN DATOS DE PRUEBA',
      tenantId,
    );

    expect(xml).toContain('<VoidedDocuments');
    expect(xml).toContain('xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1"');
    expect(xml).toContain('<cbc:UBLVersionID>2.0</cbc:UBLVersionID>');
    expect(xml).toContain('<cbc:CustomizationID>1.0</cbc:CustomizationID>');
    expect(xml).toContain('<cac:Signature>');
    expect(xml).toContain('<cbc:CustomerAssignedAccountID>20100066603</cbc:CustomerAssignedAccountID>');
    expect(xml).toContain('<sac:VoidedDocumentsLine>');
    expect(xml).toContain('<cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>');
    expect(xml).toContain('<sac:DocumentSerialID>F001</sac:DocumentSerialID>');
    expect(xml).toContain('<sac:DocumentNumberID>1</sac:DocumentNumberID>');
    expect(xml).not.toContain('Detalles de comprobantes');
  });

  it('genera SummaryDocuments RC con lineas, condicion y totales SUNAT', async () => {
    const xml = await (service as any).generarXmlResumenDiario(
      {
        numero_resumen: 'RC-20260616-1',
        fecha_generacion: '2026-06-16',
        fecha_referencia: '2026-06-16',
      },
      [
        {
          tipo_documento: '03',
          serie: 'B001',
          numero: '00000002',
          tipo_documento_receptor: '1',
          documento_receptor: '12345678',
          tipo_operacion_resumen: '3',
          moneda: 'PEN',
          total_gravadas: 10,
          total_igv: 1.8,
          total_venta: 11.8,
        },
      ],
      tenantId,
    );

    expect(xml).toContain('<SummaryDocuments');
    expect(xml).toContain('<cbc:CustomizationID>1.1</cbc:CustomizationID>');
    expect(xml).toContain('<sac:SummaryDocumentsLine>');
    expect(xml).toContain('<cbc:DocumentTypeCode>03</cbc:DocumentTypeCode>');
    expect(xml).toContain('<cbc:ID>B001-2</cbc:ID>');
    expect(xml).toContain('<cbc:ConditionCode>3</cbc:ConditionCode>');
    expect(xml).toContain('<sac:TotalAmount currencyID="PEN">11.80</sac:TotalAmount>');
    expect(xml).toContain('<sac:BillingPayment>');
    expect(xml).toContain('<cbc:InstructionID>01</cbc:InstructionID>');
    expect(xml).toContain('<cac:TaxTotal>');
    expect(xml).not.toContain('Detalles de comprobantes');
  });

  it('arma el nombre ZIP SUNAT con RUC para sendSummary', async () => {
    await expect((service as any).buildSunatSummaryFileName(tenantId, 'RA-20260616-1'))
      .resolves.toBe('20100066603-RA-20260616-1');

    await expect((service as any).buildSunatSummaryFileName(tenantId, '20100066603-RC-20260616-1'))
      .resolves.toBe('20100066603-RC-20260616-1');
  });

  it('no marca RA como rechazada cuando la consulta de ticket es tecnica/no concluyente', async () => {
    const updatePayloads: any[] = [];
    const selectChain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'ra-1',
          tenant_id: tenantId,
          estado: 'ENVIADO',
          ticket_sunat: '1781651656311',
          comprobantes_ids: ['cpe-1'],
        },
        error: null,
      }),
    };

    client = {
      from: jest.fn(() => ({
        select: jest.fn(() => selectChain),
        update: jest.fn((payload) => {
          updatePayloads.push(payload);
          return { eq: jest.fn().mockResolvedValue({ data: null, error: null }) };
        }),
      })),
    };

    service = new ComunicacionBajaService(
      { getClient: jest.fn(() => client) } as any,
      {
        consultarTicket: jest.fn().mockResolvedValue({
          success: false,
          codigoRespuesta: '99',
          descripcionRespuesta: 'Convert HTTP produced invalid XML: Incomplete markup',
        }),
      } as any,
      { get: jest.fn() } as any,
    );

    const result = await service.consultarEstadoComunicacion('ra-1', tenantId);

    expect(result).toMatchObject({
      success: false,
      estado: 'ENVIADO',
    });
    expect(updatePayloads).toHaveLength(1);
    expect(updatePayloads[0]).toMatchObject({
      codigo_respuesta: '99',
      descripcion_respuesta: 'Convert HTTP produced invalid XML: Incomplete markup',
    });
    expect(updatePayloads[0]).not.toHaveProperty('estado', 'RECHAZADO');
  });
});
