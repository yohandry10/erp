type TaxKind = 'mensual' | 'anual'
type RecordValue = Record<string, unknown>

const record = (value: unknown): value is RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
const numbers = (value: RecordValue, fields: string[]) => fields.every((field) => finite(value[field]))
const regimes = ['NRUS', 'RER', 'MYPE', 'GENERAL']
const states = ['BORRADOR', 'PRESENTADA', 'RECTIFICADA', 'ANULADA']

export function validTaxDeclaration(value: unknown, kind: TaxKind, scope?: string | number): boolean {
  if (!record(value) || typeof value.id !== 'string' || !value.id ||
      !Number.isInteger(value.version) || Number(value.version) < 1 ||
      !regimes.includes(String(value.regimen)) || !states.includes(String(value.estado))) return false
  const rowScope = kind === 'mensual' ? value.periodo : value.ejercicio
  if (scope !== undefined && rowScope !== scope) return false
  return kind === 'mensual'
    ? typeof rowScope === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(rowScope) &&
      numbers(value, ['pago_cuenta_renta', 'igv_resultante', 'saldo_favor_siguiente'])
    : Number.isInteger(rowScope) && numbers(value, ['ingresos_netos', 'renta_por_pagar',
        'adiciones_tributarias', 'deducciones_tributarias', 'perdidas_compensables',
        'pagos_cuenta_renta', 'credito_itan_renta', 'otros_creditos_renta', 'deducciones_itan'])
}

export function validTaxHistory(value: unknown, kind: TaxKind): boolean {
  return Array.isArray(value) && value.every((row) => validTaxDeclaration(row, kind))
}

export function validTaxCalculation(value: unknown, kind: TaxKind, scope: string | number): boolean {
  if (!record(value) || !regimes.includes(String(value.regimen)) ||
      typeof value.formulario !== 'string' || !value.formulario ||
      !Array.isArray(value.warnings) || !value.warnings.every((warning) =>
        record(warning) && typeof warning.codigo === 'string' && typeof warning.mensaje === 'string' &&
        (warning.bloquea_presentacion === undefined || typeof warning.bloquea_presentacion === 'boolean')) ||
      !record(value.source_snapshot) || typeof value.source_snapshot.corte !== 'string' ||
      !Number.isFinite(Date.parse(value.source_snapshot.corte)) ||
      !Number.isInteger(value.source_snapshot.cantidad_ventas) ||
      Number(value.source_snapshot.cantidad_ventas) < 0) return false
  if (value.declaracion_vigente != null && !validTaxDeclaration(value.declaracion_vigente, kind, scope)) return false
  if (kind === 'mensual') {
    return value.periodo === scope && Number.isInteger(value.source_snapshot.cantidad_compras) &&
      Number(value.source_snapshot.cantidad_compras) >= 0 &&
      numbers(value, ['ventas_gravadas', 'ventas_exoneradas', 'ventas_inafectas', 'exportaciones',
        'igv_ventas', 'compras_gravadas', 'igv_compras', 'saldo_favor_anterior', 'retenciones_igv',
        'percepciones_igv', 'otros_creditos_igv', 'igv_resultante', 'saldo_favor_siguiente',
        'ingresos_netos_mes', 'ingresos_netos_acumulados', 'otros_ingresos_renta_mes',
        'otros_ingresos_renta_acumulados', 'pago_cuenta_renta']) &&
      ['coeficiente_renta', 'nrus_categoria', 'nrus_cuota'].every((field) => value[field] === null || finite(value[field]))
  }
  return value.ejercicio === scope && typeof value.source_snapshot.ejercicio_cerrado === 'boolean' &&
    numbers(value, ['uit', 'ingresos_netos', 'otros_ingresos_revisados', 'resultado_contable',
      'adiciones_tributarias', 'deducciones_tributarias', 'perdidas_compensables', 'renta_neta_imponible',
      'impuesto_renta_calculado', 'pagos_cuenta_renta', 'credito_itan_renta', 'otros_creditos_renta',
      'renta_por_pagar', 'saldo_favor_renta', 'activos_netos', 'deducciones_itan', 'base_imponible_itan', 'itan_calculado'])
}
