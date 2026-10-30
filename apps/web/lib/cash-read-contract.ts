function record(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Lectura de caja incompleta')
  return value
}

function text(value: any) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Identidad de caja incompleta')
  return value
}

function amount(value: any) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value))) throw new Error('Importe de caja incompleto')
  const result = Number(value)
  if (!Number.isFinite(result)) throw new Error('Importe de caja inválido')
  return result
}

function timestamp(value: any) {
  text(value)
  if (!Number.isFinite(Date.parse(value))) throw new Error('Fecha de caja inválida')
  return value
}

function rows(response: any) {
  record(response)
  if (response.success !== true || !Array.isArray(response.data) || response.offline || response.pending || response.fromCache) throw new Error('Fuente de caja incompleta')
  const ids = new Set<string>()
  return response.data.map((value: any) => {
    const row = record(value); const id = text(row.id)
    if (ids.has(id)) throw new Error('Identidad de caja duplicada')
    ids.add(id)
    return row
  })
}

export function readCashRegisters(response: any) {
  return rows(response).map((row: any) => {
    text(row.nombre); text(row.codigo)
    if (!['ACTIVO', 'INACTIVO'].includes(row.estado)) throw new Error('Estado de caja incompleto')
    return row
  })
}

export function readCashSessions(response: any) {
  return rows(response).map((row: any) => {
    if (!['ABIERTA', 'CERRADA', 'CONGELADA'].includes(row.estado)) throw new Error('Estado de sesión incompleto')
    timestamp(row.hora_apertura); text(row.caja_id); text(record(row.caja).nombre); text(row.caja.codigo)
    const user = record(row.usuario)
    text(user.nombres || user.nombre || user.email)
    const result = { ...row, monto_inicio: amount(row.monto_inicio) }
    for (const key of ['monto_cierre', 'diferencia']) {
      result[key] = row[key] == null ? undefined : amount(row[key])
    }
    if (row.hora_cierre != null) timestamp(row.hora_cierre)
    return result
  })
}

export function readCashMovements(response: any) {
  const sequences = new Set<number>()
  return rows(response).map((row: any) => {
    const sequence = amount(row.secuencia)
    if (!Number.isInteger(sequence) || sequence < 1 || sequences.has(sequence)) throw new Error('Secuencia de caja inválida')
    sequences.add(sequence); text(row.tipo_movimiento); timestamp(row.timestamp)
    return { ...row, secuencia: sequence, monto: amount(row.monto), saldo_anterior: amount(row.saldo_anterior), saldo_nuevo: amount(row.saldo_nuevo) }
  })
}

export function readCashCuts(response: any) {
  return rows(response).map((row: any) => {
    timestamp(row.fecha_corte)
    const result = { ...row }
    for (const key of ['total_ventas', 'total_impuestos', 'total_neto', 'total_documentos']) result[key] = amount(row[key])
    if (!Number.isInteger(result.total_documentos) || result.total_documentos < 0) throw new Error('Cantidad del corte inválida')
    return result
  })
}

export function confirmCashOpening(response: any, cajaId: string, initialAmount: number) {
  record(response); const data = record(response.data)
  if (response.success !== true || data.success === false || response.offline || response.pending || data.offline || data.pending || data.queued) throw new Error('La apertura requiere confirmación del servidor')
  text(data.id)
  if (data.caja_id !== cajaId || data.estado !== 'ABIERTA' || amount(data.monto_inicio) !== initialAmount) throw new Error('La apertura no coincide con la caja y el arqueo solicitado')
  return data
}
