import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';

assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
assert.equal(process.env.PGHOST,'127.0.0.1');
assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;
assert.equal(new URL(api).hostname,'127.0.0.1');
const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const first=JSON.parse(fs.readFileSync(path.join(output,'accounting-first-fixture.json')));
const other=JSON.parse(fs.readFileSync(path.join(output,'accounting-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
const proof={success:false,remoteWrites:false,scope:'New supplier credit NC/application/refund on owned fresh local tenant, API/SQL/accounting; no Web or Windows acceptance',scenarios:[],requests:[]};
let token,otherToken,note,bank,target;
async function raw(endpoint,body,access=token,method=body===undefined?'GET':'POST',key=randomUUID()) {
  const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json','idempotency-key':key,authorization:'Bearer '+access},body:body===undefined?undefined:JSON.stringify(body)});
  const value=await response.json();
  proof.requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
  return {status:response.status,body:value,data:value?.data??value};
}
async function call(endpoint,body,status=body===undefined?200:201,access=token,method=body===undefined?'GET':'POST',key) {
  const result=await raw(endpoint,body,access,method,key);
  assert.equal(result.status,status,method+' '+endpoint.split('?')[0]+': '+JSON.stringify(result.body).slice(0,500));
  return result.data;
}
async function check(scenario,action) {
  try {const detail=await action();proof.scenarios.push({scenario,passed:true,...detail});}
  catch(error){proof.scenarios.push({scenario,passed:false,message:String(error.message).slice(0,900)});throw error;}
}
const cents=v=>Math.round(Number(v)*100);
const state=()=>sql(`SELECT jsonb_build_object('credit',(SELECT saldo_credito_proveedor FROM cuentas_por_pagar WHERE id=${q(note.id)}),'debt',(SELECT saldo FROM cuentas_por_pagar WHERE id=${q(target.id)}),'bank',(SELECT saldo FROM cuentas_bancarias WHERE id=${q(bank.id)}),'ledger',(SELECT count(*) FROM cxp_credito_proveedor_movimientos WHERE nota_credito_id=${q(note.id)}),'uses',(SELECT count(*) FROM financial_master_operations WHERE tenant_id=${q(first.tenant)} AND operation_type='SUPPLIER_CREDIT_USE' AND record_id=${q(note.id)}))::text;`);
try {
  token=(await call('auth/login',{email:first.email,password:'Cliente-Local-2026-Only!'})).access_token;
  otherToken=(await call('auth/login',{email:other.email,password:'Cliente-Local-2026-Only!'})).access_token;
  const today=sql(`SELECT app.hoy_tenant(${q(first.tenant)});`),[anio,mes]=today.split('-').map(Number);
  const period=sql(`SELECT estado FROM periodos_contables WHERE tenant_id=${q(first.tenant)} AND anio=${anio} AND mes=${mes};`);
  if(!period)await call('contabilidad/periodos',{anio,mes});else assert.equal(period,'ABIERTO','Do not reopen a previously closed period');
  const account=code=>{assert.ok(['1041','70','63'].includes(code));const id=sql(`SELECT id FROM plan_cuentas WHERE tenant_id=${q(first.tenant)} AND codigo='${code}' AND activo ORDER BY created_at,id LIMIT 1;`);q(id);return id;};
  const generalLedger=()=>JSON.parse(sql(`SELECT jsonb_build_object('bank',coalesce(sum(d.debe-d.haber) FILTER(WHERE p.codigo='1041'),0),'credit',coalesce(sum(d.debe-d.haber) FILTER(WHERE p.codigo='422'),0),'payables',coalesce(sum(d.debe-d.haber) FILTER(WHERE p.codigo LIKE '42%'),0)) FROM asientos_contables a JOIN detalle_asientos d ON d.asiento_id=a.id JOIN plan_cuentas p ON p.id=d.cuenta_id WHERE a.tenant_id=${q(first.tenant)} AND a.estado='CONFIRMADO';`));
  const ledgerBefore=generalLedger();
  const tag=randomUUID().slice(0,8).toUpperCase();
  bank=await call('finanzas/bancos/cuentas',{nombre:'Crédito proveedor '+tag,banco:'BANCO LOCAL',numero_cuenta:'SC-'+tag,moneda:'PEN',tipo_cuenta:'CORRIENTE',cuenta_contable_id:account('1041'),saldo:0});
  await call('finanzas/bancos/movimientos',{cuenta_bancaria_id:bank.id,cuenta_contrapartida_id:account('70'),tipo:'ABONO',monto:500,moneda:'PEN',fecha:today,descripcion:'Fondos crédito proveedor',referencia:'SC-FUND-'+tag,categoria:'OTRO_INGRESO',metodo_pago:'TRANSFERENCIA',idempotency_key:randomUUID()});
  const base='20'+String(Date.now()).slice(-8),weights=[5,4,3,2,7,6,5,4,3,2],digit=11-weights.reduce((s,w,i)=>s+Number(base[i])*w,0)%11;
  const provider=await call('compras/proveedores',{ruc:base+String(digit===10?0:digit===11?1:digit),razon_social:'Crédito proveedor '+tag,direccion:'Av. Local 456',email:'sc-'+tag+'@example.test'});
  const invoice=async(suffix,subtotal,igv,total)=>call('finanzas/cxp',{proveedor_id:provider.id,numero_documento:'F001-'+tag+suffix,serie:'F001',tipo_documento:'FACTURA',fecha_emision:today,fecha_vencimiento:sql(`SELECT (app.hoy_tenant(${q(first.tenant)})+30)::text;`),condiciones_pago:'CREDITO_30',subtotal,igv,total,moneda:'PEN',tipo_cambio:1,destino_credito_fiscal:'GRAVADAS'});
  const original=await invoice('A',100,18,118);target=await invoice('B',50,9,59);
  await call('finanzas/tesoreria/pagos',{cxp_id:original.id,monto:118,fecha_pago:today,metodo_pago:'TRANSFERENCIA',cuenta_bancaria_id:bank.id,referencia:'SC-PAY-'+tag,idempotency_key:randomUUID()});
  const nc={proveedor_id:provider.id,numero_documento:'FC01-'+tag,serie:'FC01',tipo_documento:'NOTA_CREDITO',fecha_emision:today,subtotal:10,igv:1.8,total:11.8,moneda:'PEN',tipo_cambio:1,factura_proveedor_id:original.id,motivo_nota_credito:'DESCUENTO',cuenta_ajuste_id:account('63'),documento_referencia_tipo:'FACTURA',documento_referencia_serie:'F001',documento_referencia_numero:tag+'A',documento_referencia_fecha:today};
  await check('Proveedor: NC sobre factura pagada origina11.80de crédito una sola vez',async()=>{
    note=await call('finanzas/cxp',nc);const replay=await call('finanzas/cxp',nc);assert.equal(replay.id,note.id);
    assert.equal(cents((await call('finanzas/cxp/'+note.id)).saldo_credito_proveedor),1180);
    const rows=await call('finanzas/cxp/'+note.id+'/credito-movimientos');assert.equal(rows.length,1);assert.equal(rows[0].tipo,'ORIGEN');assert.equal(cents(rows[0].monto),1180);
    assert.equal(cents((await call('finanzas/bancos/cuentas/'+bank.id)).saldo),38200);
    return {noteId:note.id,originalInvoiceId:original.id,targetInvoiceId:target.id,bankId:bank.id};
  });
  const apply={accion:'APLICACION',monto:5,fecha:today,factura_id:target.id,idempotency_key:randomUUID()};
  await check('Proveedor: dos aplicaciones concurrentes idénticas conservan un movimiento y la deuda54.00',async()=>{
    const [a,b]=await Promise.all([call('finanzas/cxp/'+note.id+'/usar-credito',apply),call('finanzas/cxp/'+note.id+'/usar-credito',apply)]);
    assert.equal(a.movimiento_credito.id,b.movimiento_credito.id);
    const s=JSON.parse(state());assert.equal(cents(s.credit),680);assert.equal(cents(s.debt),5400);assert.equal(cents(s.bank),38200);assert.equal(s.ledger,2);assert.equal(s.uses,1);
    return {movementId:a.movimiento_credito.id,originalKey:apply.idempotency_key};
  });
  await check('Proveedor: misma clave con cuerpo cambiado, exceso y milésimas son rechazados sin efecto',async()=>{
    // Shared financial writer contract maps business/idempotency rejection to400.
    const before=state();await call('finanzas/cxp/'+note.id+'/usar-credito',{...apply,monto:4},400);
    await call('finanzas/cxp/'+note.id+'/usar-credito',{...apply,monto:7,idempotency_key:randomUUID()},400);
    await call('finanzas/cxp/'+note.id+'/usar-credito',{...apply,monto:0.001,idempotency_key:randomUUID()},400);
    assert.equal(state(),before);
  });
  const refund={accion:'REEMBOLSO',monto:6.8,fecha:today,cuenta_bancaria_id:bank.id,referencia:'SC-REFUND-'+tag,idempotency_key:randomUUID()};
  await check('Proveedor: fallo tardío del ledger revierte banco, crédito, recibos y outbox de la transacción compuesta',async()=>{
    const name='uat_supplier_refund_'+tag.toLowerCase(),key=randomUUID(),before=state();
    const counts=()=>sql(`SELECT jsonb_build_object('bankMoves',(SELECT count(*) FROM movimientos_bancarios WHERE cuenta_bancaria_id=${q(bank.id)}),'outbox',(SELECT count(*) FROM outbox_events WHERE tenant_id=${q(first.tenant)}))::text;`);
    const countsBefore=counts();
    // A sequence survives rollback, proving the trigger observed the two real
    // financial updates before forcing the later ledger INSERT to fail.
    sql(`CREATE SEQUENCE app.${name}; CREATE FUNCTION app.${name}() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN IF NEW.tenant_id=${q(first.tenant)} AND NEW.tipo='REEMBOLSO' AND NEW.idempotency_key='${key}' THEN IF (SELECT saldo FROM public.cuentas_bancarias WHERE id=${q(bank.id)})<>383 OR (SELECT saldo_credito_proveedor FROM public.cuentas_por_pagar WHERE id=${q(note.id)})<>5.8 THEN RAISE EXCEPTION 'UAT_STAGE_NOT_REACHED' USING ERRCODE='XX000'; END IF; PERFORM nextval('app.${name}'::regclass); RAISE EXCEPTION 'UAT_OWN_LATE_LEDGER_FAILURE' USING ERRCODE='23514'; END IF; RETURN NEW; END $fn$; CREATE TRIGGER ${name} BEFORE INSERT ON public.cxp_credito_proveedor_movimientos FOR EACH ROW EXECUTE FUNCTION app.${name}();`);
    try {
      await call('finanzas/cxp/'+note.id+'/usar-credito',{...refund,monto:1,idempotency_key:key},400);
      assert.equal(sql(`SELECT last_value||'|'||is_called FROM app.${name};`),'1|true');
      assert.equal(state(),before);assert.equal(counts(),countsBefore);
      return {observedBankAndCreditUpdatesBeforeForcedFailure:1,bankCreditLedgerReceiptsAndOutboxRestored:true};
    } finally {
      sql(`DROP TRIGGER ${name} ON public.cxp_credito_proveedor_movimientos; DROP FUNCTION app.${name}(); DROP SEQUENCE app.${name};`);
    }
  });
  await check('Proveedor: reembolso6.80y replay dejan banco388.80, crédito0y un abono',async()=>{
    const a=await call('finanzas/cxp/'+note.id+'/usar-credito',refund),b=await call('finanzas/cxp/'+note.id+'/usar-credito',refund);
    assert.equal(a.movimiento_credito.id,b.movimiento_credito.id);
    const s=JSON.parse(state());assert.equal(cents(s.credit),0);assert.equal(cents(s.debt),5400);assert.equal(cents(s.bank),38880);assert.equal(s.ledger,3);assert.equal(s.uses,2);
    const rows=await call('finanzas/cxp/'+note.id+'/credito-movimientos');assert.deepEqual(rows.map(r=>r.tipo).sort(),['APLICACION','ORIGEN','REEMBOLSO']);
    const r=rows.find(r=>r.tipo==='REEMBOLSO');assert.equal(cents(r.saldo_anterior),680);assert.equal(cents(r.saldo_nuevo),0);q(r.movimiento_bancario_id);
  });
  await check('Proveedor: otra empresa no consulta ni utiliza el crédito',async()=>{
    const before=state();await call('finanzas/cxp/'+note.id+'/credito-movimientos',undefined,404,otherToken);
    await call('finanzas/cxp/'+note.id+'/usar-credito',{...refund,monto:1,idempotency_key:randomUUID()},404,otherToken);assert.equal(state(),before);
  });
  await check('Proveedor: lector autorizado consulta el ledger y no puede recuperar ni ejecutar un writer del propietario',async()=>{
    const permissions=JSON.parse(sql(`SELECT json_agg(id) FROM permisos WHERE tenant_id=${q(first.tenant)} AND codigo='finanzas.cxp.ver' AND activo;`));assert.equal(permissions.length,1);
    const suffix=randomUUID().slice(0,8),email='sc-reader-'+suffix+'@example.test';
    const role=await call('roles',{nombre:'LECTOR_CREDITO_'+suffix,permission_ids:permissions,idempotency_key:randomUUID()});
    await call('users',{nombre:'Lector crédito local',email,password:'Lectura-Credito-2026!',roles:[role.id],idempotency_key:randomUUID()});
    const reader=(await call('auth/login',{email,password:'Lectura-Credito-2026!'})).access_token;
    const before=state();assert.equal((await call('finanzas/cxp/'+note.id+'/credito-movimientos',undefined,200,reader)).length,3);
    await call('finanzas/cxp/'+note.id+'/usar-credito',refund,403,reader);
    await call('finanzas/cxp/'+note.id+'/usar-credito',{...refund,monto:1,idempotency_key:randomUUID()},403,reader);assert.equal(state(),before);
  });
  await check('Proveedor: una lectura del ledger indisponible responde503y recupera sus permisos exactos',async()=>{
    const before=state(),acl=sql("SELECT relacl::text FROM pg_class WHERE oid='public.cxp_credito_proveedor_movimientos'::regclass;");
    assert.equal(sql("SELECT has_table_privilege('service_role','public.cxp_credito_proveedor_movimientos','SELECT');"),'t');
    sql('REVOKE SELECT ON public.cxp_credito_proveedor_movimientos FROM service_role;');
    try {await call('finanzas/cxp/'+note.id+'/credito-movimientos',undefined,503);}
    finally {sql('GRANT SELECT ON public.cxp_credito_proveedor_movimientos TO service_role;');}
    assert.equal(sql("SELECT relacl::text FROM pg_class WHERE oid='public.cxp_credito_proveedor_movimientos'::regclass;"),acl);assert.equal(state(),before);
    assert.equal((await call('finanzas/cxp/'+note.id+'/credito-movimientos')).length,3);
  });
  await check('Proveedor: NC y aplicación tienen su asiento; reembolso se vincula al único asiento bancario y los mayores cuadran',async()=>{
    const apiDirectory=path.resolve('apps/erp-api'),require=createRequire(path.join(apiDirectory,'package.json'));
    const log=execFileSync(process.execPath,[require.resolve('ts-node/dist/bin.js'),'--transpile-only','tests/e2e/helpers/local-api-harness.ts','--accounting-drain'],{cwd:apiDirectory,env:process.env,encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:10000000});
    const logPath=path.join(output,'supplier-credit-accounting.log');fs.writeFileSync(logPath,log);
    // A PEN refund has no FX adjustment. Its bank event owns the economic
    // journal; the credit event must not duplicate that journal.
    const postings=JSON.parse(sql(`SELECT coalesce(jsonb_agg(jsonb_build_object('eventId',e.event_id,'event_type',e.event_type,'status',e.status,'accountingEventId',coalesce(b.event_id,e.event_id),'bankStatus',b.status,'bankMovementId',e.payload->>'movimientoBancarioId','directEntries',(SELECT count(*) FROM asientos_contables a WHERE a.source_event_id=e.event_id),'entries',(SELECT count(*) FROM asientos_contables a WHERE a.source_event_id=coalesce(b.event_id,e.event_id)),'balanced',(SELECT bool_and(a.total_debe=a.total_haber AND a.estado='CONFIRMADO') FROM asientos_contables a WHERE a.source_event_id=coalesce(b.event_id,e.event_id))) ORDER BY e.created_at),'[]') FROM outbox_events e LEFT JOIN outbox_events b ON e.event_type='credito.proveedor.reembolsado' AND b.tenant_id=e.tenant_id AND b.payload->>'movimientoId'=e.payload->>'movimientoBancarioId' AND b.event_type='banco.movimiento.registrado' WHERE e.tenant_id=${q(first.tenant)} AND e.aggregate_id='${note.id}' AND e.event_type IN ('nota_credito.proveedor.registrada','credito.proveedor.aplicado','credito.proveedor.reembolsado');`));
    fs.writeFileSync(path.join(output,'supplier-credit-postings.json'),JSON.stringify({postings,ledgerBefore},null,2));
    assert.equal(postings.length,3,JSON.stringify(postings));for(const row of postings){assert.equal(row.status,'completed');assert.equal(row.entries,1,JSON.stringify(row));assert.equal(row.balanced,true);if(row.event_type==='credito.proveedor.reembolsado'){assert.equal(row.directEntries,0);assert.equal(row.bankStatus,'completed');q(row.bankMovementId);assert.equal(sql(`SELECT movimiento_bancario_id FROM cxp_credito_proveedor_movimientos WHERE nota_credito_id=${q(note.id)} AND tipo='REEMBOLSO';`),row.bankMovementId);}else assert.equal(row.directEntries,1);}
    const after=generalLedger(),delta=Object.fromEntries(Object.keys(after).map(k=>[k,cents(after[k])-cents(ledgerBefore[k])]));
    assert.deepEqual(delta,{bank:38880,credit:0,payables:-5400});
    return {postings,generalLedgerBefore:ledgerBefore,generalLedgerAfter:after,generalLedgerDeltaCents:delta,logSha256:createHash('sha256').update(fs.readFileSync(logPath)).digest('hex')};
  });
  proof.success=true;
} catch(error) {
  proof.error=String(error.message).slice(0,1200);process.exitCode=1;
} finally {
  proof.completedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'supplier-credit.json'),JSON.stringify(proof,null,2));
  console.log(JSON.stringify({success:proof.success,passed:proof.scenarios.filter(s=>s.passed).length,error:proof.error}));
}
