import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),exports={};
const source=new URL('../../lib/purchase-native-view.ts',import.meta.url);
vm.runInNewContext(ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Intl,Number,Set,Error});
const {readPurchaseStatsPayload:read,formatPurchaseMoney:format}=exports;
const group=(moneda,monto)=>({moneda,totalCompras:monto,montoTotalMes:monto,comprasDelMes:1});
const data={version:2,base:'IMPORTES_ORIGINALES_SIN_CONVERSION',porMoneda:[group('PEN','354.00'),group('USD','73.11')],comprasDelMes:2,ordenesActivas:2,proveedoresActivos:1,ordenesVencidas:0};
let checks=0;const check=(name,body)=>{try{body();checks++}catch(error){throw new Error(name+': '+error.message)}};
check('mixed native amounts stay in separate groups',()=>{assert.equal(read({success:true,data}),data);assert.equal(data.porMoneda.length,2);assert.ok(!('montoTotalMes' in data));});
check('empty is a verified empty collection',()=>assert.equal(read({success:true,data:{...data,porMoneda:[],comprasDelMes:0}}).porMoneda.length,0));
for(const [name,response] of [
  ['failed response',{success:false,data}],['missing response',null],['old nominal contract',{success:true,data:{montoTotalMes:427.11}}],
  ['duplicate currency',{success:true,data:{...data,porMoneda:[group('USD','1.00'),group('USD','2.00')]}}],
  ['missing currency',{success:true,data:{...data,porMoneda:[group('', '1.00')]}}],
  ['malformed amount',{success:true,data:{...data,porMoneda:[group('USD','NaN')]}}],
  ['numeric aggregate instead of exact decimal',{success:true,data:{...data,porMoneda:[group('USD',73.11)]}}],
  ['mismatched counts',{success:true,data:{...data,comprasDelMes:0}}],
  ['negative count',{success:true,data:{...data,ordenesActivas:-1}}],
  ['monthly amount exceeds original sum',{success:true,data:{...data,porMoneda:[{...group('USD','1.00'),montoTotalMes:'2.00'}],comprasDelMes:1}}],
])check(name,()=>assert.throws(()=>read(response)));
check('PEN keeps its own symbol',()=>assert.equal(format('24.37','PEN','es-PE'),new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN',minimumFractionDigits:2,maximumFractionDigits:2}).format(24.37)));
check('USD is not labeled as PEN',()=>{assert.equal(format('24.37','USD','es-PE'),new Intl.NumberFormat('es-PE',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(24.37));assert.notEqual(format('24.37','USD','es-PE'),format('24.37','PEN','es-PE'));});
check('the KPI names the currency code',()=>assert.ok(format('73.11','USD','es-PE','code').includes('USD')));
check('native zero is money, not a missing value',()=>assert.ok(format(0,'USD','es-PE').includes('0.00')));
for(const [amount,currency] of [[null,'USD'],['','USD'],['NaN','USD'],[-1,'USD'],['0.001','USD'],[24.37,null],[24.37,'']])check('incomplete original money is unavailable '+String(amount)+' '+String(currency),()=>assert.equal(format(amount,currency,'es-PE'),'Importe no disponible'));
console.log(JSON.stringify({passed:true,checks,browser:false,network:false}));
