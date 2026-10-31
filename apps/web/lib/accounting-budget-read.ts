export type BudgetRow = {
  id: string; tenant_id: string; centro_costo_id: string; cuenta_id: string; periodo_contable_id: string;
  monto_presupuestado: number; monto_ejecutado: number; monto_comprometido: number; monto_disponible: number;
  porcentaje_ejecutado: number; estado: 'ACTIVO'|'BLOQUEADO'|'CERRADO'; notas: string|null;
  created_at: string; updated_at: string; centro_costo?: BudgetCatalogRow; cuenta?: BudgetCatalogRow;
  periodo?: {id:string;anio:number;mes:number;estado:string}
}
export type BudgetCatalogRow = { id: string; codigo: string; nombre: string; [key: string]: any }
const fail = (): never => { throw new Error('No se pudo consultar el presupuesto completo. Reintenta con conexión antes de interpretar importes o alertas.') }
const object = (v: unknown): Record<string,any> => { if (!v || typeof v!=='object' || Array.isArray(v)) return fail(); return v as Record<string,any> }
const live = (v: unknown) => { const row=object(v);for(const flag of ['cached','queued','offline','pending'])if(row[flag]!==undefined && row[flag]!==false)return fail();return row }
const uuid = (v: unknown): string => { if(typeof v!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v))return fail();return v }
const text = (v: unknown): string => { if(typeof v!=='string' || !v.trim())return fail();return v }
const number = (v: unknown, nonnegative=false): number => { if(typeof v!=='number' || !Number.isFinite(v) || !Number.isSafeInteger(Math.round(v*100)) || (nonnegative && v<0))return fail();return v }
const money = (v: unknown, nonnegative=false): number => { const n=number(v,nonnegative);if(Math.abs(n*100-Math.round(n*100))>0.00001)return fail();return n }
const count = (v: unknown): number => { const n=number(v,true);if(!Number.isSafeInteger(n))return fail();return n }
const near = (a:number,b:number,tolerance=.00001) => { if(Math.abs(a-b)>tolerance)return fail() }
const stamp = (v:unknown) => { if(typeof v!=='string' || !/^\d{4}-\d{2}-\d{2}T/.test(v) || !Number.isFinite(Date.parse(v)))return fail();return v }
const envelope = (v:unknown, tenantId:string) => { uuid(tenantId);const row=live(v);if(row.success!==true || !('data' in row))return fail();const data=row.data;if(data && !Array.isArray(data)){const d=live(data);if(d.tenant_id!==undefined && d.tenant_id!==tenantId)return fail()}return data }
const array = (v:unknown): any[] => { if(!Array.isArray(v))return fail();return v }
const distinct = (rows:Record<string,any>[],key:string) => { if(new Set(rows.map(r=>r[key])).size!==rows.length)return fail() }
const relation = (v:unknown,id?:string): BudgetCatalogRow => { const r=live(v);uuid(r.id);text(r.codigo);text(r.nombre);if(id && r.id!==id)return fail();return r as BudgetCatalogRow }
const period = (v:unknown,id?:string,checkState=true) => { const r=live(v);uuid(r.id);if(id && r.id!==id)return fail();if(!Number.isInteger(r.anio)||r.anio<1900||r.anio>9999||!Number.isInteger(r.mes)||r.mes<1||r.mes>12||(checkState&&!['ABIERTO','CERRADO','BLOQUEADO'].includes(r.estado)))return fail();return r }
const measures = (r:Record<string,any>) => {
  const p=money(r.monto_presupuestado,true),e=money(r.monto_ejecutado,true),c=money(r.monto_comprometido,true),d=money(r.monto_disponible),pct=number(r.porcentaje_ejecutado,true)
  if(p<=0)return fail();near(d,p-e-c);near(pct,e/p*100,.00501)
  return {p,e,c,d,pct}
}
const readRow = (v:unknown,tenantId:string,relations:boolean): BudgetRow => {
  const r=live(v);uuid(r.id);if(uuid(r.tenant_id)!==tenantId)return fail();uuid(r.centro_costo_id);uuid(r.cuenta_id);uuid(r.periodo_contable_id)
  text(r.codigo);text(r.nombre);object(r.metadata);measures(r)
  if(!['ACTIVO','BLOQUEADO','CERRADO'].includes(r.estado)||!('notas' in r)||(r.notas!==null&&typeof r.notas!=='string'))return fail()
  stamp(r.created_at);stamp(r.updated_at);if(Date.parse(r.updated_at)<Date.parse(r.created_at))return fail()
  for(const key of ['created_by','updated_by'])if(!(key in r)||(r[key]!==null&&typeof r[key]!=='string'))return fail()
  if(relations){relation(r.centro_costo,r.centro_costo_id);relation(r.cuenta,r.cuenta_id);period(r.periodo,r.periodo_contable_id)}
  return r as BudgetRow
}
export function readBudgetList(response:unknown,tenantId:string): BudgetRow[] {
  const rows=array(envelope(response,tenantId)).map(v=>readRow(v,tenantId,true));distinct(rows,'id');const combinations=rows.map(r=>[r.centro_costo_id,r.cuenta_id,r.periodo_contable_id].join(':'));if(new Set(combinations).size!==rows.length)return fail();return rows
}
export function readBudgetDetail(response:unknown,tenantId:string,id:string): BudgetRow {uuid(id);const row=readRow(envelope(response,tenantId),tenantId,false);if(row.id!==id)return fail();return row}
export function readBudgetCatalog(response:unknown,tenantId:string,kind:'centers'|'accounts'): BudgetCatalogRow[] {
  const rows=array(envelope(response,tenantId)).map(v=>{const r=relation(v);if(uuid(r.tenant_id)!==tenantId)return fail();if(kind==='accounts')text(r.tipo_cuenta);return r});distinct(rows,'id');return rows
}
const level = (pct:number) => pct>100?'SOBREGIRO':pct>90?'ADVERTENCIA':'NORMAL'
const totals = (v:unknown,rows:Record<string,any>[]) => {
  const r=live(v);const sums={presupuestado:0,ejecutado:0,comprometido:0,disponible:0,variacion:0}
  for(const row of rows){const x=measures(row);sums.presupuestado+=x.p;sums.ejecutado+=x.e;sums.comprometido+=x.c;sums.disponible+=x.d;sums.variacion+=x.e-x.p}
  for(const k of Object.keys(sums) as Array<keyof typeof sums>)near(money(r[k]),sums[k])
  const pct=sums.presupuestado?sums.ejecutado/sums.presupuestado*100:0,variation=sums.presupuestado?sums.variacion/sums.presupuestado*100:0
  near(number(r.porcentaje_ejecucion,true),pct);near(number(r.variacion_porcentaje),variation);if(r.alerta!==level(pct))return fail()
}
export function readBudgetComparison(response:unknown,tenantId:string,periodId:string): any {
  uuid(periodId);const d=live(envelope(response,tenantId));period(d.periodo,periodId)
  const centers=array(d.centros_costo),all:Record<string,any>[]=[];const centerIds=new Set<string>()
  for(const value of centers){const center=live(value),identity=relation(center.centro_costo);if(centerIds.has(identity.id))return fail();centerIds.add(identity.id)
    const rows=array(center.cuentas),accountIds=new Set<string>()
    for(const value of rows){const row=live(value),identity=relation(row.cuenta);if(accountIds.has(identity.id))return fail();accountIds.add(identity.id);const x=measures(row);near(money(row.variacion),x.e-x.p);near(number(row.variacion_porcentaje),(x.e-x.p)/x.p*100);if(row.alerta!==level(x.pct))return fail();all.push(row)}
    totals(center.totales,rows)
  }
  const summary=live(d.resumen_global),translated={presupuestado:summary.total_presupuestado,ejecutado:summary.total_ejecutado,comprometido:summary.total_comprometido,disponible:summary.total_disponible,variacion:summary.total_variacion,porcentaje_ejecucion:summary.porcentaje_ejecucion,variacion_porcentaje:summary.variacion_porcentaje,alerta:level(number(summary.porcentaje_ejecucion,true))};totals(translated,all)
  if(count(summary.total_centros)!==centers.length||count(summary.total_cuentas)!==all.length)return fail()
  const alerts=live(summary.alertas);for(const [key,label] of [['sobregiros','SOBREGIRO'],['advertencias','ADVERTENCIA'],['normales','NORMAL']])if(count(alerts[key])!==all.filter(r=>r.alerta===label).length)return fail()
  return d
}
export function readBudgetAlerts(response:unknown,tenantId:string): any {
  const d=live(envelope(response,tenantId));stamp(d.fecha_generacion);const ids=new Set<string>();let total=0
  for(const [key,label,severity] of [['sobregiros','SOBREGIRO','CRITICO'],['advertencias','ADVERTENCIA','ALTO']]){
    const group=live(d[key]),rows=array(group.alertas);if(count(group.cantidad)!==rows.length)return fail();let sum=0
    for(const value of rows){const row=live(value);uuid(row.presupuesto_id);if(ids.has(row.presupuesto_id))return fail();ids.add(row.presupuesto_id);const x=measures(row)
      if(row.nivel_alerta!==label||row.severidad!==severity||level(x.e/x.p*100)!==label)return fail();near(money(row.excedente),x.e-x.p);relation(row.centro_costo);relation(row.cuenta);period(row.periodo,undefined,false);text(row.mensaje);stamp(row.fecha_deteccion);sum+=key==='sobregiros'?Math.max(0,x.e-x.p):x.p
    }
    near(money(group[key==='sobregiros'?'total_excedente':'total_en_riesgo'],true),sum);total+=rows.length
  }
  if(count(d.total_alertas)!==total)return fail();return d
}
