import {
  CPE_PDF_PRINT_FORMAT,
  CPE_PDF_QR_SIZE_MM,
  CPE_PDF_PE_TAX_BOX_MIN_MM,
  PdfGeneratorService,
  getCpeDemoPdfNotice,
  getCpeNonFiscalPdfNotice,
  resolveCpePrintedNoteReference,
  resolveCpePrintedLineTotal,
  resolveCpePrintedUnitPrice,
} from './pdf-generator.service';
import { PdfFormatHelperService, normalizeFiscalDocumentType } from './pdf-format-helper.service';

const pdfFormatHelper = new PdfFormatHelperService();

describe('representación impresa CPE', () => {
  it('renderiza con el país histórico del CPE y no con el país actual del tenant', async () => {
    const service = new PdfGeneratorService({} as any, pdfFormatHelper) as any;
    jest.spyOn(service, 'getCpeData').mockResolvedValue({
      id: 'cpe-co-historico', pais: 'CO', tipo_documento: '01', serie: 'FV01', numero: 1,
      fecha_emision: '2026-08-29', simulated_origin: true,
      issuer_snapshot: {
        contract_version: 525, country_code: 'CO', tax_id: '9001234568',
        legal_name: 'Emisor colombiano histórico', address: 'Medellín',
      },
      fiscal_authority_evidence: {
        contract_version: 525, authority: 'DIAN', country_code: 'CO', status: 'SIMULATED',
      },
      items: [{ cantidad: 1, descripcion: 'Servicio demo', total_item: 119 }],
    });
    jest.spyOn(service, 'getCountryCode').mockResolvedValue('PE');
    jest.spyOn(service, 'getEmpresaConfig').mockResolvedValue({
      ruc: '20600000013', razon_social: 'Empresa peruana actual', direccion_fiscal: 'Lima',
    });
    jest.spyOn(service, 'generateQRCode').mockResolvedValue(null);
    const buildSpy = jest.spyOn(service, 'buildPdfDocument').mockResolvedValue(Buffer.from('%PDF-'));

    await expect(service.generateSunatCompliantPdf('cpe-co-historico', 'tenant-convertido'))
      .resolves.toEqual(Buffer.from('%PDF-'));
    expect(service.getEmpresaConfig).toHaveBeenCalledWith('tenant-convertido', 'PE');
    expect(buildSpy).toHaveBeenCalledWith(
      expect.objectContaining({ dian_print_info: expect.any(Object) }),
      expect.objectContaining({
        ruc: '9001234568', razon_social: 'Emisor colombiano histórico',
      }),
      null,
      'CO',
    );
  });

  it('usa la hoja A4 normalizada de 210 por 297 milímetros', () => {
    expect(CPE_PDF_PRINT_FORMAT).toEqual({
      size: 'A4',
      widthMm: 210,
      heightMm: 297,
    });
  });

  it('genera físicamente una página PDF A4 de 210 por 297 milímetros', async () => {
    const service = new PdfGeneratorService({} as any, pdfFormatHelper) as any;
    const onePixelPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const pdf = await service.buildPdfDocument(
      {
        tipo_documento: '01',
        ruc_emisor: '20600000013',
        serie: 'F001',
        numero: 1,
        fecha_emision: '2026-08-25',
        fecha_vencimiento: '2026-08-25',
        moneda: 'PEN',
        razon_social_receptor: 'Cliente Demo S.A.C.',
        tipo_documento_receptor: '6',
        documento_receptor: '20600000021',
        direccion_receptor: 'Lima',
        total_gravadas: 152.37,
        total_igv: 27.43,
        total_venta: 179.8,
        estado: 'FIRMADO',
        items: [{
          cantidad: 2,
          unidad_medida: 'NIU',
          descripcion: 'Audífonos Bluetooth',
          precio_unitario: 76.185,
          precio_venta: 89.9,
          valor_venta: 152.37,
          total_item: 179.8,
        }],
      },
      {
        razon_social: 'Comercial Andina Demo S.A.C.',
        ruc: '20600000013',
        direccion_fiscal: 'Lima',
        is_demo: true,
      },
      onePixelPng,
      'PE',
    );

    const mediaBox = pdf
      .toString('latin1')
      .match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    expect(mediaBox).not.toBeNull();

    const pointsToMillimeters = (points: string) => Number(points) * 25.4 / 72;
    expect(pointsToMillimeters(mediaBox![1])).toBeCloseTo(210, 0);
    expect(pointsToMillimeters(mediaBox![2])).toBeCloseTo(297, 0);
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).toHaveLength(1);
  }, 30_000);

  it('imprime el importe persistido de la línea y conserva descuentos y redondeos', () => {
    const demoLine = {
      cantidad: 2,
      precio_unitario: 76.185,
      precio_venta: 89.9,
      valor_venta: 152.37,
      total_item: 179.8,
    };
    expect(resolveCpePrintedUnitPrice(demoLine)).toBeCloseTo(89.9, 2);
    expect(resolveCpePrintedLineTotal(demoLine)).toBe(179.8);
    expect(resolveCpePrintedLineTotal({
      cantidad: 2,
      precio_unitario: 100,
      valor_venta: 175.55,
      subtotal: 180,
    })).toBe(175.55);
    expect(resolveCpePrintedLineTotal({
      cantidad: 2,
      precio_unitario: 100,
      subtotal: 180,
    })).toBe(180);
    expect(resolveCpePrintedLineTotal({
      cantidad: 2,
      precio_unitario: 100,
    })).toBe(200);
  });

  it('declara de forma inequívoca que el PDF demo peruano no tiene validez SUNAT', () => {
    expect(getCpeDemoPdfNotice('PE')).toBe('MUESTRA DEMO · SIN ENVÍO NI VALIDEZ SUNAT');
    expect(getCpeNonFiscalPdfNotice('PE', 'SIMULATED'))
      .toBe('MUESTRA DEMO · SIN ENVÍO NI VALIDEZ SUNAT');
    expect(getCpeNonFiscalPdfNotice('PE', 'LEGACY_UNVERIFIED'))
      .toBe('SIN VALIDEZ FISCAL · PROCEDENCIA LEGACY NO VERIFICABLE');
    expect(getCpeNonFiscalPdfNotice('CO', 'PENDING'))
      .toBe('SIN ACEPTACIÓN NI VALIDEZ DIAN');
  });

  it('limita el QR impreso a menos de seis centímetros', () => {
    expect(CPE_PDF_QR_SIZE_MM).toBeGreaterThanOrEqual(20);
    expect(CPE_PDF_QR_SIZE_MM).toBeLessThanOrEqual(60);
  });

  it('reserva en PE un recuadro fiscal de al menos 8 por 4 centímetros', () => {
    const rect = jest.fn().mockReturnThis();
    const doc: any = {
      y: 0,
      rect,
      stroke: jest.fn().mockReturnThis(),
      image: jest.fn().mockReturnThis(),
      fontSize: jest.fn().mockReturnThis(),
      font: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      heightOfString: jest.fn(() => 12),
    };
    const service = new PdfGeneratorService({} as any, pdfFormatHelper) as any;
    service.addHeader(
      doc,
      { razon_social: 'Emisor PE', ruc: '20600000013', direccion_fiscal: 'Lima' },
      { tipo_documento: '01', ruc_emisor: '20600000013', serie: 'F001', numero: 1 },
      'PE',
    );

    const [, , widthPoints, heightPoints] = rect.mock.calls[0];
    expect(widthPoints * 25.4 / 72).toBeGreaterThanOrEqual(CPE_PDF_PE_TAX_BOX_MIN_MM.width);
    expect(heightPoints * 25.4 / 72).toBeGreaterThanOrEqual(CPE_PDF_PE_TAX_BOX_MIN_MM.height);
  });

  it('imprime autorización, rango, generación y pago DIAN en el bloque fiscal', () => {
    const calls: string[] = [];
    const doc: any = {
      y: 100, page: { height: 841.89, margins: { bottom: 50 } },
      fontSize: jest.fn().mockReturnThis(), font: jest.fn().mockReturnThis(),
      text: jest.fn((value: unknown) => { calls.push(String(value)); return doc; }),
      heightOfString: jest.fn(() => 10), addPage: jest.fn().mockReturnThis(),
    };
    const service = new PdfGeneratorService({} as any, pdfFormatHelper) as any;
    service.addDianFiscalInfo(doc, {
      authorizationNumber: '18760000001', authorizationPrefix: 'FE',
      rangeFrom: 1, rangeTo: 50000, validFrom: '2026-01-01', validTo: '2027-12-31',
      consecutive: 'FE-00000009', generatedAt: '2026-08-29T10:15:00-05:00',
      paymentForm: 'CREDITO', paymentTerm: '30 días', paymentMethod: 'TRANSFERENCIA',
      taxQualities: ['Gran contribuyente'], softwareId: 'SOFTWARE-DIAN-01',
    });
    expect(calls).toEqual(expect.arrayContaining([
      'INFORMACIÓN FISCAL DIAN',
      'Autorización de numeración: 18760000001',
      'Prefijo y rango: FE 1 a 50000',
      'Generación/expedición: 2026-08-29T10:15:00-05:00',
      'Pago: CREDITO · 30 días · TRANSFERENCIA',
      'Software DIAN: SOFTWARE-DIAN-01',
    ]));
  });

  it('imprime CAE, vencimiento y leyenda A-retención ARCA', () => {
    const calls: string[] = [];
    const doc: any = {
      y: 100, page: { height: 841.89, margins: { bottom: 50 } },
      fontSize: jest.fn().mockReturnThis(), font: jest.fn().mockReturnThis(),
      text: jest.fn((value: unknown) => { calls.push(String(value)); return doc; }),
      addPage: jest.fn().mockReturnThis(),
    };
    const service = new PdfGeneratorService({} as any, pdfFormatHelper) as any;
    service.addArcaAuthorizationInfo(doc, {
      documentType: '051', authorizationCode: '70417054367476', authorizationLabel: 'CAE',
      authorizationExpiry: '20260910', pointOfSale: 12, documentNumber: 9,
      specialLegend: 'OPERACIÓN SUJETA A RETENCIÓN',
    });
    expect(calls).toEqual(expect.arrayContaining([
      'COMPROBANTE AUTORIZADO', 'CAE: 70417054367476', 'Vencimiento CAE: 10/09/2026',
      'Punto de venta: 00012 · Comprobante: 00000009', 'OPERACIÓN SUJETA A RETENCIÓN',
    ]));
  });

  it('falla cerrado si una representación peruana no puede formar su QR', async () => {
    const service = new PdfGeneratorService({} as any, {} as any) as any;
    await expect(service.generateQRCode({}, 'PE')).rejects.toThrow(
      'No se puede generar la representación CPE sin QR SUNAT válido',
    );
  });

  it('genera QR DIAN sólo desde evidencia terminal dedicada, nunca desde metadata/hash XML', async () => {
    const service = new PdfGeneratorService({} as any, {} as any) as any;
    const qr = await service.generateQRCode({
      simulated_origin: false,
      fiscal_authority_evidence: {
        status: 'ACCEPTED', authority: 'DIAN', country_code: 'CO',
        code_kind: 'CUFE', unique_code: 'A'.repeat(96),
      },
    }, 'CO');
    expect(qr).toMatch(/^data:image\/png;base64,/);
    await expect(service.generateQRCode({ simulated_origin: false, hash: 'A'.repeat(96) }, 'CO')).rejects.toThrow(
      'falta evidencia terminal 525',
    );
  });

  it('exige QR ARCA en documentos reales y permite omitir autorización sólo en demo', async () => {
    const service = new PdfGeneratorService({} as any, pdfFormatHelper) as any;
    const arcaInvoice = {
      tipo_documento: '001', serie: '00005', numero: 94,
      fecha_emision: '2026-08-29', ruc_emisor: '30700000001',
      tipo_documento_receptor: 'CUIT', documento_receptor: '30712345678',
      total_venta: 121, moneda: 'ARS', hash: '70417054367476',
      metadata: {
        fiscal_country: 'AR', arca_cae: '70417054367476', arca_cae_vencimiento: '20260910',
        arca_punto_venta: 5, arca_cbte_tipo: 1, arca_cbte_numero: 94,
      },
    };
    expect(pdfFormatHelper.isQRCodeRequired('AR')).toBe(true);
    await expect(service.generateQRCode(arcaInvoice, 'AR', false))
      .resolves.toMatch(/^data:image\/png;base64,/);
    await expect(service.generateQRCode({
      ...arcaInvoice, hash: null, metadata: { ...arcaInvoice.metadata, arca_cae: null },
    }, 'AR', false))
      .rejects.toThrow('falta CAE válido de 14 dígitos');
    await expect(service.generateQRCode({ ...arcaInvoice, hash: null, metadata: {} }, 'AR', true))
      .resolves.toBeNull();
  });

  it('conserva el día fiscal de una fecha ISO sin desplazarlo por zona horaria', () => {
    const service = new PdfGeneratorService({} as any, {} as any) as any;
    expect(service.formatDate('2026-08-29', 'PE')).toBe('29/08/2026');
  });

  it.each([
    ['01', 'Representación impresa de la Factura Electrónica.'],
    ['03', 'Representación impresa de la Boleta de Venta Electrónica.'],
    ['07', 'Representación impresa de la Nota de Crédito Electrónica.'],
    ['08', 'Representación impresa de la Nota de Débito Electrónica.'],
  ])('usa la leyenda exacta para el tipo %s', (type, expected) => {
    const service = new PdfGeneratorService({} as any, pdfFormatHelper) as any;
    expect(service.getPrintedRepresentationLegend(type, 'PE')).toBe(expected);
  });

  it.each([
    ['CO', '91', 'NOTA DE CRÉDITO ELECTRÓNICA', 'Representación gráfica de la Nota de Crédito Electrónica.'],
    ['AR', '002', 'NOTA DE DÉBITO ELECTRÓNICA A', 'Representación gráfica de la Nota de Débito Electrónica A.'],
  ])(
    'genera un PDF A4 real con nombre y leyenda fiscal de %s',
    async (countryCode, type, expectedHeader, expectedLegend) => {
      const service = new PdfGeneratorService({} as any, pdfFormatHelper) as any;
      const headerSpy = jest.spyOn(pdfFormatHelper, 'getHeaderText');
      const legendSpy = jest.spyOn(pdfFormatHelper, 'getPrintedRepresentationLegend');
      const onePixelPng =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      try {
        const pdf = await service.buildPdfDocument(
          {
            tipo_documento: type,
            ruc_emisor: countryCode === 'AR' ? '30700000001' : '9001234567',
            serie: countryCode === 'AR' ? '00001' : 'NC01',
            numero: 9,
            fecha_emision: '2026-08-29',
            moneda: countryCode === 'AR' ? 'ARS' : 'COP',
            razon_social_receptor: 'Cliente fiscal',
            tipo_documento_receptor: countryCode === 'AR' ? 'CUIT' : '31',
            documento_receptor: countryCode === 'AR' ? '30712345678' : '9011234567',
            total_gravadas: 100,
            total_igv: countryCode === 'AR' ? 21 : 19,
            total_venta: countryCode === 'AR' ? 121 : 119,
            items: [{ cantidad: 1, unidad_medida: 'UN', descripcion: 'Servicio', total_item: 119 }],
            ...(countryCode === 'AR' ? {
              metadata: { arca_cbte_tipo: 2, arca_punto_venta: 1, arca_cbte_numero: 9 },
            } : {}),
          },
          {
            razon_social: 'Emisor fiscal',
            ruc: countryCode === 'AR' ? '30700000001' : '9001234567',
            direccion_fiscal: 'Domicilio fiscal',
            is_demo: true,
          },
          onePixelPng,
          countryCode,
        );

        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
        expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).toHaveLength(1);
        expect(headerSpy).toHaveBeenCalledWith(countryCode, type);
        expect(pdfFormatHelper.getHeaderText(countryCode, type)).toBe(expectedHeader);
        expect(legendSpy).toHaveBeenCalledWith(countryCode, type);
        expect(pdfFormatHelper.getPrintedRepresentationLegend(countryCode, type)).toBe(expectedLegend);
      } finally {
        headerSpy.mockRestore();
        legendSpy.mockRestore();
      }
    },
  );

  it.each([
    ['01'], ['03'], ['07'], ['08'],
  ])('no adivina clase ARCA A/B/C desde el alias ambiguo %s', (legacy) => {
    expect(normalizeFiscalDocumentType('AR', legacy)).toBe(legacy);
    expect(pdfFormatHelper.getHeaderText('AR', legacy)).toBe('COMPROBANTE ELECTRÓNICO');
  });

  it('presenta 051 como comprobante A sujeto a retención, no como clase M', () => {
    expect(pdfFormatHelper.getHeaderText('AR', '051'))
      .toBe('FACTURA ELECTRÓNICA A - OPERACIÓN SUJETA A RETENCIÓN');
    expect(pdfFormatHelper.getPrintedRepresentationLegend('AR', '051'))
      .toContain('Operación sujeta a retención');
  });

  it('no atribuye a todos los emisores una resolución SUNAT específica', () => {
    const footer = pdfFormatHelper.getFooterLegalText('PE', '07');

    expect(footer).toEqual([
      'Representación impresa de la Nota de Crédito Electrónica.',
      'Consulte su comprobante en: www.sunat.gob.pe',
    ]);
    expect(footer.join(' ')).not.toMatch(/Resolución de Intendencia|034-005-0000832/i);
  });

  it('no afirma una autorización DIAN genérica y respeta el tipo colombiano', () => {
    const footer = pdfFormatHelper.getFooterLegalText('CO', '91');

    expect(footer).toEqual([
      'Representación gráfica de la Nota de Crédito Electrónica.',
      'Consulte la validez en: www.dian.gov.co',
    ]);
    expect(footer.join(' ')).not.toMatch(/Autorizada por la DIAN/i);
  });

  it.each([
    ['PE', '01', 'RUC: 20600000013', 'FACTURA ELECTRÓNICA F001-00000001'],
    ['CO', '91', 'NIT: 9001234567', 'NOTA DE CRÉDITO ELECTRÓNICA NC01-00000002'],
    ['AR', '002', 'CUIT: 30700000001', 'NOTA DE DÉBITO ELECTRÓNICA A 00005-00000003'],
  ])(
    'identifica emisor y comprobante en el encabezado de continuación %s',
    (countryCode, type, expectedTaxId, expectedDocument) => {
      const textCalls: string[] = [];
      const doc: any = {
        y: 50,
        page: { margins: { top: 50 } },
        fontSize: jest.fn().mockReturnThis(), font: jest.fn().mockReturnThis(),
        text: jest.fn((value: unknown) => { textCalls.push(String(value)); return doc; }),
        moveTo: jest.fn().mockReturnThis(), lineTo: jest.fn().mockReturnThis(),
        stroke: jest.fn().mockReturnThis(),
      };
      const service = new PdfGeneratorService({} as any, pdfFormatHelper) as any;
      service.addContinuationHeader(
        doc,
        { razon_social: 'Emisor fiscal', ruc: expectedTaxId.split(': ')[1] },
        {
          tipo_documento: type,
          serie: countryCode === 'PE' ? 'F001' : countryCode === 'CO' ? 'NC01' : '00005',
          numero: countryCode === 'PE' ? 1 : countryCode === 'CO' ? 2 : 3,
        },
        countryCode,
      );

      expect(textCalls).toContain('Emisor fiscal');
      expect(textCalls).toContain(expectedTaxId);
      expect(textCalls).toContain(expectedDocument);
      expect(textCalls).toContain('PÁGINA DE CONTINUACIÓN');
      expect(doc.y).toBe(83);
    },
  );

  it('usa la consulta vigente de ARCA en la leyenda del PDF', () => {
    const service = new PdfGeneratorService({} as any, pdfFormatHelper) as any;
    expect(service.getFiscalConsultUrl('AR')).toBe('www.arca.gob.ar/fe/qr');
  });

  it('repite el QR DIAN en cada página de una representación gráfica multipágina', async () => {
    const service = new PdfGeneratorService({} as any, pdfFormatHelper) as any;
    const qrSpy = jest.spyOn(service, 'addRepeatedPageQRCode');
    const continuationSpy = jest.spyOn(service, 'addContinuationHeader');
    const onePixelPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const pdf = await service.buildPdfDocument(
      {
        tipo_documento: '01', ruc_emisor: '9001234567', serie: 'FV01', numero: 20,
        simulated_origin: false,
        fiscal_authority_evidence: {
          status: 'ACCEPTED', authority: 'DIAN', country_code: 'CO',
          code_kind: 'CUFE', unique_code: 'A'.repeat(96),
          authorization: {
            number: '18760000001', prefix: 'FV', range_from: 1, range_to: 50000,
            valid_from: '2026-01-01', valid_to: '2027-12-31', software_id: 'SOFTWARE-DIAN-01',
          },
        },
        fecha_emision: '2026-08-29T10:30:00-05:00', moneda: 'COP',
        condicion_pago: 'CONTADO', medio_pago: 'EFECTIVO',
        razon_social_receptor: 'Cliente colombiano', tipo_documento_receptor: '31',
        documento_receptor: '9011234567', total_gravadas: 100, total_igv: 19,
        total_venta: 119, estado: 'FIRMADO',
        items: Array.from({ length: 65 }, (_, index) => ({
          cantidad: 1, unidad_medida: 'NIU', descripcion: `Línea colombiana ${index + 1}`, total_item: 119,
        })),
      },
      { razon_social: 'Emisor Colombia', ruc: '9001234567', direccion_fiscal: 'Bogotá', is_demo: true },
      onePixelPng,
      'CO',
    );

    const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    expect(pageCount).toBeGreaterThan(1);
    expect(qrSpy).toHaveBeenCalledTimes(pageCount);
    expect(continuationSpy).toHaveBeenCalledTimes(pageCount - 1);
    expect(qrSpy.mock.calls.every(([, , authority]: unknown[]) => authority === 'DIAN')).toBe(true);
  });

  it('identifica las páginas de continuación en un PDF argentino multipágina', async () => {
    const service = new PdfGeneratorService({} as any, pdfFormatHelper) as any;
    const continuationSpy = jest.spyOn(service, 'addContinuationHeader');
    const onePixelPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const pdf = await service.buildPdfDocument(
      {
        tipo_documento: '001', ruc_emisor: '30700000001', serie: '00005', numero: 30,
        fecha_emision: '2026-08-29', moneda: 'ARS', razon_social_receptor: 'Cliente argentino',
        tipo_documento_receptor: 'CUIT', documento_receptor: '30712345678',
        total_gravadas: 100, total_igv: 21, total_venta: 121,
        metadata: { arca_cbte_tipo: 1, arca_punto_venta: 5, arca_cbte_numero: 30 },
        items: Array.from({ length: 65 }, (_, index) => ({
          cantidad: 1, unidad_medida: 'UN', descripcion: `Línea argentina ${index + 1}`, total_item: 121,
        })),
      },
      { razon_social: 'Emisor Argentina', ruc: '30700000001', direccion_fiscal: 'Buenos Aires', is_demo: true },
      onePixelPng,
      'AR',
    );

    const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    expect(pageCount).toBeGreaterThan(1);
    expect(continuationSpy).toHaveBeenCalledTimes(pageCount - 1);
  });

  it.each([
    ['07', '01', 'F001', '15', '10', 'Devolución parcial', 'FACTURA ELECTRÓNICA F001-00000015'],
    ['08', '03', 'B001', '9', '01', 'Intereses por mora', 'BOLETA DE VENTA ELECTRÓNICA B001-00000009'],
  ])(
    'imprime comprobante modificado, código y sustento para la nota %s',
    (noteType, referenceType, series, number, reasonCode, reason, expectedDocument) => {
      const note = {
        tipo_documento: noteType,
        documento_referencia_tipo: referenceType,
        documento_referencia_serie: series,
        documento_referencia_numero: number,
        ...(noteType === '07' ? { tipo_nota_credito: reasonCode } : { tipo_nota_debito: reasonCode }),
        motivo_nota: reason,
      };
      expect(resolveCpePrintedNoteReference(note)).toMatchObject({
        referenceNumber: `${series}-${String(number).padStart(8, '0')}`,
        reasonCode,
        reason,
      });

      const textCalls: string[] = [];
      const doc: any = {
        y: 100,
        page: { height: 841.89, margins: { bottom: 50 } },
        fontSize: jest.fn().mockReturnThis(),
        font: jest.fn().mockReturnThis(),
        text: jest.fn((value: unknown) => { textCalls.push(String(value)); return doc; }),
        heightOfString: jest.fn(() => 10),
        addPage: jest.fn().mockReturnThis(),
      };
      const service = new PdfGeneratorService({} as any, pdfFormatHelper) as any;
      service.addNoteReferenceInfo(doc, note, 'PE');

      expect(textCalls).toContain(`Comprobante modificado: ${expectedDocument}`);
      expect(textCalls).toContain(`Código de motivo de la nota: ${reasonCode}`);
      expect(textCalls).toContain(`Motivo o sustento: ${reason}`);
    },
  );

  it('recupera el detalle normalizado del documento cuando el JSON legado del CPE está vacío', async () => {
    const cpeChain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'cpe-1', tenant_id: 'tenant-1', documento_id: 'doc-1', items: [] },
        error: null,
      }),
    };
    const detailRows = [{ orden: 1, descripcion: 'Audífonos Bluetooth', cantidad: 2, valor_venta: 152.37 }];
    const detailsChain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: detailRows, error: null }),
    };
    const client = {
      from: jest.fn((table: string) => table === 'cpe' ? cpeChain : detailsChain),
    };
    const service = new PdfGeneratorService(
      { getClient: () => client } as any,
      {} as any,
    ) as any;

    await expect(service.getCpeData('cpe-1', 'tenant-1')).resolves.toMatchObject({
      items: detailRows,
    });
    expect(client.from).toHaveBeenCalledWith('documento_detalles');
    expect(detailsChain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    expect(detailsChain.eq).toHaveBeenCalledWith('documento_id', 'doc-1');
  });

  it('muestra unidad y omite renglones de totales con importe cero', () => {
    const textCalls: string[] = [];
    const doc: any = {
      y: 100,
      page: { height: 841.89, margins: { bottom: 50 } },
      fontSize: jest.fn().mockReturnThis(),
      font: jest.fn().mockReturnThis(),
      text: jest.fn((value: unknown) => { textCalls.push(String(value)); return doc; }),
      heightOfString: jest.fn(() => 10),
      moveTo: jest.fn().mockReturnThis(),
      lineTo: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
      addPage: jest.fn().mockReturnThis(),
    };
    const service = new PdfGeneratorService({} as any, {} as any) as any;
    service.addItemsTable(doc, { items: [{
      cantidad: 1,
      unidad_medida: 'ZZ',
      descripcion: 'Servicio profesional',
      total_item: 118,
    }] });
    service.addTotales(doc, {
      moneda: 'PEN',
      total_gravadas: 100,
      total_exoneradas: 0,
      total_inafectas: 0,
      total_igv: 18,
      total_venta: 118,
    }, 'PE');

    expect(textCalls).toContain('UND.');
    expect(textCalls).toContain('ZZ');
    expect(textCalls).toContain('Op. Gravadas:');
    expect(textCalls).toContain('IGV (18%):');
    expect(textCalls).not.toContain('Op. Exoneradas:');
    expect(textCalls).not.toContain('Op. Inafectas:');
  });

  it('mueve el primer encabezado a otra hoja y representa una descripción vacía', () => {
    const textCalls: Array<{ value: string; y?: number }> = [];
    const doc: any = {
      y: 755,
      page: { height: 841.89, margins: { bottom: 50 } },
      fontSize: jest.fn().mockReturnThis(),
      font: jest.fn().mockReturnThis(),
      text: jest.fn((value: unknown, _x?: number, y?: number) => {
        textCalls.push({ value: String(value), y });
        return doc;
      }),
      heightOfString: jest.fn(() => 10),
      moveTo: jest.fn().mockReturnThis(),
      lineTo: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
      addPage: jest.fn().mockReturnThis(),
    };
    const service = new PdfGeneratorService({} as any, {} as any) as any;

    service.addItemsTable(doc, { items: [{ cantidad: 1, descripcion: '   ', total_item: 10 }] });

    expect(doc.addPage).toHaveBeenCalledTimes(1);
    expect(textCalls.find((call) => call.value === 'CANT.')?.y).toBe(58);
    expect(textCalls.some((call) => call.value === 'Producto')).toBe(true);
  });

  it('mueve un ítem completo a la siguiente hoja en vez de dejar texto huérfano', () => {
    const textCalls: Array<{ value: string; y?: number }> = [];
    const doc: any = {
      y: 720,
      page: { height: 841.89, margins: { bottom: 50 } },
      fontSize: jest.fn().mockReturnThis(),
      font: jest.fn().mockReturnThis(),
      text: jest.fn((value: unknown, _x?: number, y?: number) => {
        textCalls.push({ value: String(value), y });
        return doc;
      }),
      heightOfString: jest.fn((value: unknown) => (
        Math.max(1, Math.ceil(String(value).length / 35)) * 10
      )),
      moveTo: jest.fn().mockReturnThis(),
      lineTo: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
      addPage: jest.fn().mockReturnThis(),
    };
    const service = new PdfGeneratorService({} as any, {} as any) as any;
    const description = Array.from(
      { length: 18 },
      (_, index) => `detalle-${index + 1}`,
    ).join(' ');

    service.addItemsTable(doc, {
      items: [{ cantidad: 2, unidad_medida: 'NIU', descripcion: description, total_item: 23.6 }],
    });

    expect(doc.addPage).toHaveBeenCalledTimes(1);
    expect(textCalls.filter((call) => call.value === description)).toHaveLength(1);
    const descriptionCall = textCalls.find((call) => call.value === description);
    const quantityCall = textCalls.find((call) => call.value === '2');
    expect(descriptionCall?.y).toBe(quantityCall?.y);
    expect(descriptionCall?.y).toBeGreaterThan(80);
  });

  it('mantiene todas las columnas del ítem 13 juntas en el PDFKit real multipágina', async () => {
    const PDFDocument = (await import('pdfkit')).default as any;
    const prototype = PDFDocument.prototype as any;
    const originalAddPage = prototype.addPage;
    const originalText = prototype.text;
    const pageByDocument = new WeakMap<object, number>();
    const textCalls: Array<{ value: string; x?: number; y?: number; page: number }> = [];
    const addPageSpy = jest.spyOn(prototype, 'addPage').mockImplementation(function (
      this: object,
      ...args: any[]
    ) {
      const result = originalAddPage.apply(this, args);
      pageByDocument.set(this, (pageByDocument.get(this) || 0) + 1);
      return result;
    });
    const textSpy = jest.spyOn(prototype, 'text').mockImplementation(function (
      this: object,
      ...args: any[]
    ) {
      textCalls.push({
        value: String(args[0]),
        x: typeof args[1] === 'number' ? args[1] : undefined,
        y: typeof args[2] === 'number' ? args[2] : undefined,
        page: pageByDocument.get(this) || 1,
      });
      return originalText.apply(this, args);
    });

    const description = (index: number) =>
      `Producto de demostración ${index}: descripción extensa para verificar saltos de línea, columnas y continuidad entre páginas A4 sin superposición.`;
    const onePixelPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const service = new PdfGeneratorService({} as any, pdfFormatHelper) as any;

    try {
      await service.buildPdfDocument(
        {
          tipo_documento: '01', ruc_emisor: '20600000013', serie: 'F001', numero: 523,
          fecha_emision: '2026-08-29', fecha_vencimiento: '2026-09-28', moneda: 'PEN',
          razon_social_receptor: 'COMERCIAL ANDINA DEMOSTRACIÓN S.A.C.',
          tipo_documento_receptor: '6', documento_receptor: '20600000021',
          direccion_receptor: 'Av. Ejemplo 456, Miraflores, Lima',
          total_gravadas: 550, total_igv: 99, total_venta: 649, tasa_igv: 18,
          estado: 'FIRMADO', valor_resumen: 'QA523DIGESTVALUE',
          items: Array.from({ length: 55 }, (_, index) => ({
            cantidad: 1, unidad_medida: 'NIU', descripcion: description(index + 1),
            precio_unitario: 10, precio_venta: 11.8, valor_venta: 10, total_item: 11.8,
          })),
        },
        {
          razon_social: 'NEON ERP DEMO S.A.C.', ruc: '20600000013',
          direccion_fiscal: 'Av. Demo 123, Miraflores, Lima', is_demo: true,
        },
        onePixelPng,
        'PE',
      );
    } finally {
      textSpy.mockRestore();
      addPageSpy.mockRestore();
    }

    const item13 = textCalls.filter((call) => call.value === description(13));
    expect(item13).toHaveLength(1);
    expect(item13[0].page).toBe(2);
    expect(textCalls).not.toContainEqual(expect.objectContaining({
      value: 'A4 sin superposición.',
    }));
    for (const [value, x] of [['1', 50], ['NIU', 88], ['11.80', 360], ['11.80', 442]] as const) {
      expect(textCalls).toContainEqual(expect.objectContaining({
        value, x, y: item13[0].y, page: item13[0].page,
      }));
    }
  });

  it('pagina descripciones extensas sin salir del área útil A4', async () => {
    const service = new PdfGeneratorService({} as any, pdfFormatHelper) as any;
    const continuationSpy = jest.spyOn(service, 'addContinuationHeader');
    const onePixelPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const longDescription = Array.from(
      { length: 800 },
      (_, index) => `detalle-${index + 1}`,
    ).join(' ');
    const pdf = await service.buildPdfDocument(
      {
        tipo_documento: '01', ruc_emisor: '20600000013', serie: 'F001', numero: 2,
        fecha_emision: '2026-08-25', moneda: 'PEN',
        razon_social_receptor: 'Cliente con detalle extenso S.A.C.',
        tipo_documento_receptor: '6', documento_receptor: '20600000021',
        total_gravadas: 100, total_igv: 18, total_venta: 118, estado: 'FIRMADO',
        items: [{ cantidad: 1, unidad_medida: 'NIU', descripcion: longDescription, total_item: 118 }],
      },
      { razon_social: 'Emisor S.A.C.', ruc: '20600000013', direccion_fiscal: 'Lima' },
      onePixelPng,
      'PE',
    );

    const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    expect(pageCount).toBeGreaterThan(1);
    expect(continuationSpy).toHaveBeenCalledTimes(pageCount - 1);
    const mediaBoxes = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+[\d.]+\s+[\d.]+\s*\]/g) || [];
    expect(mediaBoxes.length).toBe(pageCount);
  });
});
