import {readBudgetList,readBudgetDetail,type BudgetRow} from './accounting-budget-read'
export type BudgetExecutionView=BudgetRow & {fuente_ejecucion:'ASIENTOS_CONFIRMADOS';fecha_calculo_ejecucion:string}
function verified(row:BudgetRow):BudgetExecutionView {
 const v=row as BudgetExecutionView
 if(v.fuente_ejecucion!=='ASIENTOS_CONFIRMADOS'||typeof v.fecha_calculo_ejecucion!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(v.fecha_calculo_ejecucion)||!Number.isFinite(Date.parse(v.fecha_calculo_ejecucion)))throw new Error('No se pudo verificar la ejecución actual del presupuesto.')
 return v
}
export function readBudgetExecutionList(response:unknown,tenantId:string):BudgetExecutionView[]{return readBudgetList(response,tenantId).map(verified)}
export function readBudgetExecutionDetail(response:unknown,tenantId:string,id:string,snapshot:BudgetRow):BudgetExecutionView {
 const row=verified(readBudgetDetail(response,tenantId,id))
 for(const key of ['id','tenant_id','centro_costo_id','cuenta_id','periodo_contable_id','monto_presupuestado','monto_comprometido','estado','notas','created_at','updated_at'] as const){if(row[key]!==snapshot[key])throw new Error('El presupuesto cambió entre consultas. Reintenta su fotografía y ejecución actuales.')}
 return row
}
