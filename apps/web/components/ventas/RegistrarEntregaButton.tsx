"use client"
import {useState} from 'react'
import {useAuth} from '@/contexts/AuthContext'
import {usePermission} from '@/hooks/use-permission'
import {useSalesDeliveryOperation} from '@/hooks/use-sales-delivery-operation'
import {Button} from '@/components/ui/button'
export default function RegistrarEntregaButton({order,onSuccess}:{order:Record<string,any>;onSuccess:()=>void}){
 const {session,loading:authLoading}=useAuth(),scope={tenantId:session?.user?.tenant_id||'',actorId:session?.user?.id||'',orderId:order.id||''}
 const permission=usePermission('inventario','despachar','logistica')
 const scopeReady=!authLoading&&!!scope.tenantId&&!!scope.actorId&&!!scope.orderId&&order.tenant_id===scope.tenantId
 const allowed=scopeReady&&!permission.loading&&permission.hasPermission,operation=useSalesDeliveryOperation(scope,allowed,scopeReady)
 const [notes,setNotes]=useState('')
 const eligible=['DESPACHO_PARCIAL','LISTO_FACTURAR','FACTURADO'].includes(order.estado)&&order.tracking_estado!=='ENTREGADO'
 const submit=async()=>{
  const result=operation.pending?await operation.perform():await operation.perform({success:true,data:order},notes.trim())
  if(result)onSuccess()
 }
 if(!scopeReady||permission.loading||!allowed)return null
 return <section className="rounded-xl border border-border bg-card p-4" data-testid="sales-delivery-operation">
  <h2 className="font-semibold">Entrega del pedido</h2>
  <p>Estado de seguimiento: {order.tracking_estado||'Sin seguimiento registrado'}</p>
  {(operation.error||operation.recoveryError)&&<p role="alert" className="mt-3 text-destructive">{operation.error||operation.recoveryError}</p>}
  {operation.pending?<div data-testid="sales-delivery-pending" className="mt-3 rounded-lg border border-primary/30 p-4">
   <h3 className="font-semibold">Entrega pendiente de confirmar</h3>
   <p>{operation.pending.context.number} · {operation.pending.context.currency} {operation.pending.context.total.toFixed(2)}</p>
   <ul>{operation.pending.context.lines.map(line=><li key={line.id}>{line.description}: despachado {line.dispatched} de {line.quantity}</li>)}</ul>
   <p>{JSON.parse(operation.pending.body).notas}</p>
   <p>Los datos se conservan. Reintenta con conexión para confirmar el resultado.</p>
   <Button className="mt-3" disabled={operation.busy||!operation.ready||!!operation.recoveryError} onClick={()=>void submit()}>Reintentar entrega pendiente</Button>
  </div>:eligible?<div className="mt-3 space-y-3">
   <p>Registra la entrega de las unidades despachadas de este pedido. Su factura y despacho se conservan.</p>
   <label htmlFor="sales-delivery-notes" className="block">Observaciones de entrega</label>
   <textarea id="sales-delivery-notes" className="w-full rounded-lg border border-border bg-card p-3" value={notes} onChange={e=>setNotes(e.target.value)} disabled={operation.busy||!operation.ready||!!operation.recoveryError} maxLength={10000}/>
   <Button disabled={operation.busy||!operation.ready||!!operation.recoveryError} onClick={()=>void submit()}>Registrar entrega</Button>
  </div>:<p className="mt-3">{order.tracking_estado==='ENTREGADO'?'La entrega está registrada.':'El pedido aún no tiene una entrega disponible para registrar.'}</p>}
 </section>
}
