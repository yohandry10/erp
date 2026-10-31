'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useApiCall } from '@/hooks/use-api'
import { customAuth } from '@/lib/auth-service'
import { cpeSendKey, cpeSendReceipt, readCpeSendIntent, type CpeSendIntent } from '@/lib/cpe-send-contract'

type Props = { cpeId: string; enabled: boolean; canRecover: boolean; title: string; onSent: () => void | Promise<void> }
export function CpeSendButton(props: Props) {
  const { session } = useAuth()
  const tenantId = session?.user?.tenant_id || ''; const actorId = session?.user?.id || ''
  if (!tenantId || !actorId) return null
  return <SendAction key={`${tenantId}:${actorId}:${props.cpeId}`} {...props} tenantId={tenantId} actorId={actorId} />
}
function SendAction({ cpeId, enabled, canRecover, title, onSent, tenantId, actorId }: Props & { tenantId: string; actorId: string }) {
  const { post } = useApiCall({ requireLive: true, throwOnError: true, showErrorToast: false, retries: 0, timeoutMs: 30000 })
  const scope = `erp.cpe-send.${tenantId}.${actorId}.${cpeId}`; const actor = `${tenantId}:${actorId}`
  const active = useRef(''); const writing = useRef(false); const intentRef = useRef<CpeSendIntent | null>(null)
  const [ready, setReady] = useState(false); const [intent, setIntent] = useState<CpeSendIntent | null>(null)
  const [submitting, setSubmitting] = useState(false); const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<'ACCEPTED' | 'PENDING' | null>(null)
  useEffect(() => {
    active.current = scope
    try { intentRef.current = readCpeSendIntent(localStorage.getItem(scope), tenantId, cpeId); setIntent(intentRef.current); setReady(true) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo recuperar el envío.') }
    return () => { active.current = '' }
  }, [scope, tenantId, cpeId])
  const send = async () => {
    if (writing.current || !ready || !enabled && !(intentRef.current && canRecover) || confirmed) return
    writing.current = true; setSubmitting(true); setError(null)
    try {
      const before = await customAuth.getRequestSession()
      if (active.current !== scope || `${before.session?.user?.tenant_id || ''}:${before.session?.user?.id || ''}` !== actor) return
      // Usa la clave canónica del backend: una sola operación SEND por CPE,
      // incluso después de que el servidor haya procesado un envío anterior.
      const request = intentRef.current ?? { version: 1 as const, cpeId, key: cpeSendKey(tenantId, cpeId), payload: {} }
      // Intención durable: datos de negocio e ids de empresa y usuario, sin token ni contraseña.
      // codeql[js/clear-text-storage-of-sensitive-data]
      localStorage.setItem(scope, JSON.stringify(request)); intentRef.current = request; setIntent(request)
      const receipt = cpeSendReceipt(await post(`/api/cpe/comprobantes/${encodeURIComponent(cpeId)}/enviar-sunat`, request.payload, { headers: { 'Idempotency-Key': request.key } }), cpeId)
      const after = await customAuth.getRequestSession()
      if (active.current !== scope || `${after.session?.user?.tenant_id || ''}:${after.session?.user?.id || ''}` !== actor) return
      localStorage.removeItem(scope); intentRef.current = null; setIntent(null); setConfirmed(receipt.resultKind)
      await onSent()
    } catch (failure) {
      if (active.current === scope) setError(`${failure instanceof Error ? failure.message : 'No se pudo confirmar el envío.'} Se conserva la misma operación para verificarla al reintentar.`)
    } finally { writing.current = false; if (active.current === scope) setSubmitting(false) }
  }
  return <div className="space-y-2">
    {!confirmed && <button type="button" disabled={!ready || submitting || !enabled && !(intent && canRecover)} title={title} onClick={() => { void send() }} data-testid={`send-cpe-${cpeId}`} className="rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-40">{submitting ? 'Verificando envío…' : intent ? 'Reintentar envío SUNAT' : 'Enviar SUNAT'}</button>}
    {intent && <p data-testid={`send-cpe-pending-${cpeId}`} className="max-w-xs text-xs">Envío pendiente de confirmar. Se conserva la misma operación.</p>}
    {error && <p role="alert" data-testid={`send-cpe-error-${cpeId}`} className="max-w-xs text-xs text-red-700 dark:text-red-300">{error}</p>}
    {confirmed && <p role="status" data-testid={`send-cpe-confirmed-${cpeId}`} className="max-w-xs text-xs">{confirmed === 'PENDING' ? 'Envío procesado. La aceptación SUNAT sigue pendiente.' : 'Aceptación SUNAT confirmada por el servidor.'}</p>}
  </div>
}
