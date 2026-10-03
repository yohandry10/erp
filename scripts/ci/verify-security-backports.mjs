import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const backports = {
  'node-forge': {
    version: '1.4.0', advisory: 'GHSA-86w9-cpqp-85rv',
    source: 'https://github.com/digitalbazaar/forge/pull/1152',
    files: { 'lib/rsa.js': 'acc22e5d36e27832c34e02dd3933aad7977d45b047eead5016520735efedc9c5' },
  },
  braces: {
    version: '3.0.3', advisory: 'GHSA-vfj7-8cjw-p6xm',
    source: 'https://github.com/micromatch/braces/issues/70',
    files: {
      'lib/parse.js': '36b5ee7dd3bd7b671387ad7071152dcfe915951b58f5f5f44e12c783f0289e2f',
      'lib/compile.js': '134bd4dca88319e8728618cda18f102d53bdb1bc4e6d05987cbf108f98fe1aab',
      'lib/expand.js': '76730dde8236661abe118a84722c8df66e01489aa02b9dc4239f738d14fd415f',
      'lib/stringify.js': '36eeeaf94ee3e9606e5304f0f4004b8661e9caa23596c9268250e7815cb6ebac',
    },
  },
};

export function runPnpm(args) {
  return spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args,
    { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', windowsHide: true,
      timeout: 120000, maxBuffer: 16000000 });
}

export function verifyForge(forge, patched = true) {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 3 });
  const digest = forge.md.sha256.create().update('ERP synthetic signature regression').digest().getBytes();
  const asn1 = forge.asn1;
  const node = (type, constructed, value) => asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
  const oid = node(asn1.Type.OID, false, asn1.oidToDer(forge.pki.oids.sha256).getBytes());
  const nil = node(asn1.Type.NULL, false, '');
  const signature = (algorithm, outerExtra = []) => forge.pki.rsa.encrypt(asn1.toDer(
    node(asn1.Type.SEQUENCE, true, [node(asn1.Type.SEQUENCE, true, algorithm),
      node(asn1.Type.OCTETSTRING, false, digest), ...outerExtra])).getBytes(), keys.privateKey, 0x01);
  assert.equal(keys.publicKey.verify(digest, signature([oid, nil])), true);
  assert.equal(keys.publicKey.verify(digest, signature([oid])), true);
  const bad = signature([oid, nil, node(asn1.Type.OCTETSTRING, false, 'interior garbage')]);
  if (patched) {
    assert.throws(() => keys.publicKey.verify(digest, bad), /valid RSASSA/);
    assert.throws(() => keys.publicKey.verify(digest, signature([oid, nil, nil])), /valid RSASSA/);
  } else {
    assert.equal(keys.publicKey.verify(digest, bad), true, 'Baseline must reproduce the nested element gap');
  }
  assert.throws(() => keys.publicKey.verify(digest, signature([oid, nil], [nil])), /valid RSASSA/);
  const md = forge.md.sha256.create().update('valid signature');
  const signed = keys.privateKey.sign(md);
  assert.equal(keys.publicKey.verify(md.digest().getBytes(), signed), true);
  assert.equal(keys.publicKey.verify(digest, signed), false);
  const pss = forge.pss.create({ md: forge.md.sha256.create(), mgf: forge.mgf.mgf1.create(forge.md.sha256.create()), saltLength: 16 });
  const pssMd = forge.md.sha256.create().update('valid PSS');
  assert.equal(keys.publicKey.verify(pssMd.digest().getBytes(), keys.privateKey.sign(pssMd, pss), pss), true);
  return { nestedGarbageRejected: patched, outerGarbageRejected: true, validWithAndWithoutNull: true,
    validSignature: true, changedMessageRejected: true, pssUnaffected: true };
}

export function verifyBraces(braces, patched = true) {
  assert.deepEqual(braces.expand('src/{api,web}/{a,b}.ts'), ['src/api/a.ts', 'src/api/b.ts', 'src/web/a.ts', 'src/web/b.ts']);
  assert.equal(braces.compile('x/{1..3}'), 'x/([1-3])');
  assert.equal(braces.stringify(braces.parse('a/{b,c}/d')), 'a/{b,c}/d');
  assert.deepEqual(braces.expand('x/\\{literal\\}'), ['x/{literal}']);
  const deep = '{'.repeat(4000) + 'a,b' + '}'.repeat(4000);
  if (!patched) {
    const ast = { type: 'root', nodes: [] };
    let parent = ast;
    for (let i = 0; i < 20000; i++) {
      const child = { type: 'brace', nodes: [], parent };
      parent.nodes.push(child);
      parent = child;
    }
    parent.nodes.push({ type: 'text', value: 'x' });
    assert.throws(() => braces.compile(ast), RangeError);
    return { baselineStackOverflowReproduced: true, ordinaryPatternsPreserved: true };
  }
  const bounded = error => error instanceof SyntaxError && /maximum nesting depth/.test(error.message);
  for (const method of ['parse', 'compile', 'expand', 'stringify']) {
    assert.throws(() => braces[method](deep), bounded, method);
    assert.throws(() => braces[method]('('.repeat(4000) + 'x' + ')'.repeat(4000)), bounded, `${method} parentheses`);
  }
  // Direct AST APIs must not bypass parser limits.
  const ast = () => {
    const result = { type: 'root', nodes: [] };
    let parent = result;
    for (let i = 0; i < 2000; i++) {
      const child = { type: 'brace', nodes: [], parent };
      parent.nodes.push(child);
      parent = child;
    }
    parent.nodes.push({ type: 'text', value: 'x' });
    return result;
  };
  for (const method of ['compile', 'expand', 'stringify']) assert.throws(() => braces[method](ast()), bounded, `${method} AST`);
  assert.deepEqual(braces.expand('{'.repeat(20) + 'a,b' + '}'.repeat(20)),
    ['a', 'b'].map(value => '{'.repeat(19) + value + '}'.repeat(19)));
  return { ordinaryPatternsPreserved: true, deepBracesRejected: true, deepParenthesesRejected: true,
    directAstRejected: true, boundedSyntaxError: true };
}

export function verifySecurityBackports() {
  const listing = runPnpm(['list', 'node-forge', 'braces', '--recursive', '--json', '--depth', 'Infinity']);
  assert.equal(listing.status, 0, 'Unable to inventory installed dependency copies');
  const copies = new Map();
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [name, data] of Object.entries(value)) {
      if (name in backports && data?.path && data?.version) copies.set(fs.realpathSync(data.path), { name, ...data });
      visit(data);
    }
  };
  visit(JSON.parse(listing.stdout));
  const report = [];
  for (const [directory, copy] of copies) {
    const expected = backports[copy.name];
    const require = createRequire(path.join(directory, 'package.json'));
    assert.equal(copy.version, expected.version);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).version, expected.version);
    for (const [file, digest] of Object.entries(expected.files)) {
      // npm content is compared with LF on both Windows and Linux.
      const content = fs.readFileSync(path.join(directory, file), 'utf8').replace(/\r\n/g, '\n');
      assert.equal(createHash('sha256').update(content).digest('hex'), digest, `${copy.name}/${file} backport integrity`);
    }
    const tests = copy.name === 'node-forge' ? verifyForge(require(directory)) : verifyBraces(require(directory));
    report.push({ package: copy.name, version: copy.version, advisory: expected.advisory,
      installedCopy: path.relative(root, directory).replaceAll('\\', '/'), integrityPassed: true, tests });
  }
  for (const name of Object.keys(backports)) assert.ok(report.some(copy => copy.package === name), `No installed ${name} found`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify({ success: true, verified: verifySecurityBackports() }, null, 2));
}
