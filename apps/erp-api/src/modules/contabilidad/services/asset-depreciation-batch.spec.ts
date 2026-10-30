import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ActivosFijosService } from './activos-fijos.service';
import { confirmDepreciationBatch } from './asset-depreciation-batch';
import { batchTestId as id, batchTestKey as key, batchTestReceipt } from './asset-depreciation-batch.fixture';
const tenant=id(1),actor=id(2),request={anio:2026,mes:10};
const params={p_tenant_id:tenant,p_actor_id:actor,p_key:key,p_request:request,p_plan:[{source:{id:id(3),codigo:'AF-1'},cuota:100,acumulada:100,valor_neto:1100}]};
const clone=(v:any)=>JSON.parse(JSON.stringify(v));
const verify=(r:any)=>confirmDepreciationBatch(r,tenant,actor,key,request);
describe('Original depreciation batch receipt',()=>{
 it('accepts a complete original receipt and exact replay',()=>{const r=batchTestReceipt(params);expect(verify(r)).toBe(r);expect(verify({...r,idempotent:true}).data).toEqual(r.data);});
 it('accepts genuine empty sealed batch',()=>expect(verify(batchTestReceipt({...params,p_plan:[]})).operation.snapshot_count).toBe(0));
 const mutations:Array<[string,(v:any)=>void]>=[
  ['success',v=>v.success=false],['complete',v=>delete v.complete],['tenant',v=>v.tenant_id=id(9)],['idempotent',v=>delete v.idempotent],['cached',v=>v.cached=true],['queued',v=>v.queued=true],
  ['operation',v=>delete v.operation],['status',v=>v.operation.status='PENDING'],['type',v=>v.operation.type='OTHER'],['actor',v=>v.operation.actor_id=id(9)],['key',v=>v.operation.idempotency_key=id(9)],['operationTenant',v=>v.operation.tenant_id=id(9)],['operationId',v=>v.operation.operation_id='bad'],['operationTimestamp',v=>v.operation.created_at='bad'],
  ['request',v=>v.operation.request.mes=11],['fingerprint',v=>v.operation.request_fingerprint='a'.repeat(64)],['sourceCount',v=>v.operation.snapshot_count=2],['period',v=>v.data.periodo='2026-11'],['count',v=>v.data.activos_depreciados=2],['total',v=>v.data.total_depreciado=99],['missingRow',v=>v.data.cuotas=[]],['missingSkips',v=>delete v.data.omitidos],
  ['foreignInstallment',v=>v.data.cuotas[0].depreciacion.tenant_id=id(9)],['foreignActor',v=>v.data.cuotas[0].depreciacion.created_by=id(9)],['foreignAsset',v=>v.data.cuotas[0].depreciacion.activo_id=id(9)],['installmentPeriod',v=>v.data.cuotas[0].depreciacion.periodo='2026-11'],['installmentDate',v=>v.data.cuotas[0].depreciacion.fecha_depreciacion='2026-10-30'],['fraction',v=>v.data.cuotas[0].depreciacion.monto_depreciacion=.001],['negative',v=>v.data.cuotas[0].depreciacion.valor_neto=-1],['unknownMoney',v=>v.data.cuotas[0].depreciacion.valor_neto=null],
  ['missingOutbox',v=>delete v.data.cuotas[0].outbox],['outboxInstallment',v=>v.data.cuotas[0].outbox.depreciacionId=id(9)],['outboxKey',v=>v.data.cuotas[0].outbox.idempotencyKey='other'],['outboxEvent',v=>v.data.cuotas[0].outbox.eventId='unknown'],['cachedInstallment',v=>v.data.cuotas[0].depreciacion.cached=true],
  ['duplicateAsset',v=>{v.data.cuotas.push(clone(v.data.cuotas[0]));v.data.activos_depreciados=2;v.data.total_depreciado=200;v.operation.snapshot_count=2;}],
  ['partialWriterFailure',v=>{v.data.omitidos.push({activo_id:id(9),codigo:'AF9',motivo:'SQL failure'});v.operation.snapshot_count=2;}],
 ];
 it.each(mutations)('rejects %s before confirming',(_,mutate)=>{const r=batchTestReceipt(params);mutate(r);expect(()=>verify(r)).toThrow();});
 it('valid existing installment skip remains separate from new total',()=>{const r=batchTestReceipt({...params,p_plan:[]});r.data.omitidos=[{activo_id:id(9),codigo:'AF9',motivo:'ALREADY_REGISTERED',depreciacion_id:id(10)}] as any;r.operation.snapshot_count=1;expect(verify(r).data.total_depreciado).toBe(0);});
});
describe('Original depreciation batch orchestration',()=>{
 function harness(result:any){const rpc=jest.fn(async()=>result),period=jest.fn(),from=jest.fn();const service=Object.assign(Object.create(ActivosFijosService.prototype),{supabaseService:{getClient:()=>({rpc,from})},periodosService:{validarPeriodoAbierto:period}}) as ActivosFijosService;return {service,rpc,period,from};}
 it('replays original receipt before reading changed/closed sources',async()=>{const r=batchTestReceipt(params),h=harness({data:{...r,idempotent:true},error:null});expect(await h.service.depreciarPeriodo(tenant,actor,2026,10,key)).toEqual({...r,idempotent:true});expect(h.from).not.toHaveBeenCalled();expect(h.period).not.toHaveBeenCalled();expect(h.rpc).toHaveBeenCalledTimes(1);});
 it.each([undefined,'','key','new-key'])('invalid original key %s cannot reach DB',async k=>{const h=harness(null);await expect(h.service.depreciarPeriodo(tenant,actor,2026,10,k)).rejects.toBeInstanceOf(BadRequestException);expect(h.rpc).not.toHaveBeenCalled();});
 it.each(['40001','40P01','55P03'])('concurrency %s returns retryable conflict without inventing success',async code=>{const h=harness({data:null,error:{code,message:'private detail'}});await expect(h.service.depreciarPeriodo(tenant,actor,2026,10,key)).rejects.toBeInstanceOf(ConflictException);expect(h.from).not.toHaveBeenCalled();});
 it.each([null,undefined,{data:undefined,error:null},{data:null,error:{message:'private detail'}}])('unknown previous read %j is never an empty result',async result=>{const h=harness(result);await expect(h.service.depreciarPeriodo(tenant,actor,2026,10,key)).rejects.toBeInstanceOf(ServiceUnavailableException);expect(h.from).not.toHaveBeenCalled();});
});
