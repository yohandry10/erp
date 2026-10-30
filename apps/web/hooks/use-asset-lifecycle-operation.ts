'use client'

import { useEffect, useRef, useState } from 'react'
import { AssetLifecycleAction, AssetLifecycleIntent, assetLifecyclePayload, currentAssetLifecycleActor, loadAssetLifecycle, newAssetLifecycleIntent, preserveAssetLifecycle, retireAssetLifecycle, withAssetLifecycleLock } from '@/lib/contabilidad/asset-lifecycle-operation'

interface Options {
 tenantId:string;actorId:string;country:{paisCodigo:string;moneda:string};calendarReady:boolean
 updateAllowed:boolean;retireAllowed:boolean
 put:(endpoint:string,body:any,options?:any)=>Promise<any>
 post:(endpoint:string,body:any,options?:any)=>Promise<any>
}
export function useAssetLifecycleOperation(options:Options){
 const scope={tenantId:options.tenantId,actorId:options.actorId},marker=`${scope.tenantId}:${scope.actorId}`
 const [pending,setPending]=useState<AssetLifecycleIntent|null>(null),[storageReady,setStorageReady]=useState(false),[storageError,setStorageError]=useState<string|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
 const alive=useRef(true),writing=useRef(false),original=useRef<AssetLifecycleIntent|null>(null),current=useRef(options)
 current.current=options
 const restore=(saved:AssetLifecycleIntent|null)=>{original.current=saved;setPending(saved)}
 const allowed=(action:AssetLifecycleAction)=>current.current.calendarReady&&(action==='UPDATE'?current.current.updateAllowed:current.current.retireAllowed)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{
  const recover=()=>{
   if(!currentAssetLifecycleActor(scope)||!options.updateAllowed&&!options.retireAllowed)return
   try{
    const saved=loadAssetLifecycle(scope)
    if(saved&&!(saved.action==='UPDATE'?options.updateAllowed:options.retireAllowed)){restore(null);setStorageReady(false);setStorageError('Una operación original requiere su permiso anterior. Se conserva sin exponer sus datos ni permitir otra operación.');return}
    restore(saved);setStorageReady(true);setStorageError(null)
   }catch{setStorageReady(false);setStorageError('No se pudo recuperar la operación pendiente del activo. Sus datos se conservan y otra operación permanece bloqueada.')}
  }
  recover()
  const changed=(event:StorageEvent)=>{if(!writing.current&&(event.key===null||event.key.startsWith('erp.accounting.asset-lifecycle.')&&event.key.includes(marker)))recover()}
  window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed)
 },[marker,options.updateAllowed,options.retireAllowed])
 const execute=async(action:AssetLifecycleAction,asset:any,payload:any)=>{
  if(writing.current||!storageReady||storageError||!allowed(action)||!currentAssetLifecycleActor(scope))return
  writing.current=true;setBusy(true);setError(null)
  try{
   return await withAssetLifecycleLock(scope,async()=>{
    if(!alive.current||!allowed(action)||!currentAssetLifecycleActor(scope))return
    const existing=loadAssetLifecycle(scope),known=original.current
    if(existing&&(!known||JSON.stringify(existing)!==JSON.stringify(known))){restore(existing);throw new Error('Se recuperó una operación original pendiente. Revise sus datos y reintente manualmente.')}
    if(known&&(known.action!==action||known.assetId!==asset.id))throw new Error('Hay otra operación original pendiente. Se conserva sin reemplazarla.')
    const intent=known||newAssetLifecycleIntent(action,asset,payload,scope,current.current.country)
    if(intent.source.paisCodigo!==current.current.country.paisCodigo||intent.source.moneda!==current.current.country.moneda)throw new Error('El país o moneda no coincide con la operación original. Se conserva sin enviar.')
    restore(intent);preserveAssetLifecycle(intent)
    const endpoint=`/api/contabilidad/activos-fijos/${intent.assetId}${action==='RETIRE'?'/baja':''}`,send=action==='RETIRE'?current.current.post:current.current.put
    const response=await send(endpoint,assetLifecyclePayload(intent),{headers:{'Idempotency-Key':intent.idempotencyKey}})
    if(!alive.current||!allowed(action)||!currentAssetLifecycleActor(scope)||intent.source.paisCodigo!==current.current.country.paisCodigo||intent.source.moneda!==current.current.country.moneda)return
    const receipt=retireAssetLifecycle(intent,response);restore(null);return receipt
   })
  }catch(ex:any){if(alive.current&&currentAssetLifecycleActor(scope))setError(ex.message||'No se pudo confirmar la operación original del activo')}
  finally{writing.current=false;if(alive.current)setBusy(false)}
 }
 const retry=()=>{
  const saved=original.current
  if(!saved)return Promise.resolve(undefined)
  const request=assetLifecyclePayload(saved);return execute(saved.action,request.expected,request.original)
 }
 return {pending,storageReady,storageError,error,busy,execute,retry}
}
