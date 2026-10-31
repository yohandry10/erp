import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { EstadoPresupuesto } from '@erp-suite/dtos';
import { PresupuestosService } from './presupuestos.service';
const tenant='55555555-5555-4555-8555-555555555555',actor='66666666-6666-4666-8666-666666666666',key='budget-create-fixture-key';
const payload={centro_costo_id:'11111111-1111-4111-8111-111111111111',cuenta_id:'22222222-2222-4222-8222-222222222222',periodo_contable_id:'33333333-3333-4333-8333-333333333333',monto_presupuestado:3.17,notas:'Fixture presupuesto',estado:EstadoPresupuesto.ACTIVO};
function receipt(){const id='88888888-8888-4888-8888-888888888888';return {success:true,id,action:'CREATE',operation_id:'77777777-7777-4777-8777-777777777777',tenant_id:tenant,actor_id:actor,idempotency_key:key,request_fingerprint:'a'.repeat(64),idempotent:false,payload:{...payload},record:{id,tenant_id:tenant,...payload,codigo:'PR-FIXTURE',nombre:'Presupuesto fixture',metadata:{},monto_ejecutado:0,monto_comprometido:0,monto_disponible:3.17,porcentaje_ejecutado:0,created_by:actor,updated_by:actor,created_at:'2026-10-12T08:00:00Z',updated_at:'2026-10-12T08:00:00Z'}};}
describe('Presupuesto creación: operación correlacionada y completa',()=>{
 let rpc:jest.Mock,service:PresupuestosService;
 beforeEach(()=>{rpc=jest.fn();service=new PresupuestosService({getClient:()=>({rpc})} as any);});
 it('envía actor, clave y cuerpo canónico al RPC controlado y conserva identidad del recibo',async()=>{
  const result=receipt();rpc.mockResolvedValue({data:result,error:null});const actual:any=await service.crearPresupuesto(tenant,{...payload,notas:' Fixture presupuesto '},actor,key.toUpperCase());
  expect(rpc).toHaveBeenCalledWith('crear_presupuesto_tx_570',{p_tenant_id:tenant,p_actor_id:actor,p_payload:payload,p_idempotency_key:key});expect(actual.id).toBe(result.id);expect(actual.operation.operation_id).toBe(result.operation_id);expect(actual.operation.payload).toEqual(payload);expect(actual.operation).not.toHaveProperty('record');
 });
 it('mantiene fotografía original e idempotent=true de un replay de la misma operación',async()=>{
  const result=receipt();result.idempotent=true;rpc.mockResolvedValue({data:[result],error:null});const actual:any=await service.crearPresupuesto(tenant,payload,actor,key);expect(actual.monto_presupuestado).toBe(3.17);expect(actual.operation.idempotent).toBe(true);expect(actual.operation.operation_id).toBe(result.operation_id);
 });
 it.each([
  ['envelope cached',(r:any)=>{r.cached=true;}],['record incomplete',(r:any)=>{r.record={id:r.id};}],['foreign tenant',(r:any)=>{r.record.tenant_id='99999999-9999-4999-8999-999999999999';}],['foreign actor',(r:any)=>{r.record.created_by='99999999-9999-4999-8999-999999999999';}],['wrong amount',(r:any)=>{r.record.monto_disponible=0;}],['wrong key',(r:any)=>{r.idempotency_key='another-operation-key';}],['wrong echo',(r:any)=>{r.payload.monto_presupuestado=9;}],['wrong identity',(r:any)=>{r.operation_id=null;}],['queued metadata',(r:any)=>{r.queued=true;}],
 ])('no confirma %s',async(_name,mutate:any)=>{const result=receipt();mutate(result);rpc.mockResolvedValue({data:result,error:null});await expect(service.crearPresupuesto(tenant,payload,actor,key)).rejects.toThrow(ServiceUnavailableException);});
 it.each([{value:null},{value:[]},{value:[receipt(),receipt()]}])('rechaza fuente RPC ausente o ambigua %p',async({value:data})=>{rpc.mockResolvedValue({data,error:null});await expect(service.crearPresupuesto(tenant,payload,actor,key)).rejects.toThrow(ServiceUnavailableException);});
 it('trata infraestructura como resultado incierto sin exponer detalle del SDK',async()=>{
  rpc.mockResolvedValue({data:null,error:{code:'42883',message:'PRIVATE_BACKEND_DETAIL'}});await expect(service.crearPresupuesto(tenant,payload,actor,key)).rejects.toThrow(ServiceUnavailableException);await expect(service.crearPresupuesto(tenant,payload,actor,key)).rejects.not.toThrow('PRIVATE_BACKEND_DETAIL');rpc.mockRejectedValue(new Error('PRIVATE_BACKEND_DETAIL'));await expect(service.crearPresupuesto(tenant,payload,actor,key)).rejects.toThrow(ServiceUnavailableException);
 });
 it('rechaza precisión, actor y clave inválidos antes de consultar RPC',async()=>{
  await expect(service.crearPresupuesto(tenant,{...payload,monto_presupuestado:3.171},actor,key)).rejects.toThrow(BadRequestException);await expect(service.crearPresupuesto(tenant,payload,'foreign-id',key)).rejects.toThrow(BadRequestException);await expect(service.crearPresupuesto(tenant,payload,actor,' ')).rejects.toThrow(BadRequestException);expect(rpc).not.toHaveBeenCalled();
 });
});