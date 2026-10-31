'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useApi } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { useCountryContext } from '@/hooks/use-country-context'
import { confirmCxcAdjustmentIntent, cxcAdjustmentPayload, cxcAdjustmentPendingKey, newCxcAdjustmentIntent, readCxcAdjustmentIntent } from '@/lib/finanzas/cxc-adjustment-operation'
import type { CxcAdjustmentAccount } from '@/lib/finanzas/cxc-adjustment-contract'
import type { CxcAdjustmentIntent, CxcAdjustmentKind } from '@/lib/finanzas/cxc-adjustment-operation'

const changed = () => window.dispatchEvent(new Event('erp:cxc-adjustment-pending'))
export function useCxcAdjustmentOperation(action: CxcAdjustmentKind, cuenta: CxcAdjustmentAccount | null, isOpen: boolean, onClose: () => void, onSuccess: () => void) {
  const { session, loading: authLoading } = useAuth(), country = useCountryContext()
  const { hasPermission: permitted, loading: permissionLoading } = usePermission('finanzas', 'write', 'cxc.cobros')
  const { post } = useApi({ requireLive: true, showSuccessToast: false, showErrorToast: false, throwOnError: true, retries: 0 })
  const tenantId = session?.user?.tenant_id || '', actorId = session?.user?.id || '', scope = `${tenantId}:${actorId}:${cuenta?.id || ''}:${action}`
  const active = useRef(''), revision = useRef(0), busy = useRef(false), callbacks = useRef({ onClose, onSuccess })
  active.current = isOpen && cuenta && !authLoading && !permissionLoading && permitted ? scope : ''
  callbacks.current = { onClose, onSuccess }
  const [pending, setPending] = useState<CxcAdjustmentIntent | null>(null), [raw, setRaw] = useState<string | null>(null)
  const [ready, setReady] = useState(''), [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null), [storageError, setStorageError] = useState<string | null>(null)
  const restore = useCallback(() => {
    if (!cuenta || active.current !== scope) return
    setPending(null); setRaw(null); setError(null); setStorageError(null)
    try {
      const original = localStorage.getItem(cxcAdjustmentPendingKey({ tenantId, actorId }, cuenta.id, action))
      const intent = readCxcAdjustmentIntent(original, { tenantId, actorId }, cuenta.id, action)
      setPending(intent); setRaw(original)
    } catch { setStorageError('No se pudo leer el ajuste pendiente. Se conserva sin reemplazarlo ni preparar otra solicitud.') }
    setReady(scope)
  }, [cuenta, scope, tenantId, actorId, action])
  useEffect(() => {
    revision.current += 1; busy.current = false; setSaving(false); setReady(''); setPending(null); setRaw(null); setError(null); setStorageError(null)
    if (active.current === scope) restore()
    return () => { revision.current += 1 }
  }, [isOpen, scope, authLoading, permissionLoading, permitted, restore])
  useEffect(() => {
    if (!cuenta || active.current !== scope) return
    const update = (event: StorageEvent) => {
      if (event.key !== null && event.key !== cxcAdjustmentPendingKey({ tenantId, actorId }, cuenta.id, action)) return
      if (busy.current) setStorageError('El pendiente cambió en otra ventana. Se conserva la solicitud enviada para verificar su resultado.')
      else { revision.current += 1; restore() }
    }
    window.addEventListener('storage', update)
    return () => window.removeEventListener('storage', update)
  }, [cuenta, scope, tenantId, actorId, action, restore])

  const send = async (fields: Record<string, any>): Promise<boolean> => {
    if (!cuenta || busy.current || active.current !== scope || ready !== scope || storageError) return false
    if (!pending && (country.loading || country.error || !country.paisCodigo)) { setError('Consulta el contexto fiscal antes de preparar otro ajuste.'); return false }
    busy.current = true; setSaving(true); setError(null)
    const context = scope, generation = revision.current, current = () => active.current === context && revision.current === generation
    try {
      if (!navigator.locks?.request) throw new Error('No se puede reservar el ajuste en esta ventana. Se conserva el pendiente; vuelve a abrir la aplicación.')
      let confirmed = false
      await navigator.locks.request('erp.cxc.adjustment:' + scope, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Otra ventana está confirmando este ajuste. Se conserva la solicitud original; reintenta con conexión.')
        if (!current()) return
        const key = cxcAdjustmentPendingKey({ tenantId, actorId }, cuenta.id, action), storedRaw = localStorage.getItem(key)
        const stored = readCxcAdjustmentIntent(storedRaw, { tenantId, actorId }, cuenta.id, action)
        let intent: CxcAdjustmentIntent, original: string
        if (pending) {
          if (!stored || storedRaw !== raw) throw new Error('El pendiente cambió. Se conserva sin reemplazarlo ni enviar otro ajuste.')
          intent = stored; original = storedRaw!
        } else {
          if (stored) { restore(); throw new Error('Existe un ajuste pendiente. Recupera la solicitud original antes de preparar otra.') }
          intent = newCxcAdjustmentIntent(action, cuenta, country.paisCodigo, fields, { tenantId, actorId }); original = JSON.stringify(intent)
          try {
            // Intención durable: datos de negocio e ids de empresa y usuario, sin token ni contraseña.
            // codeql[js/clear-text-storage-of-sensitive-data]
            localStorage.setItem(key, original)
            if (localStorage.getItem(key) !== original) throw new Error('Original sin lectura confirmada')
          } catch { restore(); changed(); throw new Error('No se pudo confirmar el almacenamiento del original; no se envió otro ajuste.') }
          setPending(intent); setRaw(original); changed()
        }
        const response = await post(`/api/finanzas/cxc/${intent.cuenta.id}/${intent.kind}`, cxcAdjustmentPayload(intent), intent.kind === 'reprogramar' ? { headers: { 'Idempotency-Key': intent.key } } : undefined)
        if (!current()) return
        confirmCxcAdjustmentIntent(response, intent)
        if (localStorage.getItem(key) !== original) throw new Error('El pendiente cambió durante la confirmación. Se conserva sin retirar otra solicitud.')
        localStorage.removeItem(key)
        if (localStorage.getItem(key) !== null) throw new Error('No se pudo retirar el pendiente confirmado. Reintenta la misma solicitud.')
        setPending(null); setRaw(null); changed(); confirmed = true
        callbacks.current.onSuccess(); callbacks.current.onClose()
      })
      return confirmed
    } catch (err: any) { if (current()) setError(err?.message || 'No se pudo verificar el ajuste. Se conserva la solicitud original.'); return false }
    finally { if (current()) { busy.current = false; setSaving(false) } }
  }
  const close = () => { if (!busy.current) callbacks.current.onClose() }
  return { pending, payload: pending ? cxcAdjustmentPayload(pending) : null, ready: ready === scope && active.current === scope, saving,
    frozen: saving || Boolean(pending) || Boolean(storageError), error: storageError || error, setError, send, close,
    account: pending?.cuenta || cuenta, country: pending?.country || country.paisCodigo }
}
