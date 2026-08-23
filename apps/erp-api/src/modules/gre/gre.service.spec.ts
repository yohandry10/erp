import { BadRequestException } from '@nestjs/common';
import { GreService } from './gre.service';
import { CreateGuiaRemisionDto } from './gre.types';

function buildService() {
  return new GreService(
    { getClient: jest.fn(), update: jest.fn() } as any,
    { on: jest.fn(), emit: jest.fn(), eventEmitter: { eventNames: () => [] } } as any,
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
  it('aplica modalidad y fechas canónicas al listar GRE', async () => {
    const response = { data: [], error: null };
    const chain: any = {
      select: jest.fn(), eq: jest.fn(), order: jest.fn(), limit: jest.fn(),
      gte: jest.fn(), lte: jest.fn(), or: jest.fn(),
      then: (resolve: (value: any) => void) => Promise.resolve(response).then(resolve),
    };
    for (const method of ['select', 'eq', 'order', 'limit', 'gte', 'lte', 'or']) {
      chain[method].mockReturnValue(chain);
    }
    const service = new GreService(
      { getClient: jest.fn(() => ({ from: jest.fn(() => chain) })) } as any,
      { on: jest.fn(), emit: jest.fn(), eventEmitter: { eventNames: () => [] } } as any,
      {} as any,
      {} as any,
    );

    await service.findAllGuias('tenant-1', {
      modalidad: 'TRANSPORTE_PRIVADO', desde: '2026-08-01', hasta: '2026-08-31',
    });

    expect(chain.eq).toHaveBeenCalledWith('modalidad', 'TRANSPORTE_PRIVADO');
    expect(chain.gte).toHaveBeenCalledWith('fecha_traslado', '2026-08-01');
    expect(chain.lte).toHaveBeenCalledWith('fecha_traslado', '2026-08-31');
  });

  it('devuelve métricas consumibles por la pantalla GRE', async () => {
    const today = new Date().toISOString();
    const response = {
      data: [
        { estado: 'FIRMADO', peso_total: 2, created_at: today },
        { estado: 'ENVIADO', peso_total: 3, created_at: today },
        { estado: 'ACEPTADO', peso_total: 4, created_at: '2026-01-01T00:00:00.000Z' },
      ],
      error: null,
    };
    const chain: any = {
      select: jest.fn(), eq: jest.fn(),
      then: (resolve: (value: any) => void) => Promise.resolve(response).then(resolve),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    const service = new GreService(
      { getClient: jest.fn(() => ({ from: jest.fn(() => chain) })) } as any,
      { on: jest.fn(), emit: jest.fn(), eventEmitter: { eventNames: () => [] } } as any,
      {} as any,
      {} as any,
    );

    await expect(service.getStats('tenant-1')).resolves.toEqual(expect.objectContaining({
      totalGre: 3,
      greEmitidas: 2,
      enTransito: 2,
      completados: 1,
      pesoTotal: 9,
    }));
  });

  it('cuenta las GRE de las últimas horas del día peruano como emitidas hoy', async () => {
    // 19:30 del 22 de agosto en Lima son las 00:30 del 23 en UTC. El contador
    // recortaba `created_at` a diez caracteres --el día UTC-- y lo comparaba con
    // la fecha del contribuyente, así que durante las últimas cinco horas de cada
    // jornada "emitidas hoy" caía a cero. El test fija ese instante porque a
    // cualquier otra hora el defecto no se manifiesta.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-23T00:30:00.000Z'));
    try {
      const response = {
        data: [
          { estado: 'FIRMADO', peso_total: 2, created_at: '2026-08-23T00:30:00.000Z' },
          { estado: 'ENVIADO', peso_total: 3, created_at: '2026-08-23T01:00:00.000Z' },
          { estado: 'ACEPTADO', peso_total: 4, created_at: '2026-01-01T00:00:00.000Z' },
        ],
        error: null,
      };
      const chain: any = {
        select: jest.fn(), eq: jest.fn(),
        then: (resolve: (value: any) => void) => Promise.resolve(response).then(resolve),
      };
      chain.select.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);
      const service = new GreService(
        { getClient: jest.fn(() => ({ from: jest.fn(() => chain) })) } as any,
        { on: jest.fn(), emit: jest.fn(), eventEmitter: { eventNames: () => [] } } as any,
        {} as any,
        {} as any,
      );

      const stats: any = await service.getStats('tenant-1');
      expect(stats.greEmitidas).toBe(2);
      // Y la tendencia las agrupa en el día peruano, no en el UTC del día siguiente.
      expect(stats.tendencia[stats.tendencia.length - 1]).toEqual({
        fecha: '2026-08-22', cantidad: 2, peso: 5,
      });
    } finally {
      jest.useRealTimers();
    }
  });

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

  it('permite alta interna sin ubigeo y difiere la validación UBL hasta firmar', () => {
    const service = buildService() as any;

    expect(() => service.assertCreateGreDataValida(validGre({ ubigeoDestino: '' })))
      .not.toThrow();
  });

  it('permite BORRADOR sin credenciales de transporte y valida el UBL al firmar', () => {
    const service = buildService() as any;

    expect(() => service.assertCreateGreDataValida(validGre({ transportista: '' })))
      .not.toThrow();
    expect(() => service.assertCreateGreDataValida(validGre({
      modalidad: 'TRANSPORTE_PRIVADO',
      transportista: undefined,
      transportistaDocumento: undefined,
      placaVehiculo: '',
      licenciaConducir: 'Q12345678',
    }))).not.toThrow();
    expect(() => service.assertCreateGreDataValida(validGre({
      modalidad: 'TRANSPORTE_PRIVADO',
      transportista: undefined,
      transportistaDocumento: undefined,
      placaVehiculo: 'ABC123',
      licenciaConducir: '',
    }))).not.toThrow();
    expect(() => service.assertCreateGreDataValida(validGre({
      modalidad: 'TRANSPORTE_PUBLICO',
      transportista: 'Transportes Auditados SAC',
      transportistaDocumento: '',
    }))).not.toThrow();
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
