import {PresupuestosService} from './presupuestos.service';

describe('Gasto presupuestal: reversa reduce el neto ysuelo cero al final',()=>{
 const id=(i:number)=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0');
 function setup(values:Array<any>,failLast=false) {
  const rows=values.map((r,i)=>({id:id(i),tenant_id:'tenant-a',cuenta_id:'expense-account-a',centro_costo_id:'center-a',debe:r.debe??0,haber:r.haber??0,...r.fields,asientos_contables:{tenant_id:'tenant-a',estado:'CONFIRMADO',fecha:'2026-10-15T17:00:00Z',...r.journal}}));
  const client={from:(table:string)=>{
   const filters:Array<(r:any)=>boolean>=[];const field=(row:any,key:string)=>key.split('.').reduce((v,k)=>v?.[k],row);
   const builder:any={select:()=>builder,eq:(key:string,value:unknown)=>{filters.push(r=>field(r,key)===value);return builder},gte:(key:string,value:string)=>{filters.push(r=>field(r,key)>=value);return builder},lt:(key:string,value:string)=>{filters.push(r=>field(r,key)<value);return builder},order:()=>builder,
    maybeSingle:async()=>({data:table==='empresa_config'?{pais:'PE'}:{anio:2026,mes:10},error:null}),
    range:async(first:number,last:number)=>{if(failLast&&first>=1000)return {data:null,count:null,error:{message:'PRIVATE_PAGE_FAILURE'}};const selected=rows.filter(r=>filters.every(f=>f(r)));return {data:selected.slice(first,last+1),count:selected.length,error:null}},
   };return builder;
  }};
  return new PresupuestosService({getClient:()=>client} as any);
 }
 const run=(service:PresupuestosService)=>service.calcularMontoEjecutado('tenant-a','center-a','expense-account-a','period-a');
 it.each([
  ['positiveExpense',[{debe:10,haber:0}],10],
  ['partialReversal',[{debe:10,haber:0},{debe:0,haber:4}],6],
  ['fullReversal',[{debe:10,haber:0},{debe:0,haber:10}],0],
  ['excessReversal',[{debe:10,haber:0},{debe:0,haber:14}],0],
  ['creditOnly',[{debe:0,haber:4}],0],
  ['centNegative',[{debe:.29,haber:.30}],0],
  ['centPositive',[{debe:.30,haber:.29}],.01],
  ['decimalCancellation',[{debe:.1},{debe:.2},{haber:.3}],0],
  ['decimalStrings',[{debe:'1.10',haber:'0.00'},{debe:'0.00',haber:'0.90'}],.2],
  ['empty',[],0],
 ] as Array<[string,any[],number]>)('%s confirma neto verificado sin invertir créditos',async(_name,rows,expected)=>{
  await expect(run(setup(rows))).resolves.toBe(expected);
 });
 it.each([
  ['draft',{journal:{estado:'BORRADOR'}}],['cancelled',{journal:{estado:'ANULADO'}}],
  ['foreignDetail',{fields:{tenant_id:'tenant-b'}}],['foreignJournal',{journal:{tenant_id:'tenant-b'}}],
  ['otherAccount',{fields:{cuenta_id:'other-account'}}],['otherCenter',{fields:{centro_costo_id:'other-center'}}],
  ['beforeMonth',{journal:{fecha:'2026-10-01T04:59:59.999Z'}}],['afterMonth',{journal:{fecha:'2026-11-01T05:00:00.000Z'}}],
 ] as Array<[string,any]>)('reversa %s se excluye porfiltros canónicos antes de calcular neto',async(_name,override)=>{
  await expect(run(setup([{debe:10},{haber:15,...override}]))).resolves.toBe(10);
 });
 it('primer milisegundo yúltimo milisegundo delmesPE incluyen reversa completa',async()=>{
  await expect(run(setup([{debe:10,journal:{fecha:'2026-10-01T05:00:00.000Z'}},{haber:10,journal:{fecha:'2026-11-01T04:59:59.999Z'}}]))).resolves.toBe(0);
 });
 it('una reversa en segunda página reduce total a cero',async()=>{
  await expect(run(setup([...Array.from({length:1000},()=>({debe:1})),{haber:1004}]))).resolves.toBe(0);
 });
 it('el suelo se aplica alneto final, no porfila o página',async()=>{
  await expect(run(setup([...Array.from({length:1000},()=>({haber:1})),{debe:1004}]))).resolves.toBe(4);
 });
 it('página posterior fallida no convierte subtotal negativo en cero confirmado',async()=>{
  await expect(run(setup([...Array.from({length:1000},()=>({haber:1})),{debe:1004}],true))).rejects.toMatchObject({status:503});
 });
 it('una resta fuera deprecisión se rechaza antes de aplicar suelo cero',async()=>{
  await expect(run(setup([{haber:'90071992547409.92'}]))).rejects.toMatchObject({status:503});
 });
});
