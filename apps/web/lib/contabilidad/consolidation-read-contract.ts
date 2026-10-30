const object=(v: any)=>!!v && typeof v==='object' && !Array.isArray(v)
export const consolidationLive=(v: any)=>object(v) && ['cached','queued','offline','pending'].every(k=>v[k]===undefined || v[k]===false)
const uuid=(v: unknown)=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const text=(v: unknown)=>typeof v==='string' && !!v.trim()
const count=(v: unknown)=>Number.isSafeInteger(v) && Number(v)>=0
const currency=(v: unknown)=>typeof v==='string' && /^[A-Z]{3}$/.test(v)
function rows(v: any,tenant: string) {
  if (!uuid(tenant) || !consolidationLive(v) || v.success!==true || v.complete!==true || v.tenant_id!==tenant || !Array.isArray(v.data) || !count(v.total) || v.total!==v.data.length) throw new Error('Se necesita el catálogo de consolidación completo en vivo de esta empresa.')
  const ids=new Set<string>()
  for (const r of v.data) {if (!consolidationLive(r) || !uuid(r.id) || ids.has(r.id)) throw new Error('El catálogo contiene IDs incompletos o duplicados.');ids.add(r.id)}
  return v.data as any[]
}
export function readConsolidationGroups(v: any,tenant: string) {
  return rows(v,tenant).map(g=>{
    if (!uuid(g.tenant_id) || !text(g.codigo) || !text(g.nombre) || !currency(g.moneda_presentacion) || typeof g.activo!=='boolean' || g.es_controladora!==(g.tenant_id===tenant) || !Array.isArray(g.miembros) || !count(g.miembros_total) || g.miembros_total!==g.miembros.length || !g.miembros.length) throw new Error('El grupo o sus membresías están incompletos.')
    const ids=new Set<string>(),tenants=new Set<string>();let controllers=0
    for (const m of g.miembros) {
      if (!consolidationLive(m) || !uuid(m.id) || !uuid(m.tenant_id) || m.grupo_id!==g.id || ids.has(m.id) || tenants.has(m.tenant_id) || !['ACTIVO','PENDIENTE','RECHAZADO'].includes(m.estado) || m.es_controladora!==(m.tenant_id===g.tenant_id) || typeof m.participacion!=='number' || !Number.isFinite(m.participacion) || m.participacion<=0 || m.participacion>100 ||
          !consolidationLive(m.empresa) || m.empresa.tenant_id!==m.tenant_id || !currency(m.empresa.moneda_defecto) || !(text(m.empresa.razon_social) || text(m.empresa.nombre_comercial))) throw new Error('Una membresía o empresa del grupo está incompleta o es ajena.')
      ids.add(m.id);tenants.add(m.tenant_id);if(m.es_controladora)controllers++
    }
    const current=g.miembros.find((m:any)=>m.tenant_id===tenant)
    if (controllers!==1 || !current || !['ACTIVO','PENDIENTE'].includes(current.estado)) throw new Error('No se pudo confirmar la pertenencia actual al grupo.')
    return g
  })
}
export function readConsolidationReports(v: any,tenant: string) {
  return rows(v,tenant).map(r=>{
    if (r.tenant_id!==tenant || r.activo!==true || !text(r.codigo) || !text(r.nombre) || !Array.isArray(r.lineas) || !count(r.lineas_total) || r.lineas_total!==r.lineas.length || !r.lineas.length) throw new Error('El reporte o su definición está incompleto o es ajeno.')
    const ids=new Set<string>(),codes=new Set<string>(),orders=new Set<number>(),edges=new Map<string,string[]>()
    for (const l of r.lineas) {
      if (!consolidationLive(l) || !uuid(l.id) || l.tenant_id!==tenant || l.reporte_id!==r.id || ids.has(l.id) || !text(l.codigo) || codes.has(l.codigo) || !text(l.nombre) || !count(l.orden) || orders.has(l.orden) || !['CUENTAS','FORMULA'].includes(l.tipo) || !['SALDO','DEBE','HABER'].includes(l.naturaleza) || !['PERIODO','HASTA_FECHA'].includes(l.alcance_fecha) || !['CIERRE','PROMEDIO','HISTORICA'].includes(l.tipo_tasa) || typeof l.signo!=='number' || !Number.isFinite(l.signo) || !Array.isArray(l.patrones_cuenta) || !Array.isArray(l.formula)) throw new Error('La definición contiene líneas incompletas, repetidas o ajenas.')
      if (l.tipo==='CUENTAS' ? !l.patrones_cuenta.length || !l.patrones_cuenta.every(text) || l.formula.length!==0 : l.patrones_cuenta.length!==0 || !l.formula.length || !l.formula.every((c:any)=>object(c)&&text(c.codigo)&&typeof c.coeficiente==='number'&&Number.isFinite(c.coeficiente))) throw new Error('La definición de cuentas o fórmula es incoherente.')
      ids.add(l.id);codes.add(l.codigo);orders.add(l.orden);edges.set(l.codigo,l.formula.map((c:any)=>c.codigo))
    }
    const active=new Set<string>(),done=new Set<string>()
    function visit(code:string) {if (active.has(code) || !codes.has(code)) throw new Error('La definición contiene fórmula cíclica o referencia desconocida.');if(done.has(code))return;active.add(code);for(const ref of edges.get(code)||[])visit(ref);active.delete(code);done.add(code)}
    for (const code of codes) visit(code)
    return r
  })
}
