import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import assert from 'node:assert/strict'; import crypto from 'node:crypto'; import {createRequire} from 'node:module'; import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const require=createRequire(path.join(root,'package.json'));
const ts=require(path.join(root,'node_modules/typescript'));
const file=path.join(root,'apps/web/lib/rrhh/payroll-payment-operation.ts');
const FixedDate=class extends Date{constructor(...a){super(...(a.length?a:['2026-10-16T03:10:00.000Z']))}static now(){return new Date('2026-10-16T03:10:00.000Z').getTime()}};
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,Date:FixedDate,Set,Error,Object,Number});
const id='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222',employee='33333333-3333-4333-8333-333333333333',scope={tenantId:id,actorId:actor};
const header={tenant_id:id,id,estado:'aprobada',periodo:'2026-10',moneda:'PEN',total_neto:100};
const detail=[{tenant_id:id,id_planilla:id,id_empleado:employee,neto_pagar:100,empleados:{nombres:'Control',apellidos:'Fiscal',numero_documento:'12345678'}}];
const payload={metodo_pago:'transferencia',idempotency_key:id,cuenta_bancaria_id:id,referencia:'CONTROL-NO-BUSINESS-WRITER'};
const intent=api.createPayrollPaymentIntent(scope,header,detail,payload,'PE');
const receipt={success:true,data:{success:true,planillaId:id,periodo:'2026-10',metodoPago:'transferencia',idempotent:false,eventId:id,paymentFingerprint:'a'.repeat(32),treasuryFingerprint:'b'.repeat(64),fechaPago:'2026-10-15',totalPagado:100,empleadosPagados:1,pagosInsertados:1,pagos:[{id,monto_neto:100,empleado_id:employee}],cuentaBancariaId:id,movimientoBancarioId:id,sesionCajaId:null,movimientoCajaId:null}};
let rejected=false;try{api.confirmPayrollPayment(receipt,intent,scope,'PE')}catch(e){rejected=true}
const result={scope:'DETERMINISTIC_CONTRACT_REGRESSION_ONLY_NOT_BUSINESS_ACCEPTANCE',clockUTC:'2026-10-16T03:10:00.000Z',tenantDayLima:'2026-10-15',intentCreatedAt:intent.createdAt,receiptDate:receipt.data.fechaPago,rejectedValidTenantDate:rejected,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),businessWrites:0};
assert.equal(rejected,false,'Valid tenant civil day after UTC midnight must confirm');
for(const country of ['PE','CO','AR']){
 const i=api.createPayrollPaymentIntent(scope,header,detail,payload,country),localReceipt=structuredClone(receipt);localReceipt.data.fechaPago=api.payrollPaymentCivilDate(country);api.confirmPayrollPayment(localReceipt,i,scope,country);
 const old=JSON.parse(JSON.stringify(i));delete old.countryCode;api.confirmPayrollPayment(localReceipt,old,scope,country);
 for(const offset of [-1,1]){const r=structuredClone(localReceipt),day=new Date(localReceipt.data.fechaPago+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+offset);r.data.fechaPago=day.toISOString().slice(0,10);assert.throws(()=>api.confirmPayrollPayment(r,i,scope,country));}
 const replay=structuredClone(localReceipt);replay.data.idempotent=true;replay.data.pagosInsertados=0;api.confirmPayrollPayment(replay,i,scope,country);
}
const replayIntent=structuredClone(intent);replayIntent.createdAt='2026-10-15T03:00:00.000Z';api.confirmPayrollPayment(receipt,replayIntent,scope,'PE');
const mismatch=structuredClone(intent);mismatch.countryCode='AR';assert.throws(()=>api.confirmPayrollPayment(receipt,mismatch,scope,'PE'));
console.log(JSON.stringify({...result,result:'PASS',countries:['PE','CO','AR'],legacyIntentsPreserved:true,oldAndFutureCivilDatesRejected:true,sameKeyReplayPreserved:true}));
