import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGPORT,'55456');assert.equal(process.env.LOCAL_API_URL,'http://127.0.0.1:3126');
const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR,run=path.basename(output);assert.match(run,/^peru-integrated-\d+-\d+$/);
const pg=JSON.parse(execFileSync('docker',['inspect','erp-'+run+'-pg'],{encoding:'utf8',windowsHide:true}))[0];assert.equal(pg.Config.Labels['com.erp.local-test'],run.replace('peru-integrated-',''));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p','55456','-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("BEGIN READ ONLY;SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;ROLLBACK;"),'erp_e2e|DEV|localerpephemeralqax');
const requests=[],checks=[],observations=[];let complete=false;
const raw=async(endpoint,token)=>{const r=await fetch('http://127.0.0.1:3126/api/'+endpoint,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});requests.push({method:'GET',endpoint:endpoint.replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi,':id'),status:r.status});return {status:r.status,body:await r.json()};};
const digest=()=>sql("BEGIN READ ONLY;SELECT md5(jsonb_build_object('prices',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM producto_precios_sucursal p),'stock',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM producto_stock_sucursal s))::text);ROLLBACK;");
const before=digest();let sample,primary;
try{
 for(const n of [1,2]){
  const login=await fetchWithLocalLoginRetry('http://127.0.0.1:3126/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'peru-integrated-'+n+'@example.test',password:'Local-Peru-2026-Only!'})});assert.equal(login.status,201);const auth=await login.json(),token=auth.access_token,tenant=auth.user.tenant_id;assert.match(tenant,/^[0-9a-f-]{36}$/i);
  const standard=await raw('inventario/productos',token);assert.equal(standard.status,200);
  const enriched=await raw('inventario/productos?includeSucursal=true',token);assert.equal(enriched.status,200);const v=enriched.body;assert.equal(v.complete,true);assert.equal(v.include_sucursal,true);assert.equal(v.tenant_id,tenant);assert.equal(v.fuentes_sucursal.completas,true);assert.deepEqual(v.data.map(p=>p.id),standard.body.data.map(p=>p.id));
  const prices=v.data.flatMap(p=>p.precios_sucursal),stocks=v.data.flatMap(p=>p.stock_sucursal);observations.push({tenant,products:v.data.length,prices:prices.length,stocks:stocks.length});assert.ok(prices.length>0&&stocks.length>0,'La prueba exige fuentes positivas reales: '+JSON.stringify(observations.at(-1)));
  const active=new Set(v.data.map(p=>p.id));for(const row of [...prices,...stocks]){assert.equal(row.tenant_id,tenant);assert.ok(active.has(row.producto_id));}
  for(const [table,rows,fields] of [['producto_precios_sucursal',prices,['id','producto_id','tenant_id','sucursal_id','precio','moneda','activo']],['producto_stock_sucursal',stocks,['id','producto_id','tenant_id','sucursal_id','almacen_id','stock','stock_actual','reservado','minimo','activo']]]){
   const select=fields.map(k=>"'"+k+"',s."+k).join(',');const expected=JSON.parse(sql(`BEGIN READ ONLY;SELECT coalesce(jsonb_agg(jsonb_build_object(${select}) ORDER BY s.id),'[]') FROM ${table} s JOIN productos p ON p.id=s.producto_id AND p.tenant_id=s.tenant_id WHERE s.tenant_id='${tenant}' AND p.activo;ROLLBACK;`));
   const actual=rows.map(r=>Object.fromEntries(fields.map(k=>[k,r[k]]))).sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(actual,expected);
  }
  assert.equal(v.fuentes_sucursal.precios_total,prices.length);assert.equal(v.fuentes_sucursal.stock_total,stocks.length);
  const detail=await raw('inventario/productos/'+v.data[0].id+'?includeSucursal=true',token);assert.equal(detail.status,200);assert.deepEqual(detail.body.data,v.data[0]);
  if(n===1){sample=v.data[0].id;primary=token;}else{assert.equal((await raw('inventario/productos/'+sample+'?includeSucursal=true',token)).status,404);assert.ok(!JSON.stringify(v.data).includes(sample));}
  checks.push({check:'positive_complete_sources_match_SQL_tenant_'+n,passed:true,products:v.data.length,prices:prices.length,stocks:stocks.length});
 }
 for(const table of ['producto_precios_sucursal','producto_stock_sucursal']){
  assert.equal(sql(`SELECT has_table_privilege('service_role','public.${table}','SELECT');`),'t');
  sql(`REVOKE SELECT ON public.${table} FROM service_role;`);
  try{for(const endpoint of ['inventario/productos?includeSucursal=true','inventario/productos/'+sample+'?includeSucursal=true'])assert.equal((await raw(endpoint,primary)).status,503);}finally{sql(`GRANT SELECT ON public.${table} TO service_role;`);}
  assert.equal((await raw('inventario/productos?includeSucursal=true',primary)).status,200);checks.push({check:'source_failure_503_and_live_recovery_'+table,passed:true});
 }
 assert.equal(digest(),before);complete=true;
}finally{fs.writeFileSync(path.join(output,'product-branch-current-api-read.json'),JSON.stringify({success:complete,complete,scope:'REAL_API_ONLY_PRODUCT_BRANCH_SOURCES_SQL_TWO_TENANTS_AND_SOURCE_FAILURE_RECOVERY',UIAcceptance:false,remoteWrites:false,businessWrites:0,sourceRowsPreserved:digest()===before,observations,checks,requests},null,2));}
console.log(JSON.stringify({result:'PASS',checks:checks.length,UIAcceptance:false,businessWrites:0}));
