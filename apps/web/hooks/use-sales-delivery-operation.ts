'use client'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import {confirmDeliveryRegistered,newDeliveryIntent,deliveryIntentKey,readDeliveryIntent,type DeliveryIntent,type DeliveryScope} from '@/lib/ventas/sales-delivery-operation'

const running = new Set<string>()
export function useSalesDeliveryOperation(scope: DeliveryScope, allowed: boolean, scopeReady: boolean) {
  const identity = `${scope.tenantId}:${scope.actorId}:${scope.orderId}`
  const active = useRef(identity); active.current = identity
  const permission = useRef(allowed); permission.current = allowed
  const epoch = useRef(0), inflight = useRef(false)
  const [ready,setReady] = useState(false), [pending,setPending] = useState<DeliveryIntent|null>(null)
  const [recoveryError,setRecoveryError] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false)
  const { apiCall } = useApi<unknown>({requireLive:true,retries:0,timeoutMs:30000,showErrorToast:false,throwOnError:true})
  useEffect(() => {
    epoch.current++; inflight.current=false; setReady(false); setPending(null); setRecoveryError(''); setError(''); setBusy(false)
    if (!scopeReady) return
    try { setPending(readDeliveryIntent(localStorage.getItem(deliveryIntentKey(scope)),scope)) }
    catch { setRecoveryError('No se pudo recuperar la entrega pendiente. Sus datos se conservan; revisa el resultado antes de continuar.') }
    setReady(true)
    return () => { epoch.current++ }
  // Scope is represented by its two stable identifiers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[identity,scopeReady])
  const perform = async (orderResponse?: unknown, notes?: string) => {
    if (!ready || !allowed || recoveryError || inflight.current) return null
    const key=deliveryIntentKey(scope)
    if (running.has(key)) return null
    const run=epoch.current, requested=identity
    const current=()=>run===epoch.current && active.current===requested && permission.current
    inflight.current=true; running.add(key); setBusy(true); setError('')
    try {
      const existing=localStorage.getItem(key), recovered=readDeliveryIntent(existing,scope)
      if ((pending && existing!==JSON.stringify(pending)) || (!pending && recovered)) throw new Error('La entrega pendiente cambió. Recarga para revisar sus datos conservados.')
      if (!recovered && !orderResponse) throw new Error('Consulta el pedido completo antes de registrar la entrega.')
      if (recovered && orderResponse) throw new Error('Confirma primero la entrega pendiente con sus datos conservados.')
      const intent=recovered || newDeliveryIntent(orderResponse,scope,notes||''), raw=JSON.stringify(intent)
      if (existing===null) localStorage.setItem(key,raw)
      if (localStorage.getItem(key)!==raw) throw new Error('No se pudo conservar la entrega. Reintenta sin cambiar sus datos.')
      if (!current()) return null
      setPending(intent)
      const response=await apiCall(`/inventario/logistica/${intent.orderId}/registrar-entrega`,{
        method:'POST',body:intent.body,headers:{'Content-Type':'application/json'}
      })
      if (!current()) return null
      const receipt=confirmDeliveryRegistered(response,intent)
      if (localStorage.getItem(key)!==raw) throw new Error('La entrega pendiente cambió durante la confirmación. Recarga para revisar sus datos conservados.')
      localStorage.removeItem(key)
      if (localStorage.getItem(key)!==null) throw new Error('El resultado está confirmado, pero no se pudo retirar la entrega pendiente. Reintenta con sus mismos datos.')
      setPending(null)
      return receipt
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : 'No se pudo confirmar la entrega. Reintenta con conexión.')
      return null
    } finally {
      running.delete(key)
      if (run===epoch.current && active.current===requested) { inflight.current=false; setBusy(false) }
    }
  }
  return {invalidate: () => { epoch.current++; inflight.current=false; setBusy(false) },ready,pending:pending?.tenantId===scope.tenantId && pending.actorId===scope.actorId && pending.orderId===scope.orderId ? pending:null,recoveryError,error,busy,perform}
}
