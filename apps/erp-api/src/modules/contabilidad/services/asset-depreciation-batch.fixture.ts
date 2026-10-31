import { createHash } from 'crypto';
import { revaluationJsonbText } from './revaluation-registration-receipt';
export const batchTestKey = 'bc570001-0000-4000-8000-000000000001';
export const batchTestId = (n: number) => `bc570002-0000-4000-8000-${String(n).padStart(12,'0')}`;
/** Test-only committed original receipt, independent of production validators. */
export function batchTestReceipt(p: any) {
  const request={...p.p_request}, plan=p.p_plan||[],tenant=p.p_tenant_id,actor=p.p_actor_id;
  const cuotas=plan.filter(x=>x.cuota>0).map((x,i)=>({activo_id:x.source.id,codigo:x.source.codigo,
    depreciacion:{id:batchTestId(i+10001),tenant_id:tenant,activo_id:x.source.id,periodo:`${request.anio}-${String(request.mes).padStart(2,'0')}`,
      fecha_depreciacion:new Date(Date.UTC(request.anio,request.mes,0)).toISOString().slice(0,10),created_by:actor,monto_depreciacion:x.cuota,depreciacion_acumulada:x.acumulada,valor_neto:x.valor_neto},
    outbox:{depreciacionId:batchTestId(i+10001),eventId:batchTestId(i+20001),outboxId:batchTestId(i+30001),idempotencyKey:`depreciacion.generada:${tenant}:${batchTestId(i+10001)}`}}));
  return {success:true,complete:true,tenant_id:tenant,idempotent:false,
    data:{periodo:`${request.anio}-${String(request.mes).padStart(2,'0')}`,activos_depreciados:cuotas.length,total_depreciado:cuotas.reduce((a,x)=>a+Math.round(x.depreciacion.monto_depreciacion*100),0)/100,cuotas,
      omitidos:plan.filter(x=>x.cuota===0).map(x=>({activo_id:x.source.id,codigo:x.source.codigo,motivo:'OUTSIDE_USEFUL_LIFE_OR_RESIDUAL'}))},
    operation:{status:'COMMITTED',type:'ACCOUNTING_ASSET_DEPRECIATION_BATCH',operation_id:batchTestId(40001),tenant_id:tenant,actor_id:actor,idempotency_key:p.p_key,request,
      request_fingerprint:createHash('sha256').update(revaluationJsonbText(request)).digest('hex'),snapshot_count:plan.length,created_at:'2026-10-15T06:00:00Z'}};
}
