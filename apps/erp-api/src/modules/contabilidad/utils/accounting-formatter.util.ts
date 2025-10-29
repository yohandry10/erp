/**
 * Utilidades para formatear valores según estándares contables
 */

export interface FormattedBalanceComprobacionItem {
  cuenta: string;
  nombre: string;
  saldo_inicial: string;
  debe: string;
  haber: string;
  saldo_final: string;
}

export interface FormattedEstadoResultados {
  ingresos: {
    ventas: string;
    otros_ingresos: string;
    total_ingresos: string;
  };
  costos: {
    costo_ventas: string;
    utilidad_bruta: string;
  };
  gastos: {
    gastos_administrativos: string;
    gastos_ventas: string;
    gastos_financieros: string;
    total_gastos: string;
  };
  utilidad_neta: string;
}

export interface FormattedBalanceGeneral {
  activos: {
    corrientes: {
      efectivo: string;
      cuentas_por_cobrar: string;
      inventarios: string;
      otros_activos: string;
      total_corrientes: string;
    };
    no_corrientes: {
      activos_fijos: string;
      depreciacion_acumulada: string;
      activos_fijos_neto: string;
      otros_activos: string;
      total_no_corrientes: string;
    };
    total_activos: string;
  };
  pasivos: {
    corrientes: {
      cuentas_por_pagar: string;
      tributos_por_pagar: string;
      remuneraciones_por_pagar: string;
      otros_pasivos: string;
      total_corrientes: string;
    };
    no_corrientes: {
      deudas_largo_plazo: string;
      otros_pasivos: string;
      total_no_corrientes: string;
    };
    total_pasivos: string;
  };
  patrimonio: {
    capital: string;
    resultados_acumulados: string;
    resultado_ejercicio: string;
    total_patrimonio: string;
  };
}

/**
 * Formatea un número según estándares contables
 * - 2 decimales
 * - Separador de miles con coma
 * - Valores negativos entre paréntesis
 * - Símbolo de moneda opcional
 * 
 * @param value Valor numérico a formatear
 * @param currency Símbolo de moneda (opcional, por defecto 'S/')
 * @param showCurrency Si se debe mostrar el símbolo de moneda
 * @returns Valor formateado como string
 */
export function formatCurrency(
  value: number,
  currency: string = 'S/',
  showCurrency: boolean = false
): string {
  const isNegative = value < 0;
  const absoluteValue = Math.abs(value);
  
  // Formatear con 2 decimales y separador de miles
  const formatted = absoluteValue.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Construir el resultado
  let result = formatted;
  
  if (showCurrency) {
    result = `${currency} ${result}`;
  }

  // Valores negativos entre paréntesis según estándar contable
  if (isNegative) {
    result = `(${result})`;
  }

  return result;
}

/**
 * Formatea un porcentaje según estándares contables
 * @param value Valor decimal (ej: 0.15 para 15%)
 * @param decimals Número de decimales (por defecto 2)
 * @returns Valor formateado como string con símbolo %
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  const percentage = value * 100;
  return `${percentage.toFixed(decimals)}%`;
}

/**
 * Formatea un item del balance de comprobación
 */
export function formatBalanceComprobacionItem(
  item: any,
  showCurrency: boolean = false
): FormattedBalanceComprobacionItem {
  return {
    cuenta: item.cuenta,
    nombre: item.nombre,
    saldo_inicial: formatCurrency(item.saldo_inicial, 'S/', showCurrency),
    debe: formatCurrency(item.debe, 'S/', showCurrency),
    haber: formatCurrency(item.haber, 'S/', showCurrency),
    saldo_final: formatCurrency(item.saldo_final, 'S/', showCurrency),
  };
}

/**
 * Formatea el estado de resultados completo
 */
export function formatEstadoResultados(
  estado: any,
  showCurrency: boolean = false
): FormattedEstadoResultados {
  return {
    ingresos: {
      ventas: formatCurrency(estado.ingresos.ventas, 'S/', showCurrency),
      otros_ingresos: formatCurrency(estado.ingresos.otros_ingresos, 'S/', showCurrency),
      total_ingresos: formatCurrency(estado.ingresos.total_ingresos, 'S/', showCurrency),
    },
    costos: {
      costo_ventas: formatCurrency(estado.costos.costo_ventas, 'S/', showCurrency),
      utilidad_bruta: formatCurrency(estado.costos.utilidad_bruta, 'S/', showCurrency),
    },
    gastos: {
      gastos_administrativos: formatCurrency(estado.gastos.gastos_administrativos, 'S/', showCurrency),
      gastos_ventas: formatCurrency(estado.gastos.gastos_ventas, 'S/', showCurrency),
      gastos_financieros: formatCurrency(estado.gastos.gastos_financieros, 'S/', showCurrency),
      total_gastos: formatCurrency(estado.gastos.total_gastos, 'S/', showCurrency),
    },
    utilidad_neta: formatCurrency(estado.utilidad_neta, 'S/', showCurrency),
  };
}

/**
 * Formatea el balance general completo
 */
export function formatBalanceGeneral(
  balance: any,
  showCurrency: boolean = false
): FormattedBalanceGeneral {
  return {
    activos: {
      corrientes: {
        efectivo: formatCurrency(balance.activos.corrientes.efectivo, 'S/', showCurrency),
        cuentas_por_cobrar: formatCurrency(balance.activos.corrientes.cuentas_por_cobrar, 'S/', showCurrency),
        inventarios: formatCurrency(balance.activos.corrientes.inventarios, 'S/', showCurrency),
        otros_activos: formatCurrency(balance.activos.corrientes.otros_activos, 'S/', showCurrency),
        total_corrientes: formatCurrency(balance.activos.corrientes.total_corrientes, 'S/', showCurrency),
      },
      no_corrientes: {
        activos_fijos: formatCurrency(balance.activos.no_corrientes.activos_fijos, 'S/', showCurrency),
        depreciacion_acumulada: formatCurrency(balance.activos.no_corrientes.depreciacion_acumulada, 'S/', showCurrency),
        activos_fijos_neto: formatCurrency(balance.activos.no_corrientes.activos_fijos_neto, 'S/', showCurrency),
        otros_activos: formatCurrency(balance.activos.no_corrientes.otros_activos, 'S/', showCurrency),
        total_no_corrientes: formatCurrency(balance.activos.no_corrientes.total_no_corrientes, 'S/', showCurrency),
      },
      total_activos: formatCurrency(balance.activos.total_activos, 'S/', showCurrency),
    },
    pasivos: {
      corrientes: {
        cuentas_por_pagar: formatCurrency(balance.pasivos.corrientes.cuentas_por_pagar, 'S/', showCurrency),
        tributos_por_pagar: formatCurrency(balance.pasivos.corrientes.tributos_por_pagar, 'S/', showCurrency),
        remuneraciones_por_pagar: formatCurrency(balance.pasivos.corrientes.remuneraciones_por_pagar, 'S/', showCurrency),
        otros_pasivos: formatCurrency(balance.pasivos.corrientes.otros_pasivos, 'S/', showCurrency),
        total_corrientes: formatCurrency(balance.pasivos.corrientes.total_corrientes, 'S/', showCurrency),
      },
      no_corrientes: {
        deudas_largo_plazo: formatCurrency(balance.pasivos.no_corrientes.deudas_largo_plazo, 'S/', showCurrency),
        otros_pasivos: formatCurrency(balance.pasivos.no_corrientes.otros_pasivos, 'S/', showCurrency),
        total_no_corrientes: formatCurrency(balance.pasivos.no_corrientes.total_no_corrientes, 'S/', showCurrency),
      },
      total_pasivos: formatCurrency(balance.pasivos.total_pasivos, 'S/', showCurrency),
    },
    patrimonio: {
      capital: formatCurrency(balance.patrimonio.capital, 'S/', showCurrency),
      resultados_acumulados: formatCurrency(balance.patrimonio.resultados_acumulados, 'S/', showCurrency),
      resultado_ejercicio: formatCurrency(balance.patrimonio.resultado_ejercicio, 'S/', showCurrency),
      total_patrimonio: formatCurrency(balance.patrimonio.total_patrimonio, 'S/', showCurrency),
    },
  };
}
