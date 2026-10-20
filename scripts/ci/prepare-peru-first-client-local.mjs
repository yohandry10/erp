import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
const kind=process.argv[2];
assert.ok(['wizard','annual','finance','hr','hr-financial','payroll-plame','configuration-admin','company-logo','tax-intents','tax-other','cpe-first','cpe-other','cash-first','cash-other','sales-first','sales-other','purchases-first','purchases-other','accounting-first','accounting-other','users-first','users-other','finance-ops-first','finance-ops-other','hr-ops-first','hr-ops-other','auth-first','auth-other','auth-browser','notif-first','notif-other','notif-browser','cxc-first','cxc-other','cxc-browser','aprob-first','aprob-other','aprob-browser','fact-first','fact-other','fact-browser','dash-first','dash-other','tz-first','rf-first','pres-first','pres-other','pres-browser','dk-first','est-first'].includes(kind));
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
  const base={annual:'2019876543',finance:'2019876544',wizard:'2019876545',hr:'2019876546','hr-financial':'2019876547','payroll-plame':'2019876548','configuration-admin':'2019876549','company-logo':'2098765432','tax-intents':'2098765433','tax-other':'2098765434','cpe-first':'2098765435','cpe-other':'2098765436','cash-first':'2098765437','cash-other':'2098765438','sales-first':'2098765439','sales-other':'2098765441','purchases-first':'2098765442','purchases-other':'2098765443','accounting-first':'2098765444','accounting-other':'2098765446','users-first':'2098765447','users-other':'2098765448','finance-ops-first':'2098765449','finance-ops-other':'2098765451','hr-ops-first':'2098765452','hr-ops-other':'2098765453','auth-first':'2098765454','auth-other':'2098765455','auth-browser':'2098765456','notif-first':'2098765457','notif-other':'2098765458','notif-browser':'2098765459','cxc-first':'2098765460','cxc-other':'2098765461','cxc-browser':'2098765462','aprob-first':'2098765470','aprob-other':'2098765471','aprob-browser':'2098765472','fact-first':'2098765480','fact-other':'2098765481','fact-browser':'2098765482','dash-first':'2098765495','dash-other':'2098765496','tz-first':'2098765498','rf-first':'2098765510','pres-first':'2098765511','pres-other':'2098765512','pres-browser':'2098765513','dk-first':'2098765514','est-first':'2098765516'}[kind];
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
