import {BadRequestException,ServiceUnavailableException} from '@nestjs/common';
import {EstadoPresupuesto} from '@erp-suite/dtos';
import {PresupuestosService} from './presupuestos.service';
const tenant='55555555-5555-4555-8555-555555555555',actor='66666666-6666-4666-8666-666666666666',id='88888888-8888-4888-8885-888888888888',key='budget-resolution-fixture';
const snapshot={id,tenant_id:tenant,centro_costo_id:'11111111-1111-4111-8111-111111111111',cuenta_id:'22222222-2222-4222-8222-222222222222',periodo_contable_id:'33333333-3333-4333-8333-333333333333',codigo:'PR-FIXTURE',nombre:'Fixture',metadata:{},monto_presupuestado:3.17,monto_ejecutado:0,monto_comprometido:0,monto_disponible:3.17,porcentaje_ejecutado:0,notas:'Antes',estado:EstadoPresupuesto.ACTIVO,created_by:actor,updated_by:actor,created_at:'2026-10-13T09:00:00Z',updated_at:'2026-10-13T09:00:00Z'};
const payload={monto_presupuestado:3.29,notas:'Después',estado:EstadoPresupuesto.ACTIVO,expected_snapshot:snapshot};
function abandoned(){return {success:true,action:'ABANDON_UPDATE',id,operation_id:'77777777-7777-4777-8777-777777777777',tenant_id:tenant,actor_id:actor,idempotency_key:key,payload:structuredClone(payload),request_fingerprint:'a'.repeat(64),idempotent:false,abandoned_at:'2026-10-13T09:01:00Z'};}
function committed(){const r:any=abandoned();delete r.abandoned_at;r.action='UPDATE';r.idempotent=true;r.record={...snapshot,monto_presupuestado:3.29,monto_disponible:3.29,notas:'Después',updated_at:'2026-10-13T09:01:00Z'};return r;}
describe('Resolución de edición presupuesto: confirmación o fence, sin edición nueva',()=>{
 let rpc:jest.Mock,service:PresupuestosService;
 beforeEach(()=>{rpc=jest.fn();service=new PresupuestosService({getClient:()=>({rpc})} as any);});
 it('abandono exige identidad/payload y envía sólo RPC de resolución',async()=>{
  rpc.mockResolvedValue({data:abandoned(),error:null});const r=await service.resolverEdicionPresupuesto(tenant,id,payload,actor,key);
  expect(r.resolution).toBe('ABANDONED');expect(r.receipt.action).toBe('ABANDON_UPDATE');
  expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('resolver_edicion_presupuesto_tx_570',{p_tenant_id:tenant,p_actor_id:actor,p_presupuesto_id:id,p_payload:payload,p_idempotency_key:key});
 });
 it('commit previo conserva el recibo original de edición',async()=>{
  rpc.mockResolvedValue({data:committed(),error:null});const r=await service.resolverEdicionPresupuesto(tenant,id,payload,actor,key);
  expect(r.resolution).toBe('COMMITTED');expect(r.receipt.data.operation.idempotent).toBe(true);expect(r.receipt.data.monto_presupuestado).toBe(3.29);
 });
 it.each(['operation_id','tenant_id','actor_id','idempotency_key','payload','request_fingerprint','idempotent','abandoned_at'])('rechaza abandono sin %s',async(field)=>{
  const r:any=abandoned();delete r[field];rpc.mockResolvedValue({data:r,error:null});await expect(service.resolverEdicionPresupuesto(tenant,id,payload,actor,key)).rejects.toThrow(ServiceUnavailableException);
 });
 it.each(['actor_id','tenant_id','idempotency_key','id'])('rechaza identidad ajena %s',async(field)=>{
  const r:any=abandoned();r[field]='99999999-9999-4999-8999-999999999999';rpc.mockResolvedValue({data:r,error:null});await expect(service.resolverEdicionPresupuesto(tenant,id,payload,actor,key)).rejects.toThrow(ServiceUnavailableException);
 });
 it.each(['cached','queued','offline','pending'])('rechaza %s',async(field)=>{
  const r:any=abandoned();r[field]=true;rpc.mockResolvedValue({data:r,error:null});await expect(service.resolverEdicionPresupuesto(tenant,id,payload,actor,key)).rejects.toThrow(ServiceUnavailableException);
 });
 it('falla cerrada ante resultado vacío, contrato incompleto o red',async()=>{
  for(const data of [null,{}, {success:true}, {...abandoned(),payload:{}}]){rpc.mockResolvedValue({data,error:null});await expect(service.resolverEdicionPresupuesto(tenant,id,payload,actor,key)).rejects.toThrow(ServiceUnavailableException);}
  rpc.mockRejectedValue(new Error('private'));await expect(service.resolverEdicionPresupuesto(tenant,id,payload,actor,key)).rejects.toThrow(ServiceUnavailableException);
 });
 it('nunca deriva una nueva clave para resolver ni acepta scope ajeno',async()=>{
  await expect(service.resolverEdicionPresupuesto(tenant,id,payload,actor,'')).rejects.toThrow(BadRequestException);
  await expect(service.resolverEdicionPresupuesto(tenant,id,{...payload,expected_snapshot:{...snapshot,tenant_id:actor}},actor,key)).rejects.toThrow(BadRequestException);
  expect(rpc).not.toHaveBeenCalled();
 });
 it('PUT no acepta un recibo de abandono como edición confirmada',async()=>{
  rpc.mockResolvedValue({data:abandoned(),error:null});await expect(service.actualizarPresupuesto(tenant,id,payload,actor,key)).rejects.toThrow(ServiceUnavailableException);
 });
});
