import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGPORT,'55456');assert.equal(process.env.LOCAL_API_URL,'http://127.0.0.1:3126');
const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR,run=path.basename(output);assert.match(run,/^peru-integrated-\d+-\d+$/);
const pg=JSON.parse(execFileSync('docker',['inspect','erp-'+run+'-pg'],{encoding:'utf8',windowsHide:true}))[0];assert.equal(pg.Config.Labels['com.erp.local-test'],run.replace('peru-integrated-',''));
const fixtures=[];
for(const n of [1,2]){
 const login=await fetchWithLocalLoginRetry(process.env.LOCAL_API_URL+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'peru-integrated-'+n+'@example.test',password:'Local-Peru-2026-Only!'})});assert.equal(login.status,201);const auth=await login.json();
 const call=async(endpoint,body)=>{const response=await fetch(process.env.LOCAL_API_URL+'/api/'+endpoint,{method:body?'POST':'GET',headers:{authorization:'Bearer '+auth.access_token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const v=await response.json();assert.equal(response.status,body?201:200,endpoint+': '+JSON.stringify(v.message));return v.data??v;};
 const warehouses=await call('inventario/almacenes');const warehouse=warehouses.find(row=>row.activo);assert.ok(warehouse?.id);
 const branches=await call('sucursales');const branch=branches.find(row=>row.id===warehouse.sucursal_id)??branches.find(row=>row.es_principal)??branches[0];assert.ok(branch?.id);
 await call('inventario/categorias',{idempotency_key:randomUUID(),codigo:'UAT-SUC-CAT',nombre:'Fuentes UAT por sucursal'});
 const key=randomUUID(),product=await call('inventario/productos',{idempotency_key:key,codigo:'UAT-SUC-'+randomUUID().slice(0,8).toUpperCase(),nombre:'Fuentes positivas locales de sucursal '+n,categoria:'Fuentes UAT por sucursal',unidad_medida:'NIU',precio_compra:2,precio_venta:3,controla_stock:true,almacen_id:warehouse.id,stock_inicial:10,precios_sucursal:[{sucursal_id:branch.id,moneda:'PEN',precio:3,activo:true}],afectacion_igv:'10'});assert.ok(product.id);
 // Fixture de proyección histórica: copia exacta del ledger recién creado por API.
 // El runtime actual usa producto_existencias/stock_por_sucursal; no se inventa stock.
 assert.match(product.id,/^[0-9a-f-]{36}$/i);assert.match(auth.user.tenant_id,/^[0-9a-f-]{36}$/i);
 const seed = `BEGIN;
 DO $owned_local_projection$ BEGIN IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN RAISE EXCEPTION 'LOCAL_ONLY'; END IF;END $owned_local_projection$;
 INSERT INTO producto_stock_sucursal(tenant_id,producto_id,sucursal_id,almacen_id,stock,stock_actual,reservado,minimo,activo,estado,metadata)
 SELECT pe.tenant_id,pe.producto_id,a.sucursal_id,pe.almacen_id,pe.stock_actual,pe.stock_actual,pe.stock_reservado,p.stock_minimo,true,'ACTIVO',jsonb_build_object('source','owned_local_legacy_projection_fixture','existencia_id',pe.id)
 FROM producto_existencias pe JOIN productos p ON p.id=pe.producto_id AND p.tenant_id=pe.tenant_id JOIN almacenes a ON a.id=pe.almacen_id AND a.tenant_id=pe.tenant_id
 WHERE pe.tenant_id='${auth.user.tenant_id}' AND pe.producto_id='${product.id}';
 COMMIT;`;
 execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p','55456','-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:seed,encoding:'utf8',windowsHide:true});
 fixtures.push({tenant:auth.user.tenant_id,productId:product.id,warehouseId:warehouse.id,idempotencyKey:key});
}
fs.writeFileSync(path.join(output,'product-branch-read-fixtures.json'),JSON.stringify({complete:true,scope:'OWNED_EPHEMERAL_API_PRODUCT_CREATE_FIXTURES_FOR_SOURCE_READS',remoteWrites:false,preservedUATBusinessWrites:0,productsCreated:2,categoriesCreated:2,legacyProjectionFixturesDerivedFromCanonicalLedger:2,fixtures},null,2));
console.log(JSON.stringify({result:'PASS',freshFixtureProducts:2,preservedUATBusinessWrites:0}));
