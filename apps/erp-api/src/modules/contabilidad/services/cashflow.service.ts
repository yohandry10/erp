import { Injectable, BadRequestException } from '@nestjs/common';
import { EstadosFinancierosService, BalanceComprobacionItem, EstadoResultados } from './estados-financieros.service';

export interface CashFlowSection {
  operativo: number;
  inversion: number;
  financiamiento: number;
  neto: number;
  detalle: {
    utilidadNeta: number;
    /** Depreciacion, amortizacion y deterioro del mes (PCGE 68). */
    gastosNoDesembolsables: number;
    variacionCxc: number;
    variacionInventario: number;
    variacionCxp: number;
    variacionInversiones: number;
    variacionFinanciamiento: number;
    /** Variacion real de caja y bancos (PCGE 10) en el mes. */
    variacionCaja: number;
    /**
     * `neto` menos la variacion real de caja. Un flujo de efectivo correcto
     * cierra en cero; cualquier otro numero dice que falta un concepto por
     * clasificar. Se expone en vez de callarse porque antes el estado no
     * cuadraba con la caja y nadie podia notarlo.
     */
    descuadre: number;
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
    const balancePrevio = await this.getBalance(tenantId, anioPrev, mesPrev);
    const estadoResultados = await this.estadosFinancieros.getEstadoResultados(tenantId, anio, mes);

    const netIncome = estadoResultados.utilidad_neta || 0;

    const cxc = this.sumByPrefix(balanceActual, ['12']);
    const inv = this.sumByPrefix(balanceActual, ['20']);
    const cxp = this.sumCreditBalanceByPrefix(balanceActual, ['42']);

    const cxcPrev = this.sumByPrefix(balancePrevio, ['12']);
    const invPrev = this.sumByPrefix(balancePrevio, ['20']);
    const cxpPrev = this.sumCreditBalanceByPrefix(balancePrevio, ['42']);

    const deltaCxc = cxc - cxcPrev;
    const deltaInv = inv - invPrev;
    const deltaCxp = cxp - cxpPrev;

    // Inversión: variación de activos fijos/intangibles
    const invActivos = this.sumByPrefix(balanceActual, ['33', '34', '35']);
    const invActivosPrev = this.sumByPrefix(balancePrevio, ['33', '34', '35']);
    const deltaInversiones = invActivos - invActivosPrev;

    // Financiamiento: variación de obligaciones/patrimonio (45-48, 50)
    const financ = this.sumCreditBalanceByPrefix(balanceActual, ['45', '46', '47', '48', '50']);
    const financPrev = this.sumCreditBalanceByPrefix(balancePrevio, ['45', '46', '47', '48', '50']);
    const deltaFinanc = financ - financPrev;

    // Metodo indirecto: la utilidad se corrige con lo que no movio caja.
    //
    // La cuenta 68 del PCGE --valuacion y deterioro de activos y provisiones--
    // recoge depreciacion, amortizacion y deterioro, que son gasto sin salida de
    // dinero. Sin devolverlos, el flujo operativo salia subestimado exactamente
    // en la depreciacion del mes, y como la depreciacion no toca la 33 sino la
    // 39, tampoco aparecia en inversion: simplemente se perdia.
    const noDesembolsables = this.sumMovimientoDebe(balanceActual, ['68']);

    const operativo = netIncome + noDesembolsables - deltaCxc - deltaInv + deltaCxp;
    const inversion = -deltaInversiones;
    const financiamiento = deltaFinanc;
    const neto = operativo + inversion + financiamiento;

    // La prueba acida del estado: lo que dice que se movio tiene que ser lo que
    // de verdad se movio en caja y bancos.
    const caja = this.sumByPrefix(balanceActual, ['10']);
    const cajaPrev = this.sumByPrefix(balancePrevio, ['10']);
    const variacionCaja = caja - cajaPrev;
    const descuadre = neto - variacionCaja;

    return {
      operativo: this.roundCurrency(operativo),
      inversion: this.roundCurrency(inversion),
      financiamiento: this.roundCurrency(financiamiento),
      neto: this.roundCurrency(neto),
      detalle: {
        utilidadNeta: this.roundCurrency(netIncome),
        gastosNoDesembolsables: this.roundCurrency(noDesembolsables),
        variacionCxc: this.roundCurrency(deltaCxc),
        variacionInventario: this.roundCurrency(deltaInv),
        variacionCxp: this.roundCurrency(deltaCxp),
        variacionInversiones: this.roundCurrency(deltaInversiones),
        variacionFinanciamiento: this.roundCurrency(deltaFinanc),
        variacionCaja: this.roundCurrency(variacionCaja),
        descuadre: this.roundCurrency(descuadre),
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
    const pasivosCorrientes = this.sumCreditBalanceByPrefix(balance, ['40', '41', '42', '43']);
    const inventarios = this.sumByPrefix(balance, ['20']);
    const cxc = this.sumByPrefix(balance, ['12']);
    const cxp = this.sumCreditBalanceByPrefix(balance, ['42']);

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
  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

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

  /**
   * Movimiento deudor del mes. `debe` que devuelve `balance_comprobacion_live`
   * es el del periodo, no el acumulado, que es justo lo que hace falta para el
   * gasto no desembolsable del mes.
   */
  private sumMovimientoDebe(balance: BalanceComprobacionItem[], prefixes: string[]): number {
    return balance
      .filter((item) => prefixes.some((pref) => item.cuenta.startsWith(pref)))
      .reduce((sum, item) => sum + (item.debe || 0), 0);
  }

  private sumCreditBalanceByPrefix(balance: BalanceComprobacionItem[], prefixes: string[]): number {
    // La MV expresa saldo como debe - haber. Pasivos y patrimonio, de
    // naturaleza acreedora, deben normalizarse a magnitud positiva para ratios
    // y variaciones de financiamiento.
    return -this.sumByPrefix(balance, prefixes);
  }

  private async getBalance(
    tenantId: string,
    anio: number,
    mes: number,
    _allowEmpty: boolean = false
  ): Promise<BalanceComprobacionItem[]> {
    return this.estadosFinancieros.getBalanceComprobacion(tenantId, anio, mes);
  }
}
