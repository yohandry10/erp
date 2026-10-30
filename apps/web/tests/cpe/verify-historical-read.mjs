import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const require=createRequire(path.join(web,'package.json')),ts=require('typescript')
const source=fs.readFileSync(path.join(web,'lib/cpe-read-contract.ts'),'utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const module={exports:{}};new Function('module','exports',compiled)(module,module.exports)
const {cpeList,cpeA4Metadata,cpeFinancial,parseCpeCsv}=module.exports
const ordinary={id:'5c581a1d-ca2c-4db2-bd23-d1981e270337',tipoDocumento:'01',tipoComprobante:'Factura',serie:'F001',numero:55406920,
  fechaEmision:'2025-01-01',fechaCreacion:'2026-10-15T14:17:35Z',cliente:'Cliente importado local',clienteRuc:'20100047218',total:118,moneda:'PEN',
  estado:'FIRMADO',estadoSunat:'FIRMADO',isDemoRepresentation:false,requiereVincularCobro:false,cxcId:null}
const historical={...ordinary,estado:'MIGRADO',estadoSunat:'NO_VERIFICADO',isHistoricalImport:true}
const response=row=>({success:true,data:[row],meta:{total:1,page:1,pageSize:50}})
const cases=[]
function check(name,action){try{action();cases.push({name,result:'PASS'})}catch(error){cases.push({name,result:'FAIL',message:error.message})}}
check('ordinary signed document remains readable',()=>assert.equal(cpeList(response(ordinary),1,50).documents[0].estado,'FIRMADO'))
check('canonical historical opening retains MIGRADO and unverified fiscal state',()=>assert.deepEqual(cpeList(response(historical),1,50).documents[0],historical))
for(const [name,change] of [
  ['missing import provenance flag',{isHistoricalImport:undefined}],['false import flag',{isHistoricalImport:false}],
  ['nonboolean import flag',{isHistoricalImport:'true'}],['unproven fiscal acceptance',{estadoSunat:'ACEPTADO'}],
  ['historical row advertised as a demo',{isDemoRepresentation:true}],['historical row offered as new receivable',{requiereVincularCobro:true}],
  ['unknown state',{estado:'DESCONOCIDO'}],['missing total',{total:null}],['invalid historical number',{numero:'HIST-123'}],
])check(name,()=>assert.throws(()=>cpeList(response({...historical,...change}),1,50)))
check('ordinary row cannot claim imported historical provenance',()=>assert.throws(()=>cpeList(response({...ordinary,isHistoricalImport:true}),1,50)))
const a4={id:ordinary.id,serie:'F001',numero:ordinary.numero,tipo_documento:'01',fecha_emision:'2025-01-01',moneda:'PEN',estado:'FIRMADO',
  pais_codigo:'PE',simulated:false,fiscal_acceptance_status:'PENDING',emisor:{ruc:'20100047218',razon_social:'Emisor local',direccion_fiscal:'Dirección local'},
  razon_social_receptor:'Cliente local',documento_receptor:'12345678',total_gravadas:100,total_exoneradas:0,total_inafectas:0,total_igv:18,total_isc:0,total_venta:118,
  items:[{descripcion:'Servicio local',unidad_medida:'NIU',cantidad:1,precio_unitario:100}]}
check('ordinary signed A4 remains readable',()=>assert.equal(cpeA4Metadata(a4,ordinary.id).estado,'FIRMADO'))
check('historical import never becomes A4 evidence',()=>assert.throws(()=>cpeA4Metadata({...a4,estado:'MIGRADO'},ordinary.id)))
const financial={cpe:{id:ordinary.id,numero:ordinary.numero,moneda:'PEN',estado:'FIRMADO'},nota_credito:null,cxc:null,
  cobros:[],ajustes_financieros:[],ajustes_activos:[],sesiones_caja:[],nota_aceptada:false,cobros_activos:0,estado_flujo:'REQUIERE_NOTA_CREDITO'}
check('ordinary financial workflow remains readable',()=>assert.equal(cpeFinancial(financial,ordinary.id).estado_flujo,'REQUIERE_NOTA_CREDITO'))
check('historical import never becomes a cancellation workflow',()=>assert.throws(()=>cpeFinancial({...financial,cpe:{...financial.cpe,estado:'MIGRADO'}},ordinary.id)))
const withNote={...financial,nota_credito:{id:'11111111-1111-4111-8111-111111111111',numero:2,estado:'FIRMADO'},estado_flujo:'PENDIENTE_CDR'}
check('ordinary pending note remains readable',()=>assert.equal(cpeFinancial(withNote,ordinary.id).estado_flujo,'PENDIENTE_CDR'))
check('historical import never becomes a fiscal cancellation note',()=>assert.throws(()=>cpeFinancial({...withNote,nota_credito:{...withNote.nota_credito,estado:'MIGRADO'}},ordinary.id)))
const historicalCsv='tipoComprobante,serie,numero,fechaEmision,cliente,clienteRuc,moneda,total,estado,estadoSunat\r\nFactura,F001,55406920,2025-01-01,Cliente local,20100047218,PEN,118,MIGRADO,NO_VERIFICADO'
check('historical CSV preserves its original state and unverified fiscal provenance',()=>assert.equal(parseCpeCsv(historicalCsv,1)[1][8],'MIGRADO'))
check('historical CSV cannot claim fiscal acceptance',()=>assert.throws(()=>parseCpeCsv(historicalCsv.replace('NO_VERIFICADO','ACEPTADO'),1)))
check('historical CSV requires its explicit unverified fiscal state',()=>assert.throws(()=>parseCpeCsv(historicalCsv.replace('NO_VERIFICADO',''),1)))
const result=cases.every(row=>row.result==='PASS')?'PASS':'FAIL'
console.log(JSON.stringify({result,scope:'CLIENT_HISTORICAL_CPE_READ_CONTRACT_NOT_UI_ACCEPTANCE',cases}))
if(result!=='PASS')process.exitCode=1
