import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { ConsolidacionReportesService } from './consolidacion-reportes.service';
import { ContabilidadConsolidacionController } from '../controllers/contabilidad-consolidacion.controller';
const tenant='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
const id=(n:number)=>`33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
const page=(data:any[],count=data.length)=>({data,count,error:null});
const report=(n=1)=>({id:id(n),tenant_id:tenant,nombre:'Reporte'+n,activo:true});
const line=(n=1,rid=id(1))=>({id:id(n+10000),tenant_id:tenant,reporte_id:rid,orden:n});
function setup(tables:Record<string,any[]>) {
  const calls:any[]=[];const from=jest.fn((table:string)=>{
    const result=tables[table]?.shift()??page([]);const c:any={table,filters:[]};calls.push(c);
    const q:any={select:(s:any,o:any)=>{c.selection=s;c.options=o;return q},eq:(k:any,v:any)=>{c.filters.push([k,v]);return q},in:(k:any,v:any)=>{c.filters.push([k,v]);return q},or:(s:any)=>{c.or=s;return q},order:(k:any,v:any)=>{c.order=[k,v];return q},range:(a:any,b:any)=>{c.range=[a,b];return q},maybeSingle:async()=>result,then:(resolve:any,reject:any)=>Promise.resolve(result).then(resolve,reject)};return q;
  });return {service:new ConsolidacionReportesService({getClient:()=>({from})} as any),calls,from};
}
function groupTables(own=true,state='ACTIVO') {
  const owner=own?tenant:foreign;const g={id:id(1),tenant_id:owner,nombre:'Grupo',activo:true};
  return {grupos_consolidacion:[{data:g,error:null}],grupos_consolidacion_miembros:[{data:{estado:state},error:null},page([{id:id(2),grupo_id:id(1),tenant_id:tenant,estado:state},{id:id(3),grupo_id:id(1),tenant_id:foreign,estado:'ACTIVO'}])],empresa_config:[page([{tenant_id:tenant},{tenant_id:foreign}])]};
}
describe('Catálogo consolidación completo en vivo',()=>{
  it('pagina1001 reportes y conserva empresa/activo/orden/conteo en cada página',async()=>{
    const headers=Array.from({length:1001},(_,i)=>report(i+1));const tables={reportes_contables_configurables:[page(headers.slice(0,1000),1001),page(headers.slice(1000),1001)],reportes_contables_lineas:headers.map(r=>page([line(1,r.id)]))};
    const {service,calls}=setup(tables);expect(await service.listarReportes(tenant)).toHaveLength(1001);
    expect(calls.slice(0,2).map(c=>c.range)).toEqual([[0,999],[1000,1999]]);
    for (const c of calls.slice(0,2)){expect(c.options.count).toBe('exact');expect(c.filters).toEqual([['tenant_id',tenant],['activo',true]])}
  });
  it('pagina1001 líneas sin depender del límite del embed y conserva pertenencia',async()=>{
    const lines=Array.from({length:1001},(_,i)=>line(i+1));const {service,calls}=setup({reportes_contables_configurables:[page([report()])],reportes_contables_lineas:[page(lines.slice(0,1000),1001),page(lines.slice(1000),1001)]});
    const result=await service.listarReportes(tenant);expect(result[0].lineas_total).toBe(1001);expect(result[0].lineas).toHaveLength(1001);
    for (const c of calls.slice(1))expect(c.filters).toEqual([['tenant_id',tenant],['reporte_id',id(1)]]);
  });
  it.each([null,{}, {data:[],count:null,error:null},page([report()],2),page([report(),report()]),page([{...report(),tenant_id:foreign}]),page([{...report(),activo:false}])])('rechaza catálogo desconocido/parcial/duplicado/ajeno %s',async invalid=>{
    const value=invalid===null||Array.isArray(invalid)?{data:invalid,error:null,count:0}:invalid;
    await expect(setup({reportes_contables_configurables:[value]}).service.listarReportes(tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('rechaza error y cambio de conteo entre páginas',async()=>{
    await expect(setup({reportes_contables_configurables:[{data:null,count:null,error:{code:'08006'}}]}).service.listarReportes(tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
    const first=Array.from({length:1000},(_,i)=>report(i+1));await expect(setup({reportes_contables_configurables:[page(first,1001),page([report(1001)],1002)]}).service.listarReportes(tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each([page([]),page([{...line(),tenant_id:foreign}]),page([{...line(),reporte_id:id(2)}]),{data:null,count:0,error:null}])('rechaza líneas faltantes/ajenas %s',async invalid=>{
    await expect(setup({reportes_contables_configurables:[page([report()])],reportes_contables_lineas:[invalid]}).service.listarReportes(tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('vacío confirmado del catálogo no es definición vacía de un reporte existente',async()=>{
    expect(await setup({reportes_contables_configurables:[page([])]}).service.listarReportes(tenant)).toEqual([]);
  });
  it('lista1001 grupos sólo por empresa o membresía pendiente/activa',async()=>{
    const groups=Array.from({length:1001},(_,i)=>({id:id(i+1),tenant_id:foreign,nombre:'Grupo'+i}));
    const memberships=groups.map((g,i)=>({id:id(i+2000),grupo_id:g.id,tenant_id:tenant,estado:'ACTIVO'}));
    const {service,calls}=setup({grupos_consolidacion_miembros:[page(memberships.slice(0,1000),1001),page(memberships.slice(1000),1001)],grupos_consolidacion:[page(groups.slice(0,1000),1001),page(groups.slice(1000),1001)]});
    jest.spyOn(service,'obtenerGrupo').mockImplementation(async(_tenant,gid)=>groups.find(g=>g.id===gid) as any);
    expect(await service.listarGrupos(tenant)).toHaveLength(1001);expect(calls.map(c=>c.range)).toEqual([[0,999],[1000,1999],[0,999],[1000,1999]]);expect(calls[2].or).toContain('tenant_id.eq.'+tenant);
  });
  it('grupo ajeno fuera de membresías no se incorpora aunque el proveedor lo entregue',async()=>{
    await expect(setup({grupos_consolidacion_miembros:[page([])],grupos_consolidacion:[page([{id:id(1),tenant_id:foreign}])]}).service.listarGrupos(tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each(['PENDIENTE','ACTIVO'])('grupo invitado visible sólo por membresía %s y configs completas',async state=>{
    const r=await setup(groupTables(false,state)).service.obtenerGrupo(tenant,id(1));expect(r.es_controladora).toBe(false);expect(r.miembros_total).toBe(2);
  });
  it.each(['RECHAZADO',null])('rechazo/ausencia %s impide detalles de empresa ajena',async state=>{
    const tables=groupTables(false);tables.grupos_consolidacion_miembros[0]={data:state?{estado:state}:null,error:null} as any;
    await expect(setup(tables).service.obtenerGrupo(tenant,id(1))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('error al comprobar pertenencia no se degrada a ausencia ni acceso permitido',async()=>{
    const t=groupTables();t.grupos_consolidacion_miembros[0]={data:null,error:{code:'08006'}} as any;
    await expect(setup(t).service.obtenerGrupo(tenant,id(1))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each(['missingConfig','foreignConfig','duplicateMember','foreignMember','missingMemberCount'])('rechaza detalle de grupo %s',async kind=>{
    const t:any=groupTables();
    if(kind==='missingConfig')t.empresa_config=[page([{tenant_id:tenant}])];
    if(kind==='foreignConfig')t.empresa_config=[page([{tenant_id:tenant},{tenant_id:id(10)}])];
    if(kind==='duplicateMember')t.grupos_consolidacion_miembros[1]=page([{id:id(2),grupo_id:id(1),tenant_id:tenant,estado:'ACTIVO'},{id:id(3),grupo_id:id(1),tenant_id:tenant,estado:'ACTIVO'}]);
    if(kind==='foreignMember')t.grupos_consolidacion_miembros[1].data[0].grupo_id=id(9);
    if(kind==='missingMemberCount')t.grupos_consolidacion_miembros[1].count=null;
    await expect(setup(t).service.obtenerGrupo(tenant,id(1))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('controladores publican conteo y empresa confirmados',async()=>{
    const c=new ContabilidadConsolidacionController({listarGrupos:jest.fn().mockResolvedValue([]),listarReportes:jest.fn().mockResolvedValue([])} as any);
    expect(await c.listarGrupos(tenant)).toEqual({success:true,complete:true,tenant_id:tenant,total:0,data:[]});expect(await c.listarReportes(tenant)).toEqual({success:true,complete:true,tenant_id:tenant,total:0,data:[]});
  });
});
