import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');
const requests=[],scenarios=[];let success=false;
try{
 let blocked;
 for(let attempt=0;attempt<22;attempt++){
  const response=await fetch(api+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'office-local-'+randomUUID()+'@example.test',password:'Invalid-Local-Only-2026!'})});
  requests.push({method:'POST',endpoint:'auth/login',status:response.status});
  if(response.status===429){blocked=response;break;}
  assert.equal(response.status,401,await response.text());
 }
 assert.ok(blocked,'El límite agregado debe frenar rotación de cuentas');
 const seconds=Number(blocked.headers.get('retry-after')),officeSeconds=Number(blocked.headers.get('retry-after-office'));
 assert.ok(Number.isInteger(seconds)&&seconds>0&&seconds<=60,'429 agregado publica Retry-After acotado');
 assert.equal(seconds,officeSeconds);await blocked.body?.cancel();
 scenarios.push({scenario:'Login oficina: rotación de cuentas produce 429 con Retry-After estándar y específico iguales',passed:true,retry_after_seconds:seconds});
 console.log('[local-login-office] Espera contrato real '+seconds+'s');await delay(seconds*1000);
 const recovered=await fetch(api+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'peru-integrated-restricted-1@example.test',password:'Local-Peru-2026-Only!'})});
 requests.push({method:'POST',endpoint:'auth/login',status:recovered.status});assert.equal(recovered.status,201);await recovered.body?.cancel();
 scenarios.push({scenario:'Login oficina: respetar Retry-After recupera autenticación real sin desactivar limitador',passed:true});success=true;
}finally{fs.writeFileSync(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR,'login-office.json'),JSON.stringify({success,remoteWrites:false,scope:'Límite agregado y recuperación de login real local; no cambia límites',scenarios,requests},null,2));}
