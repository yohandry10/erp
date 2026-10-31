import { BadRequestException,ServiceUnavailableException } from '@nestjs/common';
import { PlanillasService } from './planillas.service';
const tenant='tenant-1',employee='employee-1';
const row=(n:number)=>({id:`request-${n}`,tenant_id:tenant,id_empleado:employee,tipo:'vacaciones',estado:'aprobada',fecha_inicio:n===1001?'2026-10-13':'2025-01-01',fecha_fin:n===1001?'2026-10-13':'2025-01-01'});
const page=(data:any[],count=data.length)=>({data,count,error:null});
function setup(pages:any[]){
  const calls:any[]=[];const rpc=jest.fn(()=>{throw new Error('Source read cannot persist payroll')});const client={rpc,from:jest.fn((table:string)=>{
    const c:any={table,filters:[]};calls.push(c);const result=pages.shift();const q:any={select:(s:any,o:any)=>{c.selection=s;c.options=o;return q},in:(k:any,v:any)=>{c.filters.push(['in',k,v]);return q},eq:(k:any,v:any)=>{c.filters.push(['eq',k,v]);return q},order:(k:any,v:any)=>{c.order=[k,v];return q},range:(a:any,b:any)=>{c.range=[a,b];return q},then:(resolve:any,reject:any)=>Promise.resolve(result).then(resolve,reject)};return q;
  })};const service=new PlanillasService({getClient:()=>client} as any,{} as any);
  return {service,calls,rpc,read:(ids=[employee],period='2026-10',company:string|undefined=tenant)=>(service as any).obtenerDiasVacacionesDelPeriodo(ids,period,company)};
}
describe('Fuente íntegra de vacaciones antes del cálculo de planilla',()=>{
  it('la solicitud1001 aprobada aporta el día13 de octubre sin perder cola ni inventar cero',async()=>{
    const rows=Array.from({length:1001},(_,i)=>row(i+1));const {read,calls,rpc}=setup([page(rows.slice(0,1000),1001),page(rows.slice(1000),1001)]);
    expect(await read()).toEqual(new Map([[employee,1]]));expect(calls.map(c=>c.range)).toEqual([[0,999],[1000,1999]]);
    for(const c of calls){expect(c.options.count).toBe('exact');expect(c.selection).toContain('tenant_id');expect(c.filters).toEqual([['in','id_empleado',[employee]],['eq','tenant_id',tenant],['eq','tipo','vacaciones'],['eq','estado','aprobada']]);expect(c.order).toEqual(['id',{ascending:true}])}
    expect(rpc).not.toHaveBeenCalled();
  });
  it('superposiciones de solicitudes distintas se deduplican entre páginas y el cruce de mes respeta cada fecha civil',async()=>{
    const first=Array.from({length:1000},(_,i)=>({...row(i),fecha_inicio:'2026-09-29',fecha_fin:'2026-10-03'}));const last={...row(1001),fecha_inicio:'2026-10-03',fecha_fin:'2026-10-04'};
    expect(await setup([page(first,1001),page([last],1001)]).read()).toEqual(new Map([[employee,4]]));
  });
  it.each([null,{data:null,count:0,error:null},{data:[],count:null,error:null},page([row(1)],2),page([row(1),row(1)]),{data:[],count:0,error:{code:'08006'}}])('fuente %s desconocida/truncada/duplicada impide cálculo',async value=>{
    const {read,rpc}=setup([value]);await expect(read()).rejects.toBeInstanceOf(ServiceUnavailableException);expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['foreignTenant','foreignEmployee','wrongType','notApproved','missingID','unknownDate','invalidDate','reversed'])('fila %s nunca se omite para calcular cero',async kind=>{
    const r:any=row(1001);if(kind==='foreignTenant')r.tenant_id='foreign';if(kind==='foreignEmployee')r.id_empleado='foreign';if(kind==='wrongType')r.tipo='licencia';if(kind==='notApproved')r.estado='rechazada';if(kind==='missingID')r.id=null;if(kind==='unknownDate')r.fecha_inicio=null;if(kind==='invalidDate')r.fecha_inicio='2026-02-30';if(kind==='reversed')r.fecha_inicio='2026-10-14';await expect(setup([page([r])]).read()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('fallo o cambio de conteo en segunda página impide aceptar los primeros1000',async()=>{
    const rows=Array.from({length:1000},(_,i)=>row(i));for(const second of [null,{data:[],count:1001,error:{code:'08006'}},page([row(1001)],1002)])await expect(setup([page(rows,1001),second]).read()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('sólo el conteo0 confirmado representa ausencia de vacaciones',async()=>{
    expect(await setup([page([])]).read()).toEqual(new Map());
  });
  it('sin empleados no consulta fuentes, manteniendo el período/empresa válidos',async()=>{
    const {read,calls}=setup([]);expect(await read([])).toEqual(new Map());expect(calls).toHaveLength(0);
  });
  it.each(['bad','2026-13','2026-1',''])('período %s inválido falla antes de consultar',async period=>{
    const {read,calls}=setup([]);await expect(read([employee],period)).rejects.toBeInstanceOf(BadRequestException);expect(calls).toHaveLength(0);
  });
  it('empresa ausente y empleados repetidos impiden consulta sin alcance',async()=>{
    await expect(setup([]).read([employee],'2026-10','')).rejects.toBeInstanceOf(BadRequestException);await expect(setup([]).read([employee,employee])).rejects.toBeInstanceOf(BadRequestException);
  });
});
