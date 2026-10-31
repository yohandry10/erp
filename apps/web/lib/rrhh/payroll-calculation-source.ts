const object=(v:any)=>!!v&&typeof v==='object'&&!Array.isArray(v)
const uuid=(v:any)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const live=(v:any)=>object(v)&&['cached','queued','offline','pending','from_cache'].every(k=>v[k]===undefined||v[k]===false)
const civil=(v:any)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number(v.slice(0,4))>=1&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v
const stamp=(v:any)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v))
function unknown():never{throw new Error('No se pudieron confirmar los empleados, contratos vigentes y sueldos de esta planilla. Se conservan sus campos; reintente las fuentes actuales.')}
function rows(value:any,tenant:string,source:string){
  if(!uuid(tenant)||!live(value)||value.success!==true||value.tenant_id!==tenant||!Array.isArray(value.data)||!Number.isSafeInteger(value.total)||value.total<0||value.total!==value.data.length||!live(value[source])||value[source].complete!==true||value[source].total!==value.total||value[source].page_size!==1000)unknown()
  const ids=new Set<string>()
  for(const r of value.data){if(!live(r)||!uuid(r.id)||r.tenant_id!==tenant||ids.has(r.id))unknown();ids.add(r.id)}
  return value.data as any[]
}
const salary=(v:any)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&Number.isSafeInteger(Math.round(v*100))&&Math.abs(v*100-Math.round(v*100))<0.000001
/** Complete flat contracts avoid truncated/unordered embedded arrays; use the server's month/current-state rules. */
export function readPayrollCalculationSources(employeeResponse:any,contractResponse:any,tenant:string,period:string){
  if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))unknown()
  const employees=rows(employeeResponse,tenant,'fuentes_empleados'),contracts=rows(contractResponse,tenant,'fuentes_contratos'),byEmployee=new Map(employees.map(e=>[e.id,e]))
  for(const e of employees){if(!['nombres','apellidos','estado'].every(k=>typeof e[k]==='string'&&!!e[k].trim())||!['activo','inactivo','cesado','baja','suspendido','licencia','retirado'].includes(e.estado.toLowerCase()))unknown()}
  for(const c of contracts){
    if(!uuid(c.id_empleado)||!byEmployee.has(c.id_empleado)||typeof c.estado!=='string'||!c.estado.trim()||!Object.prototype.hasOwnProperty.call(c,'fecha_inicio')||!Object.prototype.hasOwnProperty.call(c,'fecha_fin')||!(c.fecha_inicio===null||civil(c.fecha_inicio))||!(c.fecha_fin===null||civil(c.fecha_fin))||c.fecha_inicio===null&&!stamp(c.created_at)||c.fecha_inicio!==null&&c.fecha_fin!==null&&c.fecha_fin<c.fecha_inicio)unknown()
  }
  return employees.filter(e=>e.estado.toLowerCase()==='activo').map(e=>{
    const current=contracts.filter(c=>c.id_empleado===e.id&&['vigente','renovado','en_periodo_prueba'].includes(c.estado.toLowerCase())&&(c.fecha_inicio===null||c.fecha_inicio.slice(0,7)<=period)&&(c.fecha_fin===null||c.fecha_fin.slice(0,7)>=period))
    const from=(c:any)=>Date.parse(c.fecha_inicio===null?c.created_at:c.fecha_inicio+'T00:00:00Z')
    current.sort((a,b)=>from(b)-from(a))
    if(!current.length||current.length>1&&from(current[0])===from(current[1])||!salary(current[0].sueldo_bruto))unknown()
    return {...e,contrato_confirmado:{...current[0]},sueldo_base_confirmado:current[0].sueldo_bruto}
  })
}
