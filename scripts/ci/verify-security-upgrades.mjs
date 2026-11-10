import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runPnpm } from './verify-security-backports.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const versions = { nodemailer: '10.1.4', 'fast-uri': '4.2.3', qs: '6.16.1' };

export function verifyNodemailer(addressParser) {
  const addresses = value => addressParser(value).map(entry => entry.address);
  assert.deepEqual(addresses('Operador <recipient@example.invalid>'), ['recipient@example.invalid']);
  assert.deepEqual(addresses('Operador (uno(dos) <other@example.invalid>) <recipient@example.invalid>'),
    ['recipient@example.invalid'], 'Nested comments must not replace the actual recipient');
  return { normalRecipientPreserved: true, nestedCommentRecipientPreserved: true, emailSent: false };
}

export function verifyFastUri(uri) {
  assert.equal(uri.normalize('https://example.invalid/a'), 'https://example.invalid/a');
  assert.equal(uri.resolve('https://example.invalid/a', 'b'), 'https://example.invalid/b');
  for (const value of ['%6Aavascript:fixture', '%u006Aavascript:fixture']) {
    assert.notEqual(uri.parse(value).scheme, 'javascript');
    assert.ok(!/^javascript:/i.test(uri.normalize(value)));
    assert.throws(() => uri.resolve('https://example.invalid/', value), /URI scheme is malformed/);
  }
  assert.equal(uri.equal('%68ttp://example.invalid/', 'http://example.invalid/'), false);
  return { normalUriPreserved: true, encodedSchemeNotActivated: true, encodedSchemeNotEqual: true };
}

export function verifyQs(qs) {
  assert.equal(qs.stringify({ a: ['uno', 'dos'] }, { arrayFormat: 'comma' }), 'a=uno%2Cdos');
  for (const encodeValuesOnly of [false, true]) {
    const input = JSON.parse('{"a":[{"toString":"x"}]}');
    assert.equal(qs.stringify(input, { arrayFormat: 'comma', encodeValuesOnly }), 'a=%5Bobject%20Object%5D');
  }
  return { normalCommaArrayPreserved: true, nonCallableToStringHandled: true, bothEncodingPaths: true };
}

export function verifySecurityUpgrades() {
  const copies = new Map();
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [name, data] of Object.entries(value)) {
      if (Object.hasOwn(versions, name) && data?.path && data?.version) {
        copies.set(fs.realpathSync(data.path), { name, version: data.version });
      }
      visit(data);
    }
  };
  for (const name of Object.keys(versions)) {
    const listing = runPnpm(['list', name, '--recursive', '--json', '--depth', 'Infinity']);
    assert.equal(listing.status, 0, `Unable to inventory installed ${name}`);
    visit(JSON.parse(listing.stdout));
  }
  const verified = [];
  for (const [directory, copy] of copies) {
    assert.equal(copy.version, versions[copy.name]);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).version, versions[copy.name]);
    const require = createRequire(path.join(directory, 'package.json'));
    const tests = copy.name === 'nodemailer' ? verifyNodemailer(require('nodemailer/lib/addressparser'))
      : copy.name === 'fast-uri' ? verifyFastUri(require(directory)) : verifyQs(require(directory));
    verified.push({ package: copy.name, version: copy.version,
      installedCopy: path.relative(root, directory).replaceAll('\\', '/'), tests });
  }
  for (const name of Object.keys(versions)) assert.ok(verified.some(copy => copy.package === name), `No installed ${name} found`);
  return verified;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify({ success: true, verified: verifySecurityUpgrades() }, null, 2));
}
