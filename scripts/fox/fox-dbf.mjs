// Lector de tablas FoxPro / Visual FoxPro (.dbf con memo .fpt) y CSV.
// Sólo lee: no modifica el extracto. Devuelve filas con valores ya tipados.
import fs from 'node:fs';
import path from 'node:path';

const VERSIONES = {
  0x02: 'FoxBASE',
  0x03: 'dBase III / FoxPro sin memo',
  0x30: 'Visual FoxPro',
  0x31: 'Visual FoxPro con autoincremento',
  0x32: 'Visual FoxPro con varchar/varbinary',
  0x43: 'dBase IV SQL',
  0x83: 'dBase III con memo',
  0x8b: 'dBase IV con memo',
  0xf5: 'FoxPro 2.x con memo',
  0xfb: 'FoxBASE con memo',
};

// Marca de página de códigos (byte 29) → codificación.
const PAGINAS = { 0x01: 'cp437', 0x02: 'cp850', 0x03: 'windows-1252', 0x64: 'cp852', 0x7d: 'windows-1255', 0xc8: 'windows-1250', 0xc9: 'windows-1251' };

// CP850 0x80-0xFF (la habitual en FoxPro para DOS de habla hispana).
const CP850 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ';
const CP437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

export function decodificador(codificacion) {
  if (codificacion === 'cp850' || codificacion === 'cp437') {
    const tabla = codificacion === 'cp850' ? CP850 : CP437;
    return (buf) => {
      let s = '';
      for (const b of buf) s += b < 0x80 ? String.fromCharCode(b) : tabla[b - 0x80];
      return s;
    };
  }
  try {
    const td = new TextDecoder(codificacion);
    return (buf) => td.decode(buf);
  } catch {
    const td = new TextDecoder('latin1');
    return (buf) => td.decode(buf);
  }
}

// Día juliano de VFP (días desde -4712) a fecha ISO.
function julianaAIso(dia, ms) {
  if (!dia) return null;
  const fecha = new Date((dia - 2440588) * 86400000 + (ms || 0));
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString().replace('.000Z', 'Z');
}

function leerMemo(fpt, puntero) {
  if (!fpt || !puntero) return null;
  const bloque = fpt.readUInt16BE(6) || 64;
  const inicio = puntero * bloque;
  if (inicio + 8 > fpt.length) return null;
  const largo = fpt.readUInt32BE(inicio + 4);
  return fpt.subarray(inicio + 8, Math.min(inicio + 8 + largo, fpt.length));
}

/** Lee una tabla DBF. `codificacion` fuerza la página de códigos si el byte 29 no es confiable. */
export function leerDbf(archivo, { codificacion } = {}) {
  const buf = fs.readFileSync(archivo);
  if (buf.length < 32) throw new Error(`${archivo}: no es una tabla DBF (muy corta)`);
  const version = buf[0];
  const registros = buf.readUInt32LE(4);
  const largoCabecera = buf.readUInt16LE(8);
  const largoRegistro = buf.readUInt16LE(10);
  const pagina = buf[29];
  const cod = codificacion ?? PAGINAS[pagina] ?? 'windows-1252';
  const dec = decodificador(cod);
  const campos = [];
  let desplazamiento = 1;
  for (let o = 32; o + 32 <= largoCabecera && buf[o] !== 0x0d; o += 32) {
    const nombre = buf.subarray(o, o + 11).toString('latin1').replace(/\0.*$/s, '').trim();
    const tipo = String.fromCharCode(buf[o + 11]);
    const largo = buf[o + 16];
    const decimales = buf[o + 17];
    const flags = buf[o + 18];
    campos.push({ nombre, tipo, largo, decimales, nulable: Boolean(flags & 0x02), sistema: Boolean(flags & 0x01), desplazamiento });
    desplazamiento += largo;
  }
  const memoPath = ['.fpt', '.FPT', '.dbt', '.DBT'].map((e) => archivo.replace(/\.[^.]+$/, e)).find((p) => fs.existsSync(p));
  const fpt = memoPath ? fs.readFileSync(memoPath) : null;
  const filas = [];
  let borrados = 0;
  for (let i = 0; i < registros; i++) {
    const base = largoCabecera + i * largoRegistro;
    if (base + largoRegistro > buf.length) break;
    if (buf[base] === 0x2a) { borrados++; continue; }
    const fila = {};
    for (const c of campos) {
      if (c.sistema || c.tipo === '0') continue;
      const raw = buf.subarray(base + c.desplazamiento, base + c.desplazamiento + c.largo);
      fila[c.nombre] = valorCampo(c, raw, dec, fpt);
    }
    filas.push(fila);
  }
  return {
    archivo: path.basename(archivo),
    version: VERSIONES[version] ?? `desconocida (0x${version.toString(16)})`,
    actualizada: buf[1] ? `${1900 + buf[1]}-${String(buf[2]).padStart(2, '0')}-${String(buf[3]).padStart(2, '0')}` : null,
    codificacion: cod,
    pagina_codigos: `0x${pagina.toString(16).padStart(2, '0')}`,
    memo: memoPath ? path.basename(memoPath) : null,
    registros_declarados: registros,
    borrados,
    campos: campos.filter((c) => !c.sistema && c.tipo !== '0').map(({ desplazamiento, sistema, ...c }) => c),
    filas,
  };
}

function valorCampo(c, raw, dec, fpt) {
  switch (c.tipo) {
    case 'C':
    case 'V':
      return dec(raw).replace(/\0+$/, '').trimEnd();
    case 'N':
    case 'F': {
      const s = raw.toString('latin1').trim();
      if (!s || /^\*+$/.test(s)) return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : s;
    }
    case 'D': {
      const s = raw.toString('latin1').trim();
      return /^\d{8}$/.test(s) && s !== '00000000' ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
    }
    case 'L': {
      const s = raw.toString('latin1').trim().toUpperCase();
      return ['T', 'Y'].includes(s) ? true : ['F', 'N'].includes(s) ? false : null;
    }
    case 'I':
      return raw.readInt32LE(0);
    case 'Y':
      return Number(raw.readBigInt64LE(0)) / 10000;
    case 'B':
      return raw.readDoubleLE(0);
    case 'T':
      return julianaAIso(raw.readInt32LE(0), raw.readInt32LE(4));
    case 'M':
    case 'G':
    case 'W': {
      const ptr = c.largo === 4 ? raw.readInt32LE(0) : Number(raw.toString('latin1').trim() || 0);
      const memo = leerMemo(fpt, ptr);
      return memo ? dec(memo) : null;
    }
    default:
      return raw.toString('latin1').trim() || null;
  }
}

/** CSV con encabezado; respeta comillas dobles y saltos de línea entre comillas. */
export function leerCsv(archivo, { separador, codificacion = 'utf-8' } = {}) {
  const texto = decodificador(codificacion)(fs.readFileSync(archivo)).replace(/^﻿/, '');
  const sep = separador ?? (texto.split('\n')[0].split(';').length > texto.split('\n')[0].split(',').length ? ';' : ',');
  const registros = [];
  let campo = '';
  let fila = [];
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some((v) => v !== '')) registros.push(fila);
      fila = [];
    } else campo += ch;
  }
  if (campo !== '' || fila.length) { fila.push(campo); if (fila.some((v) => v !== '')) registros.push(fila); }
  const [cabecera = [], ...datos] = registros;
  const nombres = cabecera.map((h) => h.trim());
  return {
    archivo: path.basename(archivo),
    version: 'CSV',
    actualizada: null,
    codificacion,
    separador: sep,
    registros_declarados: datos.length,
    borrados: 0,
    campos: nombres.map((nombre) => ({ nombre, tipo: 'C' })),
    filas: datos.map((v) => Object.fromEntries(nombres.map((n, i) => [n, (v[i] ?? '').trim()]))),
  };
}

/** Abre un archivo del extracto según su extensión. */
export function leerTabla(archivo, opciones = {}) {
  return /\.dbf$/i.test(archivo) ? leerDbf(archivo, opciones) : leerCsv(archivo, opciones);
}
