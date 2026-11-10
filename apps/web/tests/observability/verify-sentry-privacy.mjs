import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
const sourceRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '../../../..');
const load = file => {
  const code = ts.transpileModule(fs.readFileSync(path.join(sourceRoot,file),'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {}; vm.runInNewContext(code,{exports}); return exports;
};
const browser = load('apps/web/lib/observability/sentry-privacy.ts');
const api = load('apps/erp-api/src/shared/observability/sentry-privacy.ts');
const event = { message:'DO_NOT_SEND', user:{email:'DO_NOT_SEND'}, request:{url:'DO_NOT_SEND'}, breadcrumbs:[{message:'DO_NOT_SEND'}], extra:{private:'DO_NOT_SEND'}, contexts:{trace:{data:'DO_NOT_SEND'}}, tags:{tenant:'DO_NOT_SEND'},
  release:'b'.repeat(40), environment:'erp-local-verification', exception:{values:[{type:'ErpBrowserVerificationError',value:'DO_NOT_SEND',stacktrace:{frames:[{filename:'https://localhost/_next/static/chunks/app.js?secret=DO_NOT_SEND',function:'probe',lineno:1,context_line:'DO_NOT_SEND',vars:{private:'DO_NOT_SEND'}}]}}]} };
const plain = x => JSON.parse(JSON.stringify(x));
const result = browser.privateSentryError(event);
assert.deepEqual(plain(result),plain(api.privateSentryError(event)));
assert.ok(!JSON.stringify(result).includes('DO_NOT_SEND'));
assert.equal(result.exception.values[0].stacktrace.frames[0].filename,'_next/static/chunks/app.js');
assert.equal(result.exception.values[0].value,'Unexpected application error');
assert.equal(browser.privateSentryError({message:'DO_NOT_SEND'}),null);
assert.equal(browser.isSentryDsn('https://example.test/1'),false);
assert.equal(browser.isSentryDsn(`https://${'a'.repeat(32)}@o1.ingest.us.sentry.io/1`),true);
const disabled = v => Array.isArray(v) ? v.length===0 : v && typeof v==='object' ? Object.values(v).every(disabled) : v===false || v===0;
assert.ok(disabled(browser.sentryDataCollection));
assert.deepEqual(plain(browser.sentryDataCollection),plain(api.sentryDataCollection));
console.log(JSON.stringify({passed:true,checks:9,policyParity:true,network:false}));
