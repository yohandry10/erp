import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');
const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const first=JSON.parse(fs.readFileSync(path.join(output,'cpe-first-fixture.json'))),other=JSON.parse(fs.readFileSync(path.join(output,'cpe-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
let token,otherToken,cpe,client,success=false;
const scenarios=[],requests=[];
async function raw(endpoint,body,access=token,key=randomUUID()) {
 const method=body===undefined?'GET':'POST';
 let response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json','connection':'close',...(access?{authorization:'Bearer '+access}:{}),...(key===null?{}:{'idempotency-key':key})},body:body===undefined?undefined:JSON.stringify(body)});
 if(response.status===429 && process.env.CPE_VOLUME==='1' && endpoint==='cpe/comprobantes') {
   requests.push({method,endpoint,status:429,rate_limit_observed:true});const seconds=Number(response.headers.get('retry-after')||60);assert.ok(seconds>0&&seconds<=60);await response.body?.cancel();console.log('Espera por límite de API local: '+seconds+' segundos');await new Promise(resolve=>setTimeout(resolve,seconds*1000));
   response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json','connection':'close',authorization:'Bearer '+access,'idempotency-key':key},body:JSON.stringify(body)});
 }
 const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
 return {status:response.status,body:value,data:Object.hasOwn(value??{},'data')?value.data:value,bytes,type:response.headers.get('content-type')};
}
async function call(endpoint,body,status=body===undefined?200:201,access=token,key=randomUUID()){const r=await raw(endpoint,body,access,key);assert.equal(r.status,status,endpoint.split('?')[0]+': '+JSON.stringify(r.body));return r.data;}
async function check(scenario,action){try{await action();scenarios.push({scenario,passed:true});}catch(error){scenarios.push({scenario,passed:false,message:error.message});}}
const count=()=>sql(`SELECT count(*) FROM cpe WHERE tenant_id=${q(first.tenant)};`);
const financial=()=>sql(`SELECT md5(jsonb_build_object('documents',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM documentos t WHERE tenant_id=${q(first.tenant)}),'cxc',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM cuentas_por_cobrar t WHERE tenant_id=${q(first.tenant)}),'outbox',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM outbox_events t WHERE tenant_id=${q(first.tenant)}))::text);`);
const economic=()=>sql(`SELECT md5(jsonb_build_object('documents',(SELECT jsonb_agg(jsonb_build_object('id',id,'total',total,'subtotal',subtotal) ORDER BY id) FROM documentos WHERE tenant_id=${q(first.tenant)}),'cxc',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM cuentas_por_cobrar t WHERE tenant_id=${q(first.tenant)}),'entries',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM asientos_contables t WHERE tenant_id=${q(first.tenant)}))::text);`);
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date());
const payload=extra=>({tipo_documento:'01',serie:'F001',cliente_id:client.id,tipo_documento_receptor:'6',documento_receptor:other.ruc,razon_social_receptor:'Cliente CPE local',moneda:'PEN',fecha_emision:today,condicion_pago:'CONTADO',medio_pago:'001',items:[{codigo:'CPE-SERV-LOCAL',descripcion:'Servicio CPE local',cantidad:1,precio_unitario:20,valor_venta:20,igv:3.6,total:23.6,unidadMedida:'ZZ'}],...extra});
try {
 token=(await call('auth/login',{email:first.email,password:'Cliente-Local-2026-Only!'})).access_token;
 otherToken=(await call('auth/login',{email:other.email,password:'Cliente-Local-2026-Only!'})).access_token;
 const require=createRequire(path.resolve('apps/erp-api/package.json')),forge=require('node-forge'),keys=forge.pki.rsa.generateKeyPair(2048),cert=forge.pki.createCertificate();
 cert.publicKey=keys.publicKey;cert.serialNumber='05';cert.validity.notBefore=new Date(Date.now()-86400000);cert.validity.notAfter=new Date(Date.now()+365*86400000);
 const attrs=[{name:'commonName',value:'CERTIFICADO LOCAL '+first.ruc},{name:'countryName',value:'PE'},{name:'organizationName',value:'Ensayo CPE local'},{type:'2.5.4.5',value:first.ruc}];cert.setSubject(attrs);cert.setIssuer(attrs);cert.sign(keys.privateKey,forge.md.sha256.create());
 const p12=forge.pkcs12.toPkcs12Asn1(keys.privateKey,[cert],'Clave-CPE-local',{algorithm:'3des'}),certificateBase64=Buffer.from(forge.asn1.toDer(p12).getBytes(),'binary').toString('base64');
 await call('configuration/complete',{configuration:{ruc:first.ruc,pais:'PE',pais_id:1,razonSocial:'Empresa CPE local configurada',direccion:'Origen CPE local 123',ubigeo:'150101',tipo_empresa:'MICRO',regimen_tributario:'GENERAL',serie_factura:'F001',serie_boleta:'B001',serie_guia_remision:'T001',certificateBase64,certificatePassword:'Clave-CPE-local',sunat_environment:'homologacion'}});
 client=await call('ventas/clientes',{tipo:'EMPRESA',documento_tipo:'RUC',documento_numero:other.ruc,razon_social:'Cliente CPE local'});
 const key=randomUUID(),body=payload();
 cpe=await call('cpe/comprobantes',body,201,token,key);assert.ok(cpe.id);assert.equal(count(),'1');
 scenarios.push({scenario:'CPE: factura manual de contado con PFX propio confirma documento, UBL firmado y outbox sin transmisión',passed:true});
 await check('CPE: replay y dos solicitudes concurrentes recuperan misma factura sin otro efecto',async()=>{const before=financial();const values=await Promise.all([call('cpe/comprobantes',body,201,token,key),call('cpe/comprobantes',body,201,token,key)]);for(const value of values)assert.equal(value.id,cpe.id);assert.equal(count(),'1');assert.equal(financial(),before);});
 await check('CPE: conflicto de intención devuelve 409 sin cambiar documento ni efectos',async()=>{const before=financial();await call('cpe/comprobantes',{...body,razon_social_receptor:'Otra razón social local'},409,token,key);assert.equal(financial(),before);});
 await check('CPE: detalle, XML autorizado, QR y consulta general representan registro persistido',async()=>{const detail=await call('cpe/comprobantes/'+cpe.id);assert.equal(detail.id,cpe.id);assert.equal(Number(detail.total_venta),23.6);assert.equal(detail.emisor.ruc,first.ruc);assert.ok(detail.sunat_qr_content);assert.ok(!('xml_firmado' in detail));assert.equal((await call('cpe/'+cpe.id)).id,cpe.id);const xml=await raw('cpe/'+cpe.id+'/xml');assert.equal(xml.status,200);assert.match(xml.type,/application\/xml/);assert.match(xml.bytes.toString(),/Signature/);assert.match(xml.bytes.toString(),/Invoice/);});
 await check('CPE: descarga PDF devuelve binario con cabecera y contenido PDF',async()=>{const pdf=await raw('cpe/comprobantes/'+cpe.id+'/pdf');assert.equal(pdf.status,200);assert.match(pdf.type,/application\/pdf/);assert.equal(pdf.bytes.subarray(0,5).toString(),'%PDF-');fs.writeFileSync(path.join(output,'cpe-single.pdf'),pdf.bytes);});
 await check('CPE: inexistente y ajeno reciben 404 en detalle, PDF, XML y consulta general',async()=>{for(const id of [randomUUID(),cpe.id])for(const endpoint of ['cpe/comprobantes/'+id,'cpe/comprobantes/'+id+'/pdf','cpe/'+id,'cpe/'+id+'/xml'])await call(endpoint,undefined,404,id===cpe.id?otherToken:token);});
 await check('CPE: ID mal formado recibe 400 antes de consultar PostgreSQL',async()=>{for(const suffix of ['cpe/comprobantes/no-es-uuid','cpe/no-es-uuid','cpe/no-es-uuid/xml','cpe/comprobantes/no-es-uuid/pdf'])await call(suffix,undefined,400);});
 await check('CPE: listado, búsqueda, filtro vacío y aislamiento tienen conteo real',async()=>{const list=await raw('cpe/comprobantes?cliente=Cliente%20CPE&serie=F001&page=1&pageSize=1');assert.equal(list.status,200);assert.equal(list.body.success,true);assert.equal(list.data.length,1);assert.equal(list.body.meta.total,1);assert.equal((await call('cpe/comprobantes?cliente=NO-EXISTE')).length,0);assert.equal((await call('cpe/comprobantes',undefined,200,otherToken)).length,0);});
 await check('CPE: página inválida y fecha inválida reciben 400 explícito',async()=>{for(const query of ['page=-1','pageSize=texto','fechaDesde=fecha-invalida'])await call('cpe/comprobantes?'+query,undefined,400);});
 await check('CPE: factura a crédito desde contrato UI conserva cliente y genera CxC única',async()=>{const credit=await call('cpe/comprobantes',payload({condicion_pago:'CREDITO',medio_pago:undefined,plazo_pago_dias:30}));assert.ok(credit.id);assert.equal(sql(`SELECT count(*) FROM cuentas_por_cobrar WHERE tenant_id=${q(first.tenant)} AND documento_id=(SELECT documento_id FROM cpe WHERE id=${q(credit.id)}) AND cliente_id=${q(client.id)} AND monto_total=23.6;`),'1');});
 await check('CPE: totales manipulados, cantidad cero y factura con DNI no dejan efectos',async()=>{const before=financial();await call('cpe/comprobantes',payload({items:[{descripcion:'Cero',cantidad:0,precio_unitario:20,igv:3.6}]}),400);await call('cpe/comprobantes',payload({tipo_documento_receptor:'1',documento_receptor:'12345678'}),400);await call('cpe/comprobantes',payload({total_venta:1,total_igv:0,total_gravadas:1}),400);assert.equal(financial(),before);});
 await check('CPE: nota sin origen aceptado y CDR durable no se crea ni afecta deuda',async()=>{const before=financial();await call('cpe/notas-referenciadas',{origen_documento_id:cpe.documento_id??cpe.documentoId,tipo_documento:'07',codigo_motivo:'01',motivo:'Anulación de operación local',monto_total:23.6},400);assert.equal(financial(),before);});
 await check('CPE: CSV cita comas, comillas y salto de línea del receptor y neutraliza fórmulas',async()=>{const special='=SUM(1,2) "Cliente"\nCPE local';await call('cpe/comprobantes',payload({razon_social_receptor:special}));const csv=await raw('cpe/comprobantes/export?cliente='+encodeURIComponent('SUM'));assert.equal(csv.status,200);assert.match(csv.type,/text\/csv/);fs.writeFileSync(path.join(output,'cpe-special.csv'),csv.bytes);assert.ok(csv.bytes.toString().includes('"\'=SUM(1,2) ""Cliente""\nCPE local"'),csv.bytes.toString());});
 await check('CPE: exportación básica filtrada entrega archivo CSV',async()=>{const result=await raw('cpe/comprobantes/export?serie=F001');assert.equal(result.status,200);assert.match(result.type,/text\/csv/);});
 await check('CPE: exportación y listado ajenos no revelan receptor de otra empresa',async()=>{const csv=await raw('cpe/comprobantes/export',undefined,otherToken);assert.equal(csv.status,200);assert.ok(!csv.bytes.toString().includes('Cliente CPE local'));});
 await check('CPE: boleta DNI y factura multipágina firman UBL y representan sus líneas',async()=>{
   const boleta=await call('cpe/comprobantes',payload({tipo_documento:'03',serie:'B001',cliente_id:undefined,tipo_documento_receptor:'1',documento_receptor:'12345678',razon_social_receptor:'Cliente Boleta local'}));assert.ok(boleta.id);assert.equal((await call('cpe/comprobantes/'+boleta.id)).tipo_documento,'03');
   const items=Array.from({length:80},(_,index)=>({codigo:'MP-'+index,descripcion:'Línea CPE multipágina '+String(index+1).padStart(3,'0'),cantidad:1,precio_unitario:1,valor_venta:1,igv:.18,total:1.18,unidadMedida:'ZZ'}));
   const multi=await call('cpe/comprobantes',payload({items}));const detail=await call('cpe/comprobantes/'+multi.id);assert.equal(detail.items.length,80);assert.equal(Number(detail.total_venta),94.4);const pdf=await raw('cpe/comprobantes/'+multi.id+'/pdf');assert.equal(pdf.status,200);assert.equal(pdf.bytes.subarray(0,5).toString(),'%PDF-');fs.writeFileSync(path.join(output,'cpe-multipage.pdf'),pdf.bytes);
 });
 await check('CPE: envío sin credenciales falla explícito y retry conserva CPE, XML y efectos',async()=>{
   const before=economic(),xml=(await raw('cpe/'+cpe.id+'/xml')).bytes.toString(),key=randomUUID();
   for(let attempt=0;attempt<2;attempt++){const response=await raw('cpe/'+cpe.id+'/resend',{},token,key);assert.equal(response.status,503,JSON.stringify(response.body));assert.equal(economic(),before);assert.equal((await raw('cpe/'+cpe.id+'/xml')).bytes.toString(),xml);}
   assert.equal(sql(`SELECT count(*) FROM cpe WHERE id=${q(cpe.id)} AND nullif(cdr_sunat,'') IS NOT NULL;`),'0');
 });
 await check('CPE: origen rechazado, consulta de bajas y lotes mantienen ausencia de aceptación externa',async()=>{assert.equal((await call('cpe/notas-referenciadas/origenes')).length,0);assert.equal((await call('cpe/baja/elegibles?tipo=RA')).length,0);assert.equal((await call('cpe/baja/lotes?tipo=RA')).length,0);});
 await check('CPE: caída real de SELECT devuelve 503 en listado, detalle, XML, PDF y estadísticas y luego recupera',async()=>{const before=economic();
   assert.equal(sql("SELECT has_table_privilege('service_role','public.cpe','SELECT');"),'t');
   try { sql('REVOKE SELECT ON public.cpe FROM service_role;');assert.equal(sql("SELECT has_table_privilege('service_role','public.cpe','SELECT');"),'f');
     const statuses=[];for(const endpoint of ['cpe/comprobantes','cpe/comprobantes/'+cpe.id,'cpe/'+cpe.id,'cpe/'+cpe.id+'/xml','cpe/comprobantes/'+cpe.id+'/pdf','cpe/stats']){const response=await raw(endpoint);statuses.push({endpoint:endpoint.replace(cpe.id,':id'),status:response.status,expected:503});}fs.writeFileSync(path.join(output,'cpe-read-fault.json'),JSON.stringify({remoteWrites:false,local_only:true,statuses},null,2));assert.ok(statuses.every(row=>row.status===503),JSON.stringify(statuses));
   }finally{sql('GRANT SELECT ON public.cpe TO service_role;');}
   assert.equal((await call('cpe/'+cpe.id)).id,cpe.id);assert.equal(economic(),before);
 });
 await check('CPE: lectura y reenvío sin permiso XML no revelan XML y emisión/PDF quedan prohibidos',async()=>{
   const permissionIds=JSON.parse(sql(`SELECT json_agg(id) FROM permisos WHERE tenant_id=${q(first.tenant)} AND codigo IN('cpe.comprobantes.listar','cpe.comprobantes.ver','cpe.comprobantes.reenviar');`));assert.equal(permissionIds.length,3);
   const role=await call('roles',{nombre:'LECTOR_CPE_LOCAL',permission_ids:permissionIds,idempotency_key:randomUUID()});
   const user=await call('users',{nombre:'Lector CPE local',email:'lector-cpe-local@example.test',password:'Lector-CPE-2026-Local!',roles:[role.id],idempotency_key:randomUUID()});
   const reader=(await call('auth/login',{email:'lector-cpe-local@example.test',password:'Lector-CPE-2026-Local!'})).access_token;
   const before=financial();await call('cpe/comprobantes',payload(),403,reader);await call('cpe/'+cpe.id+'/xml',undefined,403,reader);await call('cpe/comprobantes/'+cpe.id+'/pdf',undefined,403,reader);
   const detail=await call('cpe/comprobantes/'+cpe.id,undefined,200,reader);assert.ok(!('xml_firmado' in detail));assert.equal(financial(),before);
   const readerInvoice=await call('cpe/comprobantes',payload({razon_social_receptor:'REENVIO-LECTOR-CPE-LOCAL'}));
   for(let attempt=0;attempt<2;attempt++){const result=await raw('cpe/'+readerInvoice.id+'/resend',{},reader,'reader-cpe-retry-local');assert.equal(result.status,503);assert.ok(!/xml_firmado|<Invoice|pe_direct_request_fingerprint/.test(JSON.stringify(result.body)));}
   await call('cpe/'+readerInvoice.id+'/resend',{},409,reader,'different-reader-cpe-key');
   await call('cpe/'+cpe.id+'/resend',{},404,otherToken);
   sql(`DO $$ BEGIN BEGIN PERFORM public.emitir_cpe_directo_peru_tx(${q(first.tenant)},${q(user.id)},repeat('a',64),'{}','{}','[]',NULL,gen_random_uuid(),'reader-cpe-sql-local'); RAISE EXCEPTION 'MISSING_PERMISSION_GUARD'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;`);
 });
 await check('CPE: actor ajeno y permiso revocado impiden emitir también en SQL sin efectos',async()=>{
   const actor=sql(`SELECT id FROM usuarios_sistema WHERE tenant_id=${q(first.tenant)} AND email='${first.email}';`),foreign=sql(`SELECT id FROM usuarios_sistema WHERE tenant_id=${q(other.tenant)} AND email='${other.email}';`);q(actor);q(foreign);
   const before=financial();sql(`DO $$ BEGIN BEGIN PERFORM public.emitir_cpe_directo_peru_tx(${q(first.tenant)},${q(foreign)},repeat('a',64),'{}','{}','[]',NULL,gen_random_uuid(),'foreign-cpe-sql-local'); RAISE EXCEPTION 'MISSING_TENANT_GUARD'; EXCEPTION WHEN check_violation THEN NULL; END; END $$;`);
   sql(`UPDATE rol_permisos rp SET concedido=false FROM permisos p,roles r WHERE rp.permiso_id=p.id AND rp.role_id=r.id AND p.tenant_id=${q(first.tenant)} AND r.tenant_id=${q(first.tenant)} AND p.codigo='cpe.comprobantes.emitir';`);
   try{await call('cpe/comprobantes',payload(),403);sql(`DO $$ BEGIN BEGIN PERFORM public.emitir_cpe_directo_peru_tx(${q(first.tenant)},${q(actor)},repeat('a',64),'{}','{}','[]',NULL,gen_random_uuid(),'revoked-cpe-sql-local'); RAISE EXCEPTION 'MISSING_REVOKED_GUARD'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;`);assert.equal(financial(),before);}
   finally{sql(`UPDATE rol_permisos rp SET concedido=true FROM permisos p,roles r WHERE rp.permiso_id=p.id AND rp.role_id=r.id AND p.tenant_id=${q(first.tenant)} AND r.tenant_id=${q(first.tenant)} AND p.codigo='cpe.comprobantes.emitir';`);}
 });
 await check('CPE: crédito con cliente ajeno o inexistente se rechaza sin cuenta por cobrar',async()=>{
   const foreignClient=await call('ventas/clientes',{tipo:'EMPRESA',documento_tipo:'RUC',documento_numero:first.ruc,razon_social:'Cliente ajeno CPE local'},201,otherToken);
   const before=financial();for(const cliente_id of [foreignClient.id,randomUUID()])await call('cpe/comprobantes',payload({cliente_id,condicion_pago:'CREDITO',medio_pago:undefined,plazo_pago_dias:30}),400);assert.equal(financial(),before);
 });
 await check('CPE: fallo real después del INSERT revierte documento y outbox y recupera la intención',async()=>{
   const before=financial(),beforeCount=count(),key=randomUUID(),body=payload({razon_social_receptor:'ROLLBACK-CPE-LOCAL'});
   sql(`CREATE FUNCTION public.fail_cpe_insert_local_565() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'LOCAL_CPE_AFTER_INSERT_FAILURE'; END $$; CREATE TRIGGER fail_cpe_insert_local_565 AFTER INSERT ON cpe FOR EACH ROW WHEN(NEW.razon_social_receptor='ROLLBACK-CPE-LOCAL') EXECUTE FUNCTION public.fail_cpe_insert_local_565();`);
   try{await call('cpe/comprobantes',body,503,token,key);assert.equal(financial(),before);assert.equal(count(),beforeCount);}finally{sql('DROP TRIGGER fail_cpe_insert_local_565 ON cpe; DROP FUNCTION public.fail_cpe_insert_local_565();');}
   const recovered=await call('cpe/comprobantes',body,201,token,key);assert.equal((await call('cpe/comprobantes',body,201,token,key)).id,recovered.id);assert.equal(Number(count()),Number(beforeCount)+1);
 });
 await check('CPE: RPC sin EXECUTE responde 503 y permite reintento único tras restaurar permiso',async()=>{
   const before=financial(),key=randomUUID(),body=payload({razon_social_receptor:'RPC-CPE-LOCAL'});
   sql('REVOKE EXECUTE ON FUNCTION public.emitir_cpe_directo_peru_tx(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,uuid,text) FROM service_role;');
   try{await call('cpe/comprobantes',body,503,token,key);assert.equal(financial(),before);}finally{sql('GRANT EXECUTE ON FUNCTION public.emitir_cpe_directo_peru_tx(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,uuid,text) TO service_role;');}
   const recovered=await call('cpe/comprobantes',body,201,token,key);assert.equal((await call('cpe/comprobantes',body,201,token,key)).id,recovered.id);
 });
 await check('CPE: contrato UI conserva precio neto y fecha de emisión en filtro y XML',async()=>{
   const yesterday=new Date(today+'T12:00:00Z');yesterday.setUTCDate(yesterday.getUTCDate()-1);const day=yesterday.toISOString().slice(0,10);
   const invoice=await call('cpe/comprobantes',{tipoComprobante:'01',serie:'F001',clienteTipoDocumento:'RUC',clienteRuc:other.ruc,clienteRazonSocial:'FECHA-PRECIO-CPE-LOCAL',moneda:'PEN',fechaEmision:day,items:[{descripcion:'Precio neto UI local',cantidad:2,valorUnitario:20,precioUnitario:23.6,igv:7.2,total:47.2,unidadMedida:'NIU'}],subtotal:40,totalIgv:7.2,total:47.2});
   const rows=await call('cpe/comprobantes?cliente=FECHA-PRECIO-CPE-LOCAL&fechaDesde='+day+'&fechaHasta='+day);assert.equal(rows.length,1);assert.equal(rows[0].id,invoice.id);assert.equal(rows[0].fechaEmision,day);
   const xml=(await raw('cpe/'+invoice.id+'/xml')).bytes.toString();assert.equal(Number(/<cac:Price>\s*<cbc:PriceAmount[^>]*>([^<]+)/.exec(xml)?.[1]),20);assert.equal(Number(invoice.items[0].precio_unitario),20);
 });
 if(process.env.CPE_VOLUME==='1')await check('CPE: exportación incluye más de 200 facturas reales de API sin truncar',async()=>{
   for(let index=0;index<201;index++)await call('cpe/comprobantes',payload({razon_social_receptor:'VOLUMEN-CPE-LOCAL-'+index}));
   const csv=await raw('cpe/comprobantes/export?cliente=VOLUMEN-CPE-LOCAL');assert.equal(csv.status,200);assert.equal(csv.bytes.toString().split('\n').filter(row=>row.includes('VOLUMEN-CPE-LOCAL-')).length,201);fs.writeFileSync(path.join(output,'cpe-volume.csv'),csv.bytes);
 });
 fs.writeFileSync(path.join(output,'cpe-browser-fixture.json'),JSON.stringify({email:first.email,tenant:first.tenant,cpe_id:cpe.id,client_id:client.id,client_ruc:other.ruc}));
 success=scenarios.every(s=>s.passed);
}catch(error){scenarios.push({scenario:'CPE: preparación o dependencia',passed:false,message:error.message});}
finally{fs.writeFileSync(path.join(output,'cpe-operations.json'),JSON.stringify({success,remoteWrites:false,scope:'CPE API/DB local no demo; sin transmisión ni aceptación SUNAT',scenarios,requests},null,2));}
