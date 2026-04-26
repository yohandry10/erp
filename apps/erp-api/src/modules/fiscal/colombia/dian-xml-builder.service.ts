/**
 * DIAN XML Builder Service - Colombia
 * 
 * Genera XML en formato UBL 2.1 según especificaciones de DIAN Colombia
 * Separado en módulo independiente para mantener código limpio
 * 
 * @module DianXmlBuilderService
 * @country Colombia
 */

import { Injectable, Logger } from '@nestjs/common';
import { DocumentoElectronico } from '../../../shared/integration/fiscal.interfaces';
import * as builder from 'xmlbuilder2';

@Injectable()
export class DianXmlBuilderService {
  private readonly logger = new Logger(DianXmlBuilderService.name);

  /**
   * Genera XML para Factura de Venta Electrónica (FE)
   */
  async generarFacturaElectronica(documento: DocumentoElectronico): Promise<string> {
    try {
      this.logger.log(`🇨🇴 Generando XML Factura DIAN: ${documento.serie}-${documento.numero}`);

      const root = builder.create({ version: '1.0', encoding: 'UTF-8' })
        .ele('Invoice', {
          'xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
          'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
          'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
          'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
        });

      // UBL Extensions (para firma digital)
      this.addUBLExtensions(root);

      // Información básica del documento
      root.ele('cbc:UBLVersionID').txt('UBL 2.1');
      root.ele('cbc:CustomizationID').txt('10'); // Factura de venta
      root.ele('cbc:ProfileID').txt('DIAN 2.1');
      root.ele('cbc:ID').txt(`${documento.serie}${documento.numero}`);
      root.ele('cbc:IssueDate').txt(this.formatDate(documento.fechaEmision));
      root.ele('cbc:IssueTime').txt(this.formatTime(documento.fechaEmision));
      root.ele('cbc:InvoiceTypeCode').txt(documento.tipoDocumento); // 01 = Factura
      root.ele('cbc:DocumentCurrencyCode').txt(documento.moneda);

      // Información del emisor (AccountingSupplierParty)
      this.addEmisor(root, documento);

      // Información del receptor (AccountingCustomerParty)
      this.addReceptor(root, documento);

      // Medios de pago
      this.addMediosPago(root, documento);

      // Totales
      this.addTotales(root, documento);

      // Items/Líneas de detalle
      this.addItems(root, documento);

      const xml = root.end({ prettyPrint: true });
      
      this.logger.log(`✅ XML Factura DIAN generado exitosamente`);
      return xml;
    } catch (error) {
      this.logger.error(`❌ Error generando XML Factura DIAN:`, error);
      throw error;
    }
  }

  /**
   * Genera XML para Nota Crédito Electrónica (NC)
   */
  async generarNotaCredito(documento: DocumentoElectronico): Promise<string> {
    try {
      this.logger.log(`🇨🇴 Generando XML Nota Crédito DIAN: ${documento.serie}-${documento.numero}`);

      const root = builder.create({ version: '1.0', encoding: 'UTF-8' })
        .ele('CreditNote', {
          'xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
          'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
          'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
          'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
        });

      this.addUBLExtensions(root);

      root.ele('cbc:UBLVersionID').txt('UBL 2.1');
      root.ele('cbc:CustomizationID').txt('20'); // Nota Crédito
      root.ele('cbc:ProfileID').txt('DIAN 2.1');
      root.ele('cbc:ID').txt(`${documento.serie}${documento.numero}`);
      root.ele('cbc:IssueDate').txt(this.formatDate(documento.fechaEmision));
      root.ele('cbc:IssueTime').txt(this.formatTime(documento.fechaEmision));
      root.ele('cbc:DocumentCurrencyCode').txt(documento.moneda);

      // Referencia al documento que se está anulando/ajustando
      if (documento.documentoReferencia) {
        const billingRef = root.ele('cac:BillingReference');
        const invoiceDocRef = billingRef.ele('cac:InvoiceDocumentReference');
        invoiceDocRef.ele('cbc:ID').txt(documento.documentoReferencia.numero);
        invoiceDocRef.ele('cbc:IssueDate').txt(this.formatDate(documento.documentoReferencia.fecha));
      }

      this.addEmisor(root, documento);
      this.addReceptor(root, documento);
      this.addTotales(root, documento);
      this.addItems(root, documento);

      const xml = root.end({ prettyPrint: true });
      
      this.logger.log(`✅ XML Nota Crédito DIAN generado exitosamente`);
      return xml;
    } catch (error) {
      this.logger.error(`❌ Error generando XML Nota Crédito DIAN:`, error);
      throw error;
    }
  }

  /**
   * Genera XML para Nota Débito Electrónica (ND)
   */
  async generarNotaDebito(documento: DocumentoElectronico): Promise<string> {
    try {
      this.logger.log(`🇨🇴 Generando XML Nota Débito DIAN: ${documento.serie}-${documento.numero}`);

      const root = builder.create({ version: '1.0', encoding: 'UTF-8' })
        .ele('DebitNote', {
          'xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2',
          'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
          'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
          'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
        });

      this.addUBLExtensions(root);

      root.ele('cbc:UBLVersionID').txt('UBL 2.1');
      root.ele('cbc:CustomizationID').txt('30'); // Nota Débito
      root.ele('cbc:ProfileID').txt('DIAN 2.1');
      root.ele('cbc:ID').txt(`${documento.serie}${documento.numero}`);
      root.ele('cbc:IssueDate').txt(this.formatDate(documento.fechaEmision));
      root.ele('cbc:IssueTime').txt(this.formatTime(documento.fechaEmision));
      root.ele('cbc:DocumentCurrencyCode').txt(documento.moneda);

      if (documento.documentoReferencia) {
        const billingRef = root.ele('cac:BillingReference');
        const invoiceDocRef = billingRef.ele('cac:InvoiceDocumentReference');
        invoiceDocRef.ele('cbc:ID').txt(documento.documentoReferencia.numero);
        invoiceDocRef.ele('cbc:IssueDate').txt(this.formatDate(documento.documentoReferencia.fecha));
      }

      this.addEmisor(root, documento);
      this.addReceptor(root, documento);
      this.addTotales(root, documento);
      this.addItems(root, documento);

      const xml = root.end({ prettyPrint: true });
      
      this.logger.log(`✅ XML Nota Débito DIAN generado exitosamente`);
      return xml;
    } catch (error) {
      this.logger.error(`❌ Error generando XML Nota Débito DIAN:`, error);
      throw error;
    }
  }

  // ========== MÉTODOS PRIVADOS ==========

  private addUBLExtensions(root: any): void {
    const extensions = root.ele('ext:UBLExtensions');
    const extension = extensions.ele('ext:UBLExtension');
    const extContent = extension.ele('ext:ExtensionContent');
    
    // Placeholder para firma digital (se agregará después)
    extContent.ele('DianExtensions', {
      'xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
    });
  }

  private addEmisor(root: any, documento: DocumentoElectronico): void {
    const supplier = root.ele('cac:AccountingSupplierParty');
    supplier.ele('cbc:AdditionalAccountID').txt(documento.emisor.tipoContribuyente || '1');
    const party = supplier.ele('cac:Party');

    // Identificación (NIT)
    const partyId = party.ele('cac:PartyIdentification');
    partyId.ele('cbc:ID', { 
      schemeID: documento.emisor.tipoDocumento || '31', // 31 = NIT
      schemeName: 'NIT',
      schemeAgencyID: '195' // DIAN
    }).txt(documento.emisor.numeroDocumento);

    // Nombre comercial
    if (documento.emisor.nombreComercial) {
      const partyName = party.ele('cac:PartyName');
      partyName.ele('cbc:Name').txt(documento.emisor.nombreComercial);
    }

    // Dirección
    const address = party.ele('cac:PhysicalLocation').ele('cac:Address');
    address.ele('cbc:ID').txt(documento.emisor.codigoUbigeo || '11001'); // Código DANE
    address.ele('cbc:CityName').txt(documento.emisor.ciudad || 'Bogotá');
    address.ele('cbc:CountrySubentity').txt(documento.emisor.departamento || 'Cundinamarca');
    address.ele('cbc:CountrySubentityCode').txt(documento.emisor.codigoDepartamento || '11');
    
    const addressLine = address.ele('cac:AddressLine');
    addressLine.ele('cbc:Line').txt(documento.emisor.direccion || 'N/A');
    
    const country = address.ele('cac:Country');
    country.ele('cbc:IdentificationCode').txt('CO');
    country.ele('cbc:Name').txt('Colombia');

    // Información legal
    const partyLegal = party.ele('cac:PartyLegalEntity');
    partyLegal.ele('cbc:RegistrationName').txt(documento.emisor.razonSocial);
    partyLegal.ele('cbc:CompanyID', {
      schemeID: '31',
      schemeName: 'NIT',
      schemeAgencyID: '195'
    }).txt(documento.emisor.numeroDocumento);

    // Régimen fiscal
    const taxScheme = party.ele('cac:PartyTaxScheme');
    taxScheme.ele('cbc:RegistrationName').txt(documento.emisor.razonSocial);
    taxScheme.ele('cbc:CompanyID', { schemeID: '31' }).txt(documento.emisor.numeroDocumento);
    
    const taxLevel = taxScheme.ele('cbc:TaxLevelCode', { listName: '48' });
    taxLevel.txt(documento.emisor.regimenFiscal || 'O-13'); // Régimen común

    const scheme = taxScheme.ele('cac:TaxScheme');
    scheme.ele('cbc:ID').txt('01'); // IVA
    scheme.ele('cbc:Name').txt('IVA');
  }

  private addReceptor(root: any, documento: DocumentoElectronico): void {
    const customer = root.ele('cac:AccountingCustomerParty');
    const party = customer.ele('cac:Party');

    // Identificación
    const partyId = party.ele('cac:PartyIdentification');
    partyId.ele('cbc:ID', {
      schemeID: documento.receptor.tipoDocumento || '31',
      schemeName: documento.receptor.tipoDocumento === '13' ? 'CC' : 'NIT',
      schemeAgencyID: '195'
    }).txt(documento.receptor.numeroDocumento);

    // Dirección
    const address = party.ele('cac:PhysicalLocation').ele('cac:Address');
    address.ele('cbc:ID').txt(documento.receptor.codigoUbigeo || '11001');
    address.ele('cbc:CityName').txt(documento.receptor.ciudad || 'Bogotá');
    address.ele('cbc:CountrySubentity').txt(documento.receptor.departamento || 'Cundinamarca');
    
    const addressLine = address.ele('cac:AddressLine');
    addressLine.ele('cbc:Line').txt(documento.receptor.direccion || 'N/A');
    
    const country = address.ele('cac:Country');
    country.ele('cbc:IdentificationCode').txt('CO');

    // Información legal
    const partyLegal = party.ele('cac:PartyLegalEntity');
    partyLegal.ele('cbc:RegistrationName').txt(documento.receptor.razonSocial);
    partyLegal.ele('cbc:CompanyID', {
      schemeID: documento.receptor.tipoDocumento || '31'
    }).txt(documento.receptor.numeroDocumento);
  }

  private addMediosPago(root: any, documento: DocumentoElectronico): void {
    const paymentMeans = root.ele('cac:PaymentMeans');
    paymentMeans.ele('cbc:ID').txt('1'); // Contado
    paymentMeans.ele('cbc:PaymentMeansCode').txt(documento.formaPago || '10'); // 10 = Efectivo
    paymentMeans.ele('cbc:PaymentDueDate').txt(this.formatDate(documento.fechaVencimiento || documento.fechaEmision));
  }

  private addTotales(root: any, documento: DocumentoElectronico): void {
    // Subtotal sin impuestos
    const legalMonetary = root.ele('cac:LegalMonetaryTotal');
    legalMonetary.ele('cbc:LineExtensionAmount', { currencyID: documento.moneda })
      .txt(this.formatAmount(documento.subtotal));
    
    // Total con impuestos
    legalMonetary.ele('cbc:TaxExclusiveAmount', { currencyID: documento.moneda })
      .txt(this.formatAmount(documento.subtotal));
    
    legalMonetary.ele('cbc:TaxInclusiveAmount', { currencyID: documento.moneda })
      .txt(this.formatAmount(documento.importeTotal));
    
    legalMonetary.ele('cbc:PayableAmount', { currencyID: documento.moneda })
      .txt(this.formatAmount(documento.importeTotal));

    // Totales de impuestos
    const taxTotal = root.ele('cac:TaxTotal');
    taxTotal.ele('cbc:TaxAmount', { currencyID: documento.moneda })
      .txt(this.formatAmount(documento.totalImpuestos));

    // Detalle IVA
    const taxSubtotal = taxTotal.ele('cac:TaxSubtotal');
    taxSubtotal.ele('cbc:TaxableAmount', { currencyID: documento.moneda })
      .txt(this.formatAmount(documento.subtotal));
    taxSubtotal.ele('cbc:TaxAmount', { currencyID: documento.moneda })
      .txt(this.formatAmount(documento.totalImpuestos));

    const taxCategory = taxSubtotal.ele('cac:TaxCategory');
    taxCategory.ele('cbc:Percent').txt(this.formatAmount(documento.tasaImpuesto * 100));
    
    const taxScheme = taxCategory.ele('cac:TaxScheme');
    taxScheme.ele('cbc:ID').txt('01'); // IVA
    taxScheme.ele('cbc:Name').txt('IVA');
  }

  private addItems(root: any, documento: DocumentoElectronico): void {
    documento.items.forEach((item, index) => {
      const invoiceLine = root.ele('cac:InvoiceLine');
      
      invoiceLine.ele('cbc:ID').txt((index + 1).toString());
      invoiceLine.ele('cbc:InvoicedQuantity', { unitCode: item.unidadMedida || 'NIU' })
        .txt(this.formatAmount(item.cantidad));
      invoiceLine.ele('cbc:LineExtensionAmount', { currencyID: documento.moneda })
        .txt(this.formatAmount(item.valorVenta));

      // Precio unitario
      const price = invoiceLine.ele('cac:Price');
      price.ele('cbc:PriceAmount', { currencyID: documento.moneda })
        .txt(this.formatAmount(item.precioUnitario));

      // Descripción del item
      const itemElement = invoiceLine.ele('cac:Item');
      itemElement.ele('cbc:Description').txt(item.descripcion);
      
      if (item.codigoProducto) {
        const sellersItemId = itemElement.ele('cac:SellersItemIdentification');
        sellersItemId.ele('cbc:ID').txt(item.codigoProducto);
      }

      // Impuestos del item
      const taxTotal = invoiceLine.ele('cac:TaxTotal');
      taxTotal.ele('cbc:TaxAmount', { currencyID: documento.moneda })
        .txt(this.formatAmount(item.igv || 0));

      const taxSubtotal = taxTotal.ele('cac:TaxSubtotal');
      taxSubtotal.ele('cbc:TaxableAmount', { currencyID: documento.moneda })
        .txt(this.formatAmount(item.valorVenta));
      taxSubtotal.ele('cbc:TaxAmount', { currencyID: documento.moneda })
        .txt(this.formatAmount(item.igv || 0));

      const taxCategory = taxSubtotal.ele('cac:TaxCategory');
      taxCategory.ele('cbc:Percent').txt(this.formatAmount((item.tasaIgv || 0.19) * 100));
      
      const taxScheme = taxCategory.ele('cac:TaxScheme');
      taxScheme.ele('cbc:ID').txt('01');
      taxScheme.ele('cbc:Name').txt('IVA');
    });
  }

  // ========== UTILIDADES ==========

  private formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  private formatTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString().split('T')[1].split('.')[0]; // HH:mm:ss
  }

  private formatAmount(amount: number): string {
    return amount.toFixed(2);
  }
}
