import Decimal from 'decimal.js';
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

/**
 * Servicio helper para validar cálculos de retenciones, percepciones y detracciones
 * 
 * Este servicio asegura que los cálculos de ajustes tributarios sean correctos
 * antes de crear CxC/CxP, evitando errores contables y financieros.
 */
@Injectable()
export class RetencionesValidationService {
  private readonly logger = new Logger(RetencionesValidationService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Valida que los cálculos de ajustes tributarios sean correctos
   * 
   * @param total - Monto total sobre el cual se calculan los ajustes
   * @param ajustesCalculados - Ajustes calculados (retención, percepción, detracción, anticipo)
   * @param clienteConfig - Configuración del cliente (sujeto_retencion, retencion_tasa, etc.)
   * @param empresaConfig - Configuración de la empresa (aplicar_retencion, retencion_tasa, etc.)
   * @returns Objeto con resultado de validación y detalles
   */
  async validarCalculoAjustes(
    total: number,
    ajustesCalculados: {
      retencion: number;
      percepcion: number;
      detraccion: number;
      anticipo: number;
    },
    clienteConfig?: {
      sujeto_retencion?: boolean;
      retencion_tasa?: number;
      sujeto_percepcion?: boolean;
      percepcion_tasa?: number;
      sujeto_detraccion?: boolean;
      detraccion_tasa?: number;
    },
    empresaConfig?: {
      aplicar_retencion?: boolean;
      retencion_tasa?: number;
      aplicar_percepcion?: boolean;
      percepcion_tasa?: number;
      aplicar_detraccion?: boolean;
      detraccion_tasa?: number;
    }
  ): Promise<{
    valido: boolean;
    errores: string[];
    ajustesEsperados: {
      retencion: number;
      percepcion: number;
      detraccion: number;
      anticipo: number;
    };
  }> {
    const errores: string[] = [];
    // Decimal, igual que `RetencionesService.calcularAjuste`, que es quien calcula
    // el importe que aquí se comprueba. Con coma flotante discrepaban en un
    // céntimo —3 % de 5.50 daba 0.16 en vez de 0.17— y esa diferencia la absorbía
    // la tolerancia, de modo que la tolerancia acababa tapando nuestra propia
    // aritmética en vez de las diferencias de redondeo del cliente.
    const round2 = (value: number) =>
      new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

    // Calcular ajustes esperados según configuración
    const sujetoRetencion = clienteConfig?.sujeto_retencion ?? empresaConfig?.aplicar_retencion ?? false;
    const retencionTasa = clienteConfig?.retencion_tasa ?? empresaConfig?.retencion_tasa ?? 0;
    const retencionEsperada = sujetoRetencion && retencionTasa > 0 
      ? round2(total * (Number(retencionTasa) / 100)) 
      : 0;

    const sujetoPercepcion = clienteConfig?.sujeto_percepcion ?? empresaConfig?.aplicar_percepcion ?? false;
    const percepcionTasa = clienteConfig?.percepcion_tasa ?? empresaConfig?.percepcion_tasa ?? 0;
    const percepcionEsperada = sujetoPercepcion && percepcionTasa > 0 
      ? round2(total * (Number(percepcionTasa) / 100)) 
      : 0;

    const sujetoDetraccion = clienteConfig?.sujeto_detraccion ?? empresaConfig?.aplicar_detraccion ?? false;
    const detraccionTasa = clienteConfig?.detraccion_tasa ?? empresaConfig?.detraccion_tasa ?? 0;
    const detraccionEsperada = sujetoDetraccion && detraccionTasa > 0 
      ? round2(total * (Number(detraccionTasa) / 100)) 
      : 0;

    const ajustesEsperados = {
      retencion: retencionEsperada,
      percepcion: percepcionEsperada,
      detraccion: detraccionEsperada,
      anticipo: ajustesCalculados.anticipo, // Los anticipos no se calculan automáticamente, se validan que sean >= 0
    };

    // Validar retención
    if (Math.abs(ajustesCalculados.retencion - retencionEsperada) > 0.01) {
      errores.push(
        `Retención calculada incorrecta. Esperada: ${retencionEsperada.toFixed(2)}, ` +
        `Recibida: ${ajustesCalculados.retencion.toFixed(2)} ` +
        `(Tasa: ${retencionTasa}%, Base: ${total.toFixed(2)})`
      );
    }

    // Validar percepción
    if (Math.abs(ajustesCalculados.percepcion - percepcionEsperada) > 0.01) {
      errores.push(
        `Percepción calculada incorrecta. Esperada: ${percepcionEsperada.toFixed(2)}, ` +
        `Recibida: ${ajustesCalculados.percepcion.toFixed(2)} ` +
        `(Tasa: ${percepcionTasa}%, Base: ${total.toFixed(2)})`
      );
    }

    // Validar detracción
    if (Math.abs(ajustesCalculados.detraccion - detraccionEsperada) > 0.01) {
      errores.push(
        `Detracción calculada incorrecta. Esperada: ${detraccionEsperada.toFixed(2)}, ` +
        `Recibida: ${ajustesCalculados.detraccion.toFixed(2)} ` +
        `(Tasa: ${detraccionTasa}%, Base: ${total.toFixed(2)})`
      );
    }

    // Validar que anticipo no sea negativo
    if (ajustesCalculados.anticipo < 0) {
      errores.push(`Anticipo no puede ser negativo: ${ajustesCalculados.anticipo.toFixed(2)}`);
    }

    // Validar que las tasas sean coherentes con los ajustes
    if (ajustesCalculados.retencion > 0 && retencionTasa === 0) {
      errores.push(
        `Retención aplicada (${ajustesCalculados.retencion.toFixed(2)}) pero tasa es 0%`
      );
    }

    if (ajustesCalculados.percepcion > 0 && percepcionTasa === 0) {
      errores.push(
        `Percepción aplicada (${ajustesCalculados.percepcion.toFixed(2)}) pero tasa es 0%`
      );
    }

    if (ajustesCalculados.detraccion > 0 && detraccionTasa === 0) {
      errores.push(
        `Detracción aplicada (${ajustesCalculados.detraccion.toFixed(2)}) pero tasa es 0%`
      );
    }

    // Validar que los ajustes no excedan el total (a excepción de percepción que suma)
    const totalDescontado = ajustesCalculados.retencion + ajustesCalculados.detraccion + ajustesCalculados.anticipo;
    if (totalDescontado > total) {
      errores.push(
        `Suma de retención + detracción + anticipo (${totalDescontado.toFixed(2)}) ` +
        `excede el total (${total.toFixed(2)})`
      );
    }

    return {
      valido: errores.length === 0,
      errores,
      ajustesEsperados,
    };
  }

  /**
   * Valida que el monto pendiente calculado sea correcto
   * 
   * @param total - Monto total
   * @param ajustes - Ajustes aplicados
   * @param montoPendiente - Monto pendiente calculado
   * @returns true si el cálculo es correcto
   */
  validarMontoPendiente(
    total: number,
    ajustes: {
      retencion: number;
      percepcion: number;
      detraccion: number;
      anticipo: number;
    },
    montoPendiente: number
  ): { valido: boolean; error?: string; montoEsperado: number } {
    // Decimal, igual que `RetencionesService.calcularAjuste`, que es quien calcula
    // el importe que aquí se comprueba. Con coma flotante discrepaban en un
    // céntimo —3 % de 5.50 daba 0.16 en vez de 0.17— y esa diferencia la absorbía
    // la tolerancia, de modo que la tolerancia acababa tapando nuestra propia
    // aritmética en vez de las diferencias de redondeo del cliente.
    const round2 = (value: number) =>
      new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    
    // Fórmula: total - retención - detracción - anticipo + percepción
    // La percepción suma porque aumenta el monto a cobrar
    const montoEsperado = round2(
      Math.max(total - ajustes.retencion - ajustes.detraccion - ajustes.anticipo + ajustes.percepcion, 0)
    );

    if (Math.abs(montoPendiente - montoEsperado) > 0.01) {
      return {
        valido: false,
        error: `Monto pendiente incorrecto. Esperado: ${montoEsperado.toFixed(2)}, ` +
          `Recibido: ${montoPendiente.toFixed(2)}. ` +
          `Fórmula: total (${total.toFixed(2)}) - retención (${ajustes.retencion.toFixed(2)}) ` +
          `- detracción (${ajustes.detraccion.toFixed(2)}) - anticipo (${ajustes.anticipo.toFixed(2)}) ` +
          `+ percepción (${ajustes.percepcion.toFixed(2)})`,
        montoEsperado,
      };
    }

    return {
      valido: true,
      montoEsperado,
    };
  }

  /**
   * Obtiene configuración de cliente para validación
   */
  async obtenerConfiguracionCliente(
    clienteId: string,
    tenantId: string
  ): Promise<{
    sujeto_retencion?: boolean;
    retencion_tasa?: number;
    sujeto_percepcion?: boolean;
    percepcion_tasa?: number;
    sujeto_detraccion?: boolean;
    detraccion_tasa?: number;
  } | null> {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('clientes')
        .select('sujeto_retencion, retencion_tasa, sujeto_percepcion, percepcion_tasa, sujeto_detraccion, detraccion_tasa')
        .eq('id', clienteId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) {
        this.logger.warn(`Error obteniendo configuración de cliente: ${error.message}`);
        return null;
      }

      return data || null;
    } catch (error) {
      this.logger.error(`Error en obtenerConfiguracionCliente:`, error);
      return null;
    }
  }

  /**
   * Obtiene configuración de empresa para validación
   */
  async obtenerConfiguracionEmpresa(tenantId: string): Promise<{
    aplicar_retencion?: boolean;
    retencion_tasa?: number;
    aplicar_percepcion?: boolean;
    percepcion_tasa?: number;
    aplicar_detraccion?: boolean;
    detraccion_tasa?: number;
  } | null> {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('empresa_config')
        .select('aplicar_retencion, retencion_tasa, aplicar_percepcion, percepcion_tasa, aplicar_detraccion, detraccion_tasa')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) {
        this.logger.warn(`Error obteniendo configuración de empresa: ${error.message}`);
        return null;
      }

      return data || null;
    } catch (error) {
      this.logger.error(`Error en obtenerConfiguracionEmpresa:`, error);
      return null;
    }
  }
}

