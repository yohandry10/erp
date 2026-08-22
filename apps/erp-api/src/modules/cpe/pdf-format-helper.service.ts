import { Injectable, Logger } from '@nestjs/common';
import { getActiveCountryByCode } from '../paises/initial-country';

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
    const headers: Record<string, Record<string, string>> = {
      PE: {
        '01': 'FACTURA ELECTRÓNICA',
        '03': 'BOLETA DE VENTA ELECTRÓNICA',
        '07': 'NOTA DE CRÉDITO ELECTRÓNICA',
        '08': 'NOTA DE DÉBITO ELECTRÓNICA',
      },
      CO: {
        '01': 'FACTURA ELECTRÓNICA DE VENTA',
        '91': 'NOTA CRÉDITO ELECTRÓNICA',
        '92': 'NOTA DÉBITO ELECTRÓNICA',
      },
    };

    return headers[countryCode]?.[documentType] || 'COMPROBANTE ELECTRÓNICO';
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
    const footers: Record<string, string[]> = {
      PE: [
        'Representación impresa de la Factura Electrónica',
        'Autorizado mediante Resolución de Intendencia N° 034-005-0000832/SUNAT',
        'Consulte su comprobante en: www.sunat.gob.pe',
      ],
      CO: [
        'Factura Electrónica de Venta',
        'Autorizada por la DIAN',
        'Consulte la validez en: www.dian.gov.co',
      ],
    };

    return footers[countryCode] || ['Comprobante Electrónico'];
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
    // Peru and Colombia require QR codes
    return ['PE', 'CO'].includes(countryCode);
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
