import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');
const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const first=JSON.parse(fs.readFileSync(path.join(output,'tax-intents-fixture.json'))),other=JSON.parse(fs.readFileSync(path.join(output,'tax-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
const scenarios=[],requests=[],defects=[];let token,otherToken,success=false;
async function call(endpoint,body,expected=body===undefined?200:201,key=randomUUID(),access=token){
 const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(access?{authorization:'Bearer '+access}:{}),'idempotency-key':key},body:body===undefined?undefined:JSON.stringify(body)});
 const value=await response.json();requests.push({method:body===undefined?'GET':'POST',endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
 if(response.status!==expected)defects.push({operation:endpoint.replace(/[0-9a-f-]{36}/gi,':id').split('?')[0],status:response.status,expected,message:value.message??null});
 assert.equal(response.status,expected,endpoint.split('?')[0]+': '+JSON.stringify(value));return value.data??value;
}
const pass=scenario=>scenarios.push({scenario,passed:true});
async function check(scenario,action){try{await action();pass(scenario);}catch(e){scenarios.push({scenario,passed:false,message:e.message});}}
const books=()=>sql(`SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]')::text) FROM asientos_contables a WHERE tenant_id IN(${q(first.tenant)},${q(other.tenant)});`);
const reportState=()=>sql(`SELECT md5(jsonb_build_object('reports',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM reportes_contables_configurables r WHERE tenant_id=${q(first.tenant)}),'lines',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM reportes_contables_lineas r WHERE tenant_id=${q(first.tenant)}))::text);`);
try{
 token=(await call('auth/login',{email:first.email,password:'Cliente-Local-2026-Only!'})).access_token;
 otherToken=(await call('auth/login',{email:other.email,password:'Cliente-Local-2026-Only!'})).access_token;
 const accounts=await call('contabilidad/plan-cuentas'),otherAccounts=await call('contabilidad/plan-cuentas',undefined,200,randomUUID(),otherToken);
 const account=(rows,code)=>{const row=rows.find(a=>a.codigo===code);assert.ok(row,code);return row.id;};
 async function entry(access,rows,date,amount,state='CONFIRMADO'){
  return call('contabilidad/asiento-contable',{fecha:date,concepto:'Fuente de consolidación local',estado:state,detalles:[{cuenta_id:account(rows,'1041'),debe:amount,haber:0,concepto:'Banco'},{cuenta_id:account(rows,'70'),debe:0,haber:amount,concepto:'Ingreso'}]},201,randomUUID(),access);
 }
 for(const month of [8,9,10])await call('contabilidad/periodos',{anio:2026,mes:month});
 await call('contabilidad/periodos',{anio:2026,mes:9},201,randomUUID(),otherToken);
 await entry(token,accounts,'2026-08-31',30);await entry(token,accounts,'2026-09-01',100);await entry(token,accounts,'2026-10-01',600);await entry(token,accounts,'2026-09-02',900,'BORRADOR');
 await entry(otherToken,otherAccounts,'2026-09-01',200);
 pass('Reportes: fuentes reales confirmadas, borrador, mes previo y futuro persistidos en dos empresas');
 const reports='contabilidad/reportes-configurables',groups='contabilidad/consolidacion/grupos';
 const definition={codigo:'REPORT-EXPANDED',nombre:'Reporte local ampliado',lineas:[
  {codigo:'INGRESOS',nombre:'Ingresos',orden:1,tipo:'CUENTAS',patrones_cuenta:['7'],naturaleza:'HABER',alcance_fecha:'PERIODO',tipo_tasa:'PROMEDIO'},
  {codigo:'ACUMULADO',nombre:'Acumulado',orden:2,tipo:'CUENTAS',patrones_cuenta:['7'],naturaleza:'HABER',alcance_fecha:'HASTA_FECHA',tipo_tasa:'PROMEDIO'},
  {codigo:'TOTAL',nombre:'Total',orden:3,tipo:'FORMULA',formula:[{codigo:'INGRESOS',coeficiente:1}],signo:1}]};
 const report=await call(reports,definition),url=reports+'/'+report.id+'/generar?fecha_desde=2026-09-01&fecha_hasta=2026-09-30';
 const total=r=>Number(r.lineas.find(l=>l.codigo==='TOTAL').valor);
 const individual=await call(url);assert.equal(total(individual),100);assert.equal(Number(individual.lineas.find(l=>l.codigo==='ACUMULADO').valor),130);pass('Reportes: período/acumulado y fórmula excluyen borradores, futuro y empresa ajena');
 let before=reportState();await call(reports,definition,409);assert.equal(reportState(),before);pass('Reportes: código duplicado no inserta otra definición');
 for(const [name,lineas] of [
  ['ciclo',[{codigo:'A',nombre:'A',orden:1,tipo:'FORMULA',formula:[{codigo:'B',coeficiente:1}]},{codigo:'B',nombre:'B',orden:2,tipo:'FORMULA',formula:[{codigo:'A',coeficiente:1}]}]],
  ['referencia ausente',[{codigo:'A',nombre:'A',orden:1,tipo:'FORMULA',formula:[{codigo:'NO_EXISTE',coeficiente:1}]}]],
  ['orden repetido',definition.lineas.map(l=>({...l,orden:1}))],
 ]){before=reportState();await call(reports,{...definition,id:report.id,lineas},400);assert.equal(reportState(),before);pass('Reportes: '+name+' rechazada sin perder líneas vigentes');}
 await check('Reportes: otra empresa no reemplaza una definición ajena',async()=>{before=reportState();await call(reports,{...definition,id:report.id,nombre:'AJENO'},403,randomUUID(),otherToken);assert.equal(reportState(),before);});
 await call(url,undefined,404,randomUUID(),otherToken);await call(reports+'/'+report.id+'/generar?fecha_desde=2026-09-30&fecha_hasta=2026-09-01',undefined,400);pass('Reportes: consulta ajena y rango invertido rechazados');
 const group=await call(groups,{codigo:'GROUP-EXPANDED',nombre:'Grupo local ampliado',moneda_presentacion:'PEN'}),base=groups+'/'+group.id;
 await call(base+'/invitaciones',{ruc:other.ruc,participacion:100});
 assert.equal(total(await call(url+'&grupo_id='+group.id)),100);pass('Consolidación: invitación pendiente no comparte saldos de la segunda empresa');
 await call(base+'/respuesta',{aceptar:false},201,randomUUID(),otherToken);
 assert.ok(!(await call(groups,undefined,200,randomUUID(),otherToken)).some(g=>g.id===group.id));assert.equal(total(await call(url+'&grupo_id='+group.id)),100);pass('Consolidación: rechazo retira acceso y conserva únicamente saldos autorizados');
 await call(base+'/invitaciones',{ruc:other.ruc,participacion:100});await call(base+'/respuesta',{aceptar:true},201,randomUUID(),otherToken);
 const accepted=await call(url+'&grupo_id='+group.id);assert.equal(total(accepted),300);assert.equal(accepted.empresas_incluidas,2);pass('Consolidación: aceptación incorpora 100 y 200 de fuentes reales por empresa');
 await check('Consolidación: no permite invitar a su propia controladora',async()=>{await call(base+'/invitaciones',{ruc:first.ruc,participacion:100},400);});
 const currencyGroup=await call(groups,{codigo:'GROUP-USD',nombre:'Presentación local USD',moneda_presentacion:'USD'}),fx=groups+'/'+currencyGroup.id,fxUrl=url+'&grupo_id='+currencyGroup.id;
 await call(fx+'/invitaciones',{ruc:other.ruc,participacion:100});await call(fx+'/respuesta',{aceptar:true},201,randomUUID(),otherToken);
 await call(fxUrl,undefined,400);pass('Consolidación: moneda de presentación distinta exige tasa explícita');
 const ownRate={tenant_miembro_id:first.tenant,fecha:'2026-09-30',tipo:'PROMEDIO',factor_conversion:0.25},otherRate={...ownRate,tenant_miembro_id:other.tenant,factor_conversion:0.5},rateKey=randomUUID();
 const rate=await call(fx+'/tasas',ownRate,201,rateKey),rateReplay=await call(fx+'/tasas',ownRate,201,rateKey);assert.equal(rate.id,rateReplay.id);assert.equal(rateReplay.idempotent,true);
 await call(fx+'/tasas',otherRate);assert.equal(total(await call(fxUrl)),125);pass('Consolidación: tasas propias y del miembro convierten 100×0.25 + 200×0.50');
 await call(fx+'/tasas',{...otherRate,fecha:'2026-10-01',factor_conversion:10});assert.equal(total(await call(fxUrl)),125);pass('Consolidación: tasa futura no altera corte anterior');
 await check('Consolidación: colisión de intención de tasa devuelve 409 sin reemplazar tasa',async()=>{await call(fx+'/tasas',{...ownRate,factor_conversion:0.75},409,rateKey);assert.equal(total(await call(fxUrl)),125);});
 await check('Consolidación: miembro no controlador recibe 403 al escribir tasa',async()=>{await call(fx+'/tasas',otherRate,403,randomUUID(),otherToken);});
 await check('Consolidación: tasa para miembro inexistente devuelve 400',async()=>{await call(fx+'/tasas',{...otherRate,tenant_miembro_id:randomUUID()},400);});
 await check('Consolidación: tasa innecesaria devuelve 400',async()=>{await call(base+'/tasas',ownRate,400);});
 const map={tenant_miembro_id:other.tenant,cuenta_codigo_origen:'70',cuenta_codigo_destino:'20'},mapKey=randomUUID();assert.ok(account(accounts,'20'));
 const mapping=await call(fx+'/mapeos-cuentas',map,201,mapKey);assert.equal((await call(fx+'/mapeos-cuentas',map,201,mapKey)).id,mapping.id);
 const mapped=await call(fxUrl);assert.equal(total(mapped),25);assert.equal(mapped.mapeos_cuentas_aplicados,1);pass('Consolidación: mapeo real 70→20 separa prefijo, persiste y recupera mismo ID');
 await call(fx+'/mapeos-cuentas',{...map,cuenta_codigo_origen:'NO_EXISTE'},404);pass('Consolidación: cuenta inexistente no se homologa');
 const adjustment={fecha:'2026-09-30',tipo:'ELIMINACION',cuenta_codigo:'70',descripcion:'Eliminación local',debe:0,haber:10},adjustKey=randomUUID(),legalBefore=books();
 const adjusted=await call(fx+'/ajustes',adjustment,201,adjustKey);assert.equal((await call(fx+'/ajustes',adjustment,201,adjustKey)).id,adjusted.id);assert.equal(total(await call(fxUrl)),35);assert.equal(books(),legalBefore);pass('Consolidación: ajuste y replay afectan reporte una vez sin alterar libros legales');
 await check('Consolidación: colisión de ajuste devuelve 409 sin duplicar',async()=>{await call(fx+'/ajustes',{...adjustment,haber:11},409,adjustKey);assert.equal(total(await call(fxUrl)),35);});
 await call(fx+'/ajustes',{...adjustment,debe:10},400);pass('Consolidación: debe/haber simultáneos rechazados');
 await check('Consolidación: cuenta de ajuste inexistente devuelve 400',async()=>{await call(fx+'/ajustes',{...adjustment,cuenta_codigo:'NO_EXISTE'},400);});
 const permission=sql(`SELECT id FROM permisos WHERE tenant_id=${q(first.tenant)} AND codigo='contabilidad.reportes.read';`);q(permission);
 const role=await call('roles',{nombre:'LECTOR_REPORTES_LOCAL',permission_ids:[permission],idempotency_key:randomUUID()});
 await call('users',{nombre:'Lector reportes local',email:'reader-reports-local@example.test',password:'Lector-Local-2026!',roles:[role.id],idempotency_key:randomUUID()});
 const reader=(await call('auth/login',{email:'reader-reports-local@example.test',password:'Lector-Local-2026!'})).access_token;
 assert.equal(total(await call(fxUrl,undefined,200,randomUUID(),reader)),35);await call(fx+'/ajustes',adjustment,403,randomUUID(),reader);await call(reports,{...definition,id:report.id},403,randomUUID(),reader);pass('Permisos: lector genera el reporte y no guarda definición ni ajustes');
 const tables=['tipos_cambio_consolidacion','mapeos_cuentas_consolidacion','ajustes_consolidacion'];
 for(const table of tables)assert.equal(sql(`SELECT has_table_privilege('service_role','public.${table}','SELECT') AND NOT has_table_privilege('service_role','public.${table}','INSERT') AND NOT has_table_privilege('service_role','public.${table}','UPDATE') AND NOT has_table_privilege('service_role','public.${table}','DELETE') AND NOT has_table_privilege('authenticated','public.${table}','SELECT') AND NOT has_table_privilege('anon','public.${table}','SELECT');`),'t');
 pass('Seguridad: servicio sólo obtiene SELECT; no hay DML directo ni lectura anon/authenticated nueva');
 const consignments='contabilidad/registro-consignaciones',delivery={fecha_registro:'2026-09-01',fecha_entrega:'2026-09-02',consignatario_nombre:'API-ENTREGA-IDENTICA',cantidad:2,valor_unitario:12.34,moneda:'PEN'},deliveryKey=randomUUID();
 const legalBeforeDeliveries=books(),created=await call(consignments,delivery,201,deliveryKey),createdReplay=await call(consignments,delivery,201,deliveryKey);
 assert.equal(created.id,createdReplay.id);assert.equal(Number(created.valor_total),24.68);pass('Consignaciones: alta y replay conservan una entrega y total calculado por servidor');
 const identical=await call(consignments,delivery);assert.notEqual(identical.id,created.id);assert.equal(sql(`SELECT count(*) FROM registro_consignaciones WHERE tenant_id=${q(first.tenant)} AND consignatario_nombre='API-ENTREGA-IDENTICA';`),'2');pass('Consignaciones: nueva intención idéntica crea otro registro');
 const soldKey=randomUUID(),soldPath=consignments+'/'+created.id+'/estado',soldBody={estado:'VENDIDA'};
 await call(soldPath,soldBody,201,soldKey);await call(soldPath,soldBody,201,soldKey);await call(soldPath,{estado:'CERRADA'});assert.equal(sql(`SELECT estado FROM registro_consignaciones WHERE id=${q(created.id)};`),'CERRADA');pass('Consignaciones: venta, replay y cierre persisten con estados válidos');
 await call(consignments+'/'+identical.id+'/estado',{estado:'DEVUELTA'});assert.equal(sql(`SELECT estado FROM registro_consignaciones WHERE id=${q(identical.id)};`),'DEVUELTA');pass('Consignaciones: devolución de entrega pendiente persiste');
 const annulled=await call(consignments,{...delivery,consignatario_nombre:'API-ANULADA'});await call(consignments+'/'+annulled.id+'/estado',{estado:'ANULADA'});assert.equal(sql(`SELECT estado FROM registro_consignaciones WHERE id=${q(annulled.id)};`),'ANULADA');pass('Consignaciones: anulación de entrega pendiente persiste');
 await call(soldPath,{estado:'PENDIENTE'},400);const foreign=await call(soldPath,{estado:'ANULADA'},400,randomUUID(),otherToken),missing=await call(consignments+'/'+randomUUID()+'/estado',{estado:'ANULADA'},400,randomUUID(),otherToken);assert.equal(foreign.message,missing.message);assert.equal(sql(`SELECT estado FROM registro_consignaciones WHERE id=${q(created.id)};`),'CERRADA');pass('Consignaciones: estado terminal y mutación ajena/inexistente rechazados sin alterar entrega');
 const rowsBefore=sql(`SELECT count(*) FROM registro_consignaciones WHERE tenant_id=${q(first.tenant)};`);await call(consignments,{...delivery,cantidad:0},400);await call(consignments,{...delivery,valor_unitario:-1},400);assert.equal(sql(`SELECT count(*) FROM registro_consignaciones WHERE tenant_id=${q(first.tenant)};`),rowsBefore);pass('Consignaciones: cantidad y valor inválidos no insertan registros');
 assert.ok((await call(consignments,undefined,200,randomUUID(),reader)).some(c=>c.id===created.id));await call(consignments,delivery,403,randomUUID(),reader);await call(soldPath,{estado:'ANULADA'},403,randomUUID(),reader);assert.equal(books(),legalBeforeDeliveries);pass('Consignaciones: lector consulta y no crea/transiciona; el registro no altera libros legales');
 success=scenarios.every(s=>s.passed)&&defects.length===0;
}catch(e){scenarios.push({scenario:'Reportes/consolidación: preparación o flujo dependiente',passed:false,message:e.message});}
finally{fs.writeFileSync(path.join(output,'reports-consolidation-expanded.json'),JSON.stringify({success,remoteWrites:false,scope:'API real local de reportes y consolidación; sin aceptación global',scenarios,defects,requests},null,2));}
if(!success)process.exitCode=1;
