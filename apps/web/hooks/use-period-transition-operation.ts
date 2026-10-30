'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermission } from '@/hooks/use-permission'
import { useApi } from '@/hooks/use-api'
import { readPeriodDetail, readPeriodClosurePreview, type PeriodSnapshot } from '@/lib/accounting-period-read'
import { confirmPeriodTransition, newPeriodTransitionIntent, periodTransitionIntentKey, periodTransitionPrefix, readPeriodTransitionIntent, samePeriodSnapshot, type PeriodTransitionAction, type PeriodTransitionIntent } from '@/lib/accounting-period-transition'
type Pending = { intent: PeriodTransitionIntent; raw: string; key: string }
const event = 'erp-period-transition-intents-changed'
const running = new Set<string>()
const changed = () => window.dispatchEvent(new Event(event))

export function usePeriodTransitionOperations() {
  const { session, user, loading: authLoading } = useAuth()
  const tenantId=session?.user?.tenant_id || '', actorId=session?.user?.id || '', scopeIdentity=`${tenantId}:${actorId}`
  const close=usePermission('contabilidad','cerrar','periodos'),validate=usePermission('contabilidad','validar','periodos'),reopen=usePermission('contabilidad','reabrir','periodos')
  const scopeReady=!authLoading && !!tenantId && !!actorId
  const canClose=scopeReady && !close.loading && close.hasPermission && !validate.loading && validate.hasPermission
  const canReopen=scopeReady && user?.is_super_admin===true && !reopen.loading && reopen.hasPermission
  const currentScope=useRef(scopeIdentity);currentScope.current=scopeIdentity
  const permissions=useRef({canClose,canReopen});permissions.current={canClose,canReopen}
  const epoch=useRef(0),inflight=useRef(false)
  const [ready,setReady]=useState(false),[pending,setPending]=useState<Pending[]>([]),[recoveryError,setRecoveryError]=useState(''),[error,setError]=useState(''),[busyKey,setBusyKey]=useState(''),[activeKeys,setActiveKeys]=useState<string[]>([])
  const {apiCall}=useApi<unknown>({requireLive:true,throwOnError:true,showErrorToast:false,retries:0,timeoutMs:30000})
  const load=useCallback(()=>{
    setPending([]);setRecoveryError('');setActiveKeys([...running])
    if(!scopeReady)return
    try {
      const scope={tenantId,actorId},prefix=periodTransitionPrefix(scope),rows:Pending[]=[]
      for(let n=0;n<localStorage.length;n++) {
        const key=localStorage.key(n)
        if(!key?.startsWith(prefix))continue
        const raw=localStorage.getItem(key)
        if(raw===null)throw new Error('La intención cambió al recuperarla')
        const intent=readPeriodTransitionIntent(raw,scope)
        if(periodTransitionIntentKey(intent)!==key)throw new Error('Identidad de intención inconsistente')
        rows.push({intent,raw,key})
      }
      setPending(rows)
    } catch {setRecoveryError('No se pudieron recuperar las transiciones pendientes. Sus datos se conservan; revisa el resultado antes de continuar.')}
    setReady(true)
  },[scopeReady,tenantId,actorId])
  useEffect(()=>{
    epoch.current++;inflight.current=false;setReady(false);setError('');setBusyKey('');load()
    window.addEventListener(event,load);window.addEventListener('storage',load)
    return ()=>{epoch.current++;window.removeEventListener(event,load);window.removeEventListener('storage',load)}
  },[load])
  const allowed=(action:PeriodTransitionAction)=>action==='CLOSE'?permissions.current.canClose:permissions.current.canReopen
  const run=async(intent:PeriodTransitionIntent,raw:string,key:string)=>{
    if(!ready || recoveryError || !allowed(intent.action) || inflight.current || running.has(key))return false
    const requestedEpoch=epoch.current,requestedScope=scopeIdentity
    const current=()=>epoch.current===requestedEpoch && currentScope.current===requestedScope && allowed(intent.action)
    inflight.current=true;running.add(key);setBusyKey(key);setError('');changed()
    try {
      const scope={tenantId,actorId}
      const verified=readPeriodTransitionIntent(raw,scope)
      if(localStorage.getItem(key)!==raw)throw new Error('La transición pendiente cambió. Sus datos se conservan; recarga para revisarlos.')
      const endpoint=`/contabilidad/periodos/${verified.snapshot.id}`
      let response=await apiCall(endpoint)
      if(!current())return false
      const live=readPeriodDetail(response,tenantId,verified.snapshot.id)
      const target=verified.action==='CLOSE'?'CERRADO':'ABIERTO'
      if(live.estado!==target) {
        if(!samePeriodSnapshot(live,verified.snapshot))throw new Error('El período cambió desde la solicitud. La intención se conserva; revisa el resultado antes de continuar.')
        if(verified.action==='CLOSE') {
          const preview=readPeriodClosurePreview(await apiCall(endpoint+'/validar-cierre'),live)
          if(!current())return false
          if(!preview.puedeCerrar)throw new Error('El período no cumple las condiciones de cierre. La intención se conserva para revisar el resultado.')
        }
        if(!current())return false
        if(localStorage.getItem(key)!==raw)throw new Error('La transición pendiente cambió antes del envío. Sus datos se conservan.')
        response=await apiCall(endpoint+(verified.action==='CLOSE'?'/cerrar':'/reabrir'),{method:'POST'})
        if(!current())return false
      }
      confirmPeriodTransition(response,verified,scope)
      if(localStorage.getItem(key)!==raw)throw new Error('La transición pendiente cambió durante la confirmación. Sus datos se conservan; recarga para revisarlos.')
      localStorage.removeItem(key)
      if(localStorage.getItem(key)!==null)throw new Error('El período está confirmado, pero no se pudo retirar su transición pendiente. Verifica el resultado con los mismos datos.')
      changed();return true
    } catch(err) {
      if(current())setError(err instanceof Error?err.message:'No se pudo verificar la transición del período.')
      throw err
    } finally {
      running.delete(key);changed()
      if(epoch.current===requestedEpoch && currentScope.current===requestedScope){inflight.current=false;setBusyKey('')}
    }
  }
  const perform=async(snapshot:PeriodSnapshot,action:PeriodTransitionAction)=>{
    if(!ready || recoveryError || !allowed(action) || inflight.current)return false
    const scope={tenantId,actorId},intent=newPeriodTransitionIntent(snapshot,action,scope),key=periodTransitionIntentKey(intent),raw=JSON.stringify(intent),requestedEpoch=epoch.current,requestedScope=scopeIdentity
    try {
      if(pending.some(row=>row.intent.snapshot.id===snapshot.id)||localStorage.getItem(key)!==null)throw new Error('Ya hay una transición pendiente para este período. Verifica su resultado antes de enviar otra solicitud.')
      localStorage.setItem(key,raw)
      if(localStorage.getItem(key)!==raw)throw new Error('No se pudo guardar la transición pendiente. Reintenta sin cambiar sus datos.')
      changed();return await run(intent,raw,key)
    } catch(err) {if(epoch.current===requestedEpoch && currentScope.current===requestedScope && allowed(action))setError(err instanceof Error?err.message:'No se pudo conservar la transición pendiente.');throw err}
  }
  const retry=async(row:Pending)=>run(row.intent,row.raw,row.key)
  return {ready,pending,recoveryError,error,busyKey,activeKeys,canClose,canReopen,perform,retry}
}
