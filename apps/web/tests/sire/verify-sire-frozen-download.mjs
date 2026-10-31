import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),ts=createRequire(path.join(web,'package.json'))('typescript'),module={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(web,'lib/sire-read-contract.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,crypto:webcrypto,TextEncoder,Uint8Array,Date,Number,Object,Set,Array});
const {readSireFrozenDownload:read}=module.exports,checks=[],tenant='ba000000-0000-4000-8000-000000000001',report='ba000000-0000-4000-8000-000000000002';
const digest=content=>createHash('sha256').update(content,'utf8').digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const fixture=(content='COMPARACIÓN|Perú|ñ|😀\r\n10.20|PEN\r\n')=>{
 const expected={id:report,tenant_id:tenant,tipo:'REG_COM',periodo:'2026-10',estado:'GENERADO',filename:'comparacion_rce_202610.txt',contenido_sha256:digest(content),source_fingerprint:'a'.repeat(64),source_cutoff_at:'2026-10-14T21:00:00.000Z'};
 const response={success:true,data:content,filename:expected.filename,contentType:'text/plain; charset=utf-8',metadata:{sha256:expected.contenido_sha256,sourceFingerprint:expected.source_fingerprint,sourceCutoffAt:expected.source_cutoff_at}};
 return {expected,response};
};
const test=async(name,run)=>{await run();checks.push(name);};
await test('exact_frozen_UTF8_bytes_with_accents_emoji_and_CRLF',async()=>{
 const f=fixture(),before=JSON.stringify(f),r=await read(f.response,f.expected,tenant);assert.equal(r.content,f.response.data);assert.equal(r.filename,f.expected.filename);assert.equal(JSON.stringify(f),before);
});
await test('empty_frozen_snapshot_is_valid_when_hash_matches',async()=>{const f=fixture('');assert.equal((await read(f.response,f.expected,tenant)).content,'');});
await test('already_sent_frozen_snapshot_remains_downloadable',async()=>{const f=fixture();f.expected.estado='ENVIADO';assert.equal((await read(f.response,f.expected,tenant)).content,f.response.data);});
for(const flag of ['cached','offline','queued','pending','from_cache'])for(const level of ['response','metadata','selected'])await test(flag+'_'+level+'_is_not_a_verified_file',async()=>{
 const f=fixture();(level==='response'?f.response:level==='metadata'?f.response.metadata:f.expected)[flag]=true;await assert.rejects(()=>read(f.response,f.expected,tenant));
});
for(const field of ['id','tenant_id','tipo','periodo','estado','filename','contenido_sha256','source_fingerprint','source_cutoff_at'])await test('missing_selected_'+field,async()=>{
 const f=fixture();delete f.expected[field];await assert.rejects(()=>read(f.response,f.expected,tenant));
});
for(const field of ['sha256','sourceFingerprint','sourceCutoffAt'])await test('missing_response_'+field,async()=>{
 const f=fixture();delete f.response.metadata[field];await assert.rejects(()=>read(f.response,f.expected,tenant));
});
for(const [name,mutate] of [
 ['tampered_content_with_original_metadata',f=>f.response.data+='bad'],
 ['normalized_line_endings_are_not_original_bytes',f=>f.response.data=f.response.data.replaceAll('\r\n','\n')],
 ['BOM_added_to_original_bytes',f=>f.response.data='\uFEFF'+f.response.data],
 ['other_report_payload_and_valid_own_hash',f=>{f.response.data='another report';f.response.metadata.sha256=digest(f.response.data);}],
 ['matching_corrupt_hashes_do_not_override_content_digest',f=>{f.expected.contenido_sha256='b'.repeat(64);f.response.metadata.sha256='b'.repeat(64);}],
 ['foreign_filename',f=>f.response.filename='other.txt'],
 ['foreign_cutoff',f=>f.response.metadata.sourceCutoffAt='2026-10-13T00:00:00.000Z'],
 ['foreign_fingerprint',f=>f.response.metadata.sourceFingerprint='b'.repeat(64)],
 ['foreign_tenant',f=>f.expected.tenant_id='ba000000-0000-4000-8000-000000000009'],
 ['missing_metadata',f=>delete f.response.metadata],
 ['partial_success_body',f=>delete f.response.data],
 ['non_text_payload',f=>f.response.data={content:f.response.data}],
 ['unknown_content_type',f=>f.response.contentType='application/octet-stream'],
 ['false_success',f=>f.response.success=false],
 ['unknown_selected_state',f=>f.expected.estado='ERROR'],
 ['path_in_selected_filename',f=>{f.expected.filename='../snapshot.txt';f.response.filename=f.expected.filename;}],
 ['invalid_hash',f=>{f.expected.contenido_sha256='bad';f.response.metadata.sha256='bad';}],
 ['invalid_fingerprint',f=>{f.expected.source_fingerprint='bad';f.response.metadata.sourceFingerprint='bad';}],
])await test(name,async()=>{const f=fixture();mutate(f);await assert.rejects(()=>read(f.response,f.expected,tenant));});
for(const value of [null,{},[],{success:true,data:'text'}])await test('incomplete_response_'+JSON.stringify(value),async()=>{const f=fixture();await assert.rejects(()=>read(clone(value),f.expected,tenant));});
console.log(JSON.stringify({result:'PASS',checks:checks.length,cases:checks}));
