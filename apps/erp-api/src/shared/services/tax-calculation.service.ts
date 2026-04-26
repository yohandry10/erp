import { Injectable } from '@nestjs/common';
import {
  TaxCalculatorService,
  TaxCalculationInput,
  TaxCalculationResult,
} from '../utils/tax-calculator';

/**
 * Alias de compatibilidad para servicios que inyectan TaxCalculationService.
 * Redirige a TaxCalculatorService real (implementación en utils/tax-calculator).
 */
@Injectable()
export class TaxCalculationService {
  constructor(private readonly taxCalculator: TaxCalculatorService) {}

  calcularImpuestos(input: TaxCalculationInput): Promise<TaxCalculationResult> {
    return this.taxCalculator.calcularImpuestos(input);
  }

  calcularIgv(subtotal: number, tenantId: string): Promise<number> {
    return this.taxCalculator.calcularIgv(subtotal, tenantId);
  }

  calcularTotal(subtotal: number, tenantId: string): Promise<number> {
    return this.taxCalculator.calcularTotal(subtotal, tenantId);
  }

  calcularSubtotalDesdeTotal(total: number, tenantId: string): Promise<number> {
    return this.taxCalculator.calcularSubtotalDesdeTotal(total, tenantId);
  }

  getTasaIgv(tenantId: string): Promise<number> {
    return this.taxCalculator.getTasaIgv(tenantId);
  }

  clearCache(): void {
    this.taxCalculator.clearCache();
  }

  invalidateTenantCache(tenantId: string): void {
    this.taxCalculator.invalidateTenantCache(tenantId);
  }
}
