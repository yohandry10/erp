import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Module, {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'

const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const require=createRequire(path.join(web,'package.json')),ts=require('typescript')
Module._extensions['.ts']=(module,file)=>{
  assert(file.startsWith(path.join(web,'lib')))
  module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)
}
const api=require(path.join(web,'lib/contabilidad/asset-create-operation.ts'))
const scope={tenantId:randomUUID(),actorId:randomUUID()}
class Store{
  values=new Map()
  get length(){return this.values.size}
  key(index){return [...this.values.keys()][index]??null}
  getItem(key){return this.values.get(key)??null}
  setItem(key,value){this.values.set(key,value)}
  removeItem(key){this.values.delete(key)}
}
function fixture(){
  globalThis.localStorage=new Store()
  const payload={codigo:'af-Mixed-123',nombre:'Alta original',fecha_adquisicion:'2026-10-14',fecha_inicio_depreciacion:'2026-10-14',valor_adquisicion:1001,valor_residual:1,vida_util_meses:3}
  const intent=api.newAssetCreateIntent(payload,scope,{paisCodigo:'PE',moneda:'PEN'},[])
  const id=randomUUID(),created_at=new Date().toISOString(),codigo=payload.codigo.toUpperCase()
  const data={...payload,codigo,id,tenant_id:scope.tenantId,created_by:scope.actorId,created_at,descripcion:null,centro_costo_id:null,metodo_depreciacion:'LINEAL',situacion:'ACTIVO',estado:'ACTIVO',activo:true,depreciacion_acumulada:0,valor_neto:1001}
  const response={success:true,complete:true,tenant_id:scope.tenantId,data,operation:{status:'COMMITTED',type:'ACCOUNTING_ASSET_CREATE',operation_id:randomUUID(),tenant_id:scope.tenantId,actor_id:scope.actorId,idempotency_key:intent.idempotencyKey,request_fingerprint:'a'.repeat(64),record_id:id,created_at,payload:structuredClone(payload)},asset:{id,tenant_id:scope.tenantId,codigo,created_by:scope.actorId,created_at,situacion_actual:'ACTIVO'}}
  api.preserveAssetCreate(intent)
  return {payload,intent,response}
}
const {payload,intent,response}=fixture(),body=intent.body
assert.equal(api.confirmAssetCreate(response,intent).codigo,'AF-MIXED-123')
payload.codigo='Caller changed'
assert.equal(api.loadAssetCreate(scope).body,body)
api.retireAssetCreate(intent,response)
assert.equal(api.loadAssetCreate(scope),null)
assert.equal(JSON.parse(localStorage.getItem(api.assetCreateReceiptKey(intent))).operation.payload.codigo,'af-Mixed-123')
assert.equal(intent.body,body)
for(const code of ['AF-OTHER','af-Mixed-123']){
  const f=fixture()
  f.response.data.codigo=code;f.response.asset.codigo=code
  assert.throws(()=>api.retireAssetCreate(f.intent,f.response))
  assert.equal(api.loadAssetCreate(scope).body,f.intent.body)
}
const changed=fixture()
changed.response.operation.payload.codigo=changed.response.data.codigo
assert.throws(()=>api.retireAssetCreate(changed.intent,changed.response))
assert.equal(api.loadAssetCreate(scope).body,changed.intent.body)
console.log(JSON.stringify({result:'PASS',checks:5,businessWrites:0,scope:'ASSET_CREATE_SQL_CODE_NORMALIZATION_AND_ORIGINAL_BODY_PRESERVATION'}))
