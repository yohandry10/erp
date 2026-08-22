import { Injectable } from '@nestjs/common';

import { calcularDigitoVerificacionNit } from '../paises/initial-country';
/**
 * Colombia-specific validation service
 * Handles DIAN-specific validation rules for Colombian companies
 */
@Injectable()
export class ColombiaValidationService {
  /**
   * Validate Colombian NIT format
   * Format: 9-10 digits + verification digit
   * Example: 900123456-7
   */
  validateNIT(nit: string): { isValid: boolean; error?: string } {
    if (!nit || nit.trim() === '') {
      return { isValid: false, error: 'El NIT es requerido' };
    }

    // Remove spaces and convert to uppercase
    const cleanNit = nit.trim().replace(/\s+/g, '');

    // Check format: 9-10 digits, optionally with dash and verification digit
    const nitPattern = /^(\d{9,10})(-?\d)?$/;
    const match = cleanNit.match(nitPattern);

    if (!match) {
      return { 
        isValid: false, 
        error: 'El NIT debe tener entre 9 y 10 dígitos, opcionalmente seguido de guión y dígito de verificación (ej: 900123456-7)' 
      };
    }

    const [, baseNumber, verificationDigit] = match;

    // If verification digit is provided, validate it
    if (verificationDigit) {
      const calculatedDigit = calcularDigitoVerificacionNit(baseNumber);
      const providedDigit = verificationDigit.replace('-', '');
      
      if (calculatedDigit.toString() !== providedDigit) {
        return { 
          isValid: false, 
          error: `Dígito de verificación incorrecto. Esperado: ${calculatedDigit}, Recibido: ${providedDigit}` 
        };
      }
    }

    return { isValid: true };
  }

  /**
   * Calculate NIT verification digit using Colombian algorithm
   */

  /**
   * Validate DIAN document limits
   * Colombia has different limits than Peru
   */
  validateDocumentLimits(itemCount: number, totalAmount: number): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // DIAN allows up to 1000 items per document (more than SUNAT's 999)
    const MAX_ITEMS_DIAN = 1000;
    if (itemCount > MAX_ITEMS_DIAN) {
      errors.push(`El documento excede el límite de ${MAX_ITEMS_DIAN} items permitidos por DIAN (actual: ${itemCount})`);
    }

    // Warning for large documents
    if (itemCount > 500) {
      warnings.push(`El documento tiene ${itemCount} items. Considere dividir en múltiples documentos para mejor rendimiento`);
    }

    // DIAN maximum amount (similar to SUNAT but in COP)
    const MAX_AMOUNT_DIAN = 999999999999.99; // Larger due to COP currency
    if (totalAmount > MAX_AMOUNT_DIAN) {
      errors.push(`El monto total excede el límite máximo permitido por DIAN ($${MAX_AMOUNT_DIAN.toFixed(2)} COP)`);
    }

    if (totalAmount < 0) {
      errors.push('El monto total no puede ser negativo');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate Colombian tax rates (IVA)
   * Colombia has multiple IVA rates: 0%, 5%, 19%
   */
  validateTaxRate(rate: number): { isValid: boolean; error?: string } {
    const validRates = [0, 0.05, 0.19]; // 0%, 5%, 19%
    
    if (!validRates.includes(rate)) {
      return {
        isValid: false,
        error: `Tasa de IVA inválida para Colombia. Tasas válidas: 0%, 5%, 19%. Recibido: ${(rate * 100).toFixed(0)}%`,
      };
    }

    return { isValid: true };
  }

  /**
   * Validate Colombian invoice series format
   * DIAN uses alphanumeric series with specific prefixes
   */
  validateSerieFormat(serie: string, documentType: string): { isValid: boolean; error?: string } {
    if (!serie || serie.trim() === '') {
      return { isValid: false, error: 'La serie es requerida' };
    }

    const cleanSerie = serie.trim().toUpperCase();

    // DIAN series format: 2-4 alphanumeric characters
    const seriePattern = /^[A-Z0-9]{2,4}$/;
    
    if (!seriePattern.test(cleanSerie)) {
      return {
        isValid: false,
        error: 'La serie debe tener entre 2 y 4 caracteres alfanuméricos en mayúsculas (ej: FE, NC, ND)',
      };
    }

    // Validate series prefix based on document type
    const validPrefixes: Record<string, string[]> = {
      '01': ['FE', 'FV', 'F'], // Factura de Venta
      '91': ['NC', 'N'], // Nota Crédito
      '92': ['ND', 'N'], // Nota Débito
    };

    if (validPrefixes[documentType]) {
      const hasValidPrefix = validPrefixes[documentType].some(prefix => 
        cleanSerie.startsWith(prefix)
      );

      if (!hasValidPrefix) {
        return {
          isValid: false,
          error: `Serie inválida para tipo de documento ${documentType}. Prefijos válidos: ${validPrefixes[documentType].join(', ')}`,
        };
      }
    }

    return { isValid: true };
  }

  /**
   * Validate Colombian resolution number (Resolución DIAN)
   * Required for electronic invoicing in Colombia
   */
  validateResolucionDIAN(resolucion: string): { isValid: boolean; error?: string } {
    if (!resolucion || resolucion.trim() === '') {
      return { isValid: false, error: 'El número de resolución DIAN es requerido' };
    }

    // DIAN resolution format: typically 18 digits
    const resolucionPattern = /^\d{18}$/;
    
    if (!resolucionPattern.test(resolucion.trim())) {
      return {
        isValid: false,
        error: 'El número de resolución DIAN debe tener 18 dígitos numéricos',
      };
    }

    return { isValid: true };
  }

  /**
   * Validate Colombian address format
   * Colombia has specific address structure
   */
  validateAddress(address: string): { isValid: boolean; error?: string; warnings?: string[] } {
    const warnings: string[] = [];

    if (!address || address.trim() === '') {
      return { isValid: false, error: 'La dirección es requerida' };
    }

    // Check minimum length
    if (address.trim().length < 10) {
      warnings.push('La dirección parece muy corta. Asegúrese de incluir calle, número y ciudad');
    }

    // Colombian addresses typically include: Calle/Carrera # número - número
    const addressPattern = /(calle|carrera|avenida|diagonal|transversal|kr|cl|av|dg|tv)/i;
    
    if (!addressPattern.test(address)) {
      warnings.push('La dirección no sigue el formato colombiano típico (Calle/Carrera # número - número)');
    }

    return { 
      isValid: true, 
      warnings: warnings.length > 0 ? warnings : undefined 
    };
  }

  /**
   * Validate Colombian phone number format
   */
  validatePhoneNumber(phone: string): { isValid: boolean; error?: string } {
    if (!phone || phone.trim() === '') {
      return { isValid: true }; // Phone is optional
    }

    // Remove spaces, dashes, and parentheses
    const cleanPhone = phone.replace(/[\s\-()]/g, '');

    // Colombian phone format: 
    // - Landline: 7 digits (local) or 10 digits with area code
    // - Mobile: 10 digits starting with 3
    const phonePattern = /^(\+?57)?[1-8]\d{6,9}$|^(\+?57)?3\d{9}$/;

    if (!phonePattern.test(cleanPhone)) {
      return {
        isValid: false,
        error: 'Formato de teléfono inválido para Colombia. Use formato: 3001234567 o 6012345678',
      };
    }

    return { isValid: true };
  }

  /**
   * Get DIAN-specific validation messages
   */
  getDIANValidationMessages(): Record<string, string> {
    return {
      CERTIFICATE_REQUIRED: 'Certificado digital DIAN requerido para facturación electrónica',
      RESOLUTION_REQUIRED: 'Resolución DIAN requerida para emitir facturas electrónicas',
      NIT_INVALID: 'NIT inválido. Verifique el formato y dígito de verificación',
      SERIE_INVALID: 'Serie inválida para DIAN. Use formato: FE, NC, ND',
      IVA_RATE_INVALID: 'Tasa de IVA inválida. Colombia permite: 0%, 5%, 19%',
      DOCUMENT_LIMIT_EXCEEDED: 'El documento excede los límites permitidos por DIAN',
    };
  }
}
