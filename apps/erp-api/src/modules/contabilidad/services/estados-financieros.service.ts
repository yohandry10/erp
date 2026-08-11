import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import {
  formatBalanceComprobacionItem,
  formatBalanceGeneral,
  formatEstadoResultados,
  FormattedBalanceComprobacionItem,
  FormattedBalanceGeneral,
  FormattedEstadoResultados,
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

/**
 * Estados financieros operativos.
 *
 * Las materialized views históricas se conservan sólo para diagnósticos y
 * exportaciones explícitas. Las consultas de UI leen el libro confirmado en
 * cada request mediante las RPC live de 458, por lo que un asiento recién
 * confirmado nunca queda oculto por un refresh o un caché de proceso.
 */
@Injectable()
export class EstadosFinancierosService {
  constructor(private readonly supabase: SupabaseService) {}

  async refrescarEstadosFinancieros(
    tenantId: string,
    anio: number,
    mes: number,
  ): Promise<void> {
    const { error } = await this.supabase.getClient().rpc('refrescar_estados_financieros', {
      p_tenant_id: tenantId,
      p_anio: anio,
      p_mes: mes,
    });
    if (error) throw error;
  }

  async getBalanceComprobacion(
    tenantId: string,
    anio: number,
    mes: number,
  ): Promise<BalanceComprobacionItem[]> {
    const { data, error } = await this.supabase.getClient().rpc(
      'balance_comprobacion_live',
      { p_tenant_id: tenantId, p_anio: anio, p_mes: mes },
    );
    if (error) throw error;

    return (data || []).map((item: any) => ({
      cuenta: String(item.cuenta || ''),
      nombre: String(item.nombre || 'Cuenta sin nombre'),
      saldo_inicial: Number(item.saldo_inicial || 0),
      debe: Number(item.debe || 0),
      haber: Number(item.haber || 0),
      saldo_final: Number(item.saldo_final || 0),
    }));
  }

  async getBalanceComprobacionFormatted(
    tenantId: string,
    anio: number,
    mes: number,
    showCurrency = false,
  ): Promise<FormattedBalanceComprobacionItem[]> {
    const balance = await this.getBalanceComprobacion(tenantId, anio, mes);
    return balance.map((item) => formatBalanceComprobacionItem(item, showCurrency));
  }

  async getEstadoResultados(
    tenantId: string,
    anio: number,
    mes: number,
  ): Promise<EstadoResultados> {
    const { data: resultado, error } = await this.supabase.getClient().rpc(
      'estado_resultados_live',
      { p_tenant_id: tenantId, p_anio: anio, p_mes: mes },
    );
    if (error) throw error;

    const raw = resultado || {};
    const ventas = Number(raw.ventas || 0);
    const otrosIngresos = Number(raw.otros_ingresos || 0);
    const costoVentas = Number(raw.costo_ventas || 0);
    const gastosAdministrativos = Number(raw.gastos_administrativos || 0);
    const gastosVentas = Number(raw.gastos_ventas || 0);
    const gastosFinancieros = Number(raw.gastos_financieros || 0);

    return {
      ingresos: {
        ventas,
        otros_ingresos: otrosIngresos,
        total_ingresos: Number(raw.total_ingresos ?? ventas + otrosIngresos),
      },
      costos: {
        costo_ventas: costoVentas,
        utilidad_bruta: Number(raw.utilidad_bruta ?? ventas + otrosIngresos - costoVentas),
      },
      gastos: {
        gastos_administrativos: gastosAdministrativos,
        gastos_ventas: gastosVentas,
        gastos_financieros: gastosFinancieros,
        total_gastos: Number(
          raw.total_gastos ?? gastosAdministrativos + gastosVentas + gastosFinancieros,
        ),
      },
      utilidad_neta: Number(raw.utilidad_neta ?? 0),
    };
  }

  async getEstadoResultadosFormatted(
    tenantId: string,
    anio: number,
    mes: number,
    showCurrency = false,
  ): Promise<FormattedEstadoResultados> {
    return formatEstadoResultados(
      await this.getEstadoResultados(tenantId, anio, mes),
      showCurrency,
    );
  }

  async getBalanceGeneral(
    tenantId: string,
    anio: number,
    mes: number,
  ): Promise<BalanceGeneral> {
    const { data: raw, error } = await this.supabase.getClient().rpc(
      'balance_general_live',
      { p_tenant_id: tenantId, p_anio: anio, p_mes: mes },
    );
    if (error) throw error;

    const balance = raw || {};
    const efectivo = Number(balance.efectivo || 0);
    const cuentasPorCobrar = Number(balance.cuentas_por_cobrar || 0);
    const inventarios = Number(balance.inventarios || 0);
    const otrosActivosCorrientes = Number(balance.otros_activos_corrientes || 0);
    const activosFijos = Number(balance.activos_fijos || 0);
    const depreciacionAcumulada = Number(balance.depreciacion_acumulada || 0);
    const otrosActivosNoCorrientes = Number(balance.otros_activos_no_corrientes || 0);
    const cuentasPorPagar = Number(balance.cuentas_por_pagar || 0);
    const tributosPorPagar = Number(balance.tributos_por_pagar || 0);
    const remuneracionesPorPagar = Number(balance.remuneraciones_por_pagar || 0);
    const otrosPasivosCorrientes = Number(balance.otros_pasivos_corrientes || 0);
    const deudasLargoPlazo = Number(balance.deudas_largo_plazo || 0);
    const otrosPasivosNoCorrientes = Number(balance.otros_pasivos_no_corrientes || 0);
    const capital = Number(balance.capital || 0);
    const resultadosAcumulados = Number(balance.resultados_acumulados || 0);
    const resultadoEjercicio = Number(balance.resultado_ejercicio || 0);

    const totalActivosCorrientes =
      efectivo + cuentasPorCobrar + inventarios + otrosActivosCorrientes;
    const activosFijosNeto = activosFijos - depreciacionAcumulada;
    const totalActivosNoCorrientes = activosFijosNeto + otrosActivosNoCorrientes;
    const totalActivos = totalActivosCorrientes + totalActivosNoCorrientes;
    const totalPasivosCorrientes =
      cuentasPorPagar + tributosPorPagar + remuneracionesPorPagar + otrosPasivosCorrientes;
    const totalPasivosNoCorrientes = deudasLargoPlazo + otrosPasivosNoCorrientes;
    const totalPasivos = totalPasivosCorrientes + totalPasivosNoCorrientes;
    const totalPatrimonio = capital + resultadosAcumulados + resultadoEjercicio;

    const result: BalanceGeneral = {
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

    const diferencia = Number((totalActivos - totalPasivos - totalPatrimonio).toFixed(2));
    if (Math.abs(diferencia) >= 0.01) {
      (result as any).advertencia_balance = {
        desbalanceado: true,
        diferencia,
        mensaje: `La ecuación contable no está balanceada. Diferencia: ${diferencia.toFixed(2)}`,
      };
    }

    return result;
  }

  async getBalanceGeneralFormatted(
    tenantId: string,
    anio: number,
    mes: number,
    showCurrency = false,
  ): Promise<FormattedBalanceGeneral> {
    return formatBalanceGeneral(
      await this.getBalanceGeneral(tenantId, anio, mes),
      showCurrency,
    );
  }
}
