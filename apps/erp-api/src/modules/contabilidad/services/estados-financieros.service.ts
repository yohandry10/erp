import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import {
  formatBalanceComprobacionItem,
  formatEstadoResultados,
  formatBalanceGeneral,
  FormattedBalanceComprobacionItem,
  FormattedEstadoResultados,
  FormattedBalanceGeneral,
} from '../utils/accounting-formatter.util';

export interface BalanceComprobacionItem {
  cuenta: string;
  nombre: string;
  saldo_inicial: number;
  debe: number;
  haber: number;
  saldo_final: number;
}

export interface EstadoResultados {
  ingresos: {
    ventas: number;
    otros_ingresos: number;
    total_ingresos: number;
  };
  costos: {
    costo_ventas: number;
    utilidad_bruta: number;
  };
  gastos: {
    gastos_administrativos: number;
    gastos_ventas: number;
    gastos_financieros: number;
    total_gastos: number;
  };
  utilidad_neta: number;
}

export interface BalanceGeneral {
  activos: {
    corrientes: {
      efectivo: number;
      cuentas_por_cobrar: number;
      inventarios: number;
      otros_activos: number;
      total_corrientes: number;
    };
    no_corrientes: {
      activos_fijos: number;
      depreciacion_acumulada: number;
      activos_fijos_neto: number;
      otros_activos: number;
      total_no_corrientes: number;
    };
    total_activos: number;
  };
  pasivos: {
    corrientes: {
      cuentas_por_pagar: number;
      tributos_por_pagar: number;
      remuneraciones_por_pagar: number;
      otros_pasivos: number;
      total_corrientes: number;
    };
    no_corrientes: {
      deudas_largo_plazo: number;
      otros_pasivos: number;
      total_no_corrientes: number;
    };
    total_pasivos: number;
  };
  patrimonio: {
    capital: number;
    resultados_acumulados: number;
    resultado_ejercicio: number;
    total_patrimonio: number;
  };
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class EstadosFinancierosService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hora en milisegundos
  private cacheCleanupInterval?: NodeJS.Timeout;

  constructor(private readonly supabase: SupabaseService) {
    console.log('📊 [EstadosFinancierosService] Servicio de estados financieros inicializado');
    // Limpiar cache expirado cada 10 minutos
    this.cacheCleanupInterval = setInterval(() => this.cleanExpiredCache(), 10 * 60 * 1000);
    this.cacheCleanupInterval.unref?.();
  }

  onModuleDestroy() {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = undefined;
    }
  }

  /**
   * Genera una clave de cache única basada en los parámetros
   */
  private getCacheKey(method: string, tenantId: string, anio: number, mes: number): string {
    return `${method}:${tenantId}:${anio}:${mes}`;
  }

  /**
   * Obtiene datos del cache si están disponibles y no han expirado
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      console.log(`🗑️ [Cache] Entrada expirada eliminada: ${key}`);
      return null;
    }

    console.log(`✅ [Cache] Hit: ${key}`);
    return entry.data as T;
  }

  /**
   * Guarda datos en el cache con TTL de 1 hora
   */
  private setCache<T>(key: string, data: T): void {
    const entry: CacheEntry<T> = {
      data,
      expiresAt: Date.now() + this.CACHE_TTL,
    };
    this.cache.set(key, entry);
    console.log(`💾 [Cache] Guardado: ${key} (expira en 1 hora)`);
  }

  /**
   * Invalida el cache para un tenant y período específico
   */
  private invalidateCache(tenantId: string, anio: number, mes: number): void {
    const patterns = [
      this.getCacheKey('balance-comprobacion', tenantId, anio, mes),
      this.getCacheKey('estado-resultados', tenantId, anio, mes),
      this.getCacheKey('balance-general', tenantId, anio, mes),
    ];

    patterns.forEach(key => {
      if (this.cache.delete(key)) {
        console.log(`🗑️ [Cache] Invalidado: ${key}`);
      }
    });
  }

  private isMaterializedViewUnavailable(error: any): boolean {
    return error?.code === '55000' || error?.code === 'PGRST116';
  }

  private getPeriodoRange(anio: number, mes: number): { inicio: string; fin: string } {
    const inicio = new Date(Date.UTC(anio, mes - 1, 1)).toISOString();
    const fin = new Date(Date.UTC(anio, mes, 1)).toISOString();

    return { inicio, fin };
  }

  private async calcularBalanceComprobacionDesdeAsientos(
    tenantId: string,
    anio: number,
    mes: number,
  ): Promise<BalanceComprobacionItem[]> {
    const { inicio, fin } = this.getPeriodoRange(anio, mes);

    const detalles: any[] = [];
    const pageSize = 1000;

    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await this.supabase
        .getClient()
        .from('detalle_asientos')
        .select(`
          debe,
          haber,
          plan_cuentas!fk_detalle_asientos_cuenta_id (
            codigo,
            nombre
          ),
          asientos_contables!fk_detalle_asientos_asiento_id_v2 (
            tenant_id,
            fecha,
            estado
          )
        `)
        .eq('asientos_contables.tenant_id', tenantId)
        .gte('asientos_contables.fecha', inicio)
        .lt('asientos_contables.fecha', fin)
        .neq('asientos_contables.estado', 'ANULADO')
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('❌ Error calculando balance desde asientos:', error);
        throw error;
      }

      detalles.push(...(data || []));

      if (!data || data.length < pageSize) {
        break;
      }
    }

    const porCuenta = new Map<string, BalanceComprobacionItem>();

    for (const detalle of detalles || []) {
      const cuenta = Array.isArray((detalle as any).plan_cuentas)
        ? (detalle as any).plan_cuentas[0]
        : (detalle as any).plan_cuentas;
      const codigo = cuenta?.codigo || 'SIN_CUENTA';
      const nombre = cuenta?.nombre || 'Cuenta sin nombre';
      const debe = Number((detalle as any).debe || 0);
      const haber = Number((detalle as any).haber || 0);

      const actual = porCuenta.get(codigo) || {
        cuenta: codigo,
        nombre,
        saldo_inicial: 0,
        debe: 0,
        haber: 0,
        saldo_final: 0,
      };

      actual.debe += debe;
      actual.haber += haber;
      actual.saldo_final = actual.debe - actual.haber;
      porCuenta.set(codigo, actual);
    }

    return [...porCuenta.values()]
      .map(item => ({
        ...item,
        debe: Number(item.debe.toFixed(2)),
        haber: Number(item.haber.toFixed(2)),
        saldo_final: Number(item.saldo_final.toFixed(2)),
      }))
      .filter(item => Math.abs(item.debe) > 0.01 || Math.abs(item.haber) > 0.01 || Math.abs(item.saldo_final) > 0.01)
      .sort((a, b) => a.cuenta.localeCompare(b.cuenta, 'es'));
  }

  private getEmptyEstadoResultados(): EstadoResultados {
    return {
      ingresos: {
        ventas: 0,
        otros_ingresos: 0,
        total_ingresos: 0,
      },
      costos: {
        costo_ventas: 0,
        utilidad_bruta: 0,
      },
      gastos: {
        gastos_administrativos: 0,
        gastos_ventas: 0,
        gastos_financieros: 0,
        total_gastos: 0,
      },
      utilidad_neta: 0,
    };
  }

  private getEmptyBalanceGeneral(resultadoEjercicio = 0): BalanceGeneral {
    return {
      activos: {
        corrientes: {
          efectivo: 0,
          cuentas_por_cobrar: 0,
          inventarios: 0,
          otros_activos: 0,
          total_corrientes: 0,
        },
        no_corrientes: {
          activos_fijos: 0,
          depreciacion_acumulada: 0,
          activos_fijos_neto: 0,
          otros_activos: 0,
          total_no_corrientes: 0,
        },
        total_activos: 0,
      },
      pasivos: {
        corrientes: {
          cuentas_por_pagar: 0,
          tributos_por_pagar: 0,
          remuneraciones_por_pagar: 0,
          otros_pasivos: 0,
          total_corrientes: 0,
        },
        no_corrientes: {
          deudas_largo_plazo: 0,
          otros_pasivos: 0,
          total_no_corrientes: 0,
        },
        total_pasivos: 0,
      },
      patrimonio: {
        capital: 0,
        resultados_acumulados: 0,
        resultado_ejercicio: resultadoEjercicio,
        total_patrimonio: resultadoEjercicio,
      },
    };
  }

  /**
   * Limpia entradas de cache expiradas
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 [Cache] Limpieza automática: ${cleaned} entradas eliminadas`);
    }
  }

  /**
   * Refresca las vistas materializadas de estados financieros
   * @param tenantId ID del tenant
   * @param anio Año del período
   * @param mes Mes del período (1-12)
   */
  async refrescarEstadosFinancieros(
    tenantId: string,
    anio: number,
    mes: number
  ): Promise<void> {
    try {
      console.log(`🔄 [EstadosFinancieros] Refrescando vistas materializadas para ${anio}-${mes}, tenant: ${tenantId}`);

      // Llamar a la función de PostgreSQL que refresca las vistas materializadas
      const { error } = await this.supabase
        .getClient()
        .rpc('refrescar_estados_financieros', {
          p_tenant_id: tenantId,
          p_anio: anio,
          p_mes: mes,
        });

      if (error) {
        console.error('❌ Error refrescando vistas materializadas:', error);
        throw error;
      }

      // Invalidar cache después de refrescar las vistas
      this.invalidateCache(tenantId, anio, mes);

      console.log('✅ Vistas materializadas refrescadas exitosamente y cache invalidado');
    } catch (error) {
      console.error('❌ Error en refrescarEstadosFinancieros:', error);
      throw error;
    }
  }

  /**
   * Obtiene el Balance de Comprobación para un período específico
   * @param tenantId ID del tenant
   * @param anio Año del período
   * @param mes Mes del período (1-12)
   * @returns Balance de comprobación con saldos por cuenta
   */
  async getBalanceComprobacion(
    tenantId: string,
    anio: number,
    mes: number
  ): Promise<BalanceComprobacionItem[]> {
    try {
      // Intentar obtener del cache
      const cacheKey = this.getCacheKey('balance-comprobacion', tenantId, anio, mes);
      const cached = this.getFromCache<BalanceComprobacionItem[]>(cacheKey);
      if (cached) {
        return cached;
      }

      console.log(`⚖️ [EstadosFinancieros] Consultando Balance de Comprobación desde vista materializada para ${anio}-${mes}, tenant: ${tenantId}`);

      // Consultar vista materializada en lugar de calcular en tiempo real
      const { data: balance, error } = await this.supabase
        .getClient()
        .from('mv_balance_comprobacion')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('anio', anio)
        .eq('mes', mes)
        .order('cuenta', { ascending: true });

      if (error) {
        if (this.isMaterializedViewUnavailable(error)) {
          console.warn('⚠️ Balance de comprobación sin MV disponible; calculando desde asientos');
          const fallbackBalance = await this.calcularBalanceComprobacionDesdeAsientos(tenantId, anio, mes);
          this.setCache(cacheKey, fallbackBalance);
          return fallbackBalance;
        }
        console.error('❌ Error consultando vista materializada:', error);
        throw error;
      }

      console.log(`✅ Balance obtenido con ${balance?.length || 0} cuentas desde vista materializada`);

      // Mapear los datos de la vista materializada al formato esperado
      const balanceItems: BalanceComprobacionItem[] = (balance || []).map((item: any) => ({
        cuenta: item.cuenta,
        nombre: item.nombre_cuenta,
        saldo_inicial: parseFloat(item.saldo_inicial || 0),
        debe: parseFloat(item.debe || 0),
        haber: parseFloat(item.haber || 0),
        saldo_final: parseFloat(item.saldo_final || 0),
      }));

      if (balanceItems.length === 0) {
        console.warn('⚠️ Balance de comprobación con MV vacía; calculando desde asientos');
        const fallbackBalance = await this.calcularBalanceComprobacionDesdeAsientos(tenantId, anio, mes);
        this.setCache(cacheKey, fallbackBalance);
        return fallbackBalance;
      }

      // Guardar en cache
      this.setCache(cacheKey, balanceItems);

      return balanceItems;
    } catch (error) {
      console.error('❌ Error generando balance de comprobación:', error);
      throw error;
    }
  }

  /**
   * Obtiene el Balance de Comprobación formateado según estándares contables
   * @param tenantId ID del tenant
   * @param anio Año del período
   * @param mes Mes del período (1-12)
   * @param showCurrency Si se debe mostrar el símbolo de moneda
   * @returns Balance de comprobación con valores formateados
   */
  async getBalanceComprobacionFormatted(
    tenantId: string,
    anio: number,
    mes: number,
    showCurrency: boolean = false
  ): Promise<FormattedBalanceComprobacionItem[]> {
    const balance = await this.getBalanceComprobacion(tenantId, anio, mes);
    return balance.map(item => formatBalanceComprobacionItem(item, showCurrency));
  }

  /**
   * Obtiene el Estado de Resultados (P&L) para un período específico
   * @param tenantId ID del tenant
   * @param anio Año del período
   * @param mes Mes del período (1-12)
   * @returns Estado de Resultados con ingresos, costos, gastos y utilidad neta
   */
  async getEstadoResultados(
    tenantId: string,
    anio: number,
    mes: number
  ): Promise<EstadoResultados> {
    try {
      // Intentar obtener del cache
      const cacheKey = this.getCacheKey('estado-resultados', tenantId, anio, mes);
      const cached = this.getFromCache<EstadoResultados>(cacheKey);
      if (cached) {
        return cached;
      }

      console.log(`📊 [EstadosFinancieros] Consultando Estado de Resultados desde vista materializada para ${anio}-${mes}, tenant: ${tenantId}`);

      // Consultar vista materializada en lugar de calcular en tiempo real
      const { data: resultado, error } = await this.supabase
        .getClient()
        .from('mv_estado_resultados')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('anio', anio)
        .eq('mes', mes)
        .single();

      if (error) {
        if (this.isMaterializedViewUnavailable(error)) {
          console.warn('⚠️ Estado de resultados sin MV poblada o sin filas, retornando valores en cero');
          const emptyResult = this.getEmptyEstadoResultados();
          this.setCache(cacheKey, emptyResult);
          return emptyResult;
        }
        console.error('❌ Error consultando vista materializada:', error);
        throw error;
      }

      if (!resultado) {
        console.log('⚠️ No se encontraron datos para el período especificado, retornando valores en cero');
        const emptyResult = this.getEmptyEstadoResultados();
        // Guardar en cache incluso si está vacío
        this.setCache(cacheKey, emptyResult);
        return emptyResult;
      }

      // Mapear los datos de la vista materializada al formato esperado
      const ventas = parseFloat(resultado.ventas || 0);
      const otrosIngresos = parseFloat(resultado.otros_ingresos || 0);
      const costoVentas = parseFloat(resultado.costo_ventas || 0);
      const gastosAdministrativos = parseFloat(resultado.gastos_administrativos || 0);
      const gastosVentas = parseFloat(resultado.gastos_ventas || 0);
      const gastosFinancieros = parseFloat(resultado.gastos_financieros || 0);

      // Calcular totales y subtotales
      const totalIngresos = ventas + otrosIngresos;
      const utilidadBruta = totalIngresos - costoVentas;
      const totalGastos = gastosAdministrativos + gastosVentas + gastosFinancieros;
      const utilidadNeta = utilidadBruta - totalGastos;

      const estadoResultados: EstadoResultados = {
        ingresos: {
          ventas,
          otros_ingresos: otrosIngresos,
          total_ingresos: totalIngresos,
        },
        costos: {
          costo_ventas: costoVentas,
          utilidad_bruta: utilidadBruta,
        },
        gastos: {
          gastos_administrativos: gastosAdministrativos,
          gastos_ventas: gastosVentas,
          gastos_financieros: gastosFinancieros,
          total_gastos: totalGastos,
        },
        utilidad_neta: utilidadNeta,
      };

      console.log(`✅ Estado de Resultados calculado - Total Ingresos: ${totalIngresos.toFixed(2)}, Total Gastos: ${totalGastos.toFixed(2)}, Utilidad Neta: ${utilidadNeta.toFixed(2)}`);

      // Guardar en cache
      this.setCache(cacheKey, estadoResultados);

      return estadoResultados;
    } catch (error) {
      console.error('❌ Error generando estado de resultados:', error);
      throw error;
    }
  }

  /**
   * Obtiene el Estado de Resultados formateado según estándares contables
   * @param tenantId ID del tenant
   * @param anio Año del período
   * @param mes Mes del período (1-12)
   * @param showCurrency Si se debe mostrar el símbolo de moneda
   * @returns Estado de Resultados con valores formateados
   */
  async getEstadoResultadosFormatted(
    tenantId: string,
    anio: number,
    mes: number,
    showCurrency: boolean = false
  ): Promise<FormattedEstadoResultados> {
    const estado = await this.getEstadoResultados(tenantId, anio, mes);
    return formatEstadoResultados(estado, showCurrency);
  }

  /**
   * Obtiene el Balance General para un período específico
   * @param tenantId ID del tenant
   * @param anio Año del período
   * @param mes Mes del período (1-12)
   * @returns Balance General con activos, pasivos y patrimonio
   */
  async getBalanceGeneral(
    tenantId: string,
    anio: number,
    mes: number
  ): Promise<BalanceGeneral> {
    try {
      // Intentar obtener del cache
      const cacheKey = this.getCacheKey('balance-general', tenantId, anio, mes);
      const cached = this.getFromCache<BalanceGeneral>(cacheKey);
      if (cached) {
        return cached;
      }

      console.log(`🏦 [EstadosFinancieros] Consultando Balance General desde vista materializada para ${anio}-${mes}, tenant: ${tenantId}`);

      // Consultar vista materializada en lugar de calcular en tiempo real
      const { data: balance, error } = await this.supabase
        .getClient()
        .from('mv_balance_general')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('anio', anio)
        .eq('mes', mes)
        .single();

      if (error) {
        if (this.isMaterializedViewUnavailable(error)) {
          console.warn('⚠️ Balance general sin MV poblada o sin filas, retornando valores en cero');
          const estadoResultados = await this.getEstadoResultados(tenantId, anio, mes);
          const emptyBalance = this.getEmptyBalanceGeneral(estadoResultados.utilidad_neta);
          this.setCache(cacheKey, emptyBalance);
          return emptyBalance;
        }
        console.error('❌ Error consultando vista materializada:', error);
        throw error;
      }

      // Obtener el resultado del ejercicio desde el Estado de Resultados (usa cache si está disponible)
      const estadoResultados = await this.getEstadoResultados(tenantId, anio, mes);
      const resultadoEjercicio = estadoResultados.utilidad_neta;

      if (!balance) {
        console.log('⚠️ No se encontraron datos para el período especificado, retornando valores en cero');
        const emptyBalance = this.getEmptyBalanceGeneral(resultadoEjercicio);
        // Guardar en cache incluso si está vacío
        this.setCache(cacheKey, emptyBalance);
        return emptyBalance;
      }

      // Mapear los datos de la vista materializada al formato esperado
      const efectivo = parseFloat(balance.efectivo || 0);
      const cuentasPorCobrar = parseFloat(balance.cuentas_por_cobrar || 0);
      const inventarios = parseFloat(balance.inventarios || 0);
      const otrosActivosCorrientes = parseFloat(balance.otros_activos_corrientes || 0);

      const activosFijos = parseFloat(balance.activos_fijos || 0);
      const depreciacionAcumulada = parseFloat(balance.depreciacion_acumulada || 0);
      const otrosActivosNoCorrientes = parseFloat(balance.otros_activos_no_corrientes || 0);

      const cuentasPorPagar = parseFloat(balance.cuentas_por_pagar || 0);
      const tributosPorPagar = parseFloat(balance.tributos_por_pagar || 0);
      const remuneracionesPorPagar = parseFloat(balance.remuneraciones_por_pagar || 0);
      const otrosPasivosCorrientes = parseFloat(balance.otros_pasivos_corrientes || 0);

      const deudasLargoPlazo = parseFloat(balance.deudas_largo_plazo || 0);
      const otrosPasivosNoCorrientes = parseFloat(balance.otros_pasivos_no_corrientes || 0);

      const capital = parseFloat(balance.capital || 0);
      const resultadosAcumulados = parseFloat(balance.resultados_acumulados || 0);

      // Calcular totales y subtotales
      const totalActivosCorrientes = efectivo + cuentasPorCobrar + inventarios + otrosActivosCorrientes;
      const activosFijosNeto = activosFijos - depreciacionAcumulada;
      const totalActivosNoCorrientes = activosFijosNeto + otrosActivosNoCorrientes;
      const totalActivos = totalActivosCorrientes + totalActivosNoCorrientes;

      const totalPasivosCorrientes = cuentasPorPagar + tributosPorPagar + remuneracionesPorPagar + otrosPasivosCorrientes;
      const totalPasivosNoCorrientes = deudasLargoPlazo + otrosPasivosNoCorrientes;
      const totalPasivos = totalPasivosCorrientes + totalPasivosNoCorrientes;

      const totalPatrimonio = capital + resultadosAcumulados + resultadoEjercicio;

      const balanceGeneral: BalanceGeneral = {
        activos: {
          corrientes: {
            efectivo,
            cuentas_por_cobrar: cuentasPorCobrar,
            inventarios,
            otros_activos: otrosActivosCorrientes,
            total_corrientes: totalActivosCorrientes,
          },
          no_corrientes: {
            activos_fijos: activosFijos,
            depreciacion_acumulada: depreciacionAcumulada,
            activos_fijos_neto: activosFijosNeto,
            otros_activos: otrosActivosNoCorrientes,
            total_no_corrientes: totalActivosNoCorrientes,
          },
          total_activos: totalActivos,
        },
        pasivos: {
          corrientes: {
            cuentas_por_pagar: cuentasPorPagar,
            tributos_por_pagar: tributosPorPagar,
            remuneraciones_por_pagar: remuneracionesPorPagar,
            otros_pasivos: otrosPasivosCorrientes,
            total_corrientes: totalPasivosCorrientes,
          },
          no_corrientes: {
            deudas_largo_plazo: deudasLargoPlazo,
            otros_pasivos: otrosPasivosNoCorrientes,
            total_no_corrientes: totalPasivosNoCorrientes,
          },
          total_pasivos: totalPasivos,
        },
        patrimonio: {
          capital,
          resultados_acumulados: resultadosAcumulados,
          resultado_ejercicio: resultadoEjercicio,
          total_patrimonio: totalPatrimonio,
        },
      };

      // Validar ecuación contable: Activos = Pasivos + Patrimonio
      const diferencia = totalActivos - (totalPasivos + totalPatrimonio);
      const ecuacionBalanceada = Math.abs(diferencia) < 0.01; // Tolerancia de 1 centavo
      
      console.log(`✅ Balance General calculado - Total Activos: ${totalActivos.toFixed(2)}, Total Pasivos: ${totalPasivos.toFixed(2)}, Total Patrimonio: ${totalPatrimonio.toFixed(2)}, Diferencia: ${diferencia.toFixed(2)}, Balanceado: ${ecuacionBalanceada ? 'Sí' : 'No'}`);

      if (!ecuacionBalanceada) {
        console.warn(`⚠️ ADVERTENCIA: La ecuación contable no está balanceada. Diferencia: ${diferencia.toFixed(2)}`);
        // Incluir advertencia en el resultado para que el UI pueda alertar al usuario
        (balanceGeneral as any).advertencia_balance = {
          desbalanceado: true,
          diferencia: Number(diferencia.toFixed(2)),
          mensaje: `La ecuación contable no está balanceada. Diferencia: ${diferencia.toFixed(2)}`,
        };
      }

      // Guardar en cache
      this.setCache(cacheKey, balanceGeneral);

      return balanceGeneral;
    } catch (error) {
      console.error('❌ Error generando balance general:', error);
      throw error;
    }
  }

  /**
   * Obtiene el Balance General formateado según estándares contables
   * @param tenantId ID del tenant
   * @param anio Año del período
   * @param mes Mes del período (1-12)
   * @param showCurrency Si se debe mostrar el símbolo de moneda
   * @returns Balance General con valores formateados
   */
  async getBalanceGeneralFormatted(
    tenantId: string,
    anio: number,
    mes: number,
    showCurrency: boolean = false
  ): Promise<FormattedBalanceGeneral> {
    const balance = await this.getBalanceGeneral(tenantId, anio, mes);
    return formatBalanceGeneral(balance, showCurrency);
  }
}
