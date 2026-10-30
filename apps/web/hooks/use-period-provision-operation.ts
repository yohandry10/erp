'use client'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { confirmProvisionOperation, newProvisionIntent, provisionIntentKey, readProvisionIntent, type ProvisionIntent, type ProvisionPayload, type ProvisionScope } from '@/lib/accounting-period-provision-operation'

const running = new Set<string>()
export function usePeriodProvisionOperation(scope: ProvisionScope, allowed: boolean, scopeReady: boolean) {
  const identity = `${scope.tenantId}:${scope.actorId}`
  const active = useRef(identity); active.current = identity
  const permission = useRef(allowed); permission.current = allowed
  const epoch = useRef(0), inflight = useRef(false)
  const [ready,setReady] = useState(false), [pending,setPending] = useState<ProvisionIntent|null>(null)
  const [recoveryError,setRecoveryError] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false)
  const { apiCall } = useApi<unknown>({requireLive:true,retries:0,timeoutMs:30000,showErrorToast:false,throwOnError:true})
  useEffect(() => {
    epoch.current++; inflight.current=false; setReady(false); setPending(null); setRecoveryError(''); setError(''); setBusy(false)
    if (!scopeReady) return
    try { setPending(readProvisionIntent(localStorage.getItem(provisionIntentKey(scope)),scope)) }
    catch { setRecoveryError('No se pudo recuperar la estimación pendiente. Sus datos se conservan; revisa el resultado antes de continuar.') }
    setReady(true)
    return () => { epoch.current++ }
  // Scope is represented by its two stable identifiers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[identity,scopeReady])
  const perform = async (payload?: ProvisionPayload) => {
    if (!ready || !allowed || recoveryError || inflight.current) return null
    const key=provisionIntentKey(scope)
    if (running.has(key)) return null
    const run=epoch.current, requested=identity
    const current=()=>run===epoch.current && active.current===requested && permission.current
    inflight.current=true; running.add(key); setBusy(true); setError('')
    try {
      const existing=localStorage.getItem(key), recovered=readProvisionIntent(existing,scope)
      if ((pending && existing!==JSON.stringify(pending)) || (!pending && recovered)) throw new Error('La estimación pendiente cambió. Recarga para revisar sus datos conservados.')
      if (!recovered && !payload) throw new Error('Selecciona un período y criterio para la estimación.')
      if (recovered && payload && JSON.stringify(recovered.payload)!==JSON.stringify(payload)) throw new Error('Confirma primero la estimación pendiente con su criterio conservado.')
      const intent=recovered || newProvisionIntent(payload!,scope), raw=JSON.stringify(intent)
      if (existing===null) localStorage.setItem(key,raw)
      if (localStorage.getItem(key)!==raw) throw new Error('No se pudo conservar la estimación. Reintenta sin cambiar sus datos.')
      if (!current()) return null
      setPending(intent)
      const response=await apiCall(`/contabilidad/periodos/${intent.payload.periodo}/provision-cobranza-dudosa?dias_vencido=${intent.payload.diasVencido}`,{
        method:'POST',headers:{'idempotency-key':intent.idempotencyKey}
      })
      if (!current()) return null
      const receipt=confirmProvisionOperation(response,intent,scope)
      if (localStorage.getItem(key)!==raw) throw new Error('La estimación pendiente cambió durante la confirmación. Recarga para revisar sus datos conservados.')
      localStorage.removeItem(key)
      if (localStorage.getItem(key)!==null) throw new Error('El resultado está confirmado, pero no se pudo retirar la estimación pendiente. Reintenta con sus mismos datos.')
      setPending(null)
      return receipt
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : 'No se pudo confirmar la estimación. Reintenta con conexión.')
      return null
    } finally {
      running.delete(key)
      if (run===epoch.current && active.current===requested) { inflight.current=false; setBusy(false) }
    }
  }
  return {invalidate: () => { epoch.current++; inflight.current=false; setBusy(false) },ready,pending:pending?.tenantId===scope.tenantId && pending.actorId===scope.actorId ? pending:null,recoveryError,error,busy,perform}
}
