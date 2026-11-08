import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {webcrypto} from 'node:crypto';
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),ts=createRequire(path.join(web,'package.json'))('typescript');
const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(web,'lib/compras/receipt-reversal-operation.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,Date,Number,Object,Array,Set,JSON,Uint8Array,TextEncoder,crypto:webcrypto,Error});
const m=module.exports,vectors=JSON.parse(fs.readFileSync(path.join(web,'tests/compras/receipt-reversal.fixture.json'),'utf8')),clone=v=>JSON.parse(JSON.stringify(v)),checks=[];
const test=async(name,run)=>{await run();checks.push(name);};
for(const v of vectors){
 const i=v.intent,scope={tenantId:i.tenantId,actorId:i.actorId,receiptId:i.receiptId},key=m.receiptReversalPendingKey(scope);
 await test(v.name+'_postgres_fingerprint_and_original_roundtrip',async()=>assert.equal(JSON.stringify(await m.readReceiptReversalIntent(JSON.stringify(i),scope)),JSON.stringify(i)));
 await test(v.name+'_new_intent_has_same_canonical_payload_hash',async()=>{const fresh=await m.newReceiptReversalIntent(scope,i.receiptNumber,i.body);assert.equal(fresh.fingerprint,i.fingerprint);assert.notEqual(fresh.key,i.key);assert.deepEqual(JSON.parse(JSON.stringify(fresh.body)),i.body);});
 await test(v.name+'_actual_authenticated_receipt',async()=>assert.equal((await m.readReceiptReversalOutcome(v.response,i)).receipt.reversa_id,v.response.data.reversa_id));
 await test(v.name+'_scope_keys_are_separate',()=>assert.notEqual(key,m.receiptReversalPendingKey({...scope,actorId:scope.receiptId})));
 for(const [name,mutate] of [
  ['changed_actor',x=>x.actorId=x.receiptId],['changed_tenant',x=>x.tenantId=x.receiptId],['changed_source',x=>x.receiptId=x.actorId],
  ['changed_reason',x=>x.body.motivo+=' cambiado'],['changed_date',x=>x.body.fecha_contable='2026-01-01'],['missing_fingerprint',x=>delete x.fingerprint],
  ['extra_field',x=>x.token='forbidden'],['impossible_date',x=>x.body.fecha_contable='2026-02-30'],['body_extra',x=>x.body.cantidad=1],
 ])await test(v.name+'_'+name,async()=>{const x=clone(i);mutate(x);await assert.rejects(()=>m.readReceiptReversalIntent(JSON.stringify(x),scope));});
 for(const [name,mutate] of [
  ['cached',x=>x.cached=true],['queued',x=>x.queued=true],['missing_data',x=>delete x.data],['partial_ack',x=>delete x.data.operation_identity],
  ['actor_mismatch',x=>x.data.operation_identity.actor_id=i.receiptId],['fingerprint_mismatch',x=>x.data.operation_identity.request_fingerprint='0'.repeat(64)],
  ['source_mismatch',x=>x.data.recepcion_id=i.actorId],['payload_mismatch',x=>x.data.payload.motivo+=' changed'],['accounting_overclaim',x=>x.data.contabilidad.estado='CONFIRMADA'],
 ])await test(v.name+'_reject_'+name,async()=>{const x=clone(v.response);mutate(x);await assert.rejects(()=>m.readReceiptReversalOutcome(x,i));});
 const outcome=await m.readReceiptReversalOutcome(v.response,i),store=new Map([[key,JSON.stringify(i)]]),storage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 await test(v.name+'_archive_readback_before_pending_removal',async()=>{await m.archiveReceiptReversal(storage,i,outcome);assert.equal(store.get(key),undefined);assert.ok(store.get(key+'.resolved.'+i.key));});
 await test(v.name+'_same_archive_accepts_replay',async()=>m.archiveReceiptReversal(storage,i,{...outcome,receipt:{...outcome.receipt,idempotent:false}}));
 for(const [label,override] of [
  ['quota_write',{setItem:()=>{throw Error('quota')}}],['silent_write',{setItem:()=>{}}],['failed_remove',{removeItem:()=>{throw Error('denied')}}],['silent_remove',{removeItem:()=>{}}],
 ])await test(v.name+'_'+label,async()=>{const saved=new Map([[key,JSON.stringify(i)]]),base={getItem:k=>saved.has(k)?saved.get(k):null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};await assert.rejects(()=>m.archiveReceiptReversal({...base,...override},i,outcome));assert.equal(saved.get(key),JSON.stringify(i));});
 await test(v.name+'_another_pending_never_removed',async()=>{store.set(key,'different-original');await assert.rejects(()=>m.archiveReceiptReversal(storage,i,outcome));assert.equal(store.get(key),'different-original');});
 await test(v.name+'_conflicting_archive_never_replaced',async()=>{const archiveKey=key+'.resolved.'+i.key,old=store.get(archiveKey);const x=JSON.parse(old);x.outcome.receipt.reversa_id=i.actorId;store.set(archiveKey,JSON.stringify(x));await assert.rejects(()=>m.archiveReceiptReversal(storage,i,outcome));assert.equal(store.get(archiveKey),JSON.stringify(x));});
}
const abandoned=JSON.parse(fs.readFileSync(path.join(web,'tests/compras/receipt-reversal-abandon.fixture.json'),'utf8'));
await test('actual_sql_abandonment_is_bound_and_archived',async()=>{
 const i=abandoned.intent,key=m.receiptReversalPendingKey(i),store=new Map([[key,JSON.stringify(i)]]),storage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const outcome=await m.readReceiptReversalOutcome(abandoned.response,i,true);assert.equal(outcome.status,'ABANDONED');await m.archiveReceiptReversal(storage,i,outcome);assert.equal(store.get(key),undefined);
});
for(const [name,mutate] of [
 ['actor',x=>x.data.resolution.actor_id=abandoned.intent.receiptId],['source',x=>x.data.resolution.source_operation_id=abandoned.intent.actorId],
 ['fingerprint',x=>x.data.resolution.request_fingerprint='0'.repeat(64)],['payload',x=>x.data.resolution.request_payload.motivo+=' changed'],
 ['partial',x=>delete x.data.resolution],['mixed',x=>x.data.receipt={}],['cached',x=>x.data.resolution.cached=true],
])await test('abandonment_reject_'+name,async()=>{const x=clone(abandoned.response);mutate(x);await assert.rejects(()=>m.readReceiptReversalOutcome(x,abandoned.intent,true));});
console.log(JSON.stringify({pass:true,checks:checks.length,actualApiFixtures:3,actualSqlAbandonmentFixture:true,archiveChecked:true,noBrowserClaim:true,names:checks},null,2));
