import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
const kind=process.argv[2];
assert.ok(['wizard','annual','finance','hr','hr-financial','payroll-plame','configuration-admin','company-logo','tax-intents','tax-other','cpe-first','cpe-other','cash-first','cash-other','sales-first','sales-other'].includes(kind));
assert.equal(process.env.PGHOST,'127.0.0.1');
assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;
assert.equal(new URL(api).hostname,'127.0.0.1');
const require=createRequire(path.resolve('apps/erp-api/package.json'));
const forge=require('node-forge');
let token;
const call=async (route,body) => {
  const response=await fetchWithLocalLoginRetry(`${api}/api/${route}`,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`} : {}),'idempotency-key':randomUUID()},body:JSON.stringify(body)});
  const value=await response.json();
  assert.equal(response.status,201, `${route}: ${value.message || 'rejected'}`);
  return value;
};
// Privilegio de plataforma sólo en el fixture local, siempre retirado al terminar.
const { execFileSync }=await import('node:child_process');
const sql=query=>execFileSync(process.env.PSQL_BIN||'psql',['-X','-qAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1','-c',query],{encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql('SELECT current_database();'),'erp_e2e');
const actor=sql("SELECT id FROM usuarios_sistema WHERE email='peru-integrated-restricted-1@example.test' AND NOT is_super_admin;");
assert.match(actor,/^[0-9a-f-]{36}$/i);
try {
  sql(`UPDATE usuarios_sistema SET is_super_admin=true WHERE id='${actor}'::uuid;`);
  token=(await call('auth/login',{email:'peru-integrated-restricted-1@example.test',password:'Local-Peru-2026-Only!'})).access_token;
  const email=`${kind}-nuevo-${randomUUID()}@example.test`;
  // Identidades distintas por caso: el alta protege la unicidad fiscal global.
  const base={annual:'2019876543',finance:'2019876544',wizard:'2019876545',hr:'2019876546','hr-financial':'2019876547','payroll-plame':'2019876548','configuration-admin':'2019876549','company-logo':'2098765432','tax-intents':'2098765433','tax-other':'2098765434','cpe-first':'2098765435','cpe-other':'2098765436','cash-first':'2098765437','cash-other':'2098765438','sales-first':'2098765439','sales-other':'2098765441'}[kind];
  const weights=[5,4,3,2,7,6,5,4,3,2];
  const candidate=11-weights.reduce((sum,weight,index)=>sum+Number(base[index])*weight,0)%11;
  const ruc=base+String(candidate===10?0:candidate===11?1:candidate);
  const result=await call('tenants',{ruc,razon_social:'Empresa local de wizard',direccion:'Av. Ensayo local 456',pais_id:1,pais:'PE',email,admin_email:email,admin_nombre:'Wizard',admin_apellido:'Local',admin_password:'Cliente-Local-2026-Only!'});
  const tenant=result.data.tenant.tenant_id;
  assert.match(tenant,/^[0-9a-f-]{36}$/i);
  assert.equal(sql(`SELECT coalesce(bool_or(completado),false) FROM wizard_progress WHERE tenant_id='${tenant}'::uuid;`),'f');
  const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
  if(kind==='wizard') {
  const keys=forge.pki.rsa.generateKeyPair(2048);
  const certificate=forge.pki.createCertificate();
  certificate.publicKey=keys.publicKey;
  certificate.serialNumber='02';
  certificate.validity.notBefore=new Date(Date.now()-86400000);
  certificate.validity.notAfter=new Date(Date.now()+365*86400000);
  const attrs=[{name:'commonName',value:`CERTIFICADO LOCAL ${ruc}`},{name:'countryName',value:'PE'},{name:'organizationName',value:'Ensayo local ERP'},{type:'2.5.4.5',value:ruc}];
  certificate.setSubject(attrs);certificate.setIssuer(attrs);certificate.sign(keys.privateKey,forge.md.sha256.create());
  const p12=forge.pkcs12.toPkcs12Asn1(keys.privateKey,[certificate],'Clave-PFX-local',{algorithm:'3des'});
  fs.writeFileSync(path.join(output,'wizard-local.pfx'),Buffer.from(forge.asn1.toDer(p12).getBytes(),'binary'),{mode:0o600});
  }
  fs.writeFileSync(path.join(output,`${kind}-fixture.json`),JSON.stringify({email,ruc,tenant,non_demo:true,wizard_completed:false}));
} finally {
  sql(`UPDATE usuarios_sistema SET is_super_admin=false WHERE id='${actor}'::uuid;`);
}
