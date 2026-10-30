import { consolidationLive } from './consolidation-read-contract'
const object=(v: any)=>!!v && typeof v==='object' && !Array.isArray(v)
const uuid=(v: unknown)=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const count=(v: unknown)=>Number.isSafeInteger(v) && Number(v)>=0
const amount=(v: unknown)=>typeof v==='number' && Number.isFinite(v) && Number.isSafeInteger(Math.round(v*100)) && Math.abs(v-Math.round(v*100)/100)<1e-9
// Evaluate the declared decimal coefficients exactly; round half away from zero,
// including negative half cents, as the financial service does.
function decimal(n:number) {
  const [mantissa,exponent='0']=String(n).toLowerCase().split('e')
  const digits=mantissa.replace('.',''),fraction=(mantissa.split('.')[1]||'').length
  const scale=fraction-Number(exponent)
  return scale<0?{value:BigInt(digits)*BigInt(10)**BigInt(-scale),scale:0}:{value:BigInt(digits),scale}
}
function formulaCents(declared:any,lines:any[]) {
  let value=BigInt(0),scale=0
  for(const component of declared.formula) {
    const line=lines.find(l=>l.codigo.toUpperCase()===component.codigo.toUpperCase())
    if(!line)throw new Error('Falta una referencia de la fórmula financiera.')
    const coefficient=decimal(component.coeficiente),sign=decimal(declared.signo)
    const term=BigInt(Math.round(line.valor*100))*coefficient.value*sign.value,next=coefficient.scale+sign.scale
    if(next>scale){value*=BigInt(10)**BigInt(next-scale);scale=next}
    value+=term*BigInt(10)**BigInt(scale-next)
  }
  const denominator=BigInt(10)**BigInt(scale),absolute=value<BigInt(0)?-value:value
  const rounded=(absolute/denominator+(absolute%denominator*BigInt(2)>=denominator?BigInt(1):BigInt(0)))*(value<BigInt(0)?BigInt(-1):BigInt(1))
  if(rounded>BigInt(Number.MAX_SAFE_INTEGER)||rounded<BigInt(-Number.MAX_SAFE_INTEGER))throw new Error('La fórmula financiera está fuera de rango.')
  return Number(rounded)
}
export function readConsolidationFinancialResult(v: any,tenant: string,report: any,group: any,from: string,to: string,currency: string) {
  const d=v?.data
  if (!uuid(tenant) || !consolidationLive(v) || v.success!==true || v.complete!==true || v.tenant_id!==tenant || !consolidationLive(d) || d.complete!==true || d.fuentes_completas!==true || d.tenant_id!==tenant || !report || d.reporte?.id!==report.id || d.reporte?.codigo!==report.codigo || d.reporte?.nombre!==report.nombre || d.fecha_desde!==from || d.fecha_hasta!==to || d.altera_libros_legales!==false || d.alcance!==(group?'CONSOLIDADO':'INDIVIDUAL') || (d.grupo?.id || '')!==(group?.id || '') || d.moneda_presentacion!==currency) throw new Error('No se pudo confirmar el resultado financiero completo para esta empresa, definición y período.')
  if (!Array.isArray(d.empresas_ids) || !count(d.empresas_incluidas) || d.empresas_incluidas!==d.empresas_ids.length || !d.empresas_incluidas || !d.empresas_ids.every(uuid) || new Set(d.empresas_ids).size!==d.empresas_ids.length) throw new Error('Las empresas incluidas no están confirmadas.')
  const expected=group?group.miembros.filter((m:any)=>m.estado==='ACTIVO').map((m:any)=>m.tenant_id):[tenant]
  if (d.empresas_ids.length!==expected.length || expected.some((id:string)=>!d.empresas_ids.includes(id))) throw new Error('El resultado incluye empresas ajenas o excluye miembros activos.')
  if (!Array.isArray(d.lineas) || !count(d.lineas_total) || d.lineas_total!==d.lineas.length || d.lineas.length!==report.lineas.length || !d.lineas.length) throw new Error('Las líneas del resultado están incompletas.')
  const codes=new Set<string>()
  for (const l of d.lineas) {
    const declared=report.lineas.find((x:any)=>x.codigo===l.codigo)
    if (!consolidationLive(l) || !declared || codes.has(l.codigo) || l.nombre!==declared.nombre || l.orden!==declared.orden || l.tipo!==declared.tipo || !amount(l.valor)) throw new Error('El resultado contiene importes desconocidos o líneas incoherentes.')
    codes.add(l.codigo)
    if (l.tipo==='CUENTAS') {
      if (!object(l.desglose_empresas) || !expected.every((id:string)=>amount(l.desglose_empresas[id])) || Object.keys(l.desglose_empresas).some(id=>!expected.includes(id)&&id!=='AJUSTES_CONSOLIDACION') || (l.desglose_empresas.AJUSTES_CONSOLIDACION!==undefined&&!amount(l.desglose_empresas.AJUSTES_CONSOLIDACION))) throw new Error('El desglose financiero está incompleto o contiene datos ajenos.')
      const cents=(Object.values(l.desglose_empresas) as number[]).reduce((sum,n)=>sum+Math.round(n*100),0)
      if (!Number.isSafeInteger(cents) || cents!==Math.round(l.valor*100)) throw new Error('El importe financiero no coincide con su desglose por empresa.')
    } else if (l.desglose_empresas!==undefined && l.desglose_empresas!==null) throw new Error('El resultado de fórmula tiene un desglose incoherente.')
  }
  for(const l of d.lineas)if(l.tipo==='FORMULA' && formulaCents(report.lineas.find((x:any)=>x.codigo===l.codigo),d.lineas)!==Math.round(l.valor*100))throw new Error('El resultado no coincide con su fórmula financiera declarada.')
  if (!count(d.mapeos_cuentas_aplicados) || !Array.isArray(d.tasas_aplicadas)) throw new Error('Las fuentes de conversión están incompletas.')
  const rates=new Set<string>()
  for (const r of d.tasas_aplicadas) {
    const member=group?.miembros.find((m:any)=>m.tenant_id===r.tenant_id)
    const key=`${r.tenant_id}:${r.tipo}`
    if (!consolidationLive(r) || !member || member.estado!=='ACTIVO' || rates.has(key) || !['CIERRE','PROMEDIO','HISTORICA'].includes(r.tipo) || typeof r.factor!=='number' || !Number.isFinite(r.factor) || r.factor<=0 || r.factor>=10000000000 || r.moneda_origen!==member.empresa.moneda_defecto || r.moneda_destino!==currency || typeof r.fecha!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.fecha) || r.fecha>to) throw new Error('Una tasa de conversión es desconocida o ajena.')
    rates.add(key)
  }
  if (group)for(const member of group.miembros.filter((m:any)=>m.estado==='ACTIVO'))for(const type of new Set(report.lineas.filter((l:any)=>l.tipo==='CUENTAS').map((l:any)=>l.tipo_tasa)))if(!rates.has(`${member.tenant_id}:${type}`))throw new Error('Falta una tasa necesaria para la definición financiera.')
  if (!group && (d.tasas_aplicadas.length || d.mapeos_cuentas_aplicados!==0)) throw new Error('El resultado individual incluye fuentes de consolidación ajenas.')
  return d
}
