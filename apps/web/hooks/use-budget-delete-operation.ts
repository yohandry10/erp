'use client'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { confirmBudgetDeleted, newBudgetDeleteIntent, budgetDeleteIntentKey, readBudgetDeleteIntent, type BudgetDeleteIntent, type BudgetDeletePayload, type BudgetDeleteScope } from '@/lib/accounting-budget-delete-operation'

const running = new Set<string>()
export function useBudgetDeleteOperation(scope: BudgetDeleteScope, allowed: boolean, scopeReady: boolean) {
  const identity = `${scope.tenantId}:${scope.actorId}`
  const active = useRef(identity); active.current = identity
  const permission = useRef(allowed); permission.current = allowed
  const epoch = useRef(0), inflight = useRef(false)
  const [ready,setReady] = useState(false), [pending,setPending] = useState<BudgetDeleteIntent|null>(null)
  const [recoveryError,setRecoveryError] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false)
  const { apiCall } = useApi<unknown>({requireLive:true,retries:0,timeoutMs:30000,showErrorToast:false,throwOnError:true})
  useEffect(() => {
    epoch.current++; inflight.current=false; setReady(false); setPending(null); setRecoveryError(''); setError(''); setBusy(false)
    if (!scopeReady) return
    try { setPending(readBudgetDeleteIntent(localStorage.getItem(budgetDeleteIntentKey(scope)),scope)) }
    catch { setRecoveryError('No se pudo recuperar la baja del presupuesto pendiente. Sus datos se conservan; revisa el resultado antes de continuar.') }
    setReady(true)
    return () => { epoch.current++ }
  // Scope is represented by its two stable identifiers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[identity,scopeReady])
  const perform = async (payload?: BudgetDeletePayload) => {
    if (!ready || !allowed || recoveryError || inflight.current) return null
    const key=budgetDeleteIntentKey(scope)
    if (running.has(key)) return null
    const run=epoch.current, requested=identity
    const current=()=>run===epoch.current && active.current===requested && permission.current
    inflight.current=true; running.add(key); setBusy(true); setError('')
    try {
      if (typeof navigator.locks?.request !== 'function') throw new Error('No se pudo proteger la baja del presupuesto entre ventanas. Usa un navegador actualizado para continuar; tus datos pendientes se conservan.')
      return await navigator.locks.request(key,{mode:'exclusive',ifAvailable:true},async lock => {
        if (!lock) throw new Error('La baja del presupuesto está en curso en otra ventana. Espera su resultado y recarga para revisar los datos conservados.')
        if (!current()) return null
        const existing=localStorage.getItem(key), recovered=readBudgetDeleteIntent(existing,scope)
        if ((pending && existing!==JSON.stringify(pending)) || (!pending && recovered)) throw new Error('La baja del presupuesto pendiente cambió. Recarga para revisar sus datos conservados.')
        if (!recovered && !payload) throw new Error('Consulta el presupuesto completo antes de eliminarlo.')
        if (recovered && payload && recovered.body!==JSON.stringify(payload)) throw new Error('Confirma primero la baja del presupuesto pendiente con sus datos conservados.')
        const intent=recovered || newBudgetDeleteIntent(payload!,scope), raw=JSON.stringify(intent)
        if (existing===null) localStorage.setItem(key,raw)
        if (localStorage.getItem(key)!==raw) throw new Error('No se pudo conservar la baja del presupuesto. Reintenta sin cambiar sus datos.')
        if (!current()) return null
        setPending(intent)
        const response=await apiCall(`/contabilidad/presupuestos/${intent.recordId}`,{
          method:'DELETE',body:intent.body,headers:{'Content-Type':'application/json','idempotency-key':intent.idempotencyKey}
      })
      if (!current()) return null
      const receipt=confirmBudgetDeleted(response,intent)
      if (localStorage.getItem(key)!==raw) throw new Error('La baja del presupuesto pendiente cambió durante la confirmación. Recarga para revisar sus datos conservados.')
      localStorage.removeItem(key)
      if (localStorage.getItem(key)!==null) throw new Error('El resultado está confirmado, pero no se pudo retirar la baja del presupuesto pendiente. Reintenta con sus mismos datos.')
      setPending(null)
      return receipt
      })
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : 'No se pudo confirmar la baja del presupuesto. Reintenta con conexión.')
      return null
    } finally {
      running.delete(key)
      if (run===epoch.current && active.current===requested) { inflight.current=false; setBusy(false) }
    }
  }
  return {invalidate: () => { epoch.current++; inflight.current=false; setBusy(false) },ready,pending:pending?.tenantId===scope.tenantId && pending.actorId===scope.actorId ? pending:null,recoveryError,error,busy,perform}
}
