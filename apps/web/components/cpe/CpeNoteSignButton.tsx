'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useApiCall } from '@/hooks/use-api'
import { customAuth } from '@/lib/auth-service'
import { readCpeNoteSignIntent, referencedNoteSignature, type CpeNoteSignIntent } from '@/lib/cpe-note-contract'

type Props = { noteId: string; state: string; onSigned: () => void | Promise<void> }
export function CpeNoteSignButton(props: Props) {
  const { session } = useAuth()
  const actor = `${session?.user?.tenant_id || ''}:${session?.user?.id || ''}`
  if (!session?.user?.tenant_id || !session.user.id) return null
  return <NoteSignAction key={`${actor}:${props.noteId}`} {...props} actor={actor} />
}

function NoteSignAction({ noteId, state, onSigned, actor }: Props & { actor: string }) {
  const { post } = useApiCall({ requireLive: true, throwOnError: true, showErrorToast: false, retries: 0, timeoutMs: 30000 })
  const scope = `erp.cpe-note-sign.${actor.replace(':', '.')}.${noteId}`
  const active = useRef(''); const writing = useRef(false); const intentRef = useRef<CpeNoteSignIntent | null>(null)
  const [ready, setReady] = useState(false); const [intent, setIntent] = useState<CpeNoteSignIntent | null>(null)
  const [submitting, setSubmitting] = useState(false); const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  useEffect(() => {
    active.current = scope
    try { intentRef.current = readCpeNoteSignIntent(localStorage.getItem(scope), noteId); setIntent(intentRef.current); setReady(true) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo recuperar el intento de firma.') }
    return () => { active.current = '' }
  }, [scope, noteId])
  const sign = async () => {
    if (writing.current || !ready || confirmed || state !== 'BORRADOR' && !intentRef.current) return
    writing.current = true; setSubmitting(true); setError(null)
    try {
      const before = await customAuth.getRequestSession()
      if (active.current !== scope || `${before.session?.user?.tenant_id || ''}:${before.session?.user?.id || ''}` !== actor) return
      const request = intentRef.current ?? { version: 1 as const, noteId, key: `note-sign-ui:${crypto.randomUUID()}`, payload: {} }
      localStorage.setItem(scope, JSON.stringify(request)); intentRef.current = request; setIntent(request)
      referencedNoteSignature(await post(`/api/cpe/notas-referenciadas/${encodeURIComponent(noteId)}/firmar`, request.payload, { headers: { 'Idempotency-Key': request.key } }), noteId)
      const after = await customAuth.getRequestSession()
      if (active.current !== scope || `${after.session?.user?.tenant_id || ''}:${after.session?.user?.id || ''}` !== actor) return
      localStorage.removeItem(scope); intentRef.current = null; setIntent(null); setConfirmed(true)
      await onSigned()
    } catch (failure) {
      if (active.current === scope) setError(`${failure instanceof Error ? failure.message : 'No se pudo confirmar la firma.'} Se conserva el intento; reintente la misma operación.`)
    } finally { writing.current = false; if (active.current === scope) setSubmitting(false) }
  }
  if (state !== 'BORRADOR' && !intent && !error && !confirmed) return null
  return <div className="space-y-2">
    {!confirmed && <button type="button" disabled={!ready || submitting} onClick={() => { void sign() }} data-testid={`sign-note-${noteId}`} className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold disabled:opacity-40">{submitting ? 'Verificando firma…' : intent ? 'Reintentar firma' : 'Firmar'}</button>}
    {intent && <p data-testid={`sign-note-pending-${noteId}`} className="max-w-xs text-xs">Firma pendiente de confirmar. Se conserva la misma operación.</p>}
    {error && <p role="alert" data-testid={`sign-note-error-${noteId}`} className="max-w-xs text-xs text-red-700 dark:text-red-300">{error}</p>}
    {confirmed && <p role="status" data-testid={`sign-note-confirmed-${noteId}`} className="max-w-xs text-xs">Firma confirmada. El envío fiscal sigue pendiente.</p>}
  </div>
}
