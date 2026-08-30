import {
  ARCA_ENDPOINTS,
  ArcaFiscalService,
  normalizeArcaEndpointConfiguration,
  resolveArcaOfficialEndpoint,
  validateArgentinaTaxId,
} from './arca-fiscal.service';

describe('ArcaFiscalService', () => {
  const service = new ArcaFiscalService(
    { get: jest.fn() } as any,
    {} as any,
    {} as any,
  );

  const documento = (overrides: Record<string, unknown> = {}) =>
    ({
      tipoDocumento: 'FACTURA_A',
      serie: '00001',
      numero: '1',
      fechaEmision: new Date('2026-07-29T12:00:00Z'),
      moneda: 'ARS',
      emisor: {
        tipoDocumento: 'CUIT',
        numeroDocumento: '30710158229',
        razonSocial: 'Empresa Argentina',
        condicionIva: 'RESPONSABLE_INSCRIPTO',
      },
      receptor: {
        tipoDocumento: 'CUIT',
        numeroDocumento: '30712345671',
        razonSocial: 'Cliente Argentina',
        condicionIva: 'RESPONSABLE_INSCRIPTO',
      },
      subtotal: 100,
      totalImpuestos: 21,
      importeTotal: 121,
      tasaImpuesto: 21,
      items: [
        {
          descripcion: 'Servicio',
          cantidad: 1,
          precioUnitario: 100,
          valorVenta: 100,
          igv: 21,
          tasaIgv: 21,
        },
      ],
      ...overrides,
    }) as any;

  it('valida CUIT con dígito verificador y rechaza uno alterado', () => {
    expect(validateArgentinaTaxId('30-71015822-9')).toBe(true);
    expect(validateArgentinaTaxId('30-71015822-8')).toBe(false);
  });

  it('acepta factura ARCA con ARS e IVA 21%', async () => {
    const result = await service.validarDocumento(documento());

    expect(result.valido).toBe(true);
    expect(result.errores).toEqual([]);
  });

  it('rechaza moneda, alícuota y totales que WSFE no admite', async () => {
    const result = await service.validarDocumento(
      documento({
        moneda: 'PEN',
        importeTotal: 120,
        items: [{ tasaIgv: 18 }],
      }),
    );

    expect(result.valido).toBe(false);
    expect(result.errores.join(' ')).toContain('este release: ARS');
    expect(result.errores.join(' ')).toContain('Subtotal + IVA');
    expect(result.errores.join(' ')).toContain('18%');
  });

  it('genera representación fiscal con tipo WSFE y moneda ARS', async () => {
    const xml = await service.generarXML(documento());

    expect(xml).toContain('<Tipo>1</Tipo>');
    expect(xml).toContain('<Moneda>ARS</Moneda>');
    expect(xml).toContain('<IVA>21.00</IVA>');
  });

  /**
   * `cpe.fecha_emision` es `timestamptz` y `CbteFch` se armaba con los getters
   * UTC. En Argentina (UTC-3) una factura emitida entre las 00:00 y las 03:00
   * salía fechada al día siguiente, y ARCA compara `CbteFch` contra su propia
   * fecha. El QR llevaba el mismo desfase, así que ni siquiera se contradecían
   * entre sí: los dos mentían igual.
   *
   * `CbteFch` es una fecha de calendario, no un instante: el día fiscal del
   * contribuyente.
   */
  describe('fecha del comprobante', () => {
    const medianocheDeBuenosAires = new Date('2026-08-21T02:30:00Z'); // 20/08 23:30 en AR

    it('fecha el comprobante en el día argentino, no en el día UTC', () => {
      const xml = (service as any).buildAuthorizeRequest(
        { cuit: '30710158229', puntoVenta: 1 },
        { token: 't', sign: 's' },
        documento({ fechaEmision: medianocheDeBuenosAires }),
        1,
        1,
        1,
      );

      expect(xml).toContain('<ar:CbteFch>20260820</ar:CbteFch>');
      expect(xml).toContain('<ar:CondicionIVAReceptorId>1</ar:CondicionIVAReceptorId>');
      expect(xml).not.toContain('20260821');
    });

    it('el QR declara la misma fecha que el XML', () => {
      const qr = (service as any).buildQrUrl(
        { cuit: '30710158229', puntoVenta: 1 },
        documento({ fechaEmision: medianocheDeBuenosAires }),
        1,
        1,
        '75000000000000',
      );

      const datos = JSON.parse(
        Buffer.from(new URL(qr).searchParams.get('p') as string, 'base64').toString('utf8'),
      );
      expect(qr).toMatch(/^https:\/\/www\.arca\.gob\.ar\/fe\/qr\/\?p=/);
      expect(datos.fecha).toBe('2026-08-20');
    });

    it.each([
      '2026-08-21',
      '2026-08-21T00:00:00Z',
    ])('preserva la fecha fiscal pura %s tanto en SOAP como en QR', (fechaEmision) => {
      const fiscalDocument = documento({ fechaEmision });
      const xml = (service as any).buildAuthorizeRequest(
        { cuit: '30710158229', puntoVenta: 1 },
        { token: 't', sign: 's' },
        fiscalDocument,
        1,
        1,
        1,
      );
      const qr = (service as any).buildQrUrl(
        { cuit: '30710158229', puntoVenta: 1 },
        fiscalDocument,
        1,
        1,
        '75000000000000',
      );
      const payload = JSON.parse(
        Buffer.from(new URL(qr).searchParams.get('p') as string, 'base64').toString('utf8'),
      );

      expect(xml).toContain('<ar:CbteFch>20260821</ar:CbteFch>');
      expect(payload.fecha).toBe('2026-08-21');
    });

    it('construye el QR final con el CbteFch confirmado por ARCA', async () => {
      const config = {
        environment: 'homologacion',
        wsaaUrl: ARCA_ENDPOINTS.homologacion.wsaa,
        wsfeUrl: ARCA_ENDPOINTS.homologacion.wsfe,
        cuit: '30710158229',
        puntoVenta: 1,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        certificate: Buffer.from('cert'),
        certificatePassword: 'secret',
        activo: true,
      };
      jest.spyOn(service as any, 'loadTenantConfig').mockResolvedValue(config);
      jest.spyOn(service as any, 'getAccessTicket').mockResolvedValue({ token: 't', sign: 's' });
      jest.spyOn(service as any, 'getLastAuthorized').mockResolvedValue(0);
      jest.spyOn(service as any, 'postSoap').mockResolvedValue(
        '<FECAEDetResponse><Resultado>A</Resultado><CbteFch>20260820</CbteFch>'
        + '<CAE>75000000000000</CAE><CAEFchVto>20260910</CAEFchVto></FECAEDetResponse>',
      );

      const result = await service.enviarDocumento(documento({
        fechaEmision: new Date('2026-08-21T02:30:00Z'),
      }));
      const payload = JSON.parse(Buffer.from(
        new URL(result.metadata.qrUrl).searchParams.get('p') as string,
        'base64',
      ).toString('utf8'));

      expect(result.success).toBe(true);
      expect(result.metadata.fechaFiscalAutorizada).toBe('2026-08-20');
      expect(payload.fecha).toBe('2026-08-20');
      jest.restoreAllMocks();
    });
  });

  describe('destinos SOAP oficiales', () => {
    it.each([
      'http://127.0.0.1:3000/steal',
      'https://10.0.0.8/wsfev1/service.asmx',
      'https://servicios1.afip.gov.ar@attacker.invalid/wsfev1/service.asmx',
      'https://servicios1.afip.gov.ar:444/wsfev1/service.asmx',
      'https://servicios1.afip.gov.ar/wsfev1/service.asmx?next=http://127.0.0.1',
      'https://servicios1.afip.gov.ar/wsfev1/service.asmx#fragment',
    ])('rechaza URL no oficial antes de hacer I/O: %s', async (url) => {
      const fetchSpy = jest.spyOn(global, 'fetch');

      expect(() => resolveArcaOfficialEndpoint('produccion', 'wsfe', url)).toThrow(
        /no autorizada|HTTPS/,
      );
      await expect((service as any).postSoap(
        url,
        '<soap/>',
        'action',
        'produccion',
        'wsfe',
      )).rejects.toThrow(/no autorizada|HTTPS/);
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('deriva el par oficial completo del ambiente y rechaza pares cruzados', () => {
      expect(normalizeArcaEndpointConfiguration({
        arca_environment: 'produccion',
      })).toMatchObject({
        arca_environment: 'produccion',
        arca_wsaa_url: ARCA_ENDPOINTS.produccion.wsaa,
        arca_wsfe_url: ARCA_ENDPOINTS.produccion.wsfe,
      });

      expect(() => normalizeArcaEndpointConfiguration({
        arca_environment: 'produccion',
        arca_wsaa_url: ARCA_ENDPOINTS.homologacion.wsaa,
        arca_wsfe_url: ARCA_ENDPOINTS.produccion.wsfe,
      })).toThrow(/no autorizada/);
    });

    it('usa redirect manual y bloquea una redirección sin seguirla', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        status: 302,
        ok: false,
        statusText: 'Found',
        text: jest.fn().mockResolvedValue(''),
      } as any);

      await expect((service as any).postSoap(
        ARCA_ENDPOINTS.homologacion.wsfe,
        '<soap/>',
        'action',
        'homologacion',
        'wsfe',
      )).rejects.toThrow('redirección bloqueada');
      expect(fetchSpy).toHaveBeenCalledWith(
        ARCA_ENDPOINTS.homologacion.wsfe,
        expect.objectContaining({ redirect: 'manual' }),
      );
      fetchSpy.mockRestore();
    });
  });

  it('rechaza CUIT/CUIL/CDI del receptor con dígito verificador inválido', async () => {
    const result = await service.validarDocumento(documento({
      receptor: {
        tipoDocumento: 'CUIT', numeroDocumento: '30712345670',
        razonSocial: 'Receptor inválido', condicionIva: 'RESPONSABLE_INSCRIPTO',
      },
    }));
    expect(result.valido).toBe(false);
    expect(result.errores.join(' ')).toContain('dígito verificador');
  });

  it('exige CUIT DocTipo 80 para comprobantes clase A', async () => {
    const result = await service.validarDocumento(documento({
      receptor: {
        tipoDocumento: 'CUIL', numeroDocumento: '20329642330',
        razonSocial: 'Receptor CUIL', condicionIva: 'MONOTRIBUTO',
      },
    }));
    expect(result.errores.join(' ')).toContain('clase A exige receptor identificado con CUIT');
  });

  it('resuelve legacy 03 como factura B y envía la condición IVA del receptor', () => {
    const fiscalDocument = documento({
      tipoDocumento: '03',
      receptor: {
        tipoDocumento: 'DNI',
        numeroDocumento: '30111222',
        razonSocial: 'Consumidor Final',
        condicionIva: 'CONSUMIDOR_FINAL',
      },
    });
    const xml = (service as any).buildAuthorizeRequest(
      { cuit: '30710158229', puntoVenta: 12 },
      { token: 't', sign: 's' },
      fiscalDocument,
      6,
      37,
      5,
    );

    expect(xml).toContain('<ar:PtoVta>12</ar:PtoVta>');
    expect(xml).toContain('<ar:CbteTipo>6</ar:CbteTipo>');
    expect(xml).toContain('<ar:DocTipo>96</ar:DocTipo>');
    expect(xml).toContain('<ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId>');
    expect(xml).toContain('<ar:BaseImp>100.00</ar:BaseImp>');
    expect(xml).toContain('<ar:Importe>21.00</ar:Importe>');
  });

  it('separa ImpNeto de las bases exentas y no gravadas sin duplicarlas', async () => {
    const fiscalDocument = documento({
      subtotal: 200,
      totalGravadas: 100,
      totalExoneradas: 60,
      totalInafectas: 40,
      totalImpuestos: 21,
      importeTotal: 221,
      items: [
        {
          descripcion: 'Gravado', cantidad: 1, precioUnitario: 100,
          valorVenta: 100, igv: 21, tasaIgv: 21,
        },
        {
          descripcion: 'Exento', cantidad: 1, precioUnitario: 60,
          valorVenta: 60, igv: 0, tasaIgv: 0,
        },
        {
          descripcion: 'No gravado', cantidad: 1, precioUnitario: 40,
          valorVenta: 40, igv: 0, tasaIgv: 0,
        },
      ],
    });

    await expect(service.validarDocumento(fiscalDocument)).resolves.toMatchObject({ valido: true });
    const xml = (service as any).buildAuthorizeRequest(
      { cuit: '30710158229', puntoVenta: 12 },
      { token: 't', sign: 's' },
      fiscalDocument,
      1,
      40,
      1,
    );

    expect(xml).toContain('<ar:ImpNeto>100.00</ar:ImpNeto>');
    expect(xml).toContain('<ar:ImpOpEx>60.00</ar:ImpOpEx>');
    expect(xml).toContain('<ar:ImpTotConc>40.00</ar:ImpTotConc>');
    expect(xml).toContain('<ar:BaseImp>100.00</ar:BaseImp>');
    expect(xml).not.toContain('<ar:ImpNeto>200.00</ar:ImpNeto>');
  });

  it('emite clase C con ImpIVA cero y sin AlicIva', () => {
    const fiscalDocument = documento({
      tipoDocumento: 'FACTURA_C',
      emisor: {
        tipoDocumento: 'CUIT', numeroDocumento: '30710158229',
        razonSocial: 'Monotributista', condicionIva: 'MONOTRIBUTO',
      },
      receptor: {
        tipoDocumento: 'CUIT', numeroDocumento: '30712345671',
        razonSocial: 'Cliente', condicionIva: 'RESPONSABLE_INSCRIPTO',
      },
      totalImpuestos: 0, importeTotal: 100, tasaImpuesto: 0,
      items: [{ descripcion: 'Servicio', cantidad: 1, precioUnitario: 100, valorVenta: 100, igv: 0, tasaIgv: 0 }],
    });
    const xml = (service as any).buildAuthorizeRequest(
      { cuit: '30710158229', puntoVenta: 12 }, { token: 't', sign: 's' },
      fiscalDocument, 11, 38, 1,
    );
    expect(xml).toContain('<ar:ImpIVA>0.00</ar:ImpIVA>');
    expect(xml).not.toContain('<ar:AlicIva>');
  });

  it('usa tipo, punto y número reales del comprobante asociado en una nota', () => {
    const fiscalDocument = documento({
      tipoDocumento: 'NOTA_CREDITO_A',
      documentoReferencia: {
        tipo: '001', serie: '00005', numero: '44', fecha: '2026-08-01',
      },
    });
    const xml = (service as any).buildAuthorizeRequest(
      { cuit: '30710158229', puntoVenta: 12 }, { token: 't', sign: 's' },
      fiscalDocument, 3, 39, 1,
    );
    expect(xml).toContain('<ar:Tipo>1</ar:Tipo><ar:PtoVta>5</ar:PtoVta><ar:Nro>44</ar:Nro>');
    expect(xml).not.toContain('<ar:Tipo>3</ar:Tipo><ar:PtoVta>12</ar:PtoVta>');
  });
});
