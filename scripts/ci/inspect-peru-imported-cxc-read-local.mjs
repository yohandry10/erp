import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire}from'node:module';

export function inspectLocalImportedCxcRead({response,tenantId,actorId,sqlRow}){
 assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
 const ts=createRequire(path.resolve('apps/web/package.json'))('typescript'),module={exports:{}};
 const text=fs.readFileSync('apps/web/lib/finanzas/cxc-read-contract.ts','utf8');
 vm.runInNewContext(ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,URL,Date,Number,Object,Set,Math,JSON});
 const fields=['id','tenant_id','cliente_id','clientes','serie','numero','tipo_documento','estado','moneda','fecha_emision','fecha_vencimiento','total','monto_total','monto_original','saldo','monto_pendiente','saldo_pendiente','external_id','event_source'];
 const pick=row=>({...Object.fromEntries(fields.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]])),metadata:row.metadata&&Object.fromEntries(['origen','fecha_corte','run_id'].filter(k=>Object.hasOwn(row.metadata,k)).map(k=>[k,row.metadata[k]]))});
 assert.equal(response.data?.length,1);const row=response.data[0];let clientAccepted=false,clientError;
 try{module.exports.readCxcRow(row,{tenantId,actorId});clientAccepted=true}catch(error){clientError=error.message}
 const file=path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR,'cxc-opening-real-public-read-contract.json');
 fs.writeFileSync(file,JSON.stringify({scope:'TECHNICAL_SUPPORT_EPHEMERAL_IMPORTED_CXC_API_TO_CLIENT_ROW',clientAccepted,clientError,publicRow:pick(row),sqlRow:pick(sqlRow),remoteWrites:false,uiAcceptance:false},null,2),{flag:'wx'});
 assert(clientAccepted,'El saldo importado no pasa el lector UI actual; ver cxc-opening-real-public-read-contract.json');
}
