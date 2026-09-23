'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { buildApiUrl } from '@/lib/api-url'
import { customAuth } from '@/lib/auth-service'
import { useCountryContext } from '@/hooks/use-country-context'

type RowError = { rowIndex: number; field?: string; message: string }
type Preview = { success: boolean; totalRows: number; errors: RowError[]; headers: string[]; sample: Record<string, string>[] }
type ImportResult = { status: string; runId: string | null; result: { created: number; updated: number; skippedRows: number; errorRows: number; errors: RowError[] } }

// Importar exige respuesta en vivo: un timeout no debe encolar una segunda carga.
async function migrationRequest(endpoint: string, body?: unknown) {
  const { session, accessToken } = customAuth.getCachedSession()
  const token = accessToken ?? session?.access_token
  return fetch(buildApiUrl(`/api/migration/${endpoint}/`), {
    method: body === undefined ? 'GET' : 'POST', credentials: 'include', cache: 'no-store',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(120_000),
  })
}

export function MasterImportDialog({ entity, open, onOpenChange, onImported }: {
  entity: 'clientes' | 'proveedores'; open: boolean; onOpenChange: (open: boolean) => void; onImported: () => Promise<void>
}) {
  const country = useCountryContext()
  const [file, setFile] = useState<{ filename: string; fileBase64: string } | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [inputVersion, setInputVersion] = useState(0)
  const reset = (clearInput = true) => { setFile(null); setPreview(null); setResult(null); setError(''); if (clearInput) setInputVersion(v => v + 1) }
  // La respuesta ya confirma la escritura; refrescar el listado puede continuar
  // mientras el usuario cierra el diálogo.
  const changeOpen = (value: boolean) => { if (!busy || result) { reset(); onOpenChange(value) } }
  const errors = result?.result.errors ?? preview?.errors ?? []

  const loadFile = async (selected?: File) => {
    reset(false)
    if (!selected) return
    if (selected.size === 0 || selected.size > 5 * 1024 * 1024) {
      setError('El CSV debe contener datos y no superar 5 MiB.'); return
    }
    setBusy(true)
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer())
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...Array.from(bytes.subarray(offset, offset + 8192)))
      const loaded = { filename: selected.name, fileBase64: btoa(binary) }
      setFile(loaded)
      const response = await migrationRequest('preview', { runType: entity, fileBase64: loaded.fileBase64 })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'No se pudo validar el archivo')
      if (!Array.isArray(payload.errors) || !Array.isArray(payload.sample) || !Array.isArray(payload.headers)) throw new Error('Respuesta de validación incompleta')
      setPreview(payload)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo leer el CSV UTF-8') }
    finally { setBusy(false) }
  }

  const downloadTemplate = async () => {
    setBusy(true); setError('')
    try {
      const response = await migrationRequest(`templates/${entity}`)
      if (!response.ok) throw new Error('No se pudo descargar la plantilla. Verifica tu permiso de migración.')
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = `plantilla-${entity}.csv`
      document.body.appendChild(anchor); anchor.click()
      window.setTimeout(() => { URL.revokeObjectURL(url); anchor.remove() }, 60_000)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo descargar la plantilla') }
    finally { setBusy(false) }
  }

  const importFile = async () => {
    if (!file || !preview?.success || !preview.totalRows || preview.errors.length || busy || result) return
    setBusy(true); setError('')
    try {
      const response = await migrationRequest(`${entity}/import`, { ...file, dryRun: false })
      const payload: ImportResult & { message?: string } = await response.json()
      if (!response.ok || !payload.result || !['completed', 'partial', 'failed'].includes(payload.status)) throw new Error(payload.message || 'No se pudo confirmar el resultado de la importación')
      setResult(payload)
      await onImported()
    } catch (err) {
      setError(`${err instanceof Error ? err.message : 'No se recibió respuesta'}. Comprueba el listado antes de reintentar y conserva los mismos external_id.`)
    } finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" onInteractOutside={event => { if (busy) event.preventDefault() }}>
      <DialogHeader>
        <DialogTitle>Importar {entity} desde CSV</DialogTitle>
        <DialogDescription>Revisa el archivo antes de confirmar. Las filas se procesan individualmente y el resultado puede ser parcial. Usa un external_id estable por registro.</DialogDescription>
      </DialogHeader>
      {country.paisCodigo !== 'PE' ? <p>Este importador valida documentos de Perú. Utiliza el alta individual para el país de esta empresa.</p> : <>
        <Button variant="outline" disabled={busy} onClick={downloadTemplate}>Descargar plantilla CSV</Button>
        <label htmlFor={`import-${entity}`}>Archivo CSV UTF-8 (máximo 5 MiB)</label>
        <input key={inputVersion} id={`import-${entity}`} type="file" accept=".csv,text/csv" disabled={busy} onChange={event => { void loadFile(event.target.files?.[0]) }} />
        {file && <p>{file.filename}</p>}
        {busy && <p role="status">Procesando archivo…</p>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {preview && <div>
          <p>{preview.totalRows} filas encontradas. La vista previa no guarda registros.</p>
          <div className="overflow-x-auto"><table>
            <thead><tr>{preview.headers.map(header => <th key={header} className="p-2 text-left">{header}</th>)}</tr></thead>
            <tbody>{preview.sample.map((row, i) => <tr key={i}>{preview.headers.map(header => <td key={header} className="p-2">{row[header]}</td>)}</tr>)}</tbody>
          </table></div>
        </div>}
        {errors.length > 0 && <ul role="alert">{errors.map((entry, index) => <li key={index}>Fila {entry.rowIndex}{entry.field ? ` (${entry.field})` : ''}: {entry.message}</li>)}</ul>}
        {result && <p role="status">
          {result.status === 'completed' ? 'Importación completada' : result.status === 'partial' ? 'Importación parcial' : 'Importación fallida'}:
          {' '}{result.result.created} creados, {result.result.updated} actualizados, {result.result.skippedRows} omitidos y {result.result.errorRows} con error.
          {result.runId && <> Referencia: {result.runId}.</>}
        </p>}
        <Button disabled={busy || !!result || !preview?.success || !preview.totalRows || preview.errors.length > 0} onClick={importFile}>Confirmar importación de {entity}</Button>
      </>}
    </DialogContent>
  </Dialog>
}
