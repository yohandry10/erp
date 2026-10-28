// Escribe tablas Visual FoxPro (0x30) con página CP850 y memo .fpt: pruebas y simulación local.
import fs from 'node:fs';

const CP850 = { Ñ: 0xa5, ñ: 0xa4, á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3, Á: 0xb5, É: 0x90, Í: 0xd6, Ó: 0xe0, Ú: 0xe9, ü: 0x81, Ü: 0x9a, '°': 0xf8 };

/** Escribe una tabla VFP con página CP850 y memo .fpt opcional; `borrados` marca índices con "*". */
export function escribirDbf(archivo, campos, filas, { borrados = [] } = {}) {
  const largoRegistro = 1 + campos.reduce((s, c) => s + c.largo, 0);
  const largoCabecera = 32 + campos.length * 32 + 1 + 263;
  const cab = Buffer.alloc(largoCabecera);
  cab[0] = 0x30; cab[1] = 126; cab[2] = 10; cab[3] = 28;
  cab.writeUInt32LE(filas.length, 4);
  cab.writeUInt16LE(largoCabecera, 8);
  cab.writeUInt16LE(largoRegistro, 10);
  const conMemo = campos.some((c) => c.tipo === 'M');
  cab[28] = conMemo ? 0x02 : 0;
  cab[29] = 0x02;
  let desp = 1;
  campos.forEach((c, i) => {
    const o = 32 + i * 32;
    cab.write(c.nombre, o, 'latin1');
    cab[o + 11] = c.tipo.charCodeAt(0);
    cab.writeUInt32LE(desp, o + 12);
    cab[o + 16] = c.largo;
    cab[o + 17] = c.decimales ?? 0;
    desp += c.largo;
  });
  cab[32 + campos.length * 32] = 0x0d;
  const memos = [];
  const registros = filas.map((fila, r) => {
    const reg = Buffer.alloc(largoRegistro, 0x20);
    reg[0] = borrados.includes(r) ? 0x2a : 0x20;
    let p = 1;
    for (const c of campos) {
      const v = fila[c.nombre];
      const celda = reg.subarray(p, p + c.largo);
      if (c.tipo === 'C') {
        // CP850 para las letras del castellano; el resto ASCII.
        Buffer.from([...String(v ?? '')].map((ch) => CP850[ch] ?? ch.charCodeAt(0))).copy(celda);
      } else if (c.tipo === 'N') {
        celda.write(v === null ? ''.padStart(c.largo) : Number(v).toFixed(c.decimales ?? 0).padStart(c.largo), 'latin1');
      } else if (c.tipo === 'D') {
        celda.write(v ? v.replace(/-/g, '') : '        ', 'latin1');
      } else if (c.tipo === 'I') celda.writeInt32LE(v, 0);
      else if (c.tipo === 'Y') celda.writeBigInt64LE(BigInt(Math.round(v * 10000)), 0);
      else if (c.tipo === 'B') celda.writeDoubleLE(v, 0);
      else if (c.tipo === 'L') celda.write(v ? 'T' : 'F', 'latin1');
      else if (c.tipo === 'T') {
        const d = new Date(v);
        celda.writeInt32LE(Math.floor(d.getTime() / 86400000) + 2440588, 0);
        celda.writeInt32LE(d.getTime() % 86400000, 4);
      } else if (c.tipo === 'M') {
        if (v) { memos.push(v); celda.writeInt32LE(8 + memos.length - 1, 0); }
        else celda.writeInt32LE(0, 0);
      }
      p += c.largo;
    }
    return reg;
  });
  fs.writeFileSync(archivo, Buffer.concat([cab, ...registros, Buffer.from([0x1a])]));
  if (conMemo) {
    const bloque = 64;
    const fpt = Buffer.alloc(512 + memos.length * bloque);
    fpt.writeUInt32BE(8 + memos.length, 0);
    fpt.writeUInt16BE(bloque, 6);
    memos.forEach((m, i) => {
      const o = (8 + i) * bloque;
      fpt.writeUInt32BE(1, o);
      fpt.writeUInt32BE(Buffer.byteLength(m, 'latin1'), o + 4);
      fpt.write(m, o + 8, 'latin1');
    });
    fs.writeFileSync(archivo.replace(/\.dbf$/i, '.fpt'), fpt);
  }
}
