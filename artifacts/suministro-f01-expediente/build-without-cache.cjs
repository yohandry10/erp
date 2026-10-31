// Ensayo local de compilación con poco disco. Sólo cambia la persistencia de
// caché de webpack durante el proceso y restaura el archivo exacto al terminar.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const web = path.resolve('apps/web');
const file = path.join(web, 'next.config.js');
const original = fs.readFileSync(file);
const source = original.toString('utf8');
const marker = 'webpack: (config, { isServer }) => {';
assert.equal(source.split(marker).length, 2);
const patched = Buffer.from(source.replace(marker, marker + '\n    config.cache = false; // Sólo este ensayo; se restaura al terminar.'));
fs.writeFileSync(file, patched);
function restore() {
  if (fs.readFileSync(file).equals(patched)) fs.writeFileSync(file, original);
  else console.error('Se conserva next.config.js: contiene otro cambio concurrente.');
}
process.once('exit', restore);
const cli = require.resolve('next/dist/bin/next', { paths: [web] });
const child = spawn(process.execPath, [cli, 'build'], { cwd: web, env: process.env, windowsHide: true, stdio: 'inherit' });
child.once('error', error => { console.error(error); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code === 0 ? 0 : 1; });
