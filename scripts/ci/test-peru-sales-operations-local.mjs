import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Diagnóstico de ventas: API/PostgREST/PostgreSQL locales efímeros; sin transporte fiscal.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const fixtureName='sales';
const first=JSON.parse(fs.readFileSync(path.join(output,fixtureName+'-first-fixture.json'))),other=JSON.parse(fs.readFileSync(path.join(output,fixtureName+'-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
let token,otherToken,approverToken;const scenarios=[],requests=[];let success=false;
async function raw(endpoint,body,access=token,key=randomUUID(),method=body===undefined?'GET':'POST'){
 const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json',connection:'close',...(access?{authorization:'Bearer '+access}:{}),...(key===null?{}:{'idempotency-key':key})},body:body===undefined?undefined:JSON.stringify(body)});
 const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
 return {status:response.status,body:value,data:value&&typeof value==='object'&&Object.hasOwn(value,'data')?value.data:value};
}
async function call(endpoint,body,status=body===undefined?200:201,access=token,key=randomUUID(),method=body===undefined?'GET':'POST'){
 const result=await raw(endpoint,body,access,key,method);assert.equal(result.status,status,(method)+' '+endpoint.split('?')[0]+': '+JSON.stringify(result.body).slice(0,400));return result.data;
}
async function check(scenario,action){try{const detail=await action();scenarios.push({scenario,passed:true,...(detail||{})});}catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,600)});}}
const count=(table,where)=>Number(sql(`SELECT count(*) FROM ${table} WHERE tenant_id=${q(first.tenant)}${where?' AND '+where:''};`));
const signature=name=>{const s=sql(`SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${name}';`).split('\n').filter(Boolean);assert.equal(s.length,1,'Firma única '+name);return s[0];};
const outage=async(grant,revoke,action)=>{sql(revoke);try{return await action();}finally{sql(grant);}};
try{
 token=(await call('auth/login',{email:first.email,password:'Cliente-Local-2026-Only!'})).access_token;
 otherToken=(await call('auth/login',{email:other.email,password:'Cliente-Local-2026-Only!'})).access_token;
 const forge=(await import('node:module')).createRequire(path.resolve('apps/erp-api/package.json'))('node-forge');
 const keys=forge.pki.rsa.generateKeyPair(2048),cert=forge.pki.createCertificate();cert.publicKey=keys.publicKey;cert.serialNumber='09';cert.validity.notBefore=new Date(Date.now()-86400000);cert.validity.notAfter=new Date(Date.now()+365*86400000);
 const attrs=[{name:'commonName',value:'CERTIFICADO LOCAL '+first.ruc},{name:'countryName',value:'PE'},{name:'organizationName',value:'Ensayo ventas ERP'},{type:'2.5.4.5',value:first.ruc}];cert.setSubject(attrs);cert.setIssuer(attrs);cert.sign(keys.privateKey,forge.md.sha256.create());
 const p12=forge.pkcs12.toPkcs12Asn1(keys.privateKey,[cert],'Clave-Ventas-local',{algorithm:'3des'});
 await call('configuration/complete',{configuration:{ruc:first.ruc,pais:'PE',pais_id:1,razonSocial:'Empresa ventas local configurada',direccion:'Origen local 123',ubigeo:'150101',tipo_empresa:'MICRO',regimen_tributario:'GENERAL',serie_factura:'F001',serie_boleta:'B001',serie_guia_remision:'T001',certificateBase64:Buffer.from(forge.asn1.toDer(p12).getBytes(),'binary').toString('base64'),certificatePassword:'Clave-Ventas-local',sunat_environment:'homologacion'}});
 const warehouse=await call('inventario/almacenes',{idempotency_key:randomUUID(),codigo:'VENTAS-LOCAL',nombre:'Almacén ventas local',es_principal:true});
 await call('inventario/categorias',{idempotency_key:randomUUID(),codigo:'VENTAS-LOCAL',nombre:'Mercaderías ventas locales'});
 const product=await call('inventario/productos',{idempotency_key:randomUUID(),codigo:'VENTAS-STOCK-LOCAL',nombre:'Producto ventas local',categoria:'Mercaderías ventas locales',unidad_medida:'NIU',precio_compra:10,precio_venta:20,controla_stock:true,almacen_id:warehouse.id,stock_inicial:10,afectacion_igv:'10'});
 const client=await call('ventas/clientes',{tipo:'EMPRESA',documento_tipo:'RUC',documento_numero:other.ruc,razon_social:'Cliente ventas local SAC'});
 const roles=await call('roles'),admin=roles.find(role=>role.nombre==='ADMIN');assert.ok(admin);
 await call('users',{nombre:'Aprobador ventas local',email:'aprobador-ventas-local@example.test',password:'Ventas-Aprobador-Local-2026!',roles:[admin.id],idempotency_key:randomUUID()});
 approverToken=(await call('auth/login',{email:'aprobador-ventas-local@example.test',password:'Ventas-Aprobador-Local-2026!'})).access_token;
 const line=(cantidad,precio)=>({producto_id:product.id,descripcion:product.nombre,cantidad,precio_unitario:precio});
 const quote=async extra=>(await call('ventas/cotizaciones',{cliente_id:client.id,notas:'Cotización ventas local',detalle:[line(1,20)],...extra}));

 await check('Ventas: cotización editada recalcula total, conserva líneas y registra historial',async()=>{
  const created=await quote({detalle:[line(1,20)]});assert.equal(created.detalle.length,1);
  const updated=await call('ventas/cotizaciones/'+created.id,{detalle:[line(3,20)],notas:'Editada localmente'},200,token,randomUUID(),'PUT');
  const detail=await call('ventas/cotizaciones/'+created.id);assert.equal(detail.detalle.length,1);assert.equal(Number(detail.detalle[0].cantidad),3);
  assert.equal(Math.round(Number(detail.total)*100),Math.round(60*1.18*100),'Total recalculado con IGV');assert.equal(detail.observaciones??detail.notas,'Editada localmente');
  const history=await call('ventas/cotizaciones/'+created.id+'/historial');const events=Array.isArray(history)?history:(history.data??history.eventos??history.timeline??[]);
  assert.ok(Array.isArray(events)&&events.length>=1,'Historial con eventos: '+JSON.stringify(history).slice(0,200));
  return {updated_total:Number(detail.total)};
 });
 await check('Ventas: cotización rechazada por otro actor no se convierte en pedido',async()=>{
  const created=await quote();await call('ventas/cotizaciones/'+created.id+'/enviar',{});
  const rejected=await call('ventas/cotizaciones/'+created.id+'/rechazar',{motivo:'Rechazo comercial local'},201,approverToken);assert.equal(rejected.estado,'RECHAZADA');
  await call('ventas/cotizaciones/'+created.id+'/convertir-pedido',{},400);
  assert.equal(count('pedidos_venta','cotizacion_id='+q(created.id)),0);
 });
 await check('Ventas: ADMIN no puede autorrechazar y su autoaprobación queda trazada',async()=>{
  const created=await quote();await call('ventas/cotizaciones/'+created.id+'/enviar',{});
  const selfReject=await raw('ventas/cotizaciones/'+created.id+'/rechazar',{motivo:'Autorrechazo local'});
  assert.ok([400,403].includes(selfReject.status),'Autorrechazo debe fallar: '+selfReject.status);
  assert.equal((await call('ventas/cotizaciones/'+created.id)).estado,'ENVIADA');
  await call('ventas/cotizaciones/'+created.id+'/aprobar',{motivo:'Excepción administrativa local'});
  assert.equal(sql(`SELECT estado||'|'||(aprobado_por=created_by)::text||'|'||observaciones_aprobacion FROM cotizaciones WHERE id=${q(created.id)};`),'APROBADA|true|Excepción administrativa local');
 });
 await check('Ventas: eliminar cotización borrador la retira; ajena o inexistente responde 404',async()=>{
  const created=await quote();await call('ventas/cotizaciones/'+created.id,undefined,200,token,randomUUID(),'DELETE');
  await call('ventas/cotizaciones/'+created.id,undefined,404);await call('ventas/cotizaciones/'+created.id,undefined,404,token,randomUUID(),'DELETE');
  const kept=await quote();await call('ventas/cotizaciones/'+kept.id,undefined,404,otherToken);
  await call('ventas/cotizaciones/'+kept.id,undefined,404,otherToken,randomUUID(),'DELETE');assert.equal((await call('ventas/cotizaciones/'+kept.id)).id,kept.id);
 });
 await check('Ventas: listado de cotizaciones filtra por estado, cliente y búsqueda dentro de la empresa',async()=>{
  const list=await raw('ventas/cotizaciones?cliente_id='+client.id+'&limit=200');assert.equal(list.status,200);
  const rows=list.body.data;assert.ok(rows.length>=3&&rows.every(r=>r.cliente_id===client.id));
  const rejected=(await raw('ventas/cotizaciones?estado=RECHAZADA')).body.data;assert.ok(rejected.length>=1&&rejected.every(r=>r.estado==='RECHAZADA'));
  const foreign=(await raw('ventas/cotizaciones?cliente_id='+client.id,undefined,otherToken)).body.data;assert.deepEqual(foreign,[]);
 });
 await check('Ventas: alta repetida de cotización con la misma Idempotency-Key no duplica',async()=>{
  const key=randomUUID(),body={cliente_id:client.id,notas:'Respuesta perdida de cotización',detalle:[line(1,20)]},before=count('cotizaciones');
  const a=await call('ventas/cotizaciones',body,201,token,key),b=await call('ventas/cotizaciones',body,201,token,key);
  const created=count('cotizaciones')-before;assert.equal(created,1,'Cotizaciones creadas con la misma clave: '+created+' (ids '+a.id+','+b.id+')');assert.equal(a.id,b.id);
 });
 let order;
 await check('Ventas: pedido directo editado antes de confirmar recalcula total',async()=>{
  order=await call('ventas/pedidos',{cliente_id:client.id,notas:'Pedido directo local',detalle:[line(1,20)]});assert.ok(order.id);
  await call('ventas/pedidos/'+order.id,{detalle:[line(2,20)]},200,token,randomUUID(),'PUT');
  const detail=await call('ventas/pedidos/'+order.id);assert.equal(Number(detail.detalle[0].cantidad),2);assert.equal(Math.round(Number(detail.total)*100),Math.round(40*1.18*100));
 });
 await check('Ventas: alta repetida de pedido con la misma Idempotency-Key no duplica',async()=>{
  const key=randomUUID(),body={cliente_id:client.id,notas:'Respuesta perdida de pedido',detalle:[line(1,20)]},before=count('pedidos_venta');
  const a=await call('ventas/pedidos',body,201,token,key),b=await call('ventas/pedidos',body,201,token,key);
  const created=count('pedidos_venta')-before;assert.equal(created,1,'Pedidos creados con la misma clave: '+created+' (ids '+a.id+','+b.id+')');
 });
 await check('Ventas: pedido confirmado y cancelado con replay conserva un único estado e historial',async()=>{
  assert.ok(order?.id,'Pedido previo');await call('ventas/pedidos/'+order.id+'/confirmar',{});
  const key=randomUUID(),body={motivo:'Cancelación comercial local'};
  const first=await raw('ventas/pedidos/'+order.id+'/cancelar',body,token,key);assert.ok([200,201].includes(first.status),JSON.stringify(first.body).slice(0,300));
  const again=await raw('ventas/pedidos/'+order.id+'/cancelar',body,token,key);assert.equal(again.status,first.status);
  assert.equal((await call('ventas/pedidos/'+order.id)).estado,'CANCELADO');
  const history=await call('ventas/pedidos/'+order.id+'/historial');const events=Array.isArray(history)?history:(history.data??history.eventos??history.timeline??[]);assert.ok(events.length>=2,'Historial '+JSON.stringify(history).slice(0,200));
  await call('ventas/pedidos/'+order.id+'/gres');
 });
 await check('Ventas: pedido ajeno responde 404 y no se modifica',async()=>{
  const created=await call('ventas/pedidos',{cliente_id:client.id,notas:'Pedido aislamiento local',detalle:[line(1,20)]});
  await call('ventas/pedidos/'+created.id,undefined,404,otherToken);await call('ventas/pedidos/'+created.id,{notas:'ajeno'},404,otherToken,randomUUID(),'PUT');
  await call('ventas/pedidos/'+created.id+'/confirmar',{},404,otherToken);await call('ventas/pedidos/'+randomUUID(),{notas:'inexistente'},404,token,randomUUID(),'PUT');assert.equal((await call('ventas/pedidos/'+created.id)).estado,created.estado);
 });
 for(const [table,endpoint] of [['cotizaciones','ventas/cotizaciones'],['pedidos_venta','ventas/pedidos']])await check('Ventas: lectura de '+table+' indisponible responde 503 y se recupera',async()=>{
  const failed=await outage(`GRANT SELECT ON public.${table} TO service_role;`,`REVOKE SELECT ON public.${table} FROM service_role;`,()=>raw(endpoint));
  assert.equal(failed.status,503,'Indisponibilidad: '+failed.status+' '+JSON.stringify(failed.body).slice(0,200));await call(endpoint);
 });
 await check('Ventas: writer de cotización sin EXECUTE responde 503 sin crear filas',async()=>{
  // La API usa el envoltorio idempotente cuando recibe clave, como hace la UI.
  const fn=signature('crear_cotizacion_idempotente_tx_567'),before=count('cotizaciones');
  const failed=await outage(`GRANT EXECUTE ON FUNCTION ${fn} TO service_role;`,`REVOKE EXECUTE ON FUNCTION ${fn} FROM service_role;`,()=>raw('ventas/cotizaciones',{cliente_id:client.id,detalle:[line(1,20)]}));
  assert.equal(count('cotizaciones'),before);assert.equal(failed.status,503,'Writer indisponible: '+failed.status+' '+JSON.stringify(failed.body).slice(0,200));
 });
 await check('Ventas: reportes comerciales restantes responden con datos de la empresa',async()=>{
  const statuses={};for(const endpoint of ['pipeline','fill-rate','cxc-aging','sunat-kpis','cotizaciones-pendientes']){const r=await raw('ventas/reportes/'+endpoint);statuses[endpoint]=r.status;}
  let viewProbe;try{viewProbe=sql("BEGIN; SET LOCAL ROLE service_role; SELECT count(*) FROM public.v_kpis_sunat_multitenant; ROLLBACK;");}catch(error){viewProbe='ERROR '+String(error.stderr||error.message).split('\n')[0];}
  assert.ok(Object.values(statuses).every(s=>s===200),JSON.stringify({statuses,viewProbe}));return {statuses,viewProbe};
 });
 await check('Ventas: validar RUC acepta dígito correcto y rechaza el incorrecto',async()=>{
  const ok=await raw('ventas/clientes/validar-ruc',{ruc:other.ruc});assert.ok([200,201].includes(ok.status),JSON.stringify(ok.body).slice(0,200));
  const bad=other.ruc.slice(0,10)+String((Number(other.ruc[10])+1)%10);const ko=await raw('ventas/clientes/validar-ruc',{ruc:bad});
  assert.ok(ko.status===400||ko.body?.valido===false||ko.body?.data?.valido===false,'RUC inválido aceptado: '+ko.status+' '+JSON.stringify(ko.body).slice(0,200));
 });
 const today=sql(`SELECT app.hoy_tenant(${q(first.tenant)});`);
 await check('Ventas: lista de precios con intención, replay, conflicto, resolución y desactivación',async()=>{
  const key=randomUUID(),body={codigo:'LP-LOCAL',nombre:'Lista cliente local',moneda:'PEN',prioridad:10,cliente_id:client.id,vigencia_desde:today,detalles:[{producto_id:product.id,cantidad_minima:0,precio_unitario:15}]};
  const list=await call('ventas/comercial/listas-precios',body,201,token,key);const id=list.id??list.lista?.id;assert.ok(id,JSON.stringify(list).slice(0,200));
  const again=await call('ventas/comercial/listas-precios',body,201,token,key);assert.equal(again.id??again.lista?.id,id);
  const conflict=await raw('ventas/comercial/listas-precios',{...body,nombre:'Otra lista'},token,key);assert.ok([400,409].includes(conflict.status),'Conflicto '+conflict.status);
  const resolved=await call('ventas/comercial/precios/resolver',{cliente_id:client.id,fecha:today,detalle:[{producto_id:product.id,cantidad:1}]},201);
  const price=item=>Number((Array.isArray(item)?item:(item.detalle??item.items??[]))[0]?.precio_unitario);assert.equal(price(resolved),15,JSON.stringify(resolved).slice(0,300));
  await call('ventas/comercial/listas-precios/'+id+'/estado',{activo:false},200,token,randomUUID(),'PATCH');
  const after=await call('ventas/comercial/precios/resolver',{cliente_id:client.id,fecha:today,detalle:[{producto_id:product.id,cantidad:1}]},201);assert.notEqual(price(after),15);
  const foreign=(await raw('ventas/comercial/listas-precios?incluir_inactivas=true',undefined,otherToken)).data;assert.ok(Array.isArray(foreign)&&foreign.every(r=>r.id!==id));
 });
 await check('Ventas: regla de comisión con intención, replay y desactivación; movimientos consultables',async()=>{
  const key=randomUUID(),body={codigo:'COM-LOCAL',nombre:'Comisión local',producto_id:product.id,porcentaje:2.5,prioridad:5,vigencia_desde:today};
  const rule=await call('ventas/comercial/comisiones/reglas',body,201,token,key);const id=rule.id??rule.regla?.id;assert.ok(id);
  assert.equal((await call('ventas/comercial/comisiones/reglas',body,201,token,key)).id??id,id);
  await call('ventas/comercial/comisiones/reglas/'+id+'/estado',{activo:false},200,token,randomUUID(),'PATCH');
  const rules=await call('ventas/comercial/comisiones/reglas?incluir_inactivas=true');assert.ok(rules.some(r=>r.id===id&&r.activo===false));
  await call('ventas/comercial/comisiones/movimientos?desde='+today+'&hasta='+today);
 });
 await check('Ventas: consolidado rechaza fuente inexistente sin efectos y lista candidatos',async()=>{
  await call('ventas/comercial/consolidados/candidatos');const before=count('ventas_consolidados');
  const bad=await raw('ventas/comercial/consolidados',{fuentes:[{tipo:'DOCUMENTO',id:randomUUID()}],notas:'Fuente inexistente local'});
  assert.ok([400,404,409].includes(bad.status),'Fuente inexistente: '+bad.status);assert.equal(count('ventas_consolidados'),before);
  await call('ventas/comercial/consolidados');
 });
 success=scenarios.every(s=>s.passed);
}catch(error){scenarios.push({scenario:'Ventas: preparación o dependencia',passed:false,message:String(error.message).slice(0,600)});}
finally{fs.writeFileSync(path.join(output,'sales-operations.json'),JSON.stringify({success,remoteWrites:false,scope:'Ventas API/DB local diagnóstico; sin aceptación integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(s=>s.passed).length,failed:scenarios.filter(s=>!s.passed).map(s=>s.scenario)}));
