import { readBudgetAlerts } from './accounting-budget-read'
export type BudgetAlertScope = {
  tenant_id: string; seleccion: 'EXPLICITO'|'ULTIMO_ABIERTO';
  periodo: {id:string;anio:number;mes:number;estado:'ABIERTO'|'CERRADO'|'BLOQUEADO'}|null;
  presupuestos_evaluados: number;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v)
function invalid():never{throw new Error('No se pudo confirmar el período y alcance de las alertas. Reintenta la consulta con conexión.')}
export function readScopedBudgetAlerts(response:unknown,tenantId:string,selectedId?:string):any {
  const report=readBudgetAlerts(response,tenantId),scope=report.consulta as BudgetAlertScope|undefined;
  if(!scope||scope.tenant_id!==tenantId||scope.seleccion!==(selectedId?'EXPLICITO':'ULTIMO_ABIERTO')||!Number.isSafeInteger(scope.presupuestos_evaluados)||scope.presupuestos_evaluados<0||scope.presupuestos_evaluados<report.total_alertas)invalid()
  if(scope.periodo===null){if(selectedId||scope.presupuestos_evaluados!==0||report.total_alertas!==0)invalid();return report}
  const p=scope.periodo;
  if(!p||!uuid(p.id)||(selectedId&&p.id!==selectedId)||!Number.isInteger(p.anio)||p.anio<1900||p.anio>9999||!Number.isInteger(p.mes)||p.mes<1||p.mes>12||!['ABIERTO','CERRADO','BLOQUEADO'].includes(p.estado)||(!selectedId&&p.estado!=='ABIERTO'))invalid()
  for(const a of [...report.sobregiros.alertas,...report.advertencias.alertas])if(a.periodo.id!==p.id||a.periodo.anio!==p.anio||a.periodo.mes!==p.mes)invalid()
  return report
}
