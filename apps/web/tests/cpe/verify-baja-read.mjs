import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(path.join(web,'package.json')),ts=require('typescript')
const source=fs.readFileSync(path.join(web,'lib/cpe-baja-read-contract.ts'),'utf8'),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const module={exports:{}};new Function('module','exports',compiled)(module,module.exports)
const {readFiscalBajaSources:read}=module.exports
const tenant='11111111-1111-4111-8111-111111111111',document='22222222-2222-4222-8222-222222222222',batch='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444'
const eligible={id:document,tipo:'RA',tipoDocumento:'01',serie:'F001',numero:'00000001',fechaEmision:'2026-10-15',receptor:'Cliente local',total:118,moneda:'PEN',reversaComercialConfirmada:true}
const pending={id:batch,tenant_id:tenant,tipo:'RA',estado:'PENDIENTE',comprobantes_ids:[other],idempotency_key:'ra-original-key',fecha_comunicacion:'2026-10-15',motivo_baja:'Baja local'}
const envelope=data=>({success:true,data}),empty=envelope([]),cases=[]
const check=(name,action)=>{try{action();cases.push({name,result:'PASS'})}catch(error){cases.push({name,result:'FAIL',message:error.message})}}
const rejected=(a,b=empty,kind='RA',scope=tenant)=>assert.throws(()=>read(a,b,kind,scope),/bajas fiscales/)
check('two live empty sources are confirmed',()=>assert.deepEqual(read(empty,empty,'RA',tenant),{eligible:[],batches:[]}))
check('RA complete eligible and pending original stay readable',()=>assert.equal(read(envelope([eligible]),envelope([pending]),'RA',tenant).batches[0].idempotency_key,pending.idempotency_key))
check('RC enforces boleta and reference date',()=>assert.equal(read(envelope([{...eligible,tipo:'RC',tipoDocumento:'03',serie:'B001'}]),envelope([{...pending,tipo:'RC',fecha_referencia:'2026-10-15',motivo_baja:null}]),'RC',tenant).eligible.length,1))
for(const bad of [null,{},[],{success:false,data:[]},{success:'true',data:[]},{success:true,data:{}},{success:true,data:null}])check('unknown envelope '+JSON.stringify(bad),()=>rejected(bad))
for(const flag of ['cached','queued','offline','pending','from_cache']){
 check('eligible envelope never accepts '+flag,()=>rejected({...empty,[flag]:true}))
 check('batch envelope never accepts '+flag,()=>rejected(empty,{...empty,[flag]:true}))
 check('eligible row never accepts '+flag,()=>rejected(envelope([{...eligible,[flag]:true}])))
}
for(const change of [{id:null},{tipo:'RC'},{tipoDocumento:'03'},{reversaComercialConfirmada:false},{total:null},{total:'118'},{total:-1},{total:0.001},{total:NaN},{total:Infinity},{moneda:''},{numero:'HIST-1'},{fechaEmision:'2026-02-30'},{tenant_id:other}])check('invalid eligible '+JSON.stringify(change),()=>rejected(envelope([{...eligible,...change}])))
check('duplicate eligible IDs rejected',()=>rejected(envelope([eligible,{...eligible}])))
const letterId='abcdef01-1111-4111-8111-111111111111'
check('UUID case cannot hide duplicate eligible identity',()=>rejected(envelope([{...eligible,id:letterId},{...eligible,id:letterId.toUpperCase()}])))
for(const change of [{estado:'UNKNOWN'},{tenant_id:other},{comprobantes_ids:[]},{comprobantes_ids:[other,other]},{idempotency_key:null},{fecha_comunicacion:'2026-02-30'},{motivo_baja:''},{estado:'ENVIADO',ticket_sunat:null}])check('invalid batch '+JSON.stringify(change),()=>rejected(empty,envelope([{...pending,...change}])))
check('known generated batch with retry diagnostic is readable',()=>assert.equal(read(empty,envelope([{...pending,estado:'GENERADO',ultimo_error:'Pendiente de conexión'}]),'RA',tenant).batches[0].estado,'GENERADO'))
check('known submitted ticket is readable without claiming external acceptance',()=>assert.equal(read(empty,envelope([{...pending,estado:'ENVIADO',ticket_sunat:'LOCAL-FIXTURE-TICKET'}]),'RA',tenant).batches[0].ticket_sunat,'LOCAL-FIXTURE-TICKET'))
check('rejected terminal diagnostic is readable',()=>assert.equal(read(empty,envelope([{...pending,estado:'RECHAZADO'}]),'RA',tenant).batches[0].estado,'RECHAZADO'))
check('same CPE cannot be reserved by two active batches',()=>rejected(empty,envelope([pending,{...pending,id:document}])) )
check('reserved CPE cannot also appear as selectable',()=>rejected(envelope([eligible]),envelope([{...pending,comprobantes_ids:[document]}])))
check('unknown session scope rejected',()=>rejected(empty,empty,'RA','unknown'))
const result=cases.every(x=>x.result==='PASS')?'PASS':'FAIL';console.log(JSON.stringify({result,scope:'CLIENT_RA_RC_LIVE_SCOPED_READ_CONTRACT_NOT_FISCAL_ACCEPTANCE',cases}));if(result!=='PASS')process.exitCode=1
