import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EstadosFinancierosService, BalanceComprobacionItem, EstadoResultados } from './estados-financieros.service';

export interface CashFlowSection {
  operativo: number;
  inversion: number;
  financiamiento: number;
  neto: number;
  detalle: {
    utilidadNeta: number;
    variacionCxc: number;
    variacionInventario: number;
    variacionCxp: number;
    variacionInversiones: number;
    variacionFinanciamiento: number;
  };
}

export interface RatiosResponse {
  liquidez: number;
  pruebaAcida: number;
  ebitdaMargin: number;
  dso: number;
  dpo: number;
  dio: number;
  rotacionInventario: number;
}

@Injectable()
export class CashflowService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly estadosFinancieros: EstadosFinancierosService,
  ) { }

  /**
   * Obtiene el flujo de caja indirecto y variaciones clave de capital de trabajo.
   */
  async getCashFlow(
    tenantId: string,
    anio: number,
    mes: number
  ): Promise<CashFlowSection> {
    this.validatePeriodo(anio, mes);

    const balanceActual = await this.getBalance(tenantId, anio, mes);
    const { anio: anioPrev, mes: mesPrev } = this.getPeriodoAnterior(anio, mes);
    const balancePrevio = await this.getBalance(tenantId, anioPrev, mesPrev, true);
    const estadoResultados = await this.estadosFinancieros.getEstadoResultados(tenantId, anio, mes);

    const netIncome = estadoResultados.utilidad_neta || 0;

    const cxc = this.sumByPrefix(balanceActual, ['12']);
    const inv = this.sumByPrefix(balanceActual, ['20']);
    const cxp = this.sumByPrefix(balanceActual, ['42']);

    const cxcPrev = this.sumByPrefix(balancePrevio, ['12']);
    const invPrev = this.sumByPrefix(balancePrevio, ['20']);
    const cxpPrev = this.sumByPrefix(balancePrevio, ['42']);

    const deltaCxc = cxc - cxcPrev;
    const deltaInv = inv - invPrev;
    const deltaCxp = cxp - cxpPrev;

    // Inversión: variación de activos fijos/intangibles
    const invActivos = this.sumByPrefix(balanceActual, ['33', '34', '35']);
    const invActivosPrev = this.sumByPrefix(balancePrevio, ['33', '34', '35']);
    const deltaInversiones = invActivos - invActivosPrev;

    // Financiamiento: variación de obligaciones/patrimonio (45-48, 50)
    const financ = this.sumByPrefix(balanceActual, ['45', '46', '47', '48', '50']);
    const financPrev = this.sumByPrefix(balancePrevio, ['45', '46', '47', '48', '50']);
    const deltaFinanc = financ - financPrev;

    const operativo = netIncome - deltaCxc - deltaInv + deltaCxp;
    const inversion = -deltaInversiones;
    const financiamiento = deltaFinanc;
    const neto = operativo + inversion + financiamiento;

    return {
      operativo,
      inversion,
      financiamiento,
      neto,
      detalle: {
        utilidadNeta: netIncome,
        variacionCxc: deltaCxc,
        variacionInventario: deltaInv,
        variacionCxp: deltaCxp,
        variacionInversiones: deltaInversiones,
        variacionFinanciamiento: deltaFinanc,
      },
    };
  }

  /**
   * Calcula ratios financieros básicos (Perú/Colombia).
   */
  async getRatios(
    tenantId: string,
    anio: number,
    mes: number
  ): Promise<RatiosResponse> {
    this.validatePeriodo(anio, mes);

    const balance = await this.getBalance(tenantId, anio, mes);
    const er: EstadoResultados = await this.estadosFinancieros.getEstadoResultados(tenantId, anio, mes);

    const activosCorrientes = this.sumByPrefix(balance, ['10', '11', '12', '13', '14', '20']);
    const pasivosCorrientes = this.sumByPrefix(balance, ['40', '41', '42', '43']);
    const inventarios = this.sumByPrefix(balance, ['20']);
    const cxc = this.sumByPrefix(balance, ['12']);
    const cxp = this.sumByPrefix(balance, ['42']);

    const ventasNetas = er?.ingresos?.total_ingresos ?? 0;
    const costoVentas = er?.costos?.costo_ventas ?? 0;
    const gastosTotales = er?.gastos?.total_gastos ?? 0;

    // Aproximación de EBITDA sin depreciación explícita
    const ebitda = (ventasNetas - costoVentas - gastosTotales);

    const liquidez = pasivosCorrientes > 0 ? activosCorrientes / pasivosCorrientes : 0;
    const pruebaAcida = pasivosCorrientes > 0 ? (activosCorrientes - inventarios) / pasivosCorrientes : 0;
    const ebitdaMargin = ventasNetas > 0 ? ebitda / ventasNetas : 0;
    const dso = ventasNetas > 0 ? (cxc / ventasNetas) * 30 : 0;
    const dpo = costoVentas > 0 ? (cxp / costoVentas) * 30 : 0;
    const dio = costoVentas > 0 ? (inventarios / costoVentas) * 30 : 0;
    const rotacionInventario = costoVentas > 0 ? costoVentas / Math.max(inventarios, 1e-6) : 0;

    return {
      liquidez,
      pruebaAcida,
      ebitdaMargin,
      dso,
      dpo,
      dio,
      rotacionInventario,
    };
  }

  // Helpers
  private validatePeriodo(anio: number, mes: number) {
    if (!anio || !mes || mes < 1 || mes > 12) {
      throw new BadRequestException('Periodo inválido. Envíe anio y mes (1-12).');
    }
  }

  private getPeriodoAnterior(anio: number, mes: number): { anio: number; mes: number } {
    if (mes === 1) {
      return { anio: anio - 1, mes: 12 };
    }
    return { anio, mes: mes - 1 };
  }

  private sumByPrefix(balance: BalanceComprobacionItem[], prefixes: string[]): number {
    const set = new Set(prefixes);
    return balance
      .filter((item) => Array.from(set).some((pref) => item.cuenta.startsWith(pref)))
      .reduce((sum, item) => sum + (item.saldo_final || 0), 0);
  }

  private async getBalance(
    tenantId: string,
    anio: number,
    mes: number,
    allowEmpty: boolean = false
  ): Promise<BalanceComprobacionItem[]> {
    const { data, error } = await this.supabase
      .getClient({ silent: true })
      .from('mv_balance_comprobacion')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('anio', anio)
      .eq('mes', mes)
      .order('cuenta', { ascending: true });

    if (error) {
      if (allowEmpty) return [];
      throw new Error(`Error consultando balance de comprobación: ${error.message}`);
    }

    if ((!data || data.length === 0) && !allowEmpty) {
      throw new BadRequestException(`No hay balance de comprobación para ${anio}-${mes}`);
    }

    return (data || []).map((item: any) => ({
      cuenta: item.cuenta,
      nombre: item.nombre_cuenta,
      saldo_inicial: parseFloat(item.saldo_inicial || 0),
      debe: parseFloat(item.debe || 0),
      haber: parseFloat(item.haber || 0),
      saldo_final: parseFloat(item.saldo_final || 0),
    }));
  }
}
