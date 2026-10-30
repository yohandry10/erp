// Positive isolated acknowledgement; this fixture never reaches a fiscal writer.
export function cpeCreatedFixture(payload: any) {
 return {success:true,data:{id:'c9ec0000-0000-4000-8000-000000000001',
  documento_id:'c9ec0000-0000-4000-8000-000000000002',serie:payload.serie||'FE01',numero:1,
  estado:'BORRADOR',moneda:payload.moneda,fecha_emision:payload.fechaEmision,
  tipo_documento:payload.tipoComprobante,documento_receptor:payload.clienteRuc,
  total:payload.total,total_igv:payload.totalIgv,items:payload.items,
 }}
}
