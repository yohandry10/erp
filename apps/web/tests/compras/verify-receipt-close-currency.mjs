import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(path.join(web,'package.json')),ts=require('typescript');
function load(file){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module,exports:module.exports,require:name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name),Date,Number,Object,Array,Set,JSON,Error});return module.exports;}
const m=load(path.join(web,'lib/compras/purchase-receipt-operation.ts')),clone=v=>JSON.parse(JSON.stringify(v)),checks=[];
const test=(name,run)=>{run();checks.push(name);},uid=n=>`61700000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={tenantId:uid(1),actorId:uid(2),orderId:uid(3)},stamp='2026-11-08T10:00:00Z';
const fx={moneda:'USD',moneda_base:'PEN',tipo_cambio:'3.7',referencia:'Constancia de cambio 617'};
const intent={version:1,...scope,createdAt:stamp,stage:'CREATE',payload:{orden_id:scope.orderId,idempotency_key:'verify617-create',observaciones:'Recepción de servicio',
 items:[{detalle_id:uid(4),cantidad_recibida:1.25,calidad:'OK'}]},expected:[{detailId:uid(4),productId:uid(5),name:'Servicio617',code:'SV617',ordered:5,price:4.13,service:true,stock:false}],
 closePayload:{observaciones:'Cierre de prueba',valuacion:fx}};
test('intención FX conserva literalmente la tasa y referencia tras recarga',()=>assert.equal(JSON.stringify(m.readPurchaseReceiptIntent(JSON.stringify(intent),scope)),JSON.stringify(intent)));
test('intención anterior sin FX sigue recuperable sin inventar tasa',()=>{const i=clone(intent);delete i.closePayload.valuacion;assert.equal(m.readPurchaseReceiptIntent(JSON.stringify(i),scope).closePayload.valuacion,undefined);});
for(const [name,value] of [['number',3.7],['zero','0'],['exponent','1e2'],['negative','-1'],['precision','3.1234567'],['infinity','Infinity'],['comma','3,7'],['leading-zero','03.7']]){
 test('rechaza tasa '+name,()=>{const i=clone(intent);i.closePayload.valuacion.tipo_cambio=value;assert.throws(()=>m.readPurchaseReceiptIntent(JSON.stringify(i),scope));});
}
for(const [name,mutate] of [['moneda',x=>x.moneda='usd'],['base',x=>x.moneda_base=''],['paridad',x=>x.moneda_base='USD'],['referencia',x=>x.referencia=''],['extra',x=>x.actual=true]]){
 test('rechaza valuación incompleta '+name,()=>{const i=clone(intent);mutate(i.closePayload.valuacion);assert.throws(()=>m.readPurchaseReceiptIntent(JSON.stringify(i),scope));});
}
const created={id:uid(6),tenant_id:scope.tenantId,orden_id:scope.orderId,created_by:scope.actorId,numero:'REC617',activo:true,estado:'BORRADOR',created_at:stamp,updated_at:stamp,fecha_recepcion:stamp,
 idempotency_key:intent.payload.idempotency_key,create_fingerprint:'a'.repeat(64),observaciones:intent.payload.observaciones,cerrado_at:null,cerrado_por:null,orden:{id:scope.orderId,numero:'OC617'},
 items:[{id:uid(7),tenant_id:scope.tenantId,recepcion_id:uid(6),detalle_id:uid(4),producto_id:uid(5),estado:'ACTIVO',created_at:stamp,updated_at:stamp,
  cantidad_recibida:1.25,cantidad:1.25,calidad:'OK',cantidad_devuelta:0,cantidad_disponible_devolucion:1.25,
  almacen_id:null,ubicacion_id:null,lote:null,serie:null,fecha_expiracion:null,observaciones:null,
  detalle:{id:uid(4),cantidad:5,precio_unitario:4.13},producto:{id:uid(5),nombre:'Servicio617',codigo:'SV617'},metadata:{es_servicio:true,controla_stock:false}}]};
const closing=m.confirmPurchaseReceiptCreated({success:true,data:created},scope,intent);
const closed={...created,estado:'CERRADA',cerrado_at:stamp,cerrado_por:scope.actorId,observaciones:closing.closePayload.observaciones,
 valuacion_cierre:{...fx,tipo_cambio:'3.700000'}};
test('confirma únicamente la conversión original con normalización decimal exacta',()=>m.confirmPurchaseReceiptClosed({success:true,data:closed},scope,closing));
for(const [name,mutate] of [['sin snapshot',x=>delete x.valuacion_cierre],['otra tasa',x=>x.valuacion_cierre.tipo_cambio='3.8'],
 ['otra base',x=>x.valuacion_cierre.moneda_base='COP'],['otra referencia',x=>x.valuacion_cierre.referencia='Referencia cambiada'],['cache',x=>x.cached=true]]){
 test('conserva pendiente ante '+name,()=>{const d=clone(closed),before=JSON.stringify(closing);mutate(d);assert.throws(()=>m.confirmPurchaseReceiptClosed({success:true,data:d},scope,closing));assert.equal(JSON.stringify(closing),before);});
}
test('conserva el último decimal que Number puede perder',()=>{const i=clone(closing),d=clone(closed);i.closePayload.valuacion.tipo_cambio='9999999999.000001';d.valuacion_cierre.tipo_cambio='9999999999.000002';assert.throws(()=>m.confirmPurchaseReceiptClosed({success:true,data:d},scope,i));});
console.log(JSON.stringify({passed:true,checks:checks.length,names:checks}));
