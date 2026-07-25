import { BadRequestException } from '@nestjs/common';
import { CreateFacturaDto } from '@erp-suite/dtos';
import { DocumentoFiscal } from '../documentos/interfaces/documento-fiscal.interface';

/**
 * Construye y normaliza XML UBL 2.1 para SUNAT.
 * Es deliberadamente puro: no persiste, no firma y no transporta comprobantes.
 */
export class CpeXmlBuilder {
buildXmlFromDocumentoFiscal(documento: DocumentoFiscal): string {
    const itemsXml = documento.detalles
      .map((detalle, index) => {
        return `
  <cac:InvoiceLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:InvoicedQuantity>${detalle.cantidad.toFixed(2)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${documento.moneda}">${detalle.valor_venta.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="${documento.moneda}">${detalle.precio_unitario.toFixed(2)}</cbc:PriceAmount>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    <cac:Item>
      <cbc:Description><![CDATA[${detalle.descripcion}]]></cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${documento.moneda}">${detalle.precio_unitario.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${documento.serie}-${documento.numero}</cbc:ID>
  <cbc:IssueDate>${documento.fecha_emision.substring(0, 10)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>${documento.tipo_documento}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${documento.moneda}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID>${documento.emisor.ruc}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${documento.emisor.razon_social}]]></cbc:Name>
      </cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID>${documento.cliente.numero_documento}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${documento.cliente.razon_social}]]></cbc:Name>
      </cac:PartyName>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${documento.moneda}">${documento.subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${documento.moneda}">${documento.total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${documento.moneda}">${documento.total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${itemsXml}
</Invoice>`;
  }

resolveEmissionDate(fechaEmision?: string): string {
    if (!fechaEmision) {
      return this.formatDate(new Date());
    }

    return this.resolveSunatDate(fechaEmision, 'fecha_emision');
  }

resolveDueDate(emissionDate: string, fechaVencimiento?: string): string {
    if (fechaVencimiento) {
      return this.resolveSunatDate(fechaVencimiento, 'fecha_vencimiento');
    }

    const [year, month, day] = emissionDate.split('-').map((part) => Number(part));
    const emission = new Date(year, month - 1, day);
    const due = new Date(emission);
    due.setDate(due.getDate() + 30);
    return this.formatDate(due);
  }

private formatDate(date: Date): string {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

private resolveSunatDate(value: any, fieldName: string): string {
    const raw = String(value ?? '').trim();
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(raw);

    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      if (!this.isValidCalendarDate(Number(year), Number(month), Number(day))) {
        throw new BadRequestException(`${fieldName} inválida: ${value}`);
      }
      return `${year}-${month}-${day}`;
    }

    const parsed = value instanceof Date ? value : new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} inválida: ${value}`);
    }

    return this.formatDate(parsed);
  }

private isValidCalendarDate(year: number, month: number, day: number): boolean {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return false;
    }

    const candidate = new Date(Date.UTC(year, month - 1, day));
    return candidate.getUTCFullYear() === year
      && candidate.getUTCMonth() === month - 1
      && candidate.getUTCDate() === day;
  }

private formatTime(date: Date): string {
    return [
      String(date.getHours()).padStart(2, '0'),
      String(date.getMinutes()).padStart(2, '0'),
      String(date.getSeconds()).padStart(2, '0'),
    ].join(':');
  }

generateXmlContent(factura: CreateFacturaDto): string {
    const tipoDocumento = this.normalizeTipoDocumentoSunat(factura.tipo_documento);
    if (tipoDocumento === '07') {
      return this.generateCreditNoteXmlContent(factura);
    }
    if (tipoDocumento === '08') {
      return this.generateDebitNoteXmlContent(factura);
    }

    const issueDate = this.resolveEmissionDate((factura as any).fecha_emision);
    const issueTime = this.resolveIssueTime((factura as any).hora_emision ?? (factura as any).fecha_emision);
    const dueDateTag = (factura as any).fecha_vencimiento
      ? `\n  <cbc:DueDate>${this.escapeXmlText(this.resolveDueDate(issueDate, (factura as any).fecha_vencimiento))}</cbc:DueDate>`
      : '';
    const moneda = this.escapeXmlText(factura.moneda || 'PEN');
    const tipoOperacion = this.resolveTipoOperacionSunat(factura);
    const formaPagoXml = this.buildPaymentTermsXml(factura, moneda);
    const noteXml = this.buildOptionalNoteXml(factura);
    const linesXml = factura.items
      .map((item, index) => this.buildInvoiceLineXml(item, index, moneda))
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID schemeAgencyName="PE:SUNAT">2.0</cbc:CustomizationID>
  <cbc:ProfileID schemeName="Tipo de Operacion" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo51">${tipoOperacion}</cbc:ProfileID>
  <cbc:ID>${this.escapeXmlText(factura.serie)}-${this.escapeXmlText(String(factura.numero))}</cbc:ID>
  <cbc:IssueDate>${this.escapeXmlText(issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>${dueDateTag}
  <cbc:InvoiceTypeCode listID="${tipoOperacion}" listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">${this.escapeXmlText(factura.tipo_documento)}</cbc:InvoiceTypeCode>${noteXml}
  <cbc:DocumentCurrencyCode listID="ISO 4217 Alpha" listName="Currency" listAgencyName="United Nations Economic Commission for Europe">${moneda}</cbc:DocumentCurrencyCode>
  <cac:Signature>
    <cbc:ID>IDSignSP</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${this.escapeXmlText(factura.ruc_emisor)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${this.wrapCdata(factura.razon_social_emisor)}</cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#SignatureSP</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${this.escapeXmlText(factura.ruc_emisor)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${this.wrapCdata(factura.razon_social_emisor)}</cbc:Name>
      </cac:PartyName>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${this.wrapCdata(factura.razon_social_emisor)}</cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:AddressTypeCode>${this.escapeXmlText(String((factura as any).codigo_establecimiento ?? '0000'))}</cbc:AddressTypeCode>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${this.escapeXmlText(factura.tipo_documento_receptor)}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${this.escapeXmlText(factura.documento_receptor)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${this.wrapCdata(factura.razon_social_receptor)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>${formaPagoXml}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${moneda}">${this.formatAmount(factura.total_igv)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${moneda}">${this.formatAmount(factura.total_gravadas)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${moneda}">${this.formatAmount(factura.total_igv)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID schemeID="UN/ECE 5305" schemeName="Tax Category Identifier" schemeAgencyName="United Nations Economic Commission for Europe">S</cbc:ID>
        ${this.buildIgvTaxSchemeXml()}
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${moneda}">${this.formatAmount(factura.total_gravadas)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${moneda}">${this.formatAmount(factura.total_venta)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${moneda}">${this.formatAmount((factura as any).total_descuentos ?? 0)}</cbc:AllowanceTotalAmount>
    <cbc:ChargeTotalAmount currencyID="${moneda}">${this.formatAmount((factura as any).total_cargos ?? 0)}</cbc:ChargeTotalAmount>
    <cbc:PayableAmount currencyID="${moneda}">${this.formatAmount(factura.total_venta)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${linesXml}
</Invoice>`;
  }

private buildInvoiceLineXml(item: any, index: number, moneda: string): string {
    const cantidad = this.toNumber(item?.cantidad, 0);
    const valorVenta = this.toNumber(item?.valor_venta ?? item?.valorVenta, 0);
    const igv = this.toNumber(item?.igv ?? item?.impuesto_igv, 0);
    const precioVenta = this.toNumber(item?.precio_venta ?? item?.precioVenta ?? valorVenta + igv, 0);
    const precioUnitario = this.toNumber(item?.precio_unitario ?? item?.precioUnitario, 0);
    const afectacionIgv = this.escapeXmlText(String(item?.tipo_afectacion_igv ?? item?.afectacion_igv ?? '10'));
    const percent = valorVenta > 0 ? (igv / valorVenta) * 100 : 18;

    return `  <cac:InvoiceLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${this.escapeXmlAttribute(item?.unidad || 'NIU')}" unitCodeListID="UN/ECE rec 20" unitCodeListAgencyName="United Nations Economic Commission for Europe">${this.formatQuantity(cantidad)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${moneda}">${this.formatAmount(valorVenta)}</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="${moneda}">${this.formatAmount(precioVenta)}</cbc:PriceAmount>
        <cbc:PriceTypeCode listName="Tipo de Precio" listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16">01</cbc:PriceTypeCode>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${moneda}">${this.formatAmount(igv)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${moneda}">${this.formatAmount(valorVenta)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${moneda}">${this.formatAmount(igv)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:ID schemeID="UN/ECE 5305" schemeName="Tax Category Identifier" schemeAgencyName="United Nations Economic Commission for Europe">S</cbc:ID>
          <cbc:Percent>${this.formatAmount(percent)}</cbc:Percent>
          <cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">${afectacionIgv}</cbc:TaxExemptionReasonCode>
          ${this.buildIgvTaxSchemeXml()}
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>${this.wrapCdata(item?.descripcion || `Item ${index + 1}`)}</cbc:Description>
      <cac:SellersItemIdentification>
        <cbc:ID>${this.escapeXmlText(item?.codigo || `ITEM-${index + 1}`)}</cbc:ID>
      </cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${moneda}">${this.formatAmount(precioUnitario, 6)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
  }

private generateCreditNoteXmlContent(factura: CreateFacturaDto): string {
    return this.buildNoteXml(factura, {
      root: 'CreditNote',
      namespace: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
      lineTag: 'CreditNoteLine',
      quantityTag: 'CreditedQuantity',
      totalTag: 'LegalMonetaryTotal',
      responseCode: this.resolveTipoNota(factura, 'credito'),
      responseListName: 'Tipo de nota de credito',
      responseListUri: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo09',
      defaultReason: 'ANULACION DE LA OPERACION',
    });
  }

private generateDebitNoteXmlContent(factura: CreateFacturaDto): string {
    return this.buildNoteXml(factura, {
      root: 'DebitNote',
      namespace: 'urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2',
      lineTag: 'DebitNoteLine',
      quantityTag: 'DebitedQuantity',
      totalTag: 'RequestedMonetaryTotal',
      responseCode: this.resolveTipoNota(factura, 'debito'),
      responseListName: 'Tipo de nota de debito',
      responseListUri: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo10',
      defaultReason: 'INTERESES POR MORA',
    });
  }

private buildNoteXml(
    factura: CreateFacturaDto,
    config: {
      root: 'CreditNote' | 'DebitNote';
      namespace: string;
      lineTag: 'CreditNoteLine' | 'DebitNoteLine';
      quantityTag: 'CreditedQuantity' | 'DebitedQuantity';
      totalTag: 'LegalMonetaryTotal' | 'RequestedMonetaryTotal';
      responseCode: string;
      responseListName: string;
      responseListUri: string;
      defaultReason: string;
    },
  ): string {
    const issueDate = this.resolveEmissionDate((factura as any).fecha_emision);
    const issueTime = this.resolveIssueTime((factura as any).hora_emision ?? (factura as any).fecha_emision);
    const moneda = this.escapeXmlText(factura.moneda || 'PEN');
    const reference = this.resolveNotaDocumentoReferencia(factura);
    const motivo = this.resolveMotivoNota(factura, config.defaultReason);
    const linesXml = factura.items
      .map((item, index) => this.buildNoteLineXml(item, index, moneda, config.lineTag, config.quantityTag))
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<${config.root} xmlns="${config.namespace}"
                xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
                xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
                xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID schemeAgencyName="PE:SUNAT">2.0</cbc:CustomizationID>
  <cbc:ID>${this.escapeXmlText(factura.serie)}-${this.escapeXmlText(String(factura.numero))}</cbc:ID>
  <cbc:IssueDate>${this.escapeXmlText(issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:DocumentCurrencyCode listID="ISO 4217 Alpha" listName="Currency" listAgencyName="United Nations Economic Commission for Europe">${moneda}</cbc:DocumentCurrencyCode>
  <cac:DiscrepancyResponse>
    <cbc:ReferenceID>${this.escapeXmlText(reference.id)}</cbc:ReferenceID>
    <cbc:ResponseCode listAgencyName="PE:SUNAT" listName="${config.responseListName}" listURI="${config.responseListUri}">${config.responseCode}</cbc:ResponseCode>
    <cbc:Description>${this.wrapCdata(motivo)}</cbc:Description>
  </cac:DiscrepancyResponse>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${this.escapeXmlText(reference.id)}</cbc:ID>
      <cbc:DocumentTypeCode listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">${this.escapeXmlText(reference.tipo)}</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>${this.buildOptionalNoteXml(factura)}
  <cac:Signature>
    <cbc:ID>IDSignSP</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${this.escapeXmlText(factura.ruc_emisor)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${this.wrapCdata(factura.razon_social_emisor)}</cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#SignatureSP</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${this.escapeXmlText(factura.ruc_emisor)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${this.wrapCdata(factura.razon_social_emisor)}</cbc:Name>
      </cac:PartyName>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${this.wrapCdata(factura.razon_social_emisor)}</cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:AddressTypeCode>${this.escapeXmlText(String((factura as any).codigo_establecimiento ?? '0000'))}</cbc:AddressTypeCode>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${this.escapeXmlText(factura.tipo_documento_receptor)}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${this.escapeXmlText(factura.documento_receptor)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${this.wrapCdata(factura.razon_social_receptor)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${moneda}">${this.formatAbsAmount(factura.total_igv)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${moneda}">${this.formatAbsAmount(factura.total_gravadas)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${moneda}">${this.formatAbsAmount(factura.total_igv)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID schemeID="UN/ECE 5305" schemeName="Tax Category Identifier" schemeAgencyName="United Nations Economic Commission for Europe">S</cbc:ID>
        ${this.buildIgvTaxSchemeXml()}
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:${config.totalTag}>
    <cbc:LineExtensionAmount currencyID="${moneda}">${this.formatAbsAmount(factura.total_gravadas)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${moneda}">${this.formatAbsAmount(factura.total_venta)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${moneda}">${this.formatAbsAmount((factura as any).total_descuentos ?? 0)}</cbc:AllowanceTotalAmount>
    <cbc:ChargeTotalAmount currencyID="${moneda}">${this.formatAbsAmount((factura as any).total_cargos ?? 0)}</cbc:ChargeTotalAmount>
    <cbc:PayableAmount currencyID="${moneda}">${this.formatAbsAmount(factura.total_venta)}</cbc:PayableAmount>
  </cac:${config.totalTag}>
${linesXml}
</${config.root}>`;
  }

private buildNoteLineXml(
    item: any,
    index: number,
    moneda: string,
    lineTag: 'CreditNoteLine' | 'DebitNoteLine',
    quantityTag: 'CreditedQuantity' | 'DebitedQuantity',
  ): string {
    const cantidad = Math.abs(this.toNumber(item?.cantidad, 0));
    const valorVenta = Math.abs(this.toNumber(item?.valor_venta ?? item?.valorVenta, 0));
    const igv = Math.abs(this.toNumber(item?.igv ?? item?.impuesto_igv, 0));
    const precioVenta = Math.abs(this.toNumber(item?.precio_venta ?? item?.precioVenta ?? valorVenta + igv, 0));
    const precioUnitario = Math.abs(this.toNumber(item?.precio_unitario ?? item?.precioUnitario, 0));
    const afectacionIgv = this.escapeXmlText(String(item?.tipo_afectacion_igv ?? item?.afectacion_igv ?? '10'));
    const percent = valorVenta > 0 ? (igv / valorVenta) * 100 : 18;

    return `  <cac:${lineTag}>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:${quantityTag} unitCode="${this.escapeXmlAttribute(item?.unidad || 'NIU')}" unitCodeListID="UN/ECE rec 20" unitCodeListAgencyName="United Nations Economic Commission for Europe">${this.formatQuantity(cantidad)}</cbc:${quantityTag}>
    <cbc:LineExtensionAmount currencyID="${moneda}">${this.formatAmount(valorVenta)}</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="${moneda}">${this.formatAmount(precioVenta)}</cbc:PriceAmount>
        <cbc:PriceTypeCode listName="Tipo de Precio" listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16">01</cbc:PriceTypeCode>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${moneda}">${this.formatAmount(igv)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${moneda}">${this.formatAmount(valorVenta)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${moneda}">${this.formatAmount(igv)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:ID schemeID="UN/ECE 5305" schemeName="Tax Category Identifier" schemeAgencyName="United Nations Economic Commission for Europe">S</cbc:ID>
          <cbc:Percent>${this.formatAmount(percent)}</cbc:Percent>
          <cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">${afectacionIgv}</cbc:TaxExemptionReasonCode>
          ${this.buildIgvTaxSchemeXml()}
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>${this.wrapCdata(item?.descripcion || `Item ${index + 1}`)}</cbc:Description>
      <cac:SellersItemIdentification>
        <cbc:ID>${this.escapeXmlText(item?.codigo || `ITEM-${index + 1}`)}</cbc:ID>
      </cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${moneda}">${this.formatAmount(precioUnitario, 6)}</cbc:PriceAmount>
    </cac:Price>
  </cac:${lineTag}>`;
  }

private resolveNotaDocumentoReferencia(factura: CreateFacturaDto): { id: string; tipo: string } {
    const anyFactura = factura as any;
    const explicitId = String(
      anyFactura.documento_referencia_id ??
      anyFactura.documento_afectado_id ??
      anyFactura.comprobante_referencia ??
      '',
    ).trim();
    const serie = String(anyFactura.documento_referencia_serie ?? anyFactura.documento_afectado_serie ?? '').trim();
    const numero = String(anyFactura.documento_referencia_numero ?? anyFactura.documento_afectado_numero ?? '').trim();
    const id = explicitId || (serie && numero ? `${serie}-${numero}` : '');
    const tipo = this.normalizeTipoDocumentoSunat(
      anyFactura.documento_referencia_tipo ?? anyFactura.documento_afectado_tipo,
      false,
    );

    if (!id || !['01', '03'].includes(tipo)) {
      throw new BadRequestException('La nota SUNAT requiere comprobante afectado tipo 01/03 y serie-numero de referencia');
    }

    return { id, tipo };
  }

private resolveTipoNota(factura: CreateFacturaDto, kind: 'credito' | 'debito'): string {
    const anyFactura = factura as any;
    const rawValue = kind === 'credito'
      ? anyFactura.tipo_nota_credito ?? anyFactura.codigo_motivo_nota ?? anyFactura.tipo_nota
      : anyFactura.tipo_nota_debito ?? anyFactura.codigo_motivo_nota ?? anyFactura.tipo_nota;
    const raw = rawValue == null ? '' : String(rawValue).trim();
    const code = raw || '01';
    if (!/^\d{2}$/.test(code)) {
      throw new BadRequestException(`El tipo de nota ${kind} SUNAT debe usar código de 2 dígitos`);
    }

    return code;
  }

private resolveMotivoNota(factura: CreateFacturaDto, fallback: string): string {
    const motivo = String(
      (factura as any).motivo_nota ??
      (factura as any).motivo ??
      (factura as any).observaciones ??
      fallback,
    ).trim();

    if (!motivo) {
      throw new BadRequestException('La nota SUNAT requiere motivo o sustento');
    }

    return motivo;
  }

private buildIgvTaxSchemeXml(): string {
    return `<cac:TaxScheme>
          <cbc:ID schemeID="UN/ECE 5153" schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT">1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>`;
  }

private buildPaymentTermsXml(factura: CreateFacturaDto, moneda: string): string {
    const raw = String((factura as any).condicion_pago ?? (factura as any).forma_pago ?? 'CONTADO')
      .trim()
      .toUpperCase();
    const isCredito = raw === 'CREDITO' || raw === 'CRÉDITO';
    const paymentMeansId = isCredito ? 'Credito' : 'Contado';
    const amountXml = isCredito ? `\n    <cbc:Amount currencyID="${moneda}">${this.formatAmount(factura.total_venta)}</cbc:Amount>` : '';
    const issueDate = this.resolveEmissionDate((factura as any).fecha_emision);
    const dueDate = this.resolveDueDate(issueDate, (factura as any).fecha_vencimiento);
    const cuotas = Array.isArray((factura as any).cuotas) ? (factura as any).cuotas : [];
    const installments = isCredito
      ? (cuotas.length ? cuotas : [{ monto: factura.total_venta, fecha_vencimiento: dueDate }])
        .map((cuota: any, index: number) => {
          const cuotaDueDate = this.resolveDueDate(issueDate, cuota?.fecha_vencimiento ?? cuota?.fechaVencimiento ?? dueDate);
          return `
  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>Cuota${String(index + 1).padStart(3, '0')}</cbc:PaymentMeansID>
    <cbc:Amount currencyID="${moneda}">${this.formatAmount(cuota?.monto ?? cuota?.amount ?? factura.total_venta)}</cbc:Amount>
    <cbc:PaymentDueDate>${this.escapeXmlText(cuotaDueDate)}</cbc:PaymentDueDate>
  </cac:PaymentTerms>`;
        })
        .join('')
      : '';

    return `
  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>${paymentMeansId}</cbc:PaymentMeansID>${amountXml}
  </cac:PaymentTerms>${installments}`;
  }

private buildOptionalNoteXml(factura: CreateFacturaDto): string {
    const note = (factura as any).monto_en_letras ?? (factura as any).montoLetras ?? (factura as any).leyenda;
    if (!String(note ?? '').trim()) {
      return '';
    }

    return `\n  <cbc:Note languageLocaleID="1000">${this.escapeXmlText(note)}</cbc:Note>`;
  }

private resolveTipoOperacionSunat(factura: CreateFacturaDto): string {
    const value = String((factura as any).tipo_operacion ?? (factura as any).tipoOperacion ?? '0101').trim();
    return /^\d{4}$/.test(value) ? value : '0101';
  }

resolveIssueTime(fechaEmision?: string): string {
    if (!fechaEmision) {
      return '00:00:00';
    }

    const raw = String(fechaEmision).trim();
    const directTime = /^(\d{2}):(\d{2}):(\d{2})$/.exec(raw);
    if (directTime) {
      return this.validateSunatTime(directTime, raw);
    }

    const timeMatch = /[T\s](\d{2}):(\d{2}):(\d{2})(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/.exec(raw);
    if (timeMatch) {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        return '00:00:00';
      }
      return this.validateSunatTime(timeMatch, raw);
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime()) || /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return '00:00:00';
    }

    return this.formatTime(parsed);
  }

private validateSunatTime(match: RegExpExecArray, raw: string): string {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);

    if (hours > 23 || minutes > 59 || seconds > 59) {
      throw new BadRequestException(`hora de emision SUNAT inválida: ${raw}`);
    }

    return `${match[1]}:${match[2]}:${match[3]}`;
  }

private toNumber(value: any, fallback: number): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

private formatAmount(value: any, decimals = 2): string {
    return this.toNumber(value, 0).toFixed(decimals);
  }

private formatAbsAmount(value: any, decimals = 2): string {
    return Math.abs(this.toNumber(value, 0)).toFixed(decimals);
  }

private formatQuantity(value: any): string {
    return this.toNumber(value, 0).toFixed(2);
  }

private escapeXmlText(value: any): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

private escapeXmlAttribute(value: any): string {
    return this.escapeXmlText(value)
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

private wrapCdata(value: any): string {
    return `<![CDATA[${String(value ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
  }

normalizeTipoDocumentoSunat(
    tipo: string | null | undefined,
    throwOnUnknown = true,
  ): string {
    const normalized = String(tipo || '').trim().toUpperCase();
    const map: Record<string, string> = {
      '01': '01',
      FACTURA: '01',
      'FACTURA ELECTRONICA': '01',
      'FACTURA ELECTRÓNICA': '01',
      '03': '03',
      BOLETA: '03',
      'BOLETA DE VENTA': '03',
      'BOLETA DE VENTA ELECTRONICA': '03',
      'BOLETA DE VENTA ELECTRÓNICA': '03',
      '07': '07',
      NOTA_CREDITO: '07',
      'NOTA CREDITO': '07',
      'NOTA CRÉDITO': '07',
      'NOTA DE CREDITO': '07',
      'NOTA DE CRÉDITO': '07',
      '08': '08',
      NOTA_DEBITO: '08',
      'NOTA DEBITO': '08',
      'NOTA DÉBITO': '08',
      'NOTA DE DEBITO': '08',
      'NOTA DE DÉBITO': '08',
    };

    const sunatCode = map[normalized];
    if (!sunatCode && throwOnUnknown) {
      throw new BadRequestException(`Tipo de documento CPE no soportado: ${tipo || '(vacio)'}`);
    }

    return sunatCode || '';
  }
}
