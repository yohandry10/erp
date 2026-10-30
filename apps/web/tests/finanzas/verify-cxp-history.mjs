import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ts=createRequire(path.join(web,'package.json'))('typescript'),module={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(web,'lib/finanzas/cxp-detail-contract.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,Date,Number,Object,Set,Math,JSON});
const {readCxpPayments,readCxpDetail}=module.exports,id=n=>'aa510000-0000-4000-8000-'+String(n).padStart(12,'0'),tenant=id(1),account=id(2),bank=id(3),checks=[];
const bankRow=()=>({id:id(4),tenant_id:tenant,cxp_id:account,cuenta_por_pagar_id:account,moneda:'USD',fuente:'BANCO',tipo:'CARGO',fecha:'2026-10-07',monto:2,metodo_pago:'TRANSFERENCIA',conciliado:false,cuenta_bancaria_id:bank,cuenta_bancaria:{id:bank,banco:'Fixture',numero_cuenta:'000',moneda:'USD'}});
const cashRow=()=>({...bankRow(),id:id(5),fuente:'CAJA',metodo_pago:'EFECTIVO',estado:'APLICADO',activo:true,cuenta_bancaria:null});
const envelope=(data=[bankRow(),cashRow()])=>({success:true,tenant_id:tenant,cuenta_por_pagar_id:account,moneda:'USD',total:data.length,data,fuentes_pagos:{complete:true,total:data.length,page_size:1000,bank_total:data.filter(r=>r.fuente==='BANCO').length,cash_total:data.filter(r=>r.fuente==='CAJA').length}});
const read=v=>readCxpPayments(v,'USD',account,tenant),test=(name,run)=>{run();checks.push(name);},reject=(name,mutate)=>test(name,()=>{const v=envelope();mutate(v);assert.throws(()=>read(v));});
test('bank_and_cash_keep_original_ids_amounts_and_order',()=>{const v=envelope();assert.equal(read(v),v.data);assert.equal(read(v).reduce((n,r)=>n+r.monto,0),4);});
for(const rows of [[],[bankRow()],[cashRow()]])test('complete_source_'+rows.length+'_'+(rows[0]?.fuente||'empty'),()=>assert.equal(read(envelope(rows)).length,rows.length));
for(const flag of ['offline','cached','queued','pending','from_cache'])for(const level of ['envelope','source','row'])reject(flag+'_'+level,v=>{(level==='envelope'?v:level==='source'?v.fuentes_pagos:v.data[0])[flag]=true;});
const cases={
 missing_source:v=>delete v.fuentes_pagos,missing_total:v=>delete v.total,unknown_total:v=>v.total=null,
 truncated_actual_source:v=>v.data.pop(),false_empty:v=>v.data=[],unconfirmed_source:v=>v.fuentes_pagos.complete=false,
 source_total_mismatch:v=>v.fuentes_pagos.total=1,unknown_bank_count:v=>v.fuentes_pagos.bank_total=null,
 wrong_cash_count:v=>v.fuentes_pagos.cash_total=2,wrong_source_size:v=>v.fuentes_pagos.page_size=50,
 missing_scope:v=>delete v.tenant_id,foreign_tenant:v=>v.tenant_id=id(20),foreign_account:v=>v.cuenta_por_pagar_id=id(20),foreign_currency:v=>v.moneda='PEN',
 foreign_row_tenant:v=>v.data[0].tenant_id=id(20),foreign_row_account:v=>v.data[0].cxp_id=id(20),missing_row_account:v=>delete v.data[0].cuenta_por_pagar_id,
 wrong_row_currency:v=>v.data[0].moneda='PEN',unknown_source:v=>v.data[0].fuente='OTHER',bank_as_cash:v=>v.data[0].fuente='CAJA',cash_as_bank:v=>v.data[1].fuente='BANCO',
 wrong_bank_id:v=>v.data[0].cuenta_bancaria.id=id(20),wrong_bank_currency:v=>v.data[0].cuenta_bancaria.moneda='PEN',missing_bank:v=>v.data[0].cuenta_bancaria=null,
 missing_bank_name:v=>delete v.data[0].cuenta_bancaria.banco,invalid_type:v=>v.data[0].tipo='ABONO',unknown_method:v=>v.data[0].metodo_pago='OTHER',
 wrong_cash_state:v=>v.data[1].estado='ANULADO',inactive_cash:v=>v.data[1].activo=false,unknown_reconciliation:v=>v.data[0].conciliado='false',
 duplicate_id:v=>v.data[1].id=v.data[0].id,invalid_amount:v=>v.data[0].monto='2',zero_amount:v=>v.data[0].monto=0,negative_amount:v=>v.data[0].monto=-2,
 fractional_cent:v=>v.data[0].monto=0.001,unsafe_amount:v=>v.data[0].monto=Number.MAX_SAFE_INTEGER,invalid_calendar:v=>v.data[0].fecha='2026-02-30',missing_date:v=>delete v.data[0].fecha,
};
for(const [name,mutate] of Object.entries(cases))reject(name,mutate);
test('invalid_requested_identity_fails_before_display',()=>assert.throws(()=>readCxpPayments(envelope(),'USD','other',tenant)));
test('valid_leap_day_preserved',()=>{const v=envelope();v.data[0].fecha='2024-02-29';assert.equal(read(v)[0].fecha,'2024-02-29');});
test('account_detail_contract_remains_bound_and_unchanged',()=>{const value={id:account,tenant_id:tenant,proveedor_id:id(8),numero_documento:'F001-1',tipo_documento:'FACTURA',estado:'PAGADA',moneda:'USD',fecha_emision:'2026-10-01',fecha_vencimiento:'2026-10-15',total:4,saldo:0,proveedor:{id:id(8),razon_social:'Fixture',ruc:'20123456789'}};assert.equal(readCxpDetail({success:true,data:value},account,tenant),value);assert.throws(()=>readCxpDetail({success:true,data:{...value,tenant_id:id(20)}},account,tenant));});
console.log(JSON.stringify({result:'PASS',checks:checks.length,scope:'CXP_COMPLETE_SCOPED_PAYMENT_HISTORY_CONTRACT',names:checks}));
