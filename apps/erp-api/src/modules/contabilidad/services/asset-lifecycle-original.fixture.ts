import { createHash } from 'crypto';
import { revaluationJsonbText } from './revaluation-registration-receipt';
export const lifecycleId=(n:number)=>`ac570001-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const lifecycleScope={tenant:lifecycleId(1),actor:lifecycleId(2),assetId:lifecycleId(3),key:lifecycleId(4)};
export function lifecycleTestRequest(action:'UPDATE'|'RETIRE',sale=false){
 const s=lifecycleScope;
 return {expected:{id:s.assetId,tenant_id:s.tenant,codigo:'AF-ORIGINAL',nombre:'Original asset',descripcion:'Original description',fecha_adquisicion:'2026-01-01',fecha_inicio_depreciacion:'2026-01-01',valor_adquisicion:1200,valor_residual:0,vida_util_meses:12,depreciacion_acumulada:0,centro_costo_id:null,situacion:'ACTIVO',updated_at:'2026-10-01T00:00:00Z',asiento_baja_id:null,estado:'ACTIVO',activo:true,created_at:'2026-01-01T00:00:00Z',created_by:s.actor},
 original:action==='UPDATE'?{nombre:'Edited asset',descripcion:'Edited description',vida_util_meses:24,valor_residual:100}:{fecha:'2026-10-15',tipo:sale?'VENTA':'BAJA',motivo:'Original retirement',...(sale?{valor_venta:100}:{})}};
}
export function lifecycleTestReceipt(action:'UPDATE'|'RETIRE',source:any=lifecycleTestRequest(action)){
 const s=lifecycleScope,request=JSON.parse(JSON.stringify(source)),e=request.expected,p=request.original;
 const data:any={...e,metodo_depreciacion:'LINEAL',fecha_baja:null,valor_venta:null,motivo_baja:null,valor_neto:e.valor_adquisicion-e.depreciacion_acumulada,updated_at:'2026-10-15T06:00:00Z'};
 let journal:any=null;
 if(action==='UPDATE')Object.assign(data,p);
 else{
  Object.assign(data,{situacion:p.tipo==='VENTA'?'VENDIDO':'BAJA',fecha_baja:p.fecha,valor_venta:p.valor_venta??null,motivo_baja:p.motivo??null,asiento_baja_id:lifecycleId(5)});
  const detail=(n:number,debe:number,haber:number)=>({id:lifecycleId(n),tenant_id:s.tenant,asiento_id:lifecycleId(5),cuenta_id:lifecycleId(n+100),debe,haber});
  const lines=[];if(e.depreciacion_acumulada>0)lines.push(detail(10,e.depreciacion_acumulada,0));if(data.valor_neto>0)lines.push(detail(11,data.valor_neto,0));lines.push(detail(12,0,e.valor_adquisicion));
  if(p.tipo==='VENTA')lines.push(detail(13,p.valor_venta,0),detail(14,0,p.valor_venta));
  journal={id:lifecycleId(5),tenant_id:s.tenant,numero_asiento:42,fecha:p.fecha,estado:'CONFIRMADO',origen:'BAJA_ACTIVO_FIJO',created_by:s.actor,confirmado_por:s.actor,created_at:'2026-10-15T06:00:00Z',confirmado_en:'2026-10-15T06:00:00Z',source_event_id:lifecycleId(6),detalles:lines};
 }
 return {success:true,complete:true,tenant_id:s.tenant,idempotent:false,data,journal,operation:{status:'COMMITTED',type:'ACCOUNTING_ASSET_'+action,operation_id:lifecycleId(7),asset_id:s.assetId,tenant_id:s.tenant,actor_id:s.actor,idempotency_key:s.key,request,request_fingerprint:createHash('sha256').update(revaluationJsonbText(request)).digest('hex'),created_at:'2026-10-15T06:00:00Z'}};
}
