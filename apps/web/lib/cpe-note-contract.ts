const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const finite = (value: unknown) => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value))
const pending = (value: any) => !value || value.success === false || value.offline || value.pending || value.queued

export function referencedNoteOrigins(response: any): any[] {
  const values = Array.isArray(response) ? response : response?.data
  const ids = new Set<string>()
  if (pending(response) || !Array.isArray(values)) throw new Error('No se pudieron consultar los orígenes fiscales completos.')
  return values.map((value: any) => {
    if (!value || !uuid.test(value.id || '') || ids.has(value.id) || !['FACTURA','BOLETA','01','03'].includes(value.tipo_documento)
      || typeof value.serie !== 'string' || typeof value.numero !== 'string' && typeof value.numero !== 'number'
      || !/^\d+$/.test(String(value.numero)) || Number(value.numero) <= 0 || typeof value.moneda !== 'string' || !/^[A-Z]{3}$/.test(value.moneda)
      || !finite(value.total) || Number(value.total) < 0 || !finite(value.saldo_total) || Number(value.saldo_total) < 0 || Number(value.saldo_total) - Number(value.total) > 0.01
      || !value.cpe || !uuid.test(value.cpe.id || '') || value.cpe.documento_id !== value.id || value.cpe.estado !== 'ACEPTADO' || value.cpe.sunat_status !== 'ACCEPTED'
      || !Array.isArray(value.lineas) || value.lineas.some((line: any) => !line || !uuid.test(line.id || '') || typeof line.descripcion !== 'string'
        || ['orden','cantidad','base','impuesto','total','saldo_cantidad','saldo_base','saldo_impuesto','saldo_total'].some(key => !finite(line[key]) || Number(line[key]) < 0))) {
      throw new Error('La consulta no confirmó la identidad, aceptación e importes de los orígenes fiscales.')
    }
    ids.add(value.id)
    return { ...value, total: Number(value.total), saldo_total: Number(value.saldo_total) }
  })
}

export type CpeNoteSignIntent = { version: 1; noteId: string; key: string; payload: Record<string, never> }
export function readCpeNoteSignIntent(raw: string | null, noteId: string): CpeNoteSignIntent | null {
  if (!raw) return null
  const value = JSON.parse(raw)
  if (!value || value.version !== 1 || value.noteId !== noteId || !uuid.test(noteId)
    || typeof value.key !== 'string' || !value.key.startsWith('note-sign-ui:') || !uuid.test(value.key.slice(13))
    || !value.payload || Array.isArray(value.payload) || Object.keys(value.payload).length !== 0) {
    throw new Error('No se pudo recuperar el intento de firma. Verifique la nota antes de continuar.')
  }
  return value
}

export function referencedNoteSignature(response: any, noteId: string): any {
  const value = response?.data ?? response
  if (pending(response) || pending(value) || value.success !== true || value.cpe_id !== noteId || !uuid.test(value.cpe_id || '')
    || !('documento_id' in value) || value.documento_id !== null && !uuid.test(value.documento_id || '')
    || value.estado !== 'FIRMADO' || value.sunat_status !== 'READY' || !/^[a-f0-9]{64}$/i.test(value.xml_sha256 || '') || typeof value.idempotent !== 'boolean') {
    throw new Error('La firma no devolvió la confirmación completa de esta nota y su XML.')
  }
  return value
}
