export type CpeDocument = {
  id: string; tipoDocumento?: string; tipoComprobante: string; serie: string; numero: number
  fechaEmision: string; cliente: string; clienteRuc: string; total: number; moneda: string
  estado: 'BORRADOR' | 'FIRMADO' | 'ENVIADO' | 'ACEPTADO' | 'ERROR' | 'RECHAZADO' | 'ANULADO' | 'MIGRADO'
  estadoSunat?: string; isDemoRepresentation?: boolean; isHistoricalImport?: boolean; observaciones?: string; fechaCreacion: string
  cxcId?: string | null; numeroDocumentoCxc?: string | null; saldoPorCobrar?: number | null; requiereVincularCobro?: boolean
}
export type CpeStats = { cpeEmitidosHoy: number; cpeDelMes: number; montoFacturado: number; rechazados: number }
export type Cobro = {
  id: string; monto: number; moneda: string; fecha_pago?: string; metodo_pago?: string; referencia?: string
  cuenta_bancaria_id?: string; estado?: string; activo?: boolean
  reversa?: { id: string; medio: string; motivo?: string; created_at?: string } | null
}
type Ajuste = { id: string; tipo: string; monto: number; moneda: string; referencia?: string; estado?: string; activo?: boolean; operacion_fiscal?: { id: string; tipo: string; estado: string } | null }
export type EstadoAnulacion = {
  cpe: { id: string; serie?: string; numero: number; moneda: string; estado: string; tipo_documento?: string }
  nota_credito: { id: string; serie?: string; numero: number; estado: string; estado_sunat?: string; cdr_sunat?: string } | null
  cxc: { id: string; numero_documento?: string; estado: string; monto_pendiente?: number; saldo_pendiente?: number; saldo?: number } | null
  cobros: Cobro[]; ajustes_financieros: Ajuste[]; ajustes_activos: Ajuste[]
  sesiones_caja: { id: string; moneda: string; cajas?: { codigo?: string; nombre?: string } }[]
  nota_aceptada: boolean; cobros_activos: number
  estado_flujo: 'ANULADO' | 'REQUIERE_NOTA_CREDITO' | 'PENDIENTE_CDR' | 'REQUIERE_REEMBOLSOS' | 'BLOQUEADO_AJUSTE_REQUIERE_REVERSA' | 'LISTO_PARA_FINALIZAR'
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const states = ['BORRADOR','FIRMADO','ENVIADO','ACEPTADO','ERROR','RECHAZADO','ANULADO']
const flows = ['ANULADO','REQUIERE_NOTA_CREDITO','PENDIENTE_CDR','REQUIERE_REEMBOLSOS','BLOQUEADO_AJUSTE_REQUIERE_REVERSA','LISTO_PARA_FINALIZAR']
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const money = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0
const number = (value: unknown) => (typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0
const date = (value: unknown) => text(value) && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value))
const currency = (value: unknown) => typeof value === 'string' && /^[A-Z]{3}$/.test(value)
function data(response: any) {
  if (response?.success !== true || response.offline || response.pending || response.data?.offline || response.data?.pending || !('data' in response)) throw new Error('La respuesta de CPE está incompleta.')
  return response.data
}
export function cpeList(response: any, page: number, pageSize: number): { documents: CpeDocument[]; total: number } {
  const rows = data(response); const meta = response.meta
  if (!Array.isArray(rows) || !count(meta?.total) || meta.page !== page || meta.pageSize !== pageSize
    || rows.length !== Math.min(pageSize, Math.max(0, meta.total - (page - 1) * pageSize))
    || new Set(rows.map(row => row?.id)).size !== rows.length
    || rows.some(row => !uuid.test(row?.id || '') || !text(row.tipoComprobante) || typeof row.serie !== 'string' || !number(row.numero)
      || !date(row.fechaEmision) || !date(row.fechaCreacion) || !text(row.cliente) || typeof row.clienteRuc !== 'string'
      || !money(row.total) || !currency(row.moneda) || !(states.includes(row.estado) || row.estado === 'MIGRADO')
      || typeof row.isDemoRepresentation !== 'boolean' || typeof row.requiereVincularCobro !== 'boolean'
      || row.isHistoricalImport !== undefined && typeof row.isHistoricalImport !== 'boolean'
      || (row.estado === 'MIGRADO'
        ? row.isHistoricalImport !== true || row.estadoSunat !== 'NO_VERIFICADO' || row.isDemoRepresentation || row.requiereVincularCobro
        : row.isHistoricalImport === true)
      || !(row.cxcId === null || uuid.test(row.cxcId || '') && text(row.numeroDocumentoCxc) && money(row.saldoPorCobrar)))) throw new Error('El listado de CPE está incompleto.')
  return { documents: rows, total: meta.total }
}
export function cpeStats(response: any): CpeStats {
  const value = data(response)
  if (!value || !['cpeEmitidosHoy','cpeDelMes','rechazados'].every(key => count(value[key])) || !money(value.montoFacturado)) throw new Error('Los indicadores de CPE están incompletos.')
  return value
}
export function cpeA4Metadata(response: any, id: string, serie?: string, numero?: string | number): any {
  const value = response && 'data' in response ? data(response) : response
  const amount = (number: unknown) => (typeof number === 'number' || typeof number === 'string' && number.trim().length > 0) && money(Number(number))
  const completeLine = (row: any) => {
    if (!row || !text(row.descripcion) || !text(row.unidad_medida || row.unidad) || !amount(row.cantidad) || Number(row.cantidad) <= 0) return false
    if (['precio_unitario','precio_venta','valor_venta','igv','impuesto_igv','total_item','total','subtotal'].some(key => row[key] != null && !amount(row[key]))) return false
    // Las notas anteriores guardan total de línea; pedidos guardan base e IGV.
    // Ambos permiten representar importe y precio sin asumir un cero ausente.
    return amount(row.total_item ?? row.total)
      || amount(row.valor_venta) && amount(row.igv ?? row.impuesto_igv)
      || amount(row.precio_unitario)
  }
  if (!value || value.offline || value.pending || value.id !== id || !uuid.test(id) || typeof value.serie !== 'string' || !number(value.numero)
    || serie && value.serie !== serie || numero != null && numero !== '' && Number(value.numero) !== Number(numero)
    || !text(value.tipo_documento) || !date(value.fecha_emision) || !currency(value.moneda) || !states.includes(value.estado)
    || !['PE','CO','AR'].includes(value.pais_codigo) || typeof value.simulated !== 'boolean'
    || !['ACCEPTED','PENDING','SIMULATED','LEGACY_UNVERIFIED','TECHNICAL_ERROR','REJECTED','NOT_FOUND'].includes(value.fiscal_acceptance_status)
    || !text(value.emisor?.ruc) || !text(value.emisor?.razon_social) || !text(value.emisor?.direccion_fiscal)
    || !text(value.razon_social_receptor) || typeof value.documento_receptor !== 'string'
    || !['total_gravadas','total_exoneradas','total_inafectas','total_igv','total_isc','total_venta'].every(key => amount(value[key]))
    || !Array.isArray(value.items) || !value.items.length
    || value.items.some((row: any) => !completeLine(row))) throw new Error('Los datos del comprobante A4 están incompletos o no corresponden al documento.')
  return value
}
export function cpeFinancial(response: any, id: string): EstadoAnulacion {
  const value = response
  const arrays = ['cobros','ajustes_financieros','ajustes_activos','sesiones_caja']
  if (!value || value.offline || value.pending || value.cpe?.id !== id || !uuid.test(id) || !number(value.cpe.numero)
    || !currency(value.cpe.moneda) || !states.includes(value.cpe.estado) || !flows.includes(value.estado_flujo)
    || typeof value.nota_aceptada !== 'boolean' || !count(value.cobros_activos)
    || !arrays.every(key => Array.isArray(value[key]) && new Set(value[key].map((row: any) => row?.id)).size === value[key].length)
    || !(value.nota_credito === null || uuid.test(value.nota_credito?.id || '') && number(value.nota_credito.numero) && states.includes(value.nota_credito.estado))
    || !(value.cxc === null || uuid.test(value.cxc?.id || '') && text(value.cxc.estado))
    || value.cobros.some((row: any) => !uuid.test(row?.id || '') || !money(row.monto) || !currency(row.moneda) || typeof row.activo !== 'boolean' || !text(row.estado)
      || !(row.reversa === null || uuid.test(row.reversa?.id || '') && text(row.reversa.medio)))
    || value.ajustes_financieros.some((row: any) => !uuid.test(row?.id || '') || !money(row.monto) || !currency(row.moneda) || !text(row.tipo) || typeof row.activo !== 'boolean' || !text(row.estado))
    || value.sesiones_caja.some((row: any) => !uuid.test(row?.id || '') || !currency(row.moneda))) throw new Error('El estado financiero está incompleto.')
  const active = value.cobros.filter((row: Cobro) => row.activo !== false && row.estado === 'ACTIVO' && !row.reversa)
  const adjustments = value.ajustes_financieros.filter((row: Ajuste) => row.activo !== false && !['ANULADO','REVERTIDO','INACTIVO'].includes(row.estado || ''))
  const accepted = Boolean(value.nota_credito?.estado === 'ACEPTADO' && text(value.nota_credito.cdr_sunat))
  const flow = value.cpe.estado === 'ANULADO' ? 'ANULADO' : !value.nota_credito ? 'REQUIERE_NOTA_CREDITO' : !accepted ? 'PENDIENTE_CDR' : adjustments.length ? 'BLOQUEADO_AJUSTE_REQUIERE_REVERSA' : active.length ? 'REQUIERE_REEMBOLSOS' : 'LISTO_PARA_FINALIZAR'
  if (value.cobros_activos !== active.length || value.nota_aceptada !== accepted || value.estado_flujo !== flow
    || JSON.stringify(value.ajustes_activos) !== JSON.stringify(adjustments)) throw new Error('El estado financiero no es consistente.')
  return value
}
const csvHeader = ['tipoComprobante','serie','numero','fechaEmision','cliente','clienteRuc','moneda','total','estado','estadoSunat']
export function parseCpeCsv(csv: string, expectedTotal: number): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]
    if (c === '"') { if (quoted && csv[i+1] === '"') { cell += '"'; i++ } else quoted = !quoted }
    else if (!quoted && (c === ',' || c === '\n')) { row.push(cell); cell = ''; if (c === '\n') { rows.push(row); row = [] } }
    else if (c !== '\r' || quoted) cell += c
  }
  if (quoted) throw new Error('El CSV de CPE está incompleto.')
  if (cell || row.length) { row.push(cell); rows.push(row) }
  if (JSON.stringify(rows[0]) !== JSON.stringify(csvHeader) || rows.length !== expectedTotal + 1 || rows.some(r => r.length !== csvHeader.length)
    || rows.slice(1).some(r => !text(r[0]) || !number(r[2]) || !date(r[3]) || !text(r[4]) || !currency(r[6]) || !r[7].trim() || !money(Number(r[7])) || !([...states,'MUESTRA_LOCAL'].includes(r[8]) || r[8] === 'MIGRADO' && r[9] === 'NO_VERIFICADO'))) throw new Error('El CSV de CPE no contiene el reporte completo. Consulte nuevamente el listado.')
  return rows
}
