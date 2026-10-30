import {PresupuestosService} from './presupuestos.service';

describe('Ejecución presupuestal: conteo completo y páginas verificadas',()=>{
 const row=(i:number)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),debe:'1.00',haber:'0.00'});
 function setup(size:number,mutate?:(page:any,offset:number)=>void,throwsAt?:number) {
  const rows=Array.from({length:size},(_,i)=>row(i)),calls:any[]=[];
  const client={from:(table:string)=>{
   const builder:any={select:(columns:string,options:any)=>{calls.push({table,select:columns,count:options?.count});return builder},
    eq:(key:string,value:unknown)=>{calls.push({table,key,value});return builder},gte:(key:string,value:unknown)=>{calls.push({table,key,value});return builder},lt:(key:string,value:unknown)=>{calls.push({table,key,value});return builder},order:(key:string,options:any)=>{calls.push({table,order:key,ascending:options.ascending});return builder},
    maybeSingle:async()=>({data:table==='empresa_config'?{pais:'PE'}:{anio:2026,mes:10},error:null}),
    range:async(first:number,last:number)=>{calls.push({table,first,last});if(first===throwsAt)throw Error('PRIVATE_SQL_CREDENTIAL');const page={data:rows.slice(first,last+1).map(r=>({...r})),count:rows.length,error:null};mutate?.(page,first);return page},
   };return builder;
  }};
  return {service:new PresupuestosService({getClient:()=>client} as any),calls};
 }
 const run=(service:PresupuestosService)=>service.calcularMontoEjecutado('tenant-a','center-a','account-a','period-a');
 it.each([0,1,1000,1001,2001])('lee exactamente %i movimientos sin perder filas tras límite1000',async size=>{
  const {service,calls}=setup(size);await expect(run(service)).resolves.toBe(size);const ranges=calls.filter(c=>'first' in c);expect(ranges).toHaveLength(Math.max(1,Math.ceil(size/1000)));expect(ranges.map(c=>[c.first,c.last])).toEqual(Array.from({length:Math.max(1,Math.ceil(size/1000))},(_,i)=>[i*1000,i*1000+999]));
  for(const c of calls.filter(c=>c.table==='detalle_asientos'&&'select' in c)){expect(c.count).toBe('exact');expect(c.select).toContain('id,debe,haber');}
  expect(calls.filter(c=>c.order==='id').every(c=>c.ascending===true)).toBe(true);
 });
 it('cada página mantiene empresa, cuenta, centro, confirmado yventana civilPE',async()=>{
  const {service,calls}=setup(1001);await run(service);
  for(const [key,value] of [['tenant_id','tenant-a'],['asientos_contables.tenant_id','tenant-a'],['asientos_contables.estado','CONFIRMADO'],['cuenta_id','account-a'],['centro_costo_id','center-a'],['asientos_contables.fecha','2026-10-01T05:00:00.000Z'],['asientos_contables.fecha','2026-11-01T05:00:00.000Z']])expect(calls.filter(c=>c.table==='detalle_asientos'&&c.key===key&&c.value===value)).toHaveLength(2);
 });
 it.each([undefined,null,-1,1.5,NaN,Infinity,'1001',Number.MAX_SAFE_INTEGER+1])('conteo inválido %p no confirma ni cero ni parcial',async count=>{
  const {service}=setup(1001,p=>{p.count=count});await expect(run(service)).rejects.toMatchObject({status:503});
 });
 it('un fallo posterior no devuelve los1000 ya sumados',async()=>{
  const {service}=setup(1001,(p,offset)=>{if(offset===1000)p.error={message:'PRIVATE_SQL_CREDENTIAL'}});await expect(run(service)).rejects.toMatchObject({status:503});
 });
 it('SDKthrow posterior se sanea yno confirma parcial',async()=>{
  const {service}=setup(1001,undefined,1000);try{await run(service);throw Error('Expected error')}catch(error:any){expect(error.status).toBe(503);expect(error.message).not.toContain('PRIVATE_SQL_CREDENTIAL')}
 });
 it('cambio deconteo entre páginas se rechaza',async()=>{
  const {service}=setup(1001,(p,offset)=>{if(offset===1000)p.count=1002});await expect(run(service)).rejects.toMatchObject({status:503});
 });
 it.each(['shortFirst','missingLast','extraLast','missingList'])('página incompleta %s se rechaza',async kind=>{
  const {service}=setup(1001,(p,offset)=>{if(kind==='shortFirst'&&offset===0)p.data.pop();if(kind==='missingLast'&&offset===1000)p.data=[];if(kind==='extraLast'&&offset===1000)p.data.push(row(1001));if(kind==='missingList'&&offset===1000)p.data=null});await expect(run(service)).rejects.toMatchObject({status:503});
 });
 it.each(['missingID','invalidID','samePageDuplicate','crossPageDuplicate','outOfOrder'])('identidad %s impide doble suma o página inconsistente',async kind=>{
  const {service}=setup(1001,(p,offset)=>{if(offset===0){if(kind==='missingID')delete p.data[0].id;if(kind==='invalidID')p.data[0].id='fake';if(kind==='samePageDuplicate')p.data[1].id=p.data[0].id;if(kind==='outOfOrder')[p.data[0],p.data[1]]=[p.data[1],p.data[0]]}else if(kind==='crossPageDuplicate')p.data[0].id=row(0).id});await expect(run(service)).rejects.toMatchObject({status:503});
 });
 it.each([undefined,null,'invalid',.001,Infinity])('importe inválido deúltima página %p no devuelve subtotal previo',async debe=>{
  const {service}=setup(1001,(p,offset)=>{if(offset===1000)p.data[0].debe=debe});await expect(run(service)).rejects.toMatchObject({status:503});
 });
 it('acumula centavos entre páginas sin error binario',async()=>{
  const {service}=setup(1001,(p)=>{for(const r of p.data)r.debe='0.01'});await expect(run(service)).resolves.toBe(10.01);
 });
});
