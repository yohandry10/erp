import { DocumentoElectronico } from '../../../shared/integration/fiscal.interfaces';
import {
  DianXmlBuilderService,
  type DianTaxInput,
} from './dian-xml-builder.service';

const context = {
  environmentId: '2' as const,
  software: { id: 'SOFTWARE-DIAN-01', pin: 'PIN-PRIVADO-01' },
  authorization: {
    number: '18760000001', prefix: 'FV', rangeFrom: 1, rangeTo: 50000,
    validFrom: '2026-01-01', validTo: '2027-12-31', technicalKey: 'CLAVE-TECNICA-RANGO',
  },
  taxes: { iva: 19, inc: 0, ica: 0 },
};

function invoice(overrides: Record<string, unknown> = {}): DocumentoElectronico {
  return {
    id: 'cpe-co-1', tipoDocumento: '01', serie: 'FV', numero: '125',
    fechaEmision: '2026-08-29T10:15:30-05:00', moneda: 'COP',
    emisor: {
      tipoDocumento: '31', numeroDocumento: '9001234568', razonSocial: 'EMISOR CO SAS',
      direccion: 'Carrera 7 # 72-41', ciudad: 'Bogotá D.C.', departamento: 'Bogotá D.C.',
      codigoUbigeo: '11001', codigoDepartamento: '11', regimenFiscal: 'O-13',
      tipoContribuyente: '1',
    },
    receptor: {
      tipoDocumento: '13', numeroDocumento: '1020304050', razonSocial: 'Cliente CO',
      dianTaxProfile: {
        profile: 'CONSUMIDOR_FINAL', taxLevelCode: 'R-99-PN', taxLevelListName: '49',
        taxSchemeId: 'ZY', taxSchemeName: 'No causa',
      },
    },
    subtotal: 100, totalGravadas: 100, totalImpuestos: 19, importeTotal: 119,
    tasaImpuesto: 0.19, formaPago: 'CONTADO', medioPago: '10', dianContext: context,
    items: [{
      descripcion: 'Servicio', cantidad: 1, unidadMedida: 'NIU', precioUnitario: 100,
      valorVenta: 100, igv: 19, tasaIgv: 0.19, codigoProducto: 'SERV-01',
    }],
    ...overrides,
  } as DocumentoElectronico;
}

describe('DianXmlBuilderService · FEV Anexo 1.9', () => {
  const service = new DianXmlBuilderService();

  it('emite Invoice con DIANExtensions, CUFE, seguridad, QR y extensión separada para firma', async () => {
    const xml = await service.generarFacturaElectronica(invoice());

    expect((xml.match(/<ext:UBLExtension>/g) || [])).toHaveLength(2);
    expect(xml).toContain('<ext:ExtensionContent/>');
    expect(xml).toContain('<sts:DianExtensions>');
    expect(xml).toContain('<sts:InvoiceAuthorization>18760000001</sts:InvoiceAuthorization>');
    expect(xml).toContain('<sts:Prefix>FV</sts:Prefix>');
    expect(xml).toContain(
      '<cbc:ProfileID>DIAN 2.1: Factura Electrónica de Venta</cbc:ProfileID>',
    );
    expect(xml).toContain('<cbc:ProfileExecutionID>2</cbc:ProfileExecutionID>');
    expect(xml).toMatch(/<cbc:UUID schemeID="2" schemeName="CUFE-SHA384">[0-9a-f]{96}<\/cbc:UUID>/);
    expect(xml).toMatch(/<sts:SoftwareSecurityCode[^>]*>[0-9a-f]{96}<\/sts:SoftwareSecurityCode>/);
    expect(xml).toContain('catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=');
    expect(xml).not.toContain('PIN-PRIVADO-01');
    expect(xml).toContain('<cbc:IssueTime>10:15:30-05:00</cbc:IssueTime>');
    expect(xml).toContain('<cbc:LineCountNumeric>1</cbc:LineCountNumeric>');
    expect(xml).toContain('<cbc:TaxLevelCode listName="05">O-13</cbc:TaxLevelCode>');
    expect(xml).toContain('<cbc:TaxLevelCode listName="49">R-99-PN</cbc:TaxLevelCode>');
    expect(xml).toContain('<cbc:ID>ZY</cbc:ID>');
    expect(xml).toContain('<cbc:Name>No causa</cbc:Name>');
  });

  it('emite el adquirente NIT B2B con responsabilidad O-99 e IVA', async () => {
    const xml = await service.generarFacturaElectronica(invoice({
      receptor: {
        tipoDocumento: '31', numeroDocumento: '9001082813', razonSocial: 'ADQUIRIENTE SAS',
        dianTaxProfile: {
          profile: 'ADQUIRIENTE_NIT_B2B', taxLevelCode: 'O-99', taxLevelListName: '04',
          taxSchemeId: '01', taxSchemeName: 'IVA',
        },
      },
    }));
    expect(xml).toContain('<cbc:AdditionalAccountID>1</cbc:AdditionalAccountID>');
    expect(xml).toContain('<cbc:TaxLevelCode listName="04">O-99</cbc:TaxLevelCode>');
    expect(xml).toContain('<cbc:ID>01</cbc:ID>');
    expect(xml).toContain('<cbc:Name>IVA</cbc:Name>');
  });

  it('cierra si falta el perfil fiscal o si un NIT intenta usar consumidor final', async () => {
    await expect(service.generarFacturaElectronica(invoice({
      receptor: { tipoDocumento: '13', numeroDocumento: '1020304050', razonSocial: 'Cliente' },
    }))).rejects.toThrow('falta perfil tributario del receptor');
    await expect(service.generarFacturaElectronica(invoice({
      receptor: {
        tipoDocumento: '31', numeroDocumento: '9001082813', razonSocial: 'Cliente',
        dianTaxProfile: {
          profile: 'CONSUMIDOR_FINAL', taxLevelCode: 'R-99-PN', taxLevelListName: '49',
          taxSchemeId: 'ZY', taxSchemeName: 'No causa',
        },
      },
    }))).rejects.toThrow('NIT no puede usar el perfil CONSUMIDOR_FINAL');
  });

  it('representa IVA/INC, exento, descuento, cargo y retención sin colapsar bases', async () => {
    const taxes: DianTaxInput[] = [
      { id: '01', name: 'IVA', taxableAmount: 100, amount: 19, percent: 19, categoryCode: '01' },
      { id: '04', name: 'INC', taxableAmount: 100, amount: 8, percent: 8, categoryCode: '01' },
      { id: '01', name: 'IVA', taxableAmount: 50, amount: 0, percent: 0, categoryCode: '02' },
    ];
    const xml = await service.generarFacturaElectronica(invoice({
      subtotal: 150, totalGravadas: 100, totalExoneradas: 50,
      totalImpuestos: 27, importeTotal: 177,
      dianContext: { ...context, taxes: { iva: 19, inc: 8, ica: 0 } },
      dianTaxes: taxes,
      dianWithholdings: [
        { id: '06', name: 'ReteFuente', taxableAmount: 100, amount: 5, percent: 5 },
      ],
      dianAllowanceCharges: [
        { chargeIndicator: false, amount: 10, baseAmount: 160, percent: 6.25, reasonCode: '00', reason: 'Descuento comercial' },
        { chargeIndicator: true, amount: 2, baseAmount: 150, reasonCode: '01', reason: 'Flete' },
      ],
      items: [
        {
          descripcion: 'Gravado', cantidad: 1, precioUnitario: 100, valorVenta: 100,
          igv: 19, tasaIgv: 0.19, dianTaxes: taxes.slice(0, 2),
        },
        {
          descripcion: 'Exento', cantidad: 1, precioUnitario: 50, valorVenta: 50,
          igv: 0, tasaIgv: 0, dianTaxes: [taxes[2]], dianTaxCategory: 'EXENTO',
        },
      ],
    }));

    expect(xml).toContain('<cbc:Name>INC</cbc:Name>');
    expect(xml).toContain('<cbc:TaxableAmount currencyID="COP">50.00</cbc:TaxableAmount>');
    expect(xml).toContain('<cbc:Percent>0.00</cbc:Percent>');
    expect(xml).toContain('<cac:WithholdingTaxTotal>');
    expect(xml).toContain('<cbc:AllowanceChargeReason>Descuento comercial</cbc:AllowanceChargeReason>');
    expect(xml).toContain('<cbc:AllowanceChargeReason>Flete</cbc:AllowanceChargeReason>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="COP">172.00</cbc:PayableAmount>');
  });

  it('no informa TaxTotal en una línea excluida, como exige FAX01/FAX05', async () => {
    const xml = await service.generarFacturaElectronica(invoice({
      subtotal: 100, totalGravadas: 0, totalInafectas: 100,
      totalImpuestos: 0, importeTotal: 100,
      dianContext: { ...context, taxes: { iva: 0, inc: 0, ica: 0 } },
      items: [{
        descripcion: 'Servicio excluido', cantidad: 1, precioUnitario: 100,
        valorVenta: 100, igv: 0, tasaIgv: 0, dianTaxCategory: 'EXCLUIDO',
      }],
    }));

    const line = /<cac:InvoiceLine>([\s\S]*?)<\/cac:InvoiceLine>/.exec(xml)?.[1] || '';
    expect(line).not.toContain('<cac:TaxTotal>');
  });

  it.each([
    ['91', 'CreditNoteLine', 'CreditedQuantity', 'CreditNoteTypeCode'],
    ['92', 'DebitNoteLine', 'DebitedQuantity', 'DebitNoteTypeCode'],
  ])('emite nota %s con línea, referencia y discrepancia correctas', async (
    type,
    line,
    quantity,
    typeCode,
  ) => {
    const document = invoice({
      tipoDocumento: type,
      serie: type === '91' ? 'NC' : 'ND',
      dianContext: { ...context, authorization: undefined },
      documentoReferencia: {
        tipo: '01', serie: 'FV', numero: '100', fecha: '2026-08-20', uuid: 'a'.repeat(96),
      },
      dianDiscrepancy: { responseCode: type === '91' ? '1' : '2', description: 'Ajuste fiscal' },
    });
    const xml = type === '91'
      ? await service.generarNotaCredito(document)
      : await service.generarNotaDebito(document);

    if (type === '91') {
      expect(xml).toContain(`<cbc:${typeCode}>${type}</cbc:${typeCode}>`);
      expect(xml).toContain(
        '<cbc:ProfileID>DIAN 2.1: Nota Crédito de Factura Electrónica de Venta</cbc:ProfileID>',
      );
    } else {
      expect(xml).not.toContain('<cbc:DebitNoteTypeCode>');
      expect(xml).toContain(
        '<cbc:ProfileID>DIAN 2.1: Nota Débito de Factura Electrónica de Venta</cbc:ProfileID>',
      );
    }
    expect(xml).toContain(`<cac:${line}>`);
    expect(xml).toContain(`<cbc:${quantity} unitCode="NIU">1.00</cbc:${quantity}>`);
    expect(xml).toContain('<cac:DiscrepancyResponse>');
    expect(xml).toContain('<cac:BillingReference>');
    expect(xml).toContain('schemeName="CUDE-SHA384"');
    expect(xml).not.toContain('<cac:InvoiceLine>');
  });

  it('genera ApplicationResponse explícito y AttachedDocument con ambos XML embebidos', async () => {
    const document = invoice();
    const unsigned = await service.generarFacturaElectronica(document);
    const signed = unsigned.replace(
      '<ext:ExtensionContent/>',
      '<ext:ExtensionContent><ds:Signature Id="sig-real"/></ext:ExtensionContent>',
    );
    const unsignedResponse = service.generarApplicationResponse({
      id: 'AR-0001', issueDate: '2026-08-29', issueTime: '11:30:00-05:00',
      environmentId: '2', softwareId: 'SOFTWARE-DIAN-01', softwarePin: 'PIN-PRIVADO-01',
      sender: { type: '31', number: '8001972684', name: 'DIAN' },
      receiver: { type: '31', number: '9001234568', name: 'EMISOR CO SAS' },
      responseCode: '030', responseDescription: 'Acuse de recibo de Factura Electrónica de Venta',
      referencedDocumentId: 'FV125', referencedDocumentTypeCode: '01',
      referencedDocumentUuid: 'b'.repeat(96),
      issuerPerson: {
        identity: { type: '13', number: '1020304050' },
        firstName: 'Andrea', familyName: 'Gómez', jobTitle: 'Analista',
        organizationDepartment: 'Compras',
      },
    });
    expect((unsignedResponse.match(/<ext:UBLExtension>/g) || [])).toHaveLength(2);
    expect(unsignedResponse).toContain('<ext:ExtensionContent/>');
    expect(unsignedResponse).toContain('<sts:DianExtensions>');
    expect(unsignedResponse).toContain('<sts:InvoiceSource>');
    expect(unsignedResponse).toContain(
      '<cbc:ProfileID>DIAN 2.1: ApplicationResponse de Factura Electrónica de Venta</cbc:ProfileID>',
    );
    expect(unsignedResponse).toContain('<sts:SoftwareID');
    expect(unsignedResponse).toMatch(
      /<sts:SoftwareSecurityCode[^>]*>[0-9a-f]{96}<\/sts:SoftwareSecurityCode>/,
    );
    expect(unsignedResponse).toContain(
      'catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=',
    );
    expect(unsignedResponse).not.toContain('PIN-PRIVADO-01');
    const response = unsignedResponse.replace(
      '<ext:ExtensionContent/>',
      '<ext:ExtensionContent><ds:Signature Id="dian-response-signature"/></ext:ExtensionContent>',
    );
    const attached = service.generarAttachedDocument(document, signed, response);

    expect(attached).toContain('<AttachedDocument');
    expect(attached).toContain('<cbc:CustomizationID>Documentos adjuntos</cbc:CustomizationID>');
    expect((attached.match(/<!\[CDATA\[/g) || [])).toHaveLength(2);
    expect(attached).toContain('<cbc:DocumentType>ApplicationResponse</cbc:DocumentType>');
    expect(attached).toContain('<cbc:ValidationResultCode>030</cbc:ValidationResultCode>');
  });

  it('falla cerrado sin contexto, sin referencia verificable o sin desglose de impuestos', async () => {
    await expect(service.generarFacturaElectronica(invoice({ dianContext: undefined })))
      .rejects.toThrow('contexto fiscal sellado');
    await expect(service.generarNotaCredito(invoice({
      tipoDocumento: '91', serie: 'NC', dianContext: { ...context, authorization: undefined },
      documentoReferencia: { tipo: '01', numero: 'FV100', fecha: '2026-08-20' },
      dianDiscrepancy: { responseCode: '1', description: 'Ajuste' },
    }))).rejects.toThrow('CUFE/CUDE');
    await expect(service.generarFacturaElectronica(invoice({
      totalImpuestos: 27,
      dianContext: { ...context, taxes: { iva: 19, inc: 8, ica: 0 } },
    }))).rejects.toThrow('desglose de impuestos múltiples');
  });

  it('rechaza AttachedDocument sin firma o sin ApplicationResponse real', async () => {
    const document = invoice();
    const xml = await service.generarFacturaElectronica(document);
    expect(() => service.generarAttachedDocument(document, xml, '<ApplicationResponse/>'))
      .toThrow('firmado');
    expect(() => service.generarAttachedDocument(
      document,
      xml.replace('<ext:ExtensionContent/>', '<ext:ExtensionContent><ds:Signature/></ext:ExtensionContent>'),
      '<Response>OK</Response>',
    )).toThrow('ApplicationResponse DIAN firmado');
  });
});
