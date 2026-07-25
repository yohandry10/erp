import { BadRequestException } from '@nestjs/common';
import { GreService } from './gre.service';
import { CreateGuiaRemisionDto } from './gre.types';

function buildService() {
  return new GreService(
    { getClient: jest.fn(), update: jest.fn() } as any,
    { on: jest.fn(), emit: jest.fn(), eventEmitter: { eventNames: () => [] } } as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

function validGre(overrides: Partial<CreateGuiaRemisionDto> = {}): CreateGuiaRemisionDto {
  return {
    destinatario: 'Cliente GRE',
    direccionDestino: 'Av. Fiscal 123',
    ubigeoDestino: '150101',
    fechaTraslado: new Date(Date.now() + 86400000).toISOString(),
    modalidad: 'TRANSPORTE_PUBLICO',
    motivo: 'VENTA',
    pesoTotal: 12.5,
    transportista: 'Transportes Auditados SAC',
    transportistaDocumento: '20555555555',
    observaciones: 'GRE de prueba',
    ...overrides,
  };
}

describe('GreService validaciones de creación', () => {
  it('rechaza GRE sin datos obligatorios', () => {
    const service = buildService() as any;

    expect(() => service.assertCreateGreDataValida(validGre({ destinatario: '' })))
      .toThrow(BadRequestException);
    expect(() => service.assertCreateGreDataValida(validGre({ direccionDestino: '' })))
      .toThrow(/dirección de destino/i);
  });

  it('rechaza peso o cantidad logística inválida antes de emitir', () => {
    const service = buildService() as any;

    expect(() => service.assertCreateGreDataValida(validGre({ pesoTotal: 0 })))
      .toThrow(/peso total/i);
    expect(() => service.assertCreateGreDataValida(validGre({ pesoTotal: -1 })))
      .toThrow(/peso total/i);
  });

  it('rechaza GRE sin ubigeo de destino SUNAT válido', () => {
    const service = buildService() as any;

    expect(() => service.assertCreateGreDataValida(validGre({ ubigeoDestino: '' })))
      .toThrow(/ubigeo de destino/i);
    expect(() => service.assertCreateGreDataValida(validGre({ ubigeoDestino: '15010' })))
      .toThrow(/6 dígitos/i);
  });

  it('exige transportista para transporte público y placa/licencia para privado', () => {
    const service = buildService() as any;

    expect(() => service.assertCreateGreDataValida(validGre({ transportista: '' })))
      .toThrow(/transportista/i);
    expect(() => service.assertCreateGreDataValida(validGre({
      modalidad: 'TRANSPORTE_PRIVADO',
      transportista: undefined,
      transportistaDocumento: undefined,
      placaVehiculo: '',
      licenciaConducir: 'Q12345678',
    }))).toThrow(/placa/i);
    expect(() => service.assertCreateGreDataValida(validGre({
      modalidad: 'TRANSPORTE_PRIVADO',
      transportista: undefined,
      transportistaDocumento: undefined,
      placaVehiculo: 'ABC123',
      licenciaConducir: '',
    }))).toThrow(/licencia/i);
    expect(() => service.assertCreateGreDataValida(validGre({
      modalidad: 'TRANSPORTE_PUBLICO',
      transportista: 'Transportes Auditados SAC',
      transportistaDocumento: '',
    }))).toThrow(/RUC válido del transportista/i);
  });

  it('acepta GRE manual válida', () => {
    const service = buildService() as any;

    expect(() => service.assertCreateGreDataValida(validGre())).not.toThrow();
    expect(() => service.assertCreateGreDataValida(validGre({
      modalidad: 'TRANSPORTE_PRIVADO',
      transportista: undefined,
      transportistaDocumento: undefined,
      placaVehiculo: 'ABC123',
      licenciaConducir: 'Q12345678',
      conductorDocumentoTipo: '1',
      conductorDocumentoNumero: '12345678',
      conductorNombres: 'Angel Ricardo',
      conductorApellidos: 'Gadea Lira',
    }))).not.toThrow();
  });

  it('deshabilita GRE automática si no puede leer configuración del tenant', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'unavailable' } }),
    };
    const service = new GreService(
      { getClient: jest.fn(() => ({ from: jest.fn(() => chain) })) } as any,
      { on: jest.fn(), emit: jest.fn(), eventEmitter: { eventNames: () => [] } } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.getGREThresholdConfig('tenant-1')).resolves.toEqual({
      umbralGREAutomatico: 700,
      greAutomaticoHabilitado: false,
      greObligatorio: false,
    });
  });

  it('clasifica HTTP 5xx de SUNAT como error técnico reintentable', () => {
    const service = buildService() as any;

    expect(service.isTechnicalError('500', 'HTTP 500 recibido desde SUNAT')).toBe(true);
    expect(service.isTechnicalError('503', 'Servicio no disponible')).toBe(true);
    expect(service.isTechnicalError('3200', 'GRE rechazada por validación')).toBe(false);
  });

  it('rechaza GRE automática con datos de traslado incompletos en vez de usar placeholders', async () => {
    const service = buildService();

    await expect(service.createAutoGREFromSale('venta-1', {
      tenantId: 'tenant-1',
      cpeId: 'cpe-1',
      clienteId: 'cliente-1',
      clienteNombre: 'Cliente Auditado SAC',
      total: 1200,
      productos: [],
    })).rejects.toThrow(/faltan datos obligatorios de traslado/i);
  });

  it('genera DespatchAdvice SUNAT con firma, shipment stage y ubicaciones', () => {
    const service = buildService() as any;

    const xml = service.generateGreXmlUbl({
      emisor: {
        ruc: '20100066603',
        razonSocial: 'EMPRESA DEMO',
        nombreComercial: 'EMPRESA DEMO',
        direccion: 'AV ORIGEN 123',
        ubigeo: '150101',
        departamento: 'LIMA',
        provincia: 'LIMA',
        distrito: 'LIMA',
      },
      receptor: {
        docTipo: '6',
        docNumero: '20600600600',
        razonSocial: 'CLIENTE GRE',
        direccion: 'AV DESTINO 456',
      },
      gre: {
        numero: 'T001-00000001',
        motivo: 'VENTA',
        modalidad: 'TRANSPORTE_PUBLICO',
        peso_total: 12.5,
        fecha_traslado: '2026-06-17T00:00:00.000Z',
        transportista: 'TRANSPORTES DEMO SAC',
        transportista_documento: '20555555555',
        datos_adicionales: { destinoUbigeo: '150102' },
      },
      detalles: [{ id: 1, descripcion: 'Producto <auditado>', cantidad: 2, unidad: 'NIU' }],
    });

    expect(xml).toContain('<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"');
    expect(xml).toContain('<cbc:CustomizationID>2.0</cbc:CustomizationID>');
    expect(xml).not.toContain('<cbc:CustomizationID schemeAgencyName=');
    expect(xml).toContain('<cac:Signature>');
    expect(xml).toContain('<cbc:URI>#SignatureSP</cbc:URI>');
    expect(xml).toContain('<cac:DespatchSupplierParty>');
    expect(xml).toContain('<cac:DeliveryCustomerParty>');
    expect(xml).toContain('<cbc:HandlingCode listAgencyName="PE:SUNAT" listName="Motivo de traslado" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo20">01</cbc:HandlingCode>');
    expect(xml).toContain('<cbc:TransportModeCode listAgencyName="PE:SUNAT" listName="Modalidad de traslado" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo18">01</cbc:TransportModeCode>');
    expect(xml).toContain('<cbc:StartDate>2026-06-17</cbc:StartDate>');
    expect(xml).toContain('<cbc:GrossWeightMeasure unitCode="KGM">12.500</cbc:GrossWeightMeasure>');
    expect(xml).toContain('<cac:CarrierParty>');
    expect(xml).toContain('<cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">20555555555</cbc:ID>');
    expect(xml).toContain('<cbc:ID schemeAgencyName="PE:INEI">150102</cbc:ID>');
    expect(xml).toContain('<cbc:ID schemeAgencyName="PE:INEI">150101</cbc:ID>');
    expect(xml).toContain('<cac:DespatchAddress>');
    expect(xml).not.toContain('<cac:OriginAddress>');
    expect(xml).toContain('<cbc:Description><![CDATA[Producto <auditado>]]></cbc:Description>');
    expect(xml).not.toContain('<cac:AdditionalDocumentReference>');
  });

  it('genera GRE privada con conductor principal y placa en estructura validada por SUNAT', () => {
    const service = buildService() as any;

    const xml = service.generateGreXmlUbl({
      emisor: {
        ruc: '20100066603',
        razonSocial: 'EMPRESA DEMO',
        nombreComercial: 'EMPRESA DEMO',
        direccion: 'AV ORIGEN 123',
        ubigeo: '150101',
        departamento: 'LIMA',
        provincia: 'LIMA',
        distrito: 'LIMA',
      },
      receptor: {
        docTipo: '6',
        docNumero: '20600600600',
        razonSocial: 'CLIENTE GRE',
        direccion: 'AV DESTINO 456',
      },
      gre: {
        numero: 'T001-00000002',
        motivo: 'VENTA',
        modalidad: 'TRANSPORTE_PRIVADO',
        peso_total: 1,
        fecha_traslado: '2026-06-17T23:30:00-05:00',
        placa_vehiculo: 'abc-123',
        licencia_conducir: 'Q12345678',
        datos_adicionales: {
          destinoUbigeo: '150102',
          conductorDocumentoTipo: '1',
          conductorDocumentoNumero: '12345678',
          conductorNombres: 'Angel Ricardo',
          conductorApellidos: 'Gadea Lira',
        },
      },
      detalles: [{ id: 1, descripcion: 'Producto', cantidad: 1, unidad: 'NIU' }],
    });

    expect(xml).toContain('<cbc:TransportModeCode listAgencyName="PE:SUNAT" listName="Modalidad de traslado" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo18">02</cbc:TransportModeCode>');
    expect(xml).toContain('<cbc:StartDate>2026-06-17</cbc:StartDate>');
    expect(xml).toContain('<cac:DriverPerson>');
    expect(xml).toContain('<cbc:JobTitle>Principal</cbc:JobTitle>');
    expect(xml).toContain('<cac:IdentityDocumentReference>');
    expect(xml).toContain('<cbc:ID>Q12345678</cbc:ID>');
    expect(xml).toContain('<cac:TransportHandlingUnit>');
    expect(xml).toContain('<cac:TransportEquipment>');
    expect(xml).toContain('<cbc:ID>ABC123</cbc:ID>');
    expect(xml).not.toContain('<cac:RoadTransport>');
    expect(xml).not.toContain('<cac:OriginAddress>');
  });

  it('rechaza XML GRE si falta ubigeo de origen válido', () => {
    const service = buildService() as any;

    expect(() => service.generateGreXmlUbl({
      emisor: {
        ruc: '20100066603',
        razonSocial: 'EMPRESA DEMO',
        nombreComercial: 'EMPRESA DEMO',
        direccion: 'AV ORIGEN 123',
        ubigeo: '',
        departamento: 'LIMA',
        provincia: 'LIMA',
        distrito: 'LIMA',
      },
      receptor: {
        docTipo: '6',
        docNumero: '20600600600',
        razonSocial: 'CLIENTE GRE',
        direccion: 'AV DESTINO 456',
      },
      gre: {
        numero: 'T001-00000001',
        motivo: 'VENTA',
        modalidad: 'TRANSPORTE_PUBLICO',
        peso_total: 12.5,
        fecha_traslado: '2026-06-17T00:00:00.000Z',
        transportista: 'TRANSPORTES DEMO SAC',
        transportista_documento: '20555555555',
        datos_adicionales: { destinoUbigeo: '150102' },
      },
      detalles: [{ id: 1, descripcion: 'Producto', cantidad: 2, unidad: 'NIU' }],
    })).toThrow(/ubigeo/i);
  });
});
