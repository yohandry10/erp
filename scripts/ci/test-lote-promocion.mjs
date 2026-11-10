// El lote de promoción debe tener los mismos bytes en cualquier checkout. Con autocrlf, Windows
// entrega las migraciones en CRLF: un lote armado así no coincide con el que valida la CI y sus
// anclas multilínea dejan de encontrar la función que parchean (ensayo 594–617 del 2026-11-10).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { construirLote } from './lote-promocion.mjs';

const migraciones = {
  '001__base.sql': 'BEGIN;\nSELECT 1;\nCOMMIT;\n',
  '002__parche.sql': "BEGIN;\nDO $p$ BEGIN PERFORM replace('a\nb','a\nb','c'); END $p$;\nCOMMIT;\n",
};
const lote = (finDeLinea) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-promocion-'));
  try {
    const dir = path.join(raiz, 'supabase/migrations');
    fs.mkdirSync(dir, { recursive: true });
    for (const [nombre, sql] of Object.entries(migraciones)) fs.writeFileSync(path.join(dir, nombre), sql.replaceAll('\n', finDeLinea));
    return construirLote(raiz, 2, 2);
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); }
};
const lf = lote('\n');
const crlf = lote('\r\n');
assert.ok(!crlf.sql.includes('\r'), 'El lote conserva retornos de carro del checkout');
assert.equal(crlf.sha256, lf.sha256, 'El lote depende de los finales de línea del checkout');
assert.deepEqual(crlf.migraciones, ['002__parche.sql']);
console.log(JSON.stringify({ passed: true, sha256: lf.sha256 }));
