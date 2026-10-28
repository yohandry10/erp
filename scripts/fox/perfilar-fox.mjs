#!/usr/bin/env node
// Perfil del extracto FOX: versión, formato, volumen, campos, claves
// candidatas, calidad y rango de históricos por tabla. Sólo lee.
//
// Uso: node scripts/fox/perfilar-fox.mjs <carpeta-del-extracto> [--salida <carpeta>] [--codificacion cp850]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { leerTabla } from './fox-dbf.mjs';

const MAX_DISTINTOS = 50000;

function tipoDe(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return 'numero';
  if (typeof v === 'boolean') return 'logico';
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(String(v))) return 'fecha';
  if (/^-?\d+([.,]\d+)?$/.test(String(v))) return 'numero_texto';
  return 'texto';
}

/** Perfil de una tabla ya leída. */
export function perfilarTabla(tabla) {
  const total = tabla.filas.length;
  const campos = tabla.campos.map((c) => {
    const valores = tabla.filas.map((f) => f[c.nombre]);
    const presentes = valores.filter((v) => v !== null && v !== undefined && v !== '');
    const distintos = new Set();
    let desbordado = false;
    for (const v of presentes) {
      if (distintos.size >= MAX_DISTINTOS) { desbordado = true; break; }
      distintos.add(typeof v === 'string' ? v.trim().toUpperCase() : v);
    }
    const tipos = [...new Set(presentes.map(tipoDe))];
    const ordenables = presentes.filter((v) => typeof v === 'number' || tipoDe(v) === 'fecha');
    const control = presentes.filter((v) => typeof v === 'string' && /[\u0000-\u0008\u000b\u000c\u000e-\u001f�]/.test(v)).length;
    return {
      nombre: c.nombre,
      tipo: c.tipo,
      ...(c.largo !== undefined ? { largo: c.largo, decimales: c.decimales } : {}),
      tipos_observados: tipos,
      vacios: total - presentes.length,
      vacios_pct: total ? Math.round(((total - presentes.length) * 10000) / total) / 100 : 0,
      distintos: desbordado ? `>${MAX_DISTINTOS}` : distintos.size,
      ...(ordenables.length
        ? { minimo: ordenables.reduce((a, b) => (a < b ? a : b)), maximo: ordenables.reduce((a, b) => (a > b ? a : b)) }
        : {}),
      largo_max: presentes.reduce((m, v) => Math.max(m, String(v).length), 0),
      con_caracteres_de_control: control,
      ejemplos: [...new Set(presentes.slice(0, 50).map(String))].slice(0, 3),
      clave_candidata: total > 0 && !desbordado && presentes.length === total && distintos.size === total,
    };
  });
  const alertas = [];
  for (const c of campos) {
    if (c.con_caracteres_de_control) alertas.push(`${c.nombre}: ${c.con_caracteres_de_control} valores con caracteres de control o no decodificables; revisar página de códigos`);
    if (c.tipos_observados.length > 1) alertas.push(`${c.nombre}: tipos mezclados (${c.tipos_observados.join(', ')})`);
    if (c.tipo === 'C' && c.largo && c.largo_max === c.largo) alertas.push(`${c.nombre}: valores que llenan el largo del campo; posible truncamiento`);
  }
  if (!campos.some((c) => c.clave_candidata)) alertas.push('Sin campo único y completo: la clave del origen será compuesta o no confiable');
  if (tabla.borrados) alertas.push(`${tabla.borrados} registros marcados como borrados (no se migran)`);
  const fechas = campos.filter((c) => c.tipos_observados.includes('fecha') && c.minimo);
  return {
    archivo: tabla.archivo,
    formato: tabla.version,
    actualizada: tabla.actualizada,
    codificacion: tabla.codificacion,
    ...(tabla.pagina_codigos ? { pagina_codigos: tabla.pagina_codigos } : {}),
    ...(tabla.memo ? { memo: tabla.memo } : {}),
    registros: total,
    registros_borrados: tabla.borrados,
    claves_candidatas: campos.filter((c) => c.clave_candidata).map((c) => c.nombre),
    historico: fechas.map((c) => ({ campo: c.nombre, desde: c.minimo, hasta: c.maximo })),
    campos,
    alertas,
  };
}

export function perfilarCarpeta(carpeta, opciones = {}) {
  const archivos = fs.readdirSync(carpeta).filter((f) => /\.(dbf|csv)$/i.test(f)).sort();
  if (!archivos.length) throw new Error(`${carpeta}: no hay archivos .dbf ni .csv`);
  return {
    generado_en: new Date().toISOString(),
    carpeta: path.resolve(carpeta),
    tablas: archivos.map((f) => {
      try {
        return perfilarTabla(leerTabla(path.join(carpeta, f), opciones));
      } catch (e) {
        return { archivo: f, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  };
}

export function perfilMarkdown(perfil) {
  const l = [`# Perfil del extracto FOX`, '', `Generado: ${perfil.generado_en}`, `Carpeta: ${perfil.carpeta}`, '',
    '| Tabla | Formato | Registros | Borrados | Claves candidatas | Histórico |', '| --- | --- | ---: | ---: | --- | --- |'];
  for (const t of perfil.tablas) {
    if (t.error) { l.push(`| ${t.archivo} | ERROR: ${t.error} | | | | |`); continue; }
    l.push(`| ${t.archivo} | ${t.formato} (${t.codificacion}) | ${t.registros} | ${t.registros_borrados} | ${t.claves_candidatas.join(', ') || '—'} | ${t.historico.map((h) => `${h.campo} ${String(h.desde).slice(0, 10)}…${String(h.hasta).slice(0, 10)}`).join('; ') || '—'} |`);
  }
  for (const t of perfil.tablas.filter((x) => !x.error)) {
    l.push('', `## ${t.archivo}`, '', '| Campo | Tipo | Vacíos % | Distintos | Mín | Máx | Ejemplos |', '| --- | --- | ---: | ---: | --- | --- | --- |');
    for (const c of t.campos)
      l.push(`| ${c.nombre} | ${c.tipo}${c.largo ? `(${c.largo}${c.decimales ? `,${c.decimales}` : ''})` : ''} | ${c.vacios_pct} | ${c.distintos} | ${c.minimo ?? ''} | ${c.maximo ?? ''} | ${c.ejemplos.join(' · ').replace(/\|/g, '/')} |`);
    if (t.alertas.length) l.push('', ...t.alertas.map((a) => `- ${a}`));
  }
  return l.join('\n') + '\n';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const carpeta = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--salida' && args[args.indexOf(a) - 1] !== '--codificacion');
  if (!carpeta) {
    console.error('Uso: node scripts/fox/perfilar-fox.mjs <carpeta-del-extracto> [--salida <carpeta>] [--codificacion cp850]');
    process.exit(2);
  }
  const salida = args.includes('--salida') ? args[args.indexOf('--salida') + 1] : carpeta;
  const codificacion = args.includes('--codificacion') ? args[args.indexOf('--codificacion') + 1] : undefined;
  const perfil = perfilarCarpeta(carpeta, { codificacion });
  fs.mkdirSync(salida, { recursive: true });
  fs.writeFileSync(path.join(salida, 'perfil-fox.json'), JSON.stringify(perfil, null, 2));
  fs.writeFileSync(path.join(salida, 'perfil-fox.md'), perfilMarkdown(perfil));
  console.log(`Perfil de ${perfil.tablas.length} tablas en ${path.join(salida, 'perfil-fox.{json,md}')}`);
}
