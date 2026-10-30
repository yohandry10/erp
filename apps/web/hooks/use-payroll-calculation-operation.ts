'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { customAuth } from '@/lib/auth-service'
import { payrollCalculationIntentKey,readPayrollCalculationIntent,newPayrollCalculationIntent,confirmPayrollCalculationOperation,payrollCalculationArchiveKey,samePayrollCalculationReceipt,type PayrollCalculationScope,type PayrollCalculationIntent } from '@/lib/rrhh/payroll-calculation-operation'
const running=new Set<string>()
export function usePayrollCalculationOperation(scope: PayrollCalculationScope,allowed: boolean,scopeReady: boolean) {
  const identity=`${scope.tenantId}:${scope.actorId}`,active=useRef(identity);active.current=identity
  const permission=useRef(allowed);permission.current=allowed
  const epoch=useRef(0),inflight=useRef(false),pendingBytes=useRef<string|null>(null)
  const [readyScope,setReadyScope]=useState(''),[pending,setPending]=useState<PayrollCalculationIntent|null>(null),[recoveryError,setRecoveryError]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const {apiCall}=useApi<unknown>({requireLive:true,retries:0,timeoutMs:30000,showErrorToast:false,throwOnError:true})
  const recover=useCallback(()=>{
    if (inflight.current) return
    setReadyScope('');setPending(null);setRecoveryError('');setError('');pendingBytes.current=null
    if (!scopeReady || !allowed) return
    try { const raw=localStorage.getItem(payrollCalculationIntentKey(scope));setPending(readPayrollCalculationIntent(raw,scope));pendingBytes.current=raw }
    catch (e) {setRecoveryError(e instanceof Error ? e.message : 'No se pudo recuperar la solicitud de cálculo. Sus datos se conservan.')}
    setReadyScope(identity)
  // The scope consists of the two stable identifiers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[identity,scopeReady,allowed])
  useEffect(()=>{
    epoch.current++;inflight.current=false;setBusy(false);recover()
    window.addEventListener('storage',recover);window.addEventListener('focus',recover)
    return ()=>{epoch.current++;window.removeEventListener('storage',recover);window.removeEventListener('focus',recover)}
  },[recover])
  const execute=async(resolve: boolean,body?: any,header?: any,employees?: any[])=>{
    if (readyScope !== identity || !allowed || recoveryError || inflight.current) return null
    const key=payrollCalculationIntentKey(scope);if (running.has(key)) return null
    const run=epoch.current,current=()=>run===epoch.current && active.current===identity && permission.current
    const actor=async()=>{const user=(await customAuth.getRequestSession()).session?.user;if (!current() || !user || user.id !== scope.actorId || user.tenant_id !== scope.tenantId) throw new Error('La sesión cambió. La solicitud de cálculo se conserva.')}
    inflight.current=true;running.add(key);setBusy(true);setError('')
    try {
      if (!navigator.locks?.request) throw new Error('No se pudo bloquear la solicitud pendiente. Sus datos se conservan; reintente con conexión.')
      return await navigator.locks.request(key,{mode:'exclusive',ifAvailable:true},async lock=>{
        if (!lock) throw new Error('La solicitud se está gestionando en otra ventana. Sus datos se conservan.')
        await actor();if (!current()) return null
        const existing=localStorage.getItem(key),recovered=readPayrollCalculationIntent(existing,scope)
        if (existing !== pendingBytes.current) throw new Error('La solicitud pendiente cambió. Recupere sus datos antes de continuar.')
        if (resolve && !recovered) throw new Error('Recupere la solicitud pendiente antes de conciliarla.')
        if (recovered && body && recovered.body !== JSON.stringify(body)) throw new Error('Confirme primero la solicitud original conservada.')
        const intent=recovered || newPayrollCalculationIntent(body,scope,header,employees!),raw=existing || JSON.stringify(intent)
        if (existing === null) localStorage.setItem(key,raw)
        if (localStorage.getItem(key) !== raw) throw new Error('No se pudo conservar la solicitud. Reintente sin cambiar sus datos.')
        pendingBytes.current=raw;setPending(intent)
        await actor();if (!current()) return null
        const response=await apiCall(`/rrhh/planillas/${intent.payroll.id}/calcular-personalizada${resolve?'/resolver':''}`,{method:'POST',body:intent.body,headers:{'Content-Type':'application/json','idempotency-key':intent.idempotencyKey}})
        if (!current()) return null
        await actor();if (!current()) return null
        const confirmed=confirmPayrollCalculationOperation(response,intent)
        if (!resolve && confirmed.action !== 'CALCULATE') throw new Error('La respuesta no confirma el cálculo. La solicitud original se conserva para conciliarla.')
        if (localStorage.getItem(key) !== raw) throw new Error('La solicitud cambió durante la confirmación. Se conserva para conciliarla.')
        const archiveKey=payrollCalculationArchiveKey(intent),archive=JSON.stringify({version:1,intent,receipt:confirmed.receipt}),previous=localStorage.getItem(archiveKey)
        if (previous !== null) {
          const saved=JSON.parse(previous);confirmPayrollCalculationOperation(saved.receipt,intent)
          if (saved.version !== 1 || JSON.stringify(saved.intent) !== JSON.stringify(intent) || !samePayrollCalculationReceipt(saved.receipt,confirmed.receipt)) throw new Error('El archivo del recibo no coincide. La solicitud pendiente se conserva.')
        } else localStorage.setItem(archiveKey,archive)
        if (localStorage.getItem(archiveKey) !== (previous ?? archive)) throw new Error('No se pudo conservar el recibo. La solicitud pendiente se conserva.')
        if (!current() || localStorage.getItem(key) !== raw) return null
        localStorage.removeItem(key)
        if (localStorage.getItem(key) !== null) throw new Error('El resultado está confirmado, pero no se pudo retirar el pendiente. Reintente con los mismos datos.')
        pendingBytes.current=null;setPending(null);return confirmed.action
      })
    } catch (cause) {if (current()) setError(cause instanceof Error ? cause.message : 'No se pudo confirmar el cálculo. La solicitud se conserva.');return null}
    finally {running.delete(key);if (current()) {inflight.current=false;setBusy(false)}}
  }
  return {ready:readyScope===identity,pending:pending?.tenantId===scope.tenantId && pending.actorId===scope.actorId ? pending:null,recoveryError,error,busy,
    recover,invalidate:()=>{epoch.current++;inflight.current=false;setBusy(false)},perform:(body?:any,header?:any,employees?:any[])=>execute(false,body,header,employees),resolve:()=>execute(true)}
}
export type PayrollCalculationOperation = ReturnType<typeof usePayrollCalculationOperation>
