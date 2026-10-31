import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ts=createRequire(path.join(web,'package.json'))('typescript');
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(web,'lib/finanzas/cxc-read-contract.ts'),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,{module,exports:module.exports,URL,Date,Number,Object,Set,Math,JSON});
const {loadCxcList,readCxcHistory,loadCxcCustomers,cxcPendingBalances}=module.exports;
const id=n=>'aa000000-0000-4000-8000-'+String(n).padStart(12,'0');
const scope={tenantId:id(1),actorId:id(2)},checks=[];
const row=n=>({id:id(n+10),tenant_id:scope.tenantId,cliente_id:id(3),clientes:{id:id(3),razon_social:'Cliente de prueba',documento_numero:'20123456789'},serie:'F001',numero:String(n+1),tipo_documento:'FACTURA',estado:'PENDIENTE',moneda:'PEN',fecha_emision:'2026-10-01',fecha_vencimiento:'2026-10-15',total:10,saldo:3});
const envelope=rows=>({success:true,data:rows,pagination:{page:1,limit:50,total:rows.length,totalPages:Math.ceil(rows.length/50)}});
const clone=value=>JSON.parse(JSON.stringify(value));
const test=async(name,run)=>{await run();checks.push(name);};
const rejects=mutate=>assert.rejects(()=>loadCxcList(async()=>{const value=envelope([row(0)]);mutate(value);return value;},'/api/finanzas/cxc',scope));

await test('empty_confirmed_page_is_valid',async()=>assert.equal((await loadCxcList(async()=>envelope([]),'/api/finanzas/cxc',scope)).length,0));
await test('explicit_legacy_null_customer_document_is_preserved',async()=>{
 const value=row(0);value.clientes.documento_numero=null;
 assert.equal((await loadCxcList(async()=>envelope([value]),'/api/finanzas/cxc',scope))[0].clientes.documento_numero,null);
});
await test('legacy_numeric_customer_document_is_normalized_without_amount_changes',async()=>{
 const value=row(0);value.clientes.documento_numero=20123456789;
 const result=(await loadCxcList(async()=>envelope([value]),'/api/finanzas/cxc',scope))[0];
 assert.equal(result.clientes.documento_numero,'20123456789');assert.equal(result.saldo,3);
});
await test('canonical_opening_import_keeps_legacy_number_in_list_and_history',async()=>{
 const value={...row(0),numero:'22c9bd04',external_id:'APERTURA-cxc-22c9bd04',event_source:'migracion.apertura',metadata:{origen:'migracion_apertura'}};
 const result=(await loadCxcList(async()=>envelope([value]),'/api/finanzas/cxc?search=22c9bd04',scope))[0];
 assert.equal(result.numero,value.numero);assert.equal(result.saldo,3);assert.equal(result.total,10);
 const detail=readCxcHistory({...value,pagos:[{id:id(8),tenant_id:scope.tenantId,cuenta_id:value.id,fecha_pago:'2026-10-10',monto:7,moneda:'PEN',metodo_pago:'TRANSFERENCIA'}]},value.id,scope);
 assert.equal(detail.numero,value.numero);assert.equal(detail.pagos.length,1);
});
await test('canonical_database_vencida_maps_to_public_vencido_in_list_and_history',async()=>{
 for(const imported of [false,true]){
  const value={...row(0),estado:'VENCIDA',...(imported?{numero:'65c02672',external_id:'APERTURA-cxc-65c02672',event_source:'migracion.apertura',metadata:{origen:'migracion_apertura'}}:{})};
  const result=(await loadCxcList(async()=>envelope([value]),'/api/finanzas/cxc?estado=VENCIDO',scope))[0];
  assert.equal(result.estado,'VENCIDO');assert.equal(result.numero,value.numero);assert.equal(result.saldo,3);assert.equal(result.total,10);
  const detail=readCxcHistory({...value,pagos:[{id:id(8),tenant_id:scope.tenantId,cuenta_id:value.id,fecha_pago:'2026-10-10',monto:7,moneda:'PEN',metodo_pago:'TRANSFERENCIA'}]},value.id,scope);
  assert.equal(detail.estado,'VENCIDO');assert.equal(detail.pagos.length,1);
 }
});
await test('unknown_overdue_state_still_rejects_whole_page',()=>rejects(value=>{value.data[0].estado='VENCIDAX';}));
for(const field of ['event_source','external_id','metadata'])await test('legacy_number_requires_import_provenance_'+field,()=>rejects(value=>{
 value.data[0]={...value.data[0],numero:'22c9bd04',external_id:'APERTURA-cxc-22c9bd04',event_source:'migracion.apertura',metadata:{origen:'migracion_apertura'}};
 delete value.data[0][field];
}));
for(const numero of ['', ' ', '0', '-1', null, {}])await test('invalid_original_number_'+JSON.stringify(numero),()=>rejects(value=>{value.data[0].numero=numero;}));
await test('all_51_rows_across_two_pages_are_returned_once',async()=>{
 const rows=Array.from({length:51},(_,n)=>row(n)),seen=[];
 const result=await loadCxcList(async endpoint=>{const p=Number(new URL(endpoint,'http://localhost').searchParams.get('page'));seen.push(p);return {success:true,data:rows.slice((p-1)*50,p*50),pagination:{page:p,limit:50,total:51,totalPages:2}};},'/api/finanzas/cxc?estado=PENDIENTE',scope);
 assert.equal(result.length,51);assert.deepEqual(seen,[1,2]);
});
for(const flag of ['cached','offline','queued','pending','from_cache'])for(const level of ['envelope','row','customer'])await test(flag+'_'+level+'_is_not_current',()=>rejects(value=>{(level==='envelope'?value:level==='row'?value.data[0]:value.data[0].clientes)[flag]=true;}));
for(const field of ['tenant_id','id','cliente_id','moneda','saldo','total','fecha_emision','fecha_vencimiento','estado','serie','numero','clientes'])await test('missing_'+field+'_rejects_whole_page',()=>rejects(value=>{delete value.data[0][field];}));
for(const [label,change] of [
 ['foreign_tenant',r=>r.tenant_id=id(9)],['foreign_customer',r=>r.clientes.id=id(9)],['invalid_balance',r=>r.saldo='3'],['negative_balance',r=>r.saldo=-1],['balance_over_original',r=>r.saldo=11],['invalid_calendar',r=>r.fecha_vencimiento='2026-02-30'],['cancelled_positive_balance',r=>r.estado='CANCELADO'],['contradictory_alias',r=>r.monto_pendiente=1],
])await test(label,()=>rejects(value=>change(value.data[0])));
for(const [label,change] of [
 ['missing_metadata',v=>delete v.pagination],['wrong_page',v=>v.pagination.page=2],['wrong_limit',v=>v.pagination.limit=100],['wrong_total',v=>v.pagination.total=2],['wrong_page_count',v=>v.pagination.totalPages=2],['duplicate_ids',v=>{v.data.push(clone(v.data[0]));v.pagination.total=2;}],
])await test(label,()=>rejects(change));
await test('page_two_failure_does_not_return_page_one',async()=>assert.rejects(()=>loadCxcList(async endpoint=>{
 const p=Number(new URL(endpoint,'http://localhost').searchParams.get('page'));if(p===2)throw Error('temporarily unavailable');
 return {success:true,data:Array.from({length:50},(_,n)=>row(n)),pagination:{page:1,limit:50,total:51,totalPages:2}};
},'/api/finanzas/cxc',scope)));
for(const params of ['estado=CANCELADO','cliente_id='+id(9),'desde=2026-10-16','hasta=2026-10-14'])await test('filter_scope_'+params,async()=>assert.rejects(()=>loadCxcList(async()=>envelope([row(0)]),'/api/finanzas/cxc?'+params,scope)));
const history=()=>({...row(0),pagos:[{id:id(8),tenant_id:scope.tenantId,cuenta_id:row(0).id,fecha_pago:'2026-10-10',monto:7,moneda:'PEN',metodo_pago:'TRANSFERENCIA'}]});
await test('raw_and_enveloped_real_history_contract',async()=>{
 for(const value of [history(),{success:true,data:history()}]){const result=readCxcHistory(value,row(0).id,scope);assert.equal(result.monto_total,10);assert.equal(result.monto_pendiente,3);assert.equal(result.pagos.length,1);}
});
for(const [label,change] of [
 ['wrong_account',v=>v.id=id(9)],['wrong_tenant',v=>v.tenant_id=id(9)],['missing_payments',v=>delete v.pagos],['duplicate_payment',v=>v.pagos.push(clone(v.pagos[0]))],['foreign_payment',v=>v.pagos[0].cuenta_id=id(9)],['foreign_payment_tenant',v=>v.pagos[0].tenant_id=id(9)],['wrong_payment_currency',v=>v.pagos[0].moneda='USD'],['invalid_payment_date',v=>v.pagos[0].fecha_pago='2026-02-30'],['missing_payment_amount',v=>delete v.pagos[0].monto],['cached_payment',v=>v.pagos[0].cached=true],
])await test('history_'+label,async()=>{const value=history();change(value);assert.throws(()=>readCxcHistory(value,row(0).id,scope));});
await test('customer_catalog_requires_current_tenant',async()=>{
 const value={success:true,data:[{id:id(3),tenant_id:scope.tenantId,razon_social:'Cliente'}]};
 assert.equal((await loadCxcCustomers(async()=>value,'/clientes',scope)).length,1);value.data[0].tenant_id=id(9);await assert.rejects(()=>loadCxcCustomers(async()=>value,'/clientes',scope));
});
await test('nominal_currencies_never_added_together_and_decimal_carry_is_exact',async()=>{
 const result=cxcPendingBalances([{moneda:'PEN',saldo:.1,estado:'PENDIENTE'},{moneda:'PEN',saldo:.2,estado:'PARCIAL'},{moneda:'USD',saldo:4.2,estado:'PENDIENTE'}]);
 assert.equal(result.PEN,.3);assert.equal(result.USD,4.2);
});
console.log(JSON.stringify({result:'PASS',checks:checks.length,cases:checks}));
