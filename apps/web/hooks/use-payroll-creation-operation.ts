'use client'
import { useCallback,useEffect,useRef,useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { customAuth } from '@/lib/auth-service'
import { payrollCreationIntentKey,readPayrollCreationIntent,newPayrollCreationIntent,confirmPayrollCreationOperation,confirmPayrollCreationChild,payrollCreationArchiveKey,samePayrollCreationReceipt,type PayrollCreationIntent } from '@/lib/rrhh/payroll-creation-operation'
import { type PayrollCalculationScope } from '@/lib/rrhh/payroll-calculation-operation'
const running=new Set<string>()
export function usePayrollCreationOperation(scope:PayrollCalculationScope,allowed:boolean,scopeReady:boolean) {
  const identity=`${scope.tenantId}:${scope.actorId}`,active=useRef(identity);active.current=identity
  const permission=useRef(allowed);permission.current=allowed
  const epoch=useRef(0),inflight=useRef(false),pendingBytes=useRef<string|null>(null)
  const [readyScope,setReadyScope]=useState(''),[pending,setPending]=useState<PayrollCreationIntent|null>(null),[recoveryError,setRecoveryError]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const {apiCall}=useApi<unknown>({requireLive:true,retries:0,timeoutMs:30000,showErrorToast:false,throwOnError:true})
  const recover=useCallback(()=>{
    if (inflight.current)return
    setReadyScope('');setPending(null);setRecoveryError('');setError('');pendingBytes.current=null
    if (!scopeReady || !allowed)return
    try {const raw=localStorage.getItem(payrollCreationIntentKey(scope));setPending(readPayrollCreationIntent(raw,scope));pendingBytes.current=raw}
    catch(e){setRecoveryError(e instanceof Error?e.message:'No se pudo recuperar la solicitud. Sus datos se conservan.')}
    setReadyScope(identity)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[identity,scopeReady,allowed])
  useEffect(()=>{
    epoch.current++;inflight.current=false;setBusy(false);recover()
    window.addEventListener('storage',recover);window.addEventListener('focus',recover)
    return()=>{epoch.current++;window.removeEventListener('storage',recover);window.removeEventListener('focus',recover)}
  },[recover])
  const execute=async(resolve:boolean,input?:any,employees?:any[])=>{
    if (readyScope!==identity || !allowed || recoveryError || inflight.current)return null
    const key=payrollCreationIntentKey(scope);if (running.has(key))return null
    const run=epoch.current,current=()=>run===epoch.current && active.current===identity && permission.current
    const actor=async()=>{const user=(await customAuth.getRequestSession()).session?.user;if (!current() || !user || user.id!==scope.actorId || user.tenant_id!==scope.tenantId)throw new Error('La sesión cambió. La solicitud de alta y cálculo se conserva.')}
    inflight.current=true;running.add(key);setBusy(true);setError('')
    try {
      if (!navigator.locks?.request)throw new Error('No se pudo bloquear la solicitud. Reintente con conexión; sus datos se conservan.')
      return await navigator.locks.request(key,{mode:'exclusive',ifAvailable:true},async lock=>{
        if (!lock)throw new Error('La solicitud se está gestionando en otra ventana. Sus datos se conservan.')
        await actor();if (!current())return null
        const existing=localStorage.getItem(key),recovered=readPayrollCreationIntent(existing,scope)
        if (existing!==pendingBytes.current)throw new Error('La solicitud conservada cambió. Recupere sus datos antes de continuar.')
        if (resolve && !recovered)throw new Error('Recupere la solicitud pendiente antes de conciliarla.')
        if (recovered && input)throw new Error('Confirme primero la solicitud original conservada.')
        let intent=recovered || newPayrollCreationIntent(input,scope,employees!),raw=existing || JSON.stringify(intent)
        if (existing===null)localStorage.setItem(key,raw)
        if (localStorage.getItem(key)!==raw)throw new Error('No se pudo conservar la solicitud. Reintente sin cambiar sus datos.')
        pendingBytes.current=raw;setPending(intent)
        const archive=(stage:'creation'|'resolved',receipt:any,child:boolean)=>{
          const archiveKey=payrollCreationArchiveKey(intent,stage),value=JSON.stringify({version:1,intent,receipt}),previous=localStorage.getItem(archiveKey)
          if (previous!==null) {
            const saved=JSON.parse(previous);readPayrollCreationIntent(JSON.stringify(saved.intent),scope)
            if (child)confirmPayrollCreationChild(saved.receipt,intent);else confirmPayrollCreationOperation(saved.receipt,intent)
            if (saved.version!==1 || JSON.stringify(saved.intent)!==JSON.stringify(intent) || !samePayrollCreationReceipt(saved.receipt,receipt))throw new Error('El archivo del recibo no coincide. La solicitud original se conserva.')
          } else localStorage.setItem(archiveKey,value)
          if (localStorage.getItem(archiveKey)!==(previous ?? value))throw new Error('No se pudo conservar el recibo. La solicitud pendiente se conserva.')
        }
        const retire=()=>{
          if (!current() || localStorage.getItem(key)!==raw)throw new Error('La solicitud cambió durante la confirmación. Se conserva para conciliar.')
          localStorage.removeItem(key);if (localStorage.getItem(key)!==null)throw new Error('No se pudo retirar la solicitud confirmada. Se conserva para conciliar.')
          pendingBytes.current=null;setPending(null);setError('')
        }
        await actor();if (!current())return null
        if (!intent.parentReceipt) {
          const response=await apiCall(`/rrhh/planillas/crear-con-calculo${resolve?'/resolver':''}`,{method:'POST',body:intent.body,headers:{'Content-Type':'application/json'}})
          if (!current())return null;await actor();if (!current())return null
          const parent=confirmPayrollCreationOperation(response,intent)
          if (!resolve && parent.action!=='CREATE_WITH_CALCULATION')throw new Error('La respuesta no confirma el alta original. Se conserva para conciliar.')
          if (localStorage.getItem(key)!==raw)throw new Error('La solicitud cambió durante la confirmación. Se conserva para conciliar.')
          archive(parent.action==='ABANDON_CREATION'?'resolved':'creation',parent.receipt,false)
          if (parent.action==='ABANDON_CREATION') {retire();return {action:'ABANDON_CREATION' as const,receipt:parent.receipt}}
          intent=readPayrollCreationIntent(JSON.stringify({...intent,parentReceipt:parent.receipt}),scope)!
          const next=JSON.stringify(intent);localStorage.setItem(key,next)
          if (localStorage.getItem(key)!==next)throw new Error('No se pudo conservar el alta confirmada. El cálculo no se envió; concilie la solicitud original.')
          raw=next;pendingBytes.current=raw;setPending(intent)
          if (resolve)return {action:'CREATION_CONFIRMED' as const,receipt:parent.receipt}
        }
        await actor();if (!current())return null
        const response=await apiCall(`/rrhh/planillas/${intent.parentReceipt.id}/calcular-personalizada${resolve?'/resolver':''}`,{method:'POST',body:intent.childBody,headers:{'Content-Type':'application/json','idempotency-key':intent.calculationKey}})
        if (!current())return null;await actor();if (!current())return null
        const child=confirmPayrollCreationChild(response,intent)
        if (!resolve && child.action!=='CALCULATE')throw new Error('La respuesta no confirma el cálculo original. Se conserva para conciliar.')
        if (localStorage.getItem(key)!==raw)throw new Error('La solicitud cambió durante la confirmación. Se conserva para conciliar.')
        archive('resolved',child.receipt,true);retire();return child
      })
    } catch(e){if (current())setError(e instanceof Error?e.message:'No se confirmó la solicitud. Sus datos se conservan.');return null}
    finally {running.delete(key);if (current()){inflight.current=false;setBusy(false)}}
  }
  return {ready:readyScope===identity,pending:pending?.tenantId===scope.tenantId && pending.actorId===scope.actorId?pending:null,recoveryError,error,busy,recover,
    invalidate:()=>{epoch.current++;inflight.current=false;setBusy(false)},perform:(input?:any,employees?:any[])=>execute(false,input,employees),resolve:()=>execute(true)}
}
