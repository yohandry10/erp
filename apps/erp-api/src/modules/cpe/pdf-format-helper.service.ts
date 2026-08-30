import { Injectable, Logger } from '@nestjs/common';
import { getActiveCountryByCode } from '../paises/initial-country';

export function normalizeFiscalDocumentType(countryCode: string, documentType: string): string {
  const country = String(countryCode || '').trim().toUpperCase();
  const type = String(documentType || '').trim().toUpperCase();
  if (country !== 'AR') return type;

  // 01/03/07/08 no determinan por sí solos A/B/C: la clase depende de las
  // condiciones IVA y de la autorización. El backend debe entregar el código
  // fiscal resuelto; este helper nunca lo adivina.
  return type;
}

/**
 * PDF Format Helper Service
 * Handles country-specific PDF formatting for invoices
 */
@Injectable()
export class PdfFormatHelperService {
  private readonly logger = new Logger(PdfFormatHelperService.name);

  /**
   * Get PDF header text based on country
   */
  getHeaderText(countryCode: string, documentType: string): string {
    const normalizedType = normalizeFiscalDocumentType(countryCode, documentType);
    const headers: Record<string, Record<string, string>> = {
      PE: {
        '01': 'FACTURA ELECTRÓNICA',
        '03': 'BOLETA DE VENTA ELECTRÓNICA',
        '07': 'NOTA DE CRÉDITO ELECTRÓNICA',
        '08': 'NOTA DE DÉBITO ELECTRÓNICA',
      },
      CO: {
        '01': 'FACTURA ELECTRÓNICA DE VENTA',
        '91': 'NOTA DE CRÉDITO ELECTRÓNICA',
        '92': 'NOTA DE DÉBITO ELECTRÓNICA',
      },
      AR: {
        '001': 'FACTURA ELECTRÓNICA A',
        '002': 'NOTA DE DÉBITO ELECTRÓNICA A',
        '003': 'NOTA DE CRÉDITO ELECTRÓNICA A',
        '006': 'FACTURA ELECTRÓNICA B',
        '007': 'NOTA DE DÉBITO ELECTRÓNICA B',
        '008': 'NOTA DE CRÉDITO ELECTRÓNICA B',
        '011': 'FACTURA ELECTRÓNICA C',
        '012': 'NOTA DE DÉBITO ELECTRÓNICA C',
        '013': 'NOTA DE CRÉDITO ELECTRÓNICA C',
        '019': 'FACTURA ELECTRÓNICA E',
        '020': 'NOTA DE DÉBITO ELECTRÓNICA E',
        '021': 'NOTA DE CRÉDITO ELECTRÓNICA E',
        '051': 'FACTURA ELECTRÓNICA A - OPERACIÓN SUJETA A RETENCIÓN',
        '052': 'NOTA DE DÉBITO ELECTRÓNICA A - OPERACIÓN SUJETA A RETENCIÓN',
        '053': 'NOTA DE CRÉDITO ELECTRÓNICA A - OPERACIÓN SUJETA A RETENCIÓN',
      },
    };

    return headers[countryCode]?.[normalizedType] || 'COMPROBANTE ELECTRÓNICO';
  }

  getPrintedRepresentationLegend(countryCode: string, documentType: string): string {
    const normalizedType = normalizeFiscalDocumentType(countryCode, documentType);
    const legends: Record<string, Record<string, string>> = {
      PE: {
        '01': 'Representación impresa de la Factura Electrónica.',
        '03': 'Representación impresa de la Boleta de Venta Electrónica.',
        '07': 'Representación impresa de la Nota de Crédito Electrónica.',
        '08': 'Representación impresa de la Nota de Débito Electrónica.',
      },
      CO: {
        '01': 'Representación gráfica de la Factura Electrónica de Venta.',
        '91': 'Representación gráfica de la Nota de Crédito Electrónica.',
        '92': 'Representación gráfica de la Nota de Débito Electrónica.',
      },
      AR: {
        '001': 'Representación gráfica de la Factura Electrónica A.',
        '002': 'Representación gráfica de la Nota de Débito Electrónica A.',
        '003': 'Representación gráfica de la Nota de Crédito Electrónica A.',
        '006': 'Representación gráfica de la Factura Electrónica B.',
        '007': 'Representación gráfica de la Nota de Débito Electrónica B.',
        '008': 'Representación gráfica de la Nota de Crédito Electrónica B.',
        '011': 'Representación gráfica de la Factura Electrónica C.',
        '012': 'Representación gráfica de la Nota de Débito Electrónica C.',
        '013': 'Representación gráfica de la Nota de Crédito Electrónica C.',
        '019': 'Representación gráfica de la Factura Electrónica E.',
        '020': 'Representación gráfica de la Nota de Débito Electrónica E.',
        '021': 'Representación gráfica de la Nota de Crédito Electrónica E.',
        '051': 'Representación gráfica de la Factura Electrónica A - Operación sujeta a retención.',
        '052': 'Representación gráfica de la Nota de Débito Electrónica A - Operación sujeta a retención.',
        '053': 'Representación gráfica de la Nota de Crédito Electrónica A - Operación sujeta a retención.',
      },
    };

    return legends[countryCode]?.[normalizedType]
      || `Representación gráfica del ${this.getHeaderText(countryCode, normalizedType).toLocaleLowerCase('es')}.`;
  }

  /**
   * Get tax label based on country
   */
  getTaxLabel(countryCode: string): string {
    const labels: Record<string, string> = {
      PE: 'IGV (18%)',
      CO: 'IVA (19%)',
      CL: 'IVA (19%)',
      MX: 'IVA (16%)',
      EC: 'IVA (12%)',
    };

    return labels[countryCode] || 'Impuesto';
  }

  /**
   * Get currency symbol based on country
   */
  getCurrencySymbol(countryCode: string): string {
    const symbols: Record<string, string> = {
      PE: 'S/',
      CO: '$',
      CL: '$',
      MX: '$',
      EC: '$',
    };

    return symbols[countryCode] || '$';
  }

  /**
   * Get footer legal text based on country
   */
  getFooterLegalText(countryCode: string, documentType: string): string[] {
    const consultation: Record<string, string> = {
      PE: 'Consulte su comprobante en: www.sunat.gob.pe',
      CO: 'Consulte la validez en: www.dian.gov.co',
      AR: 'Consulte su comprobante en: www.arca.gob.ar/fe/qr',
    };

    const footer = [this.getPrintedRepresentationLegend(countryCode, documentType)];
    if (consultation[countryCode]) footer.push(consultation[countryCode]);
    return footer;
  }

  /**
   * Get QR code content format based on country
   */
  getQRCodeContent(countryCode: string, data: {
    ruc: string;
    documentType: string;
    serie: string;
    numero: string;
    total: number;
    fecha: string;
  }): string {
    if (countryCode === 'PE') {
      // SUNAT QR format
      return `${data.ruc}|${data.documentType}|${data.serie}|${data.numero}|${data.total.toFixed(2)}|${data.fecha}`;
    } else if (countryCode === 'CO') {
      // DIAN QR format (CUFE - Código Único de Factura Electrónica)
      // Simplified version - real implementation would calculate CUFE
      return `NIT:${data.ruc}|Tipo:${data.documentType}|Serie:${data.serie}|Numero:${data.numero}|Fecha:${data.fecha}|Total:${data.total.toFixed(2)}`;
    }

    // Generic format
    return `${data.ruc}|${data.documentType}|${data.serie}-${data.numero}|${data.total}`;
  }

  /**
   * Get document ID label based on country
   */
  getDocumentIdLabel(countryCode: string): string {
    const labels: Record<string, string> = {
      PE: 'RUC',
      CO: 'NIT',
      CL: 'RUT',
      MX: 'RFC',
      EC: 'RUC',
    };

    return labels[countryCode] || 'ID Fiscal';
  }

  /**
   * Get address label based on country
   */
  getAddressLabel(countryCode: string): string {
    const labels: Record<string, string> = {
      PE: 'Dirección',
      CO: 'Dirección',
      CL: 'Dirección',
      MX: 'Domicilio',
      EC: 'Dirección',
    };

    return labels[countryCode] || 'Dirección';
  }

  /**
   * Check if QR code is required for country
   */
  isQRCodeRequired(countryCode: string): boolean {
    return ['PE', 'CO', 'AR'].includes(countryCode);
  }

  /**
   * Get fiscal authority name for footer
   */
  getFiscalAuthorityName(countryCode: string): string {
    // La tabla que había aquí no incluía Argentina y sí Chile, México y Ecuador.
    return getActiveCountryByCode(countryCode)?.autoridadFiscal ?? 'Autoridad Fiscal';
  }

  /**
   * Get date format based on country
   */
  getDateFormat(countryCode: string): string {
    const formats: Record<string, string> = {
      PE: 'DD/MM/YYYY',
      CO: 'DD/MM/YYYY',
      CL: 'DD-MM-YYYY',
      MX: 'DD/MM/YYYY',
      EC: 'DD/MM/YYYY',
    };

    return formats[countryCode] || 'DD/MM/YYYY';
  }

  /**
   * Format date according to country
   */
  formatDate(date: Date | string, countryCode: string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();

    const format = this.getDateFormat(countryCode);

    if (format === 'DD-MM-YYYY') {
      return `${day}-${month}-${year}`;
    }

    return `${day}/${month}/${year}`;
  }

  /**
   * Get number format (decimal separator) based on country
   */
  formatNumber(value: number, countryCode: string): string {
    // Most Latin American countries use comma as decimal separator
    // except for some contexts in Mexico
    const useComma = ['CO', 'CL', 'EC'].includes(countryCode);

    if (useComma) {
      return value.toFixed(2).replace('.', ',');
    }

    return value.toFixed(2);
  }
}
