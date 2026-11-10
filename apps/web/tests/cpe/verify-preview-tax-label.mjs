import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const require=createRequire(path.join(web,'package.json')),ts=require('typescript')
const source=fs.readFileSync(path.join(web,'lib/cpe-preview-tax-label.ts'),'utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const module={exports:{}};new Function('module','exports',compiled)(module,module.exports)
const {cpePreviewTaxLabel:label}=module.exports
assert.equal(label({total_gravadas:.06,total_igv:.01,items:[{tasa_igv:.18},{tasa_igv:.18}]},'IGV',18),'IGV (18%)')
assert.equal(label({total_gravadas:.06,total_igv:.01},'IGV',18),'IGV (18%)')
assert.equal(label({items:[{tipo_afectacion_igv:'10',tasa_igv:.105},{tipo_afectacion_igv:'20',tasa_igv:0}]},'IGV',18),'IGV (10.5%)')
assert.equal(label({items:[{tasa_igv:18},{tasa_igv:10.5}]},'IGV',18),'IGV')
assert.equal(label({items:[{tasa_igv:NaN}],tasa_igv:'18'},'IGV',18),'IGV (18%)')
assert.equal(label({items:[{tasa_igv:.05}]},'IVA',19),'IVA (5%)')
assert.equal(label({},'IVA',21),'IVA (21%)')
assert.equal(label({tasa_impuesto:0},'IGV',18),'IGV (0%)')
console.log('PASS D22: tasas persistidas, legado por país y tasas mixtas; sin cociente de importes redondeados')
