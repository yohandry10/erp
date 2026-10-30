// Positive isolated order snapshot, scoped to the actor whose page is tested.
export function salesOrderFixture(user:{tenant_id:string},row:any) {
 return {success:true,data:{tenant_id:user.tenant_id,cliente_id:'5a1e0000-0000-4000-8000-000000000001',
  moneda:'PEN',factura_id:null,...row,detalle:row.detalle.map((line:any,index:number)=>({
   tenant_id:user.tenant_id,pedido_id:row.id,producto_id:`5a1e0000-0000-4000-8000-${String(index+2).padStart(12,'0')}`,
   cantidad_facturada:0,...line,
  }))}}
}
