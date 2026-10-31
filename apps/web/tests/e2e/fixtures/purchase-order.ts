// Explicit positive receipt used only by isolated UI tests; no persistence claim.
export function purchaseOrderCreatedFixture(payload: any, user: {id:string;tenant_id:string}, id: string, taxRate: number) {
  const date=new Date(payload.fecha_orden+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+30)
  const delivery=payload.fecha_entrega_esperada||date.toISOString().slice(0,10)
  const detalles=payload.detalles.map((row:any,index:number)=>({...row,
    id:`f0ed0000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
    tenant_id:user.tenant_id,orden_id:id,numero:index+1,moneda:payload.moneda,
    cantidad_recibida:0,cantidad_pendiente:row.cantidad,
    subtotal:Math.round(row.cantidad*row.precio_unitario*100)/100,
    metadata:{afectacion_igv:'10',tax_rate:taxRate},
  }))
  const subtotal=detalles.reduce((sum:number,row:any)=>sum+row.subtotal,0)
  const igv=Math.round(subtotal*taxRate*100)/100
  return {success:true,data:{...payload,id,tenant_id:user.tenant_id,numero_orden:payload.numero,
    estado:'BORRADOR',created_by:user.id,updated_by:user.id,cotizacion_id:null,
    fecha_entrega_esperada:delivery,fecha_entrega:delivery,
    condiciones_pago:payload.condiciones_pago||(payload.dias_credito>0?'CREDITO':'CONTADO'),
    almacen_destino_id:payload.almacen_destino_id||null,observaciones:payload.observaciones||null,
    idempotent:false,created_at:'2026-10-15T12:00:00Z',updated_at:'2026-10-15T12:00:00Z',
    metadata:{idempotency_key:payload.idempotency_key,revision:1,request_fingerprint:'a'.repeat(64)},
    subtotal,igv,total:Math.round((subtotal+igv)*100)/100,detalles,
    items:detalles.map((row:any)=>({...row,producto_nombre:row.descripcion})),
  }}
}
