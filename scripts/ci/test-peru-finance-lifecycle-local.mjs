import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
assert.equal(process.env.PGHOST,'127.0.0.1');
assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;
assert.equal(new URL(api).hostname,'127.0.0.1');
const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const fixture=JSON.parse(fs.readFileSync(path.join(output,'finance-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN||'psql',['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1','-c',query],{encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql('SELECT current_database();'),'erp_e2e');
const quote=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return `'${id}'::uuid`;};
const trace=[];
const scenarios=[];
let token;
async function call(endpoint,body,expected=body===undefined?200:201,headers={},method=body===undefined?'GET':'POST') {
  const response=await fetch(`${api}/api/${endpoint}`,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`} : {}),'idempotency-key':randomUUID(),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();
  trace.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id'),status:response.status});
  assert.equal(response.status,expected,`${method} ${endpoint}: ${value.message||JSON.stringify(value)}`);
  return value.data??value;
}
const cents=value=>Math.round(Number(value)*100);
const tenant=fixture.tenant;
const snapshot=()=>sql(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]')::text) FROM cuentas_bancarias t WHERE tenant_id=${quote(tenant)};`);
const pass=scenario=>scenarios.push({scenario,passed:true});
const proof={success:false,local_only:true,remoteWrites:false,scope:'Primer ADMIN no demo; banco, CxP, pagos parciales y conciliación por API real',scenarios,requests:trace};
try {
  const login=await call('auth/login',{email:fixture.email,password:'Cliente-Local-2026-Only!'});
  token=login.access_token;
  assert.equal(login.user.tenant_id,tenant);
  assert.equal(login.user.is_super_admin,false);
  const other=await call('auth/login',{email:'peru-integrated-2@example.test',password:'Local-Peru-2026-Only!'});
  const accounts=await call('contabilidad/plan-cuentas');
  const account=code=>{const found=accounts.find(row=>row.codigo===code&&row.activo);assert.ok(found,code);return found.id;};
  const today=sql(`SELECT app.hoy_tenant(${quote(tenant)});`);
  const month=today.slice(0,7);
  const last=sql(`SELECT (date_trunc('month',app.hoy_tenant(${quote(tenant)}))+interval '1 month'-interval '1 day')::date;`);
  const bankBody=code=>({nombre:`Banco local ${code}`,banco:'BANCO LOCAL',numero_cuenta:`LOCAL-${code}`,moneda:'PEN',tipo_cuenta:'CORRIENTE',cuenta_contable_id:account(code),saldo:0});
  const creation={'idempotency-key':randomUUID()};
  const a=await call('finanzas/bancos/cuentas',bankBody('1041'),201,creation);
  const b=await call('finanzas/bancos/cuentas',bankBody('1042'));
  assert.equal((await call('finanzas/bancos/cuentas',bankBody('1041'),201,creation)).id,a.id);
  await call('finanzas/bancos/cuentas',{...bankBody('1041'),saldo:1},400);
  await call(`finanzas/bancos/cuentas/${a.id}`,{nombre:'Banco A editado'},200,{},'PUT');
  assert.equal((await call(`finanzas/bancos/cuentas/${a.id}`)).nombre,'Banco A editado');
  pass('Bancos: altas con cuenta contable, replay, edición y rechazo de saldo inventado');
  const move=(type,monto,reference,code='63')=>({cuenta_bancaria_id:a.id,cuenta_contrapartida_id:account(code),tipo:type,monto,moneda:'PEN',fecha:today,descripcion:reference,referencia:reference,categoria:type==='ABONO'?'OTRO_INGRESO':'COMISION_BANCARIA',metodo_pago:'TRANSFERENCIA',idempotency_key:randomUUID()});
  const fundBody=move('ABONO',100,'FUND-LOCAL','70');
  const fund=await call('finanzas/bancos/movimientos',fundBody);
  assert.equal((await call('finanzas/bancos/movimientos',fundBody)).movimiento_id,fund.movimiento_id);
  await call('finanzas/bancos/movimientos',{...fundBody,monto:101},400);
  const feeBody={...move('CARGO',3,'FEE-LOCAL'),descripcion:'=1+1'};
  const fee=await call('finanzas/bancos/movimientos',feeBody);
  const transferBody={cuenta_origen_id:a.id,cuenta_destino_id:b.id,monto:10,moneda:'PEN',fecha:today,descripcion:'Transferencia local',referencia:'TRANSFER-LOCAL',idempotency_key:randomUUID()};
  const transfer=await call('finanzas/bancos/transferencias',transferBody);
  await call('finanzas/bancos/transferencias',transferBody);
  assert.equal(cents((await call(`finanzas/bancos/cuentas/${a.id}`)).saldo),8700);
  assert.equal(cents((await call(`finanzas/bancos/cuentas/${b.id}`)).saldo),1000);
  await call('finanzas/bancos/transferencias',{...transferBody,idempotency_key:randomUUID(),monto:1000},400);
  pass('Bancos: abono, cargo y transferencia inseparable; replay, colisión y saldo insuficiente');
  const provider=await call('compras/proveedores',{ruc:'20198765431',razon_social:'Proveedor local de tesorería',direccion:'Av. Local 123',email:'proveedor-finanzas@example.test'});
  const invoiceBody={proveedor_id:provider.id,numero_documento:'F001-LOCAL-001',serie:'F001',tipo_documento:'FACTURA',fecha_emision:today,condiciones_pago:'CREDITO_30',subtotal:15,igv:2.7,total:17.7,moneda:'PEN',tipo_cambio:1,destino_credito_fiscal:'GRAVADAS'};
  const invoice=await call('finanzas/cxp',invoiceBody);
  const paymentBody={cxp_id:invoice.id,monto:6,fecha_pago:today,metodo_pago:'TRANSFERENCIA',cuenta_bancaria_id:a.id,referencia:'PAY-PARTIAL',idempotency_key:randomUUID()};
  const partial=await call('finanzas/tesoreria/pagos',paymentBody);
  const replay=await call('finanzas/tesoreria/pagos',paymentBody);
  assert.equal(replay.pago.id,partial.pago.id);
  assert.equal(cents((await call(`finanzas/cxp/${invoice.id}`)).saldo),1170);
  await call('finanzas/tesoreria/pagos',{...paymentBody,idempotency_key:randomUUID(),monto:12},400);
  const finalBody={...paymentBody,monto:11.7,referencia:'PAY-FINAL',idempotency_key:randomUUID()};
  const paid=await call('finanzas/tesoreria/pagos',finalBody);
  await call('finanzas/tesoreria/pagos',finalBody);
  const debt=await call(`finanzas/cxp/${invoice.id}`);
  assert.equal(debt.estado,'PAGADA');assert.equal(cents(debt.saldo),0);
  assert.equal(cents((await call(`finanzas/bancos/cuentas/${a.id}`)).saldo),6930);
  pass('CxP y tesorería: factura, dos pagos parciales, replay y exceso rechazado sin duplicar deuda ni banco');
  const reconciliationBody={cuenta_bancaria_id:a.id,periodo:month,fecha_desde:`${month}-01`,fecha_hasta:last,idempotency_key:randomUUID()};
  const reconciliation=await call('finanzas/conciliacion',reconciliationBody);
  const reconciliationId=reconciliation.conciliacion?.id??reconciliation.conciliacion_id??reconciliation.id;
  assert.ok(reconciliationId);
  const base=`finanzas/conciliacion/${reconciliationId}`;
  const csv=['Fecha,Descripcion,Referencia,Tipo,Monto',`${today},Fondos,FUND-LOCAL,ABONO,100`,`${today},Comision,FEE-LOCAL,CARGO,3`,`${today},Transferencia,TRANSFER-LOCAL,CARGO,10`,`${today},Pago parcial,PAY-PARTIAL,CARGO,6`,`${today},Pago final,PAY-FINAL,CARGO,11.70`,`${today},Ajuste pendiente,ADJUST-LOCAL,CARGO,1`].join('\n');
  const importBody={contenidoCsv:csv,banco:'GENERICO',saldo_banco_inicial:0,saldo_banco_final:68.3,idempotency_key:randomUUID()};
  await call(`${base}/importar-csv`,{...importBody,saldo_banco_final:999},400);
  assert.equal(sql(`SELECT count(*) FROM movimientos_bancarios WHERE conciliacion_id=${quote(reconciliationId)} AND es_extracto;`),'0');
  await call(`${base}/importar-csv`,importBody);await call(`${base}/importar-csv`,importBody);
  assert.equal(sql(`SELECT count(*) FROM movimientos_bancarios WHERE conciliacion_id=${quote(reconciliationId)} AND es_extracto;`),'6');
  const matching={tolerancia_dias:0,idempotency_key:randomUUID()};
  await call(`${base}/match-automatico`,matching);await call(`${base}/match-automatico`,matching);
  await call(`${base}/cerrar`,{idempotency_key:randomUUID()},400);
  const adjustment=await call('finanzas/bancos/movimientos',{...move('CARGO',1,'ADJUST-LOCAL'),categoria:'AJUSTE_CONCILIACION',conciliacion_id:reconciliationId});
  const extract=sql(`SELECT id FROM movimientos_bancarios WHERE conciliacion_id=${quote(reconciliationId)} AND es_extracto AND referencia='ADJUST-LOCAL';`);
  const manual={movimiento_sistema_id:adjustment.movimiento_id,movimiento_extracto_id:extract,idempotency_key:randomUUID()};
  await call(`${base}/marcar-item`,manual);await call(`${base}/marcar-item`,manual);
  const closure={idempotency_key:randomUUID()};
  await call(`${base}/cerrar`,closure);await call(`${base}/cerrar`,closure);
  assert.equal(sql(`SELECT estado FROM conciliaciones_bancarias WHERE id=${quote(reconciliationId)};`),'CERRADA');
  assert.equal(cents((await call(`finanzas/bancos/cuentas/${a.id}`)).saldo),6830);
  const before=snapshot();await call('finanzas/bancos/movimientos',move('CARGO',1,'LATE-LOCAL'),400);assert.equal(snapshot(),before);
  const differences=await call(`${base}/diferencias`);
  assert.equal(cents(differences.saldos.diferencia_neta),0);
  const exported=await call(`finanzas/bancos/cuentas/${a.id}/movimientos/exportar?es_extracto=false&conciliado=true`);
  assert.equal(typeof exported,'string');
  for(const reference of ['FUND-LOCAL','FEE-LOCAL','TRANSFER-LOCAL','PAY-PARTIAL','PAY-FINAL','ADJUST-LOCAL']) assert.ok(exported.includes(reference));
  const csvRows=JSON.parse(execFileSync(process.env.PYTHON_BIN||(process.platform==='win32'?'python':'python3'),['-c','import csv,json,sys;print(json.dumps(list(csv.reader(sys.stdin))))'],{input:exported,encoding:'utf8',windowsHide:true}));
  const csvChecks={expected_date:today.split('-').reverse().join('/'),observed_dates:[...new Set(csvRows.slice(1).map(row=>row[0]))],header_columns:csvRows[0].length,row_columns:csvRows.slice(1).map(row=>row.length),unprotected_formula_cells:csvRows.slice(1).flatMap(row=>row.filter(cell=>/^[=+@]/.test(cell.trimStart())))};
  const csvValid=csvChecks.observed_dates.every(date=>date===csvChecks.expected_date)&&csvChecks.row_columns.every(length=>length===csvChecks.header_columns)&&csvChecks.unprotected_formula_cells.length===0;
  proof.csv_checks=csvChecks;
  await call(`finanzas/bancos/cuentas/${a.id}/movimientos/exportar`,undefined,404,{authorization:`Bearer ${other.access_token}`});
  const permissionIds=JSON.parse(sql(`SELECT json_agg(id) FROM permisos WHERE tenant_id=${quote(tenant)} AND codigo IN ('finanzas.bancos.ver','finanzas.cxp.ver','finanzas.conciliacion.ver','finanzas.tesoreria.ver') AND activo;`));
  assert.equal(permissionIds.length,4);
  const suffix=randomUUID().slice(0,8);
  const role=await call('roles',{nombre:`LECTOR_FINANZAS_${suffix}`,permission_ids:permissionIds,idempotency_key:randomUUID()});
  const readerEmail=`finanzas-${suffix}@example.test`;
  await call('users',{nombre:'Lector finanzas local',email:readerEmail,password:'Lectura-Finanzas-2026!',roles:[role.id],idempotency_key:randomUUID()});
  const reader=await call('auth/login',{email:readerEmail,password:'Lectura-Finanzas-2026!'});
  const readerHeaders={authorization:`Bearer ${reader.access_token}`};
  for(const endpoint of [`finanzas/bancos/cuentas/${a.id}`,`finanzas/cxp/${invoice.id}`,base]) await call(endpoint,undefined,200,readerHeaders);
  for(const [endpoint,body,method] of [
    ['finanzas/bancos/cuentas',bankBody('1041'),'POST'],
    [`finanzas/bancos/cuentas/${b.id}`,{nombre:'Sin permiso'},'PUT'],
    ['finanzas/bancos/movimientos',move('CARGO',1,'READONLY'),'POST'],
    ['finanzas/bancos/transferencias',{...transferBody,idempotency_key:randomUUID()},'POST'],
    ['finanzas/cxp',invoiceBody,'POST'],
    ['finanzas/tesoreria/pagos',{...finalBody,idempotency_key:randomUUID()},'POST'],
    ['finanzas/conciliacion',{...reconciliationBody,idempotency_key:randomUUID()},'POST'],
    [`${base}/importar-csv`,{...importBody,idempotency_key:randomUUID()},'POST'],
    [`${base}/match-automatico`,{...matching,idempotency_key:randomUUID()},'POST'],
    [`${base}/marcar-item`,{...manual,idempotency_key:randomUUID()},'POST'],
    [`${base}/cerrar`,{idempotency_key:randomUUID()},'POST'],
  ]) await call(endpoint,body,403,readerHeaders,method);
  assert.equal(snapshot(),before);
  for (const endpoint of [`finanzas/bancos/cuentas/${a.id}`,`finanzas/cxp/${invoice.id}`,base]) await call(endpoint,undefined,404,{authorization:`Bearer ${other.access_token}`});
  assert.equal(snapshot(),before);
  pass('Conciliación: CSV atómico, match automático/manual, ajuste explícito, cierre/replay, inmutabilidad y consultas ajenas');
  pass('Finanzas: reporte de diferencias, CSV con filtros, exportación ajena oculta y once mutaciones rechazadas para lector');
  const apiDirectory=path.resolve('apps/erp-api');
  const require=createRequire(path.join(apiDirectory,'package.json'));
  fs.writeFileSync(path.join(output,'finance-accounting.log'),execFileSync(process.execPath,[require.resolve('ts-node/dist/bin.js'),'--transpile-only','tests/e2e/helpers/local-api-harness.ts','--accounting-once'],{cwd:apiDirectory,env:process.env,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:5000000}));
  const postings=JSON.parse(sql(`SELECT coalesce(jsonb_agg(jsonb_build_object('event_type',e.event_type,'status',e.status,'entries',(SELECT count(*) FROM asientos_contables a WHERE a.source_event_id=e.event_id),'balanced',(SELECT bool_and(a.total_debe=a.total_haber AND a.estado='CONFIRMADO') FROM asientos_contables a WHERE a.source_event_id=e.event_id)) ORDER BY e.created_at),'[]') FROM outbox_events e WHERE tenant_id=${quote(tenant)} AND event_type IN ('banco.movimiento.registrado','banco.transferencia.registrada','factura.proveedor.registrada','pago.proveedor.registrado');`));
  assert.equal(postings.length,7,JSON.stringify(postings));
  for (const posting of postings) {assert.equal(posting.status,'completed');assert.equal(posting.entries,1);assert.equal(posting.balanced,true);}
  pass('Contabilidad: un asiento confirmado y cuadrado por evento bancario/factura/pago');
  assert.ok(csvValid,'CSV bancario: fechas, número de columnas o celdas de fórmula incorrectos');
  pass('CSV bancario: fecha fiscal, columnas correctas y fórmulas neutralizadas');
  proof.postings=postings;proof.success=true;
} finally {
  proof.checkedAt=new Date().toISOString();
  fs.writeFileSync(path.join(output,'finance-lifecycle.json'),JSON.stringify(proof,null,2));
}
