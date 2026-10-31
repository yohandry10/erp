import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { RevaluacionService } from './revaluacion.service';
const tenant='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
const id=(n:number)=>`33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
const cxc=(n=1)=>({id:id(n),tenant_id:tenant,fecha_emision:'2026-08-07',moneda:'USD',estado:'PENDIENTE',monto_pendiente:.01,tipo_cambio_origen:3.5});
const page=(data:any[],count=data.length)=>({data,count,error:null});
const quote=()=>({id:id(2000),tenant_id:tenant,moneda_origen:'USD',moneda_destino:'PEN',fecha:'2026-08-07',compra:4,venta:4,activo:true,estado:'ACTIVO'});
function setup(overrides:Record<string,any>={}){
  const tables:Record<string,any>={empresa_config:{data:{tenant_id:tenant,pais:'PE'},error:null},cuentas_por_cobrar:page([cxc()]),cuentas_por_pagar:page([]),tipos_cambio:page([quote()]),...overrides};
  const calls:any[]=[];const rpc=jest.fn(()=>{throw new Error('Read simulation cannot write')});
  const client={rpc,from:jest.fn((table:string)=>{const c:any={table,filters:[],orders:[]};calls.push(c);let start=0,end=999;
    const result=()=>{const r=typeof tables[table]==='function'?tables[table](start):tables[table];return Array.isArray(r?.data)?{...r,data:r.data.slice(start,end+1)}:r};
    const q:any={select:(s:any,o:any)=>{c.selection=s;c.options=o;return q},eq:(k:any,v:any)=>{c.filters.push(['eq',k,v]);return q},lte:(k:any,v:any)=>{c.filters.push(['lte',k,v]);return q},order:(k:any,v:any)=>{c.orders.push([k,v]);return q},range:(a:number,b:number)=>{start=a;end=b;c.range=[a,b];return q},maybeSingle:async()=>result(),then:(resolve:any,reject:any)=>Promise.resolve(result()).then(resolve,reject)};return q;
  })};
  const periodos={validarPeriodoAbierto:jest.fn()};const fx={obtenerMonedaLocal:jest.fn(),obtenerVigente:jest.fn()};
  return {service:new RevaluacionService({getClient:()=>client} as any,periodos as any,fx as any),tables,calls,rpc};
}
const read=(service:RevaluacionService)=>service.simularCompleta(tenant,'2026-08-07');
describe('Simulación completa de Revaluación sin escritura',()=>{
  it('metadata fuera del snapshot económico; redondeo de medio céntimo igual a PostgreSQL',async()=>{
    const {service,rpc}=setup();const v=await read(service);expect(v.data.posiciones).toHaveLength(0);expect(v.fuentes.sin_diferencia_total).toBe(1);
    expect(Object.keys(v.data).sort()).toEqual(['fecha','moneda_local','posiciones','total_ganancia','total_perdida','diferencia_neta','excluidas'].sort());expect(v.data).not.toHaveProperty('fuentes');expect(rpc).not.toHaveBeenCalled();
  });
  it('consulta1001 documentos con paginación y conteo estable; último documento altera el total',async()=>{
    const rows=Array.from({length:1001},(_,i)=>({...cxc(i+1),monto_pendiente:1,tipo_cambio_origen:3.5}));const {service,calls,rpc}=setup({cuentas_por_cobrar:page(rows)});
    const v=await read(service);expect(v.data.posiciones).toHaveLength(1001);expect(v.data.total_ganancia).toBe(500.5);expect(v.fuentes.cxc_total).toBe(1001);expect(v.fuentes.evaluadas_total).toBe(1001);
    expect(calls.filter(c=>c.table==='cuentas_por_cobrar').map(c=>c.range)).toEqual([[0,999],[1000,1999]]);expect(calls.filter(c=>c.table==='tipos_cambio')).toHaveLength(1);expect(rpc).not.toHaveBeenCalled();
  });
  it('CXC gana/CXP pierde, separado sin compensar y con decimal exacto',async()=>{
    const {service}=setup({cuentas_por_cobrar:page([{...cxc(),monto_pendiente:1}]),cuentas_por_pagar:page([{...cxc(2),saldo:2}])});const v=await read(service);
    expect(v.data.posiciones.map(p=>p.diferencia)).toEqual([.5,-1]);expect([v.data.total_ganancia,v.data.total_perdida,v.data.diferencia_neta]).toEqual([.5,1,-.5]);
  });
  it.each([null,{data:null,error:null},{data:{tenant_id:foreign,pais:'PE'},error:null},{data:{tenant_id:tenant,pais:'XX'},error:null},{data:{tenant_id:tenant,pais:null},error:null},{data:null,error:{code:'08006'}}])('país desconocido/ajeno nunca asume PEN %s',async config=>{
    await expect(read(setup({empresa_config:config}).service)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each(['bad','2026-02-30','2026-8-7','2026-08-07T00:00:00Z'])('corte %s inválido no consulta fuentes',async date=>{
    const {service,calls}=setup();await expect(service.simularCompleta(tenant,date)).rejects.toBeInstanceOf(BadRequestException);expect(calls).toHaveLength(0);
  });
  it.each(['cuentas_por_cobrar','cuentas_por_pagar'])('fuente%s desconocida/truncada no confirma vacío',async table=>{
    for(const value of [null,{data:null,count:0,error:null},{data:[],count:null,error:null},page([cxc()],2),{data:null,count:null,error:{code:'XX'}}])await expect(read(setup({[table]:value}).service)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each(['foreign','duplicate','missingDate','invalidDate','missingState','missingCurrency','badCurrency','nullSaldo','stringSaldo','negativeSaldo','fractionCents','hugeSaldo','invalidOrigin','stringOrigin','nanOrigin'])('posición %s impide total inventado',async kind=>{
    const row:any={...cxc(),monto_pendiente:1};if(kind==='foreign')row.tenant_id=foreign;if(kind==='missingDate')row.fecha_emision=null;if(kind==='invalidDate')row.fecha_emision='2026-02-30';if(kind==='missingState')row.estado=null;if(kind==='missingCurrency')row.moneda=null;if(kind==='badCurrency')row.moneda='?';if(kind==='nullSaldo')row.monto_pendiente=null;if(kind==='stringSaldo')row.monto_pendiente='1';if(kind==='negativeSaldo')row.monto_pendiente=-1;if(kind==='fractionCents')row.monto_pendiente=.011;if(kind==='hugeSaldo')row.monto_pendiente=1e20;if(kind==='invalidOrigin')row.tipo_cambio_origen=0;if(kind==='stringOrigin')row.tipo_cambio_origen='3.5';if(kind==='nanOrigin')row.tipo_cambio_origen=NaN;
    await expect(read(setup({cuentas_por_cobrar:page(kind==='duplicate'?[row,row]:[row])}).service)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('fecha posterior, saldada, anulada y moneda local se excluyen por reglas explícitas',async()=>{
    const rows=[{...cxc(),fecha_emision:'2026-08-08'},{...cxc(2),monto_pendiente:0},{...cxc(3),estado:'ANULADA'},{...cxc(4),moneda:'PEN'}];const v=await read(setup({cuentas_por_cobrar:page(rows)}).service);expect(v.fuentes.cxc_total).toBe(4);expect(v.fuentes.evaluadas_total).toBe(0);expect(v.data.posiciones).toEqual([]);
  });
  it('origen ausente confirmado se conserva como exclusión motivada',async()=>{
    const v=await read(setup({cuentas_por_cobrar:page([{...cxc(),tipo_cambio_origen:null}])}).service);expect(v.excluidas_total).toBe(1);expect(v.data.excluidas?.[0].motivo).toContain('no registra el tipo de cambio');
  });
  it('cotización vacía confirmada y lado compra ausente generan exclusión, no factor inventado',async()=>{
    for(const q of [page([]),page([{...quote(),compra:null}])]){const v=await read(setup({tipos_cambio:q}).service);expect(v.excluidas_total).toBe(1);expect(v.data.posiciones).toEqual([])}
  });
  it.each(['unknown','missingCount','short','foreign','pair','future','date','inactive','state','nullRow','undefinedSide','stringSide','zeroSide','nanSide'])('cotización %s nunca produce importe confirmado',async kind=>{
    let value:any=page([quote()]);const r=value.data[0];if(kind==='unknown')value=null;if(kind==='missingCount')delete value.count;if(kind==='short')value.data=[];if(kind==='foreign')r.tenant_id=foreign;if(kind==='pair')r.moneda_destino='USD';if(kind==='future')r.fecha='2026-08-08';if(kind==='date')r.fecha='2026-02-30';if(kind==='inactive')r.activo=false;if(kind==='state')r.estado='INACTIVO';if(kind==='nullRow')value.data=[null];if(kind==='undefinedSide')delete r.compra;if(kind==='stringSide')r.compra='4';if(kind==='zeroSide')r.compra=0;if(kind==='nanSide')r.compra=NaN;
    await expect(read(setup({tipos_cambio:value}).service)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('composición cambia entre páginas y se rechaza la fotografía parcial',async()=>{
    const rows=Array.from({length:1001},(_,i)=>cxc(i+1));await expect(read(setup({cuentas_por_cobrar:(offset:number)=>page(rows,offset===0?1001:1002)}).service)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
