import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SireService } from './sire.service';
jest.mock('../../shared/utils/fecha-tenant.util', () => ({
  fechaHoyDelTenant: jest.fn(async () => '2026-10-13'),
  rangoDelDiaDelTenant: jest.fn(async (_client, _tenant, date: Date) => ({ desde: `${date.toISOString().slice(0,10)}T05:00:00.000Z` })),
}));
const tenant='11111111-1111-4111-8111-111111111111';
const id=(n: number)=>`33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
const report=(n=1)=>({id:id(n),tenant_id:tenant,tipo:'REG_VEN',periodo:'2026-10',estado:'GENERADO',total_registros:5,created_at:'2026-10-13T00:00:00Z'});
function setup(files: any[]=[], details: any={error:null,count:0}, operations: any[]=[], owner: any={data:{id:id(1),tenant_id:tenant},error:null}) {
  const calls: any[]=[];
  const client={from: jest.fn((table: string)=>{
    const call:any={table,filters:[],orders:[]};calls.push(call);
    const query:any={
      select: (s: string,opts: any)=>{call.select=s;call.options=opts;return query;},
      eq: (column:string,value:any)=>{call.filters.push([column,value]);return query;},
      order: (column:string,opts:any)=>{call.orders.push([column,opts]);return query;},
      range: (start:number,end:number)=>{call.range=[start,end];return query;},
      maybeSingle:async()=>owner,
      then:(resolve:any,reject:any)=>Promise.resolve(table==='sire_registros_detalle'?details:(table==='sire_operaciones'?operations:files).shift()??{data:[],count:0,error:null}).then(resolve,reject),
    };return query;
  })};
  const service=new SireService({getClient:()=>client} as any,{onComprobanteCreadoEvent:jest.fn()} as any,{getTenantId:()=>tenant} as any,{} as any);
  return {service,calls,client};
}
const page=(rows:any[],count=rows.length)=>({data:rows,count,error:null});
describe('SIRE lecturas completas en vivo',()=>{
  it('pagina 1001 reportes y aplica tenant/filtros/orden en cada página',async()=>{
    const rows=Array.from({length:1001},(_,i)=>report(i+1));const {service,calls}=setup([page(rows.slice(0,1000),1001),page(rows.slice(1000),1001)]);
    const result=await service.getReportes({periodo:'2026-10',tipoReporte:'REGISTRO_VENTAS',estado:'GENERADO'},tenant);
    expect(result).toMatchObject({success:true,complete:true,total:1001,tenant_id:tenant});expect(result.data).toHaveLength(1001);
    expect(calls.map(x=>x.range)).toEqual([[0,999],[1000,1999]]);
    for(const call of calls){expect(call.options.count).toBe('exact');expect(call.filters).toEqual([['tenant_id',tenant],['periodo','2026-10'],['tipo','REG_VEN'],['estado','GENERADO']]);expect(call.orders).toEqual([['created_at',{ascending:false}],['id',{ascending:true}]]);}
  });
  it('distingue vacío confirmado de conteo desconocido',async()=>{
    expect(await setup([page([])]).service.getReportes({},tenant)).toMatchObject({data:[],total:0,complete:true});
    await expect(setup([{data:[],error:null,count:null}]).service.getReportes({},tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each([
    ['error',{data:null,error:{code:'XX'},count:0}],['null',{data:null,error:null,count:0}],
    ['truncado',page([report()],2)],['sobrante',page([report()],0)],['negativo',page([],-1)],['fracción',page([],0.1)],
    ['duplicado',page([report(),report()])],['empresa',page([{...report(),tenant_id:id(2)}])],['ID',page([{...report(),id:null}])],
  ])('rechaza %s sin devolver parcial',async(_name,invalid)=>{
    await expect(setup([invalid]).service.getReportes({},tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('rechaza cambio de conteo entre páginas',async()=>{
    const first=Array.from({length:1000},(_,i)=>report(i+1));
    await expect(setup([page(first,1001),page([report(1001)],1002)]).service.getReportes({},tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('rechaza fila que contradice filtro',async()=>{
    await expect(setup([page([report()])]).service.getReportes({estado:'ENVIADO'},tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('estadísticas cuentan mes civil Perú con inicio inclusivo y fin exclusivo',async()=>{
    const dates=['2026-10-01T04:59:59Z','2026-10-01T05:00:00Z','2026-11-01T04:59:59Z','2026-11-01T05:00:00Z'];
    const rows=dates.map((created_at,i)=>({...report(i+1),created_at,estado:i===0?'ENVIADO':i===3?'ERROR':'PENDIENTE'}));
    const {service,calls}=setup([page(rows)],{count:17,error:null});
    expect(await service.getStats(tenant)).toEqual({success:true,complete:true,tenant_id:tenant,data:{periodoActual:'2026-10',reportesDelMes:2,registrosTotales:20,totalDetalles:17,enviadosASunat:1,pendientes:2}});
    expect(calls.find(x=>x.table==='sire_registros_detalle')).toMatchObject({options:{count:'exact',head:true},filters:[['tenant_id',tenant]]});
  });
  it.each([null,-1,0.5,NaN])('no inventa cero detalles ante count=%s',async count=>{
    await expect(setup([page([])],{count,error:null}).service.getStats(tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('propaga fallo en fuente de detalles',async()=>{
    await expect(setup([page([])],{count:0,error:{code:'XX'}}).service.getStats(tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each([{total_registros:-1},{total_registros:1.5},{total_registros:null},{created_at:'bad'},{estado:'INVALID'}])('rechaza estadísticas incoherentes %s',async patch=>{
    await expect(setup([page([{...report(),...patch}])]).service.getStats(tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('no redondea sumatoria fuera de entero seguro',async()=>{
    await expect(setup([page([{...report(),total_registros:Number.MAX_SAFE_INTEGER},report(2)])]).service.getStats(tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('bitácora paginada está correlacionada con reporte y tenant',async()=>{
    const rows=Array.from({length:1001},(_,i)=>({id:id(i+2),tenant_id:tenant,reporte_id:id(1)}));
    const {service,calls}=setup([],undefined,[page(rows.slice(0,1000),1001),page(rows.slice(1000),1001)]);
    expect(await service.getOperaciones(id(1),tenant)).toMatchObject({complete:true,total:1001,tenant_id:tenant,reporte_id:id(1)});
    expect(calls[0].filters).toEqual([['tenant_id',tenant],['id',id(1)]]);
    for(const call of calls.slice(1))expect(call.filters).toEqual([['tenant_id',tenant],['reporte_id',id(1)]]);
  });
  it.each([
    ['ausente',{data:null,error:null},NotFoundException],['fuente',{data:null,error:{code:'XX'}},ServiceUnavailableException],
    ['ajeno',{data:{id:id(1),tenant_id:id(2)},error:null},ServiceUnavailableException],
  ])('no anuncia bitácora vacía para propietario %s',async(_name,owner,ErrorType)=>{
    const {service,calls}=setup([],undefined,[],owner);await expect(service.getOperaciones(id(1),tenant)).rejects.toBeInstanceOf(ErrorType);expect(calls).toHaveLength(1);
  });
  it('rechaza operación de otro reporte',async()=>{
    await expect(setup([],undefined,[page([{id:id(2),tenant_id:tenant,reporte_id:id(3)}])]).service.getOperaciones(id(1),tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
