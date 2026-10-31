import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// Sólo se ejecuta tras el fallo de una operación del propio ensayo efímero.
// Conserva el recibo persistido y reproduce sus lecturas, sin otro writer.
export async function inspectLocalAssetCreation({sql,tenant,actor,key,payload}){
 assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
 const rest=new URL(process.env.LOCAL_POSTGREST_URL);assert.equal(rest.hostname,'127.0.0.1');assert.equal(rest.port,'55457');
 const q=value=>"'"+String(value).replaceAll("'","''")+"'";
 const ledger=JSON.parse(sql(`SELECT to_jsonb(f)::text FROM financial_master_operations f WHERE tenant_id=${q(tenant)}::uuid AND operation_type='ACCOUNTING_ASSET_CREATE' AND idempotency_key=${q(key)};`)||'null');
 assert.ok(ledger,'El fallo conserva el ledger comprometido');
 const current=JSON.parse(sql(`SELECT to_jsonb(a)::text FROM activos_fijos a WHERE tenant_id=${q(tenant)}::uuid AND id=${q(ledger.record_id)}::uuid;`));
 const require=createRequire(path.resolve('apps/erp-api/package.json')),{createClient}=require('@supabase/supabase-js');
 const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const head=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'service_role',exp:Math.floor(Date.now()/1000)+60});
 const jwt=head+'.'+createHmac('sha256','local-integration-key-only-never-production-20260905').update(head).digest('base64url');
 const client=createClient(rest.origin,jwt,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
  const u=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.equal(u.origin,rest.origin);if(u.pathname.startsWith('/rest/v1/'))u.pathname=u.pathname.slice('/rest/v1'.length);return fetch(u,{...init,redirect:'error'});
 }}});
 const ledgerRead=await client.from('financial_master_operations').select('*',{count:'exact'}).eq('tenant_id',tenant).eq('operation_type','ACCOUNTING_ASSET_CREATE').eq('idempotency_key',key).maybeSingle();
 const currentRead=await client.from('activos_fijos').select('id,tenant_id,codigo,fecha_adquisicion,fecha_inicio_depreciacion,valor_adquisicion,metodo_depreciacion,situacion,created_by,created_at',{count:'exact'}).eq('tenant_id',tenant).eq('id',ledger.record_id).maybeSingle();
 const record=ledger.result.record,result={...record,valor_adquisicion:Number(record.valor_adquisicion),valor_residual:Number(record.valor_residual??0),vida_util_meses:Number(record.vida_util_meses),depreciacion_acumulada:Number(record.depreciacion_acumulada??0),valor_neto:Math.round((Number(record.valor_adquisicion)-Number(record.depreciacion_acumulada??0))*100)/100};
 const {confirmAssetCreateReceipt,assetCreateFingerprint}=require(path.resolve('apps/erp-api/dist/src/modules/contabilidad/services/asset-create-receipt.js'));
 let pureValidation;
 try{confirmAssetCreateReceipt({tenant,actor,key,payload},result,ledgerRead.data,currentRead.data);pureValidation={accepted:true};}
 catch(e){pureValidation={accepted:false,message:e.message,stack:e.stack.split('\n').slice(0,4)};}
 const evidence={scope:'EPHEMERAL_COMMITTED_ASSET_RECEIPT_FAILURE_SOURCE_FORENSICS',readOnly:true,payload,actor,tenant,key,ledger,current,ledgerRead,currentRead,publicResult:result,expectedFingerprint:assetCreateFingerprint(payload),pureValidation,remoteWrites:false,noReplayRPC:true};
 fs.writeFileSync(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR,'asset-create-receipt-failure-sources.json'),JSON.stringify(evidence,null,2));
}
