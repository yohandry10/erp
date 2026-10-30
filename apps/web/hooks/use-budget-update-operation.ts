'use client'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { confirmBudgetUpdated, confirmBudgetUpdateResolution, newBudgetUpdateIntent, budgetUpdateIntentKey, readBudgetUpdateIntent, type BudgetUpdateIntent, type BudgetUpdatePayload, type BudgetUpdateScope } from '@/lib/accounting-budget-update-operation'
import {type BudgetCreateContext} from '@/lib/accounting-budget-create-operation'
import {type BudgetRow} from '@/lib/accounting-budget-read'

const running = new Set<string>()
export function useBudgetUpdateOperation(scope: BudgetUpdateScope, allowed: boolean, scopeReady: boolean) {
  const identity = `${scope.tenantId}:${scope.actorId}`
  const active = useRef(identity); active.current = identity
  const permission = useRef(allowed); permission.current = allowed
  const epoch = useRef(0), inflight = useRef(false)
  const [ready,setReady] = useState(false), [pending,setPending] = useState<BudgetUpdateIntent|null>(null)
  const [recoveryError,setRecoveryError] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false)
  const { apiCall } = useApi<unknown>({requireLive:true,retries:0,timeoutMs:30000,showErrorToast:false,throwOnError:true})
  useEffect(() => {
    epoch.current++; inflight.current=false; setReady(false); setPending(null); setRecoveryError(''); setError(''); setBusy(false)
    if (!scopeReady) return
    try { setPending(readBudgetUpdateIntent(localStorage.getItem(budgetUpdateIntentKey(scope)),scope)) }
    catch { setRecoveryError('No se pudo recuperar la edición del presupuesto pendiente. Sus datos se conservan; revisa el resultado antes de continuar.') }
    setReady(true)
    return () => { epoch.current++ }
  // Scope is represented by its two stable identifiers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[identity,scopeReady])

  const execute = async (resolve: boolean, payload?: BudgetUpdatePayload, context?: BudgetCreateContext):Promise<BudgetRow|'COMMITTED'|'ABANDONED'|null> => {
    if (!ready || !allowed || recoveryError || inflight.current) return null
    const key=budgetUpdateIntentKey(scope)
    if (running.has(key)) return null
    const run=epoch.current, requested=identity
    const current=()=>run===epoch.current && active.current===requested && permission.current
    inflight.current=true; running.add(key); setBusy(true); setError('')
    try {
      if (!navigator.locks?.request) throw new Error('No se pudo bloquear la edición pendiente. Sus datos se conservan; reintenta en una sesión compatible.')
      return await navigator.locks.request(key,{mode:'exclusive',ifAvailable:true},async lock=>{
        if (!lock) throw new Error('La edición pendiente está siendo gestionada en otra ventana. Sus datos se conservan.')
        if (!current()) return null
        const existing=localStorage.getItem(key), recovered=readBudgetUpdateIntent(existing,scope)
        if ((pending && existing!==JSON.stringify(pending)) || (!pending && recovered)) throw new Error('La edición del presupuesto pendiente cambió. Recarga para revisar sus datos conservados.')
        if (resolve && !recovered) throw new Error('Recupera la edición pendiente antes de resolverla.')
        if (!recovered && !payload) throw new Error('Selecciona un centro, cuenta, período e importe para la edición del presupuesto.')
        if (recovered && payload && recovered.body!==JSON.stringify(payload)) throw new Error('Confirma primero la edición del presupuesto pendiente con sus datos conservados.')
        const intent=recovered || newBudgetUpdateIntent(payload!,scope,context!), raw=JSON.stringify(intent)
        if (existing===null) localStorage.setItem(key,raw)
        if (localStorage.getItem(key)!==raw) throw new Error('No se pudo conservar la edición del presupuesto. Reintenta sin cambiar sus datos.')
        if (!current()) return null
        setPending(intent)
        const response=await apiCall(`/contabilidad/presupuestos/${intent.recordId}${resolve?'/resolver-edicion':''}`,{
          method:resolve?'POST':'PUT',body:intent.body,headers:{'Content-Type':'application/json','idempotency-key':intent.idempotencyKey}
        })
        if (!current()) return null
        const receipt=resolve?confirmBudgetUpdateResolution(response,intent):confirmBudgetUpdated(response,intent)
        if (localStorage.getItem(key)!==raw) throw new Error('La edición del presupuesto pendiente cambió durante la confirmación. Recarga para revisar sus datos conservados.')
        if (resolve) {
          const archiveKey=`erp.accounting.budget-update.resolved.v1.${intent.tenantId}:${intent.actorId}:${intent.idempotencyKey}`
          const archive=JSON.stringify({intent,resolution:receipt,receipt:response})
          const previous=localStorage.getItem(archiveKey)
          if(previous!==null) {
            const saved=JSON.parse(previous)
            if(JSON.stringify(saved.intent)!==raw||saved.resolution!==receipt) throw new Error('El archivo de la resolución no coincide. La edición pendiente se conserva.')
          } else localStorage.setItem(archiveKey,archive)
          if (localStorage.getItem(archiveKey)!==(previous??archive)) throw new Error('No se pudo conservar el recibo de resolución. La edición pendiente se conserva.')
        }
        if (!current() || localStorage.getItem(key)!==raw) return null
        localStorage.removeItem(key)
        if (localStorage.getItem(key)!==null) throw new Error('El resultado está confirmado, pero no se pudo retirar la edición del presupuesto pendiente. Reintenta con sus mismos datos.')
        setPending(null)
        return receipt
      })
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : 'No se pudo confirmar la edición del presupuesto. Reintenta con conexión.')
      return null
    } finally {
      running.delete(key)
      if (run===epoch.current && active.current===requested) { inflight.current=false; setBusy(false) }
    }
  }
  const perform=async(payload?:BudgetUpdatePayload,context?:BudgetCreateContext)=>{
    const result=await execute(false,payload,context)
    return result && typeof result==='object'?result:null
  }
  const resolve=async()=>{
    const result=await execute(true)
    return typeof result==='string'?result:null
  }
  return {invalidate: () => { epoch.current++; inflight.current=false; setBusy(false) },ready,pending:pending?.tenantId===scope.tenantId && pending.actorId===scope.actorId ? pending:null,recoveryError,error,busy,perform,resolve}
}
