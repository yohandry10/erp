import {PresupuestosService} from './presupuestos.service';
import {budgetCalendarWindow} from './budget-calendar-window';

describe('Presupuesto: mes civil completo del país de la empresa',()=>{
 const originalTZ=process.env.TZ;
 afterEach(()=>{if(originalTZ===undefined)delete process.env.TZ;else process.env.TZ=originalTZ});
 const boundaryRows=[
  {fecha:'2026-10-01T04:59:59.999Z',debe:.01,haber:0},
  {fecha:'2026-10-01T05:00:00.000Z',debe:1.11,haber:0},
  {fecha:'2026-11-01T04:59:59.999Z',debe:2.22,haber:0},
  {fecha:'2026-11-01T05:00:00.000Z',debe:8.88,haber:0},
 ];
 function setup(country:unknown={pais:'PE'},error:unknown=null,throwCountry=false) {
  const calls:Array<{table:string;key?:string;value?:unknown}>=[];
  let start='',end='';
  const client={from:(table:string)=>{
   calls.push({table});
   const builder={select:()=>builder,eq:(key:string,value:unknown)=>{calls.push({table,key,value});return builder},
    maybeSingle:async()=>{if(table==='empresa_config'&&throwCountry)throw Error('PRIVATE_SQL_CREDENTIAL');return {data:table==='empresa_config'?country:{anio:2026,mes:10},error:table==='empresa_config'?error:null}},
    gte:(key:string,value:string)=>{start=value;calls.push({table,key,value});return builder},
    lt:(key:string,value:string)=>{end=value;calls.push({table,key,value});return builder},
    order:()=>builder,range:async()=>{const data=boundaryRows.filter(r=>r.fecha>=start&&r.fecha<end).map(({debe,haber},i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),debe,haber}));return {data,error:null,count:data.length}},
   };return builder;
  }};
  return {service:new PresupuestosService({getClient:()=>client} as any),calls};
 }
 it.each(['UTC','America/Lima','Asia/Tokyo'])('incluye último milisegundo yexcluye meses vecinos conhost %s',async host=>{
  process.env.TZ=host;const {service,calls}=setup();
  await expect(service.calcularMontoEjecutado('tenant-a','center-a','account-a','period-a')).resolves.toBe(3.33);
  expect(calls).toContainEqual({table:'detalle_asientos',key:'asientos_contables.fecha',value:'2026-10-01T05:00:00.000Z'});
  expect(calls).toContainEqual({table:'detalle_asientos',key:'asientos_contables.fecha',value:'2026-11-01T05:00:00.000Z'});
 });
 it('país, período yambos lados deldetalle conservan filtro deempresa yasientos confirmados',async()=>{
  const {service,calls}=setup();await service.calcularMontoEjecutado('tenant-a','center-a','account-a','period-a');
  for(const table of ['empresa_config','periodos_contables','detalle_asientos'])expect(calls).toContainEqual({table,key:'tenant_id',value:'tenant-a'});
  expect(calls).toContainEqual({table:'detalle_asientos',key:'asientos_contables.tenant_id',value:'tenant-a'});
  expect(calls).toContainEqual({table:'detalle_asientos',key:'asientos_contables.estado',value:'CONFIRMADO'});
 });
 it.each([null,{},[],{pais:null},{pais:1},{pais:''},{pais:'ZZ'}])('configuración incompleta %p falla503 antes de leer movimientos',async country=>{
  const {service,calls}=setup(country);await expect(service.calcularMontoEjecutado('tenant-a','center-a','account-a','period-a')).rejects.toMatchObject({status:503});expect(calls.some(c=>c.table==='detalle_asientos')).toBe(false);
 });
 it.each([false,true])('fallo de configuración, SDKthrow=%s, se sanea yno acredita cero',async throws=>{
  const {service,calls}=setup({pais:'PE'},throws?null:{message:'PRIVATE_SQL_CREDENTIAL'},throws);
  try{await service.calcularMontoEjecutado('tenant-a','center-a','account-a','period-a');throw Error('Expected failure')}catch(error:any){expect(error.status).toBe(503);expect(error.message).not.toContain('PRIVATE_SQL_CREDENTIAL')}
  expect(calls.some(c=>c.table==='detalle_asientos')).toBe(false);
 });
 it.each([['PE',5],['CO',5],['EC',5],['BO',4],['CL',3],['AR',3],['MX',6]])('octubre2026 respeta país %s sin depender delhost', (country,hour)=>{
  const suffix=String(hour).padStart(2,'0')+':00:00.000Z';expect(budgetCalendarWindow(2026,10,country)).toMatchObject({desde:'2026-10-01T'+suffix,hasta:'2026-11-01T'+suffix});
 });
 it('Santiago resuelve cada límite por separado durante cambio deoffset en septiembre',()=>{
  expect(budgetCalendarWindow(2026,9,'CL')).toMatchObject({desde:'2026-09-01T04:00:00.000Z',hasta:'2026-10-01T03:00:00.000Z'});
 });
 it('febrero bisiesto ycruce diciembre/enero conservan todos los días civiles',()=>{
  expect(budgetCalendarWindow(2024,2,'PE')).toMatchObject({desde:'2024-02-01T05:00:00.000Z',hasta:'2024-03-01T05:00:00.000Z'});
  expect(budgetCalendarWindow(2026,12,'PE')).toMatchObject({desde:'2026-12-01T05:00:00.000Z',hasta:'2027-01-01T05:00:00.000Z'});
 });
 it.each([[1899,1,'PE'],[10000,1,'PE'],[2026,0,'PE'],[2026,13,'PE'],[2026.1,1,'PE'],[2026,1.1,'PE'],[2026,1,null],[2026,1,'ZZ']])('rechaza calendario incompleto %p/%p/%p',(year,month,country)=>{
  expect(()=>budgetCalendarWindow(year as number,month as number,country)).toThrow();
 });
});
