/**
 * Tax Calculator Service - Cálculo centralizado de impuestos
 * 
 * Servicio enterprise para cálculo de impuestos que:
 * - Evita hardcodear tasas de IGV/IVA en el código
 * - Soporta múltiples países y monedas
 * - Implementa cache inteligente para performance
 * - Proporciona métodos de cálculo precisos con redondeo correcto
 * 
 * @module TaxCalculatorService
 * @author ERP Suite Team
 * @version 2.0.0
 */

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Configuración fiscal de un país
 */
export interface TaxConfig {
  /** Tasa de IGV/IVA (ej: 0.18 para 18%) */
  tasaIgv: number;
  /** Código del país (PE, CO, CL, MX, EC) */
  pais: string;
  /** Código de moneda (PEN, COP, CLP, MXN, USD) */
  moneda: string;
  /** Nombre del impuesto (IGV, IVA) */
  nombreImpuesto: string;
  /** ID del país en la base de datos */
  paisId?: number;
  /** Tasa de retención de renta */
  retencionRenta?: number;
  /** Tasa de retención de IVA */
  retencionIva?: number;
}

/**
 * Resultado del cálculo de impuestos
 */
export interface TaxCalculationResult {
  /** Subtotal sin impuestos */
  subtotal: number;
  /** Monto del impuesto (IGV/IVA) */
  igv: number;
  /** Total con impuestos */
  total: number;
  /** Tasa aplicada */
  tasaIgv: number;
  /** Moneda utilizada */
  moneda: string;
  /** Nombre del impuesto */
  nombreImpuesto: string;
}

/**
 * Entrada para cálculo de impuestos
 */
export interface TaxCalculationInput {
  /** Subtotal base */
  subtotal: number;
  /** Tenant ID para obtener configuración */
  tenantId: string;
  /** País (opcional, se obtiene del tenant si no se proporciona) */
  paisId?: string;
  /** Moneda (opcional, se obtiene de la configuración si no se proporciona) */
  moneda?: string;
}

/**
 * Servicio inyectable para cálculo de impuestos
 * 
 * @example
 * ```typescript
 * constructor(private taxCalculator: TaxCalculatorService) {}
 * 
 * async calcularOrden() {
 *   const resultado = await this.taxCalculator.calcularImpuestos({
 *     subtotal: 1000,
 *     tenantId: 'tenant-123'
 *   });
 *   console.log(resultado.total); // 1180 (con IGV 18%)
 * }
 * ```
 */
@Injectable()
export class TaxCalculatorService {
  private readonly logger = new Logger(TaxCalculatorService.name);
  private readonly configCache = new Map<string, { config: TaxConfig; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos
  private readonly PRECISION = 2; // Decimales para redondeo

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Calcula impuestos de forma completa
   * 
   * @param input - Datos de entrada para el cálculo
   * @returns Resultado completo del cálculo con todos los montos
   * 
   * @throws Error si no se puede obtener la configuración fiscal
   */
  async calcularImpuestos(input: TaxCalculationInput): Promise<TaxCalculationResult> {
    try {
      // Obtener configuración fiscal
      const config = await this.getTaxConfig(input.tenantId, input.paisId);

      // Calcular montos
      const subtotal = this.round(input.subtotal);
      const igv = this.round(subtotal * config.tasaIgv);
      const total = this.round(subtotal + igv);

      return {
        subtotal,
        igv,
        total,
        tasaIgv: config.tasaIgv,
        moneda: input.moneda || config.moneda,
        nombreImpuesto: config.nombreImpuesto,
      };
    } catch (error) {
      this.logger.error(`Error calculando impuestos para tenant ${input.tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Calcula solo el IGV desde un subtotal
   * 
   * @param subtotal - Monto base sin impuestos
   * @param tenantId - ID del tenant
   * @returns Monto del IGV/IVA
   */
  async calcularIgv(subtotal: number, tenantId: string): Promise<number> {
    const config = await this.getTaxConfig(tenantId);
    return this.round(subtotal * config.tasaIgv);
  }

  /**
   * Calcula el total (subtotal + IGV)
   * 
   * @param subtotal - Monto base sin impuestos
   * @param tenantId - ID del tenant
   * @returns Total con impuestos incluidos
   */
  async calcularTotal(subtotal: number, tenantId: string): Promise<number> {
    const config = await this.getTaxConfig(tenantId);
    return this.round(subtotal * (1 + config.tasaIgv));
  }

  /**
   * Calcula el subtotal desde un total (operación inversa)
   * Útil cuando se tiene el precio final y se necesita extraer el subtotal
   * 
   * @param total - Monto total con impuestos
   * @param tenantId - ID del tenant
   * @returns Subtotal sin impuestos
   */
  async calcularSubtotalDesdeTotal(total: number, tenantId: string): Promise<number> {
    const config = await this.getTaxConfig(tenantId);
    return this.round(total / (1 + config.tasaIgv));
  }

  /**
   * Obtiene la configuración fiscal del tenant
   * Implementa cache para optimizar performance
   * 
   * @param tenantId - ID del tenant
   * @param paisId - ID del país (opcional)
   * @returns Configuración fiscal
   * 
   * @private
   */
  async getTaxConfig(tenantId: string, paisId?: string): Promise<TaxConfig> {
    const cacheKey = `${tenantId}:${paisId || 'default'}`;

    // Verificar cache
    const cached = this.configCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.config;
    }

    try {
      // Obtener país del tenant si no se proporciona
      let paisIdToUse = paisId;
      if (!paisIdToUse) {
        const { data: empresaConfig } = await this.supabase.getClient()
          .from('empresa_config')
          .select('pais_id')
          .eq('tenant_id', tenantId)
          .single();

        paisIdToUse = String(empresaConfig?.pais_id || 1); // Perú sólo para datos históricos sin país
      }

      // Consultar configuración fiscal con las columnas correctas
      const { data, error } = await this.supabase.getClient()
        .from('configuracion_fiscal')
        .select(`
          impuesto_principal_porcentaje,
          tasa_igv,
          impuesto_principal_nombre,
          retencion_renta_porcentaje,
          retencion_iva_porcentaje,
          tenant_id,
          pais_id,
          paises!inner(codigo_iso, moneda_codigo)
        `)
        .eq('pais_id', paisIdToUse)
        .eq('activo', true)
        .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
        .order('tenant_id', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        this.logger.warn(
          `No se encontró configuración fiscal para tenant ${tenantId}, usando defaults`,
          error
        );
      }

      // ✅ FIX: paises es un array, acceder al primer elemento
      const paisData = Array.isArray(data?.paises) ? data.paises[0] : data?.paises;
      const tasaConfigurada = Number(
        data?.tasa_igv ?? data?.impuesto_principal_porcentaje ?? 0.18,
      );
      const tasaNormalizada = tasaConfigurada > 1
        ? tasaConfigurada / 100
        : tasaConfigurada;

      if (!Number.isFinite(tasaNormalizada) || tasaNormalizada < 0 || tasaNormalizada > 1) {
        throw new Error(`Tasa tributaria inválida: ${String(tasaConfigurada)}`);
      }

      const config: TaxConfig = {
        // Cero es una tasa válida; `||` la reemplazaba indebidamente por 18 %.
        tasaIgv: tasaNormalizada,
        pais: paisData?.codigo_iso || 'PE',
        moneda: paisData?.moneda_codigo || 'PEN',
        nombreImpuesto: data?.impuesto_principal_nombre || 'IGV',
        paisId: data?.pais_id,
        retencionRenta: data?.retencion_renta_porcentaje || 0,
        retencionIva: data?.retencion_iva_porcentaje || 0,
      };

      // Guardar en cache
      this.configCache.set(cacheKey, { config, timestamp: Date.now() });

      this.logger.debug(
        `Configuración fiscal cargada para tenant ${tenantId}: ${config.nombreImpuesto} ${config.tasaIgv * 100}%`
      );

      return config;
    } catch (error) {
      this.logger.error(`Error obteniendo configuración fiscal para tenant ${tenantId}:`, error);
      
      // Fallback a configuración por defecto (Perú)
      const defaultConfig: TaxConfig = {
        tasaIgv: 0.18,
        pais: 'PE',
        moneda: 'PEN',
        nombreImpuesto: 'IGV',
      };

      return defaultConfig;
    }
  }

  /**
   * Obtiene solo la tasa de IGV/IVA
   * 
   * @param tenantId - ID del tenant
   * @returns Tasa de impuesto (ej: 0.18 para 18%)
   */
  async getTasaIgv(tenantId: string): Promise<number> {
    const config = await this.getTaxConfig(tenantId);
    return config.tasaIgv;
  }

  /**
   * Redondea un número a la precisión configurada (2 decimales por defecto)
   * 
   * @param value - Valor a redondear
   * @returns Valor redondeado
   * 
   * @private
   */
  private round(value: number): number {
    const multiplier = Math.pow(10, this.PRECISION);
    return Math.round(value * multiplier) / multiplier;
  }

  /**
   * Limpia el cache de configuraciones
   * Útil para tests o cuando se actualiza la configuración fiscal
   */
  clearCache(): void {
    this.configCache.clear();
    this.logger.log('Cache de configuración fiscal limpiado');
  }

  /**
   * Invalida el cache de un tenant específico
   * 
   * @param tenantId - ID del tenant
   */
  invalidateTenantCache(tenantId: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.configCache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.configCache.delete(key));
    
    this.logger.log(`Cache invalidado para tenant ${tenantId}`);
  }
}
