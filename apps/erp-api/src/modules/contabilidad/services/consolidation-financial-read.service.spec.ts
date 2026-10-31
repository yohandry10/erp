import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConsolidacionReportesService } from './consolidacion-reportes.service';
const tenant='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
const id=(n:number)=>`33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
const page=(data:any[],count=data.length)=>({data,count,error:null});
const row=(n=1,fecha='2026-08-07T12:00:00Z')=>({id:id(n),tenant_id:tenant,asiento_id:id(n+2000),cuenta_id:id(1000),debe:0,haber:.01,plan_cuentas:{id:id(1000),tenant_id:tenant,codigo:'7011',nombre:'Ingreso'},asientos_contables:{id:id(n+2000),tenant_id:tenant,fecha,estado:'CONFIRMADO'}});
function setup(pages:any[],config:any={data:{tenant_id:tenant,pais:'PE'},error:null}) {
  const calls:any[]=[];const client={from:jest.fn((table:string)=>{
    const result=table==='empresa_config'?config:pages.length ? pages.shift() : page([]);const c:any={table,filters:[]};calls.push(c);
    const q:any={select:(s:any,o:any)=>{c.selection=s;c.options=o;return q},eq:(k:any,v:any)=>{c.filters.push(['eq',k,v]);return q},lt:(k:any,v:any)=>{c.filters.push(['lt',k,v]);return q},order:(k:any,v:any)=>{c.order=[k,v];return q},range:(a:any,b:any)=>{c.range=[a,b];return q},maybeSingle:async()=>result,then:(resolve:any,reject:any)=>Promise.resolve(result).then(resolve,reject)};return q;
  })};return {service:new ConsolidacionReportesService({getClient:()=>client} as any),calls,client};
}
describe('Consolidación fuente financiera completa',()=>{
  it('lee1001 líneas con conteo estable, identidad, joins inner y orden determinista',async()=>{
    const rows=Array.from({length:1001},(_,i)=>row(i+1));const {service,calls}=setup([page(rows.slice(0,1000),1001),page(rows.slice(1000),1001)]);
    expect(await (service as any).cargarMovimientos(tenant,'2026-08-07')).toHaveLength(1001);
    const scans=calls.filter(c=>c.table==='detalle_asientos');expect(scans.map(c=>c.range)).toEqual([[0,999],[1000,1999]]);
    for(const c of scans){expect(c.options.count).toBe('exact');expect(c.selection).toContain('!inner');expect(c.filters).toEqual([['eq','asientos_contables.tenant_id',tenant],['eq','asientos_contables.estado','CONFIRMADO'],['lt','asientos_contables.fecha','2026-08-08T05:00:00.000Z']]);}
  });
  it('incluye el instante Perú hasta04:59:59Z y conserva fecha civil a medianocheUTC; excluye calendario del día siguiente',async()=>{
    const {service}=setup([page([row(1,'2026-08-07T00:00:00Z'),row(2,'2026-08-08T04:59:59Z'),row(3,'2026-08-08T00:00:00Z')])]);
    const result=await (service as any).cargarMovimientos(tenant,'2026-08-07');expect(result.map((r:any)=>r.fecha)).toEqual(['2026-08-07','2026-08-07']);
  });
  it.each([null,{data:null,error:null},{data:{tenant_id:foreign,pais:'PE'},error:null},{data:{tenant_id:tenant,pais:null},error:null},{data:{tenant_id:tenant,pais:'XX'},error:null},{data:null,error:{code:'08006'}}])('no asume Perú ante configuración desconocida/ajena %s',async config=>{
    await expect((setup([],config).service as any).cargarMovimientos(tenant,'2026-08-07')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each(['2026-02-30','2026-13-01','bad','2026-8-7'])('rechaza fecha civil %s',async date=>{
    await expect((setup([]).service as any).cargarMovimientos(tenant,date)).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each([null,{data:null,count:0,error:null},{data:[],count:null,error:null},page([row()],2),page([row(),row()]),{data:null,count:null,error:{code:'XX'}}])('rechaza fuente truncada/desconocida/duplicada %s',async invalid=>{
    await expect((setup([invalid]).service as any).cargarMovimientos(tenant,'2026-08-07')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each(['foreignChild','foreignHeader','foreignAccount','missingHeader','multipleHeader','missingAccount','wrongAsiento','wrongCuenta','unconfirmed','nullDebit','stringCredit','nan','negative','fractionCents','missingDate','afterCut'])('rechaza %s sin omitir fila ni inventar cero',async kind=>{
    const r:any=row();
    if(kind==='foreignChild')r.tenant_id=foreign;
    if(kind==='foreignHeader')r.asientos_contables.tenant_id=foreign;
    if(kind==='foreignAccount')r.plan_cuentas.tenant_id=foreign;
    if(kind==='missingHeader')r.asientos_contables=null;
    if(kind==='multipleHeader')r.asientos_contables=[r.asientos_contables,r.asientos_contables];
    if(kind==='missingAccount')r.plan_cuentas=null;
    if(kind==='wrongAsiento')r.asiento_id=id(9);
    if(kind==='wrongCuenta')r.cuenta_id=id(9);
    if(kind==='unconfirmed')r.asientos_contables.estado='BORRADOR';
    if(kind==='nullDebit')r.debe=null;
    if(kind==='stringCredit')r.haber='0.01';
    if(kind==='nan')r.haber=NaN;
    if(kind==='negative')r.debe=-1;
    if(kind==='fractionCents')r.haber=.011;
    if(kind==='missingDate')r.asientos_contables.fecha=null;
    if(kind==='afterCut')r.asientos_contables.fecha='2026-08-08T05:00:00Z';
    await expect((setup([page([r])]).service as any).cargarMovimientos(tenant,'2026-08-07')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('cero movimientos sólo se acepta con ventana confirmada vacía',async()=>{
    expect(await (setup([page([])]).service as any).cargarMovimientos(tenant,'2026-08-07')).toEqual([]);
  });
  it('cambio de conteo entre páginas impide un resultado parcial',async()=>{
    const rows=Array.from({length:1000},(_,i)=>row(i+1));await expect((setup([page(rows,1001),page([row(1001)],1002)]).service as any).cargarMovimientos(tenant,'2026-08-07')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

const groupId=id(8000),reportId=id(9000);
const definition=()=>({id:reportId,codigo:'CONTROL',nombre:'Control',lineas:[
  {id:id(9100),tenant_id:tenant,reporte_id:reportId,codigo:'A',nombre:'Cuenta',orden:1,tipo:'CUENTAS',patrones_cuenta:['10'],formula:[],naturaleza:'SALDO',alcance_fecha:'PERIODO',tipo_tasa:'CIERRE',signo:1},
  {id:id(9101),tenant_id:tenant,reporte_id:reportId,codigo:'F',nombre:'Fórmula',orden:2,tipo:'FORMULA',patrones_cuenta:[],formula:[{codigo:'A',coeficiente:-.5}],naturaleza:'SALDO',alcance_fecha:'PERIODO',tipo_tasa:'CIERRE',signo:1},
]});
function resultSetup(overrides:Record<string,any>={}) {
  const tables:Record<string,any>={
    grupos_consolidacion_miembros:page([{id:id(8100),grupo_id:groupId,tenant_id:tenant,estado:'ACTIVO'},{id:id(8101),grupo_id:groupId,tenant_id:foreign,estado:'ACTIVO'}]),
    mapeos_cuentas_consolidacion:page([]),ajustes_consolidacion:page([]),
    tipos_cambio_consolidacion:{data:{id:id(8200),grupo_id:groupId,miembro_tenant_id:foreign,moneda_origen:'USD',moneda_destino:'PEN',factor_conversion:3.5,fecha:'2026-08-07',tipo:'CIERRE'},error:null},
    reportes_contables_configurables:page([{...definition(),tenant_id:tenant,activo:true}]),reportes_contables_lineas:page(definition().lineas),...overrides,
  };
  const rpc=jest.fn(()=>{throw new Error('No financial writer is permitted')});
  const client={rpc,from:jest.fn((table:string)=>{
    const filters:any[]=[];let start=0,end=999;
    const response=()=>{
      if(table==='empresa_config')return overrides.config===undefined?{data:{tenant_id:filters.find(f=>f[0]==='tenant_id')[1],moneda_defecto:filters.find(f=>f[0]==='tenant_id')[1]===tenant?'PEN':'USD'},error:null}:overrides.config;
      const result=tables[table];return result?.data instanceof Array?{...result,data:result.data.slice(start,end+1)}:result;
    };
    const q:any={select:()=>q,eq:(k:any,v:any)=>{filters.push([k,v]);return q},lte:()=>q,order:()=>q,range:(a:number,b:number)=>{start=a;end=b;return q},limit:()=>q,maybeSingle:async()=>response(),then:(resolve:any,reject:any)=>Promise.resolve(response()).then(resolve,reject)};return q;
  })};
  const service=new ConsolidacionReportesService({getClient:()=>client} as any);
  jest.spyOn(service as any,'exigirControladora').mockResolvedValue({id:groupId,moneda_presentacion:'PEN'});
  jest.spyOn(service as any,'cargarMovimientos').mockImplementation(async(member:any)=>[{tenant_id:member,fecha:'2026-08-07',codigo:'10',nombre:'Banco',debe:member===tenant?2.5:0,haber:member===tenant?0:.03}]);
  return {service,rpc,tables};
}
const generate=(service:ConsolidacionReportesService)=>service.generarReporte(tenant,reportId,'2026-08-01','2026-08-07',groupId);
describe('Consolidación definición, miembros y conversión financiera',()=>{
  it('calcula dos empresas y fórmula negativa con tasa confirmada y ajuste sin alterar libros',async()=>{
    const {service,rpc}=resultSetup({ajustes_consolidacion:page([{id:id(8300),tenant_id:tenant,grupo_id:groupId,fecha:'2026-08-07',cuenta_codigo:'10',debe:1.01,haber:0}])});
    const result=await generate(service);expect(result.lineas.map(l=>l.valor)).toEqual([3.4,-1.7]);expect(result.lineas[0].desglose_empresas).toEqual({[tenant]:2.5,[foreign]:-.11,AJUSTES_CONSOLIDACION:1.01});
    expect(result.empresas_ids).toEqual([tenant,foreign]);expect(result.lineas_total).toBe(2);expect(result.fuentes_completas).toBe(true);expect(result.altera_libros_legales).toBe(false);expect(rpc).not.toHaveBeenCalled();
  });
  it.each([null,{data:null,count:0,error:null},page([]),page([{id:id(8100),grupo_id:groupId,tenant_id:foreign,estado:'ACTIVO'}]),page([{id:id(8100),grupo_id:groupId,tenant_id:tenant,estado:'ACTIVO'},{id:id(8101),grupo_id:groupId,tenant_id:tenant,estado:'ACTIVO'}]),page([{id:id(8100),grupo_id:groupId,tenant_id:tenant,estado:'RECHAZADO'}])])('composición desconocida/duplicada/inactiva nunca produce total parcial %s',async value=>{
    const {service,rpc}=resultSetup({grupos_consolidacion_miembros:value});await expect(generate(service)).rejects.toBeInstanceOf(ServiceUnavailableException);expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['unknown','foreignTenant','foreignMember','missingAccount','duplicate'])('mapeo %s no se omite silenciosamente',async kind=>{
    const m:any={id:id(8400),tenant_id:tenant,grupo_id:groupId,miembro_tenant_id:foreign,cuenta_codigo_origen:'10',cuenta_codigo_destino:'10'};
    if(kind==='foreignTenant')m.tenant_id=foreign;if(kind==='foreignMember')m.miembro_tenant_id=id(4);if(kind==='missingAccount')m.cuenta_codigo_origen=null;
    const data=kind==='duplicate'?[m,{...m,id:id(8401)}]:[m];const {service,rpc}=resultSetup({mapeos_cuentas_consolidacion:kind==='unknown'?null:page(data)});
    await expect(generate(service)).rejects.toBeInstanceOf(ServiceUnavailableException);expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['unknown','foreign','null','string','negative','fraction','date','future'])('ajuste %s no inventa importe ni invade alcance',async kind=>{
    const a:any={id:id(8500),tenant_id:tenant,grupo_id:groupId,fecha:'2026-08-07',cuenta_codigo:'10',debe:1,haber:0};
    if(kind==='foreign')a.tenant_id=foreign;if(kind==='null')a.debe=null;if(kind==='string')a.debe='1';if(kind==='negative')a.debe=-1;if(kind==='fraction')a.debe=.011;if(kind==='date')a.fecha='2026-02-30';if(kind==='future')a.fecha='2026-08-08';
    const {service}=resultSetup({ajustes_consolidacion:kind==='unknown'?null:page([a])});await expect(generate(service)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each(['foreign','null','string','negative','zero','huge','currency','date','future','kind','group'])('tasa %s impide usar factor 1 o resultado incoherente',async kind=>{
    const {service,tables}=resultSetup();const r=tables.tipos_cambio_consolidacion.data;
    if(kind==='foreign')r.miembro_tenant_id=tenant;if(kind==='null')r.factor_conversion=null;if(kind==='string')r.factor_conversion='3.5';if(kind==='negative')r.factor_conversion=-1;if(kind==='zero')r.factor_conversion=0;if(kind==='huge')r.factor_conversion=1e10;if(kind==='currency')r.moneda_origen='PEN';if(kind==='date')r.fecha='2026-02-30';if(kind==='future')r.fecha='2026-08-08';if(kind==='kind')r.tipo='PROMEDIO';if(kind==='group')r.grupo_id=id(3);
    await expect(generate(service)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each([null,{data:null,error:null},{data:{tenant_id:foreign,moneda_defecto:'PEN'},error:null},{data:{tenant_id:tenant,moneda_defecto:null},error:null},{data:{tenant_id:tenant,moneda_defecto:'?'},error:null},{data:null,error:{code:'08006'}}])('moneda desconocida/ajena no permite generación %s',async value=>{
    await expect(generate(resultSetup({config:value}).service)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each(['short','unknown','foreign','badFormula','fractionOrder'])('definición %s no utiliza embed truncado ni referencia desconocida',async kind=>{
    const {service,tables}=resultSetup();const lines=tables.reportes_contables_lineas;
    if(kind==='short')lines.count=3;if(kind==='unknown')tables.reportes_contables_lineas=null;if(kind==='foreign')lines.data[0].tenant_id=foreign;if(kind==='badFormula')lines.data[1].formula[0].coeficiente='1';if(kind==='fractionOrder')lines.data[0].orden=.5;
    await expect(generate(service)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
