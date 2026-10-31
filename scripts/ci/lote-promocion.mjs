// Lote de promoción: un rango de migraciones en una sola transacción. El ensayo y la promoción
// usan estos mismos bytes, y la promoción sólo acepta un lote cuya huella ya se ensayó.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const PROYECTO_PROD = 'wypnbcptofqdmoynlonq';
const ESQUEMAS = `('public','app','auth','storage')`;
const literal = (v) => `'${v.replaceAll("'", "''")}'`;
const identificador = (x) => `"${x.replaceAll('"', '""')}"`;
export const sha256 = (v) => createHash('sha256').update(v).digest('hex');

export function construirLote(root, desde, hasta) {
  const dir = path.join(root, 'supabase/migrations');
  const todas = fs.readdirSync(dir).filter((f) => /^\d+__.*\.sql$/.test(f))
    .map((archivo) => ({ version: Number(archivo.split('__')[0]), archivo }))
    .sort((a, b) => a.version - b.version);
  assert.equal(new Set(todas.map((m) => m.version)).size, todas.length, 'Prefijos de migración duplicados');
  assert.equal(todas.at(-1).version, hasta, `La última migración debe ser la ${hasta}`);
  const anterior = todas.filter((m) => m.version < desde).at(-1).version;
  const lote = todas.filter((m) => m.version >= desde && m.version <= hasta);
  assert.equal(lote[0].version, desde);
  const partes = lote.map(({ version, archivo }) => {
    const cuerpo = fs.readFileSync(path.join(dir, archivo), 'utf8').replace(/^﻿/, '');
    assert.equal((cuerpo.match(/^BEGIN;\s*$/gm) || []).length, 1, `${archivo}: se esperaba un BEGIN;`);
    assert.equal((cuerpo.match(/^COMMIT;\s*$/gm) || []).length, 1, `${archivo}: se esperaba un COMMIT;`);
    const nombre = archivo.replace(/^\d+__/, '').replace(/\.sql$/, '');
    return `${cuerpo.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '')}
INSERT INTO supabase_migrations.schema_migrations(version,statements,name) VALUES('${version}',ARRAY[${literal(cuerpo)}],'${nombre}');`;
  });
  const sql = `BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s';
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='PROD' AND project_ref='${PROYECTO_PROD}') THEN RAISE EXCEPTION 'PROMOCION_ENTORNO_INVALIDO'; END IF;
 IF (SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$') IS DISTINCT FROM ${anterior} THEN RAISE EXCEPTION 'PROMOCION_ESQUEMA_INVALIDO'; END IF;
END $guard$;
${partes.join('\n')}
DO $ready$ BEGIN
 IF NOT coalesce((public.outbox_runtime_health_492(p_required_schema_version=>${hasta})->>'ready')::boolean,false) THEN RAISE EXCEPTION 'PROMOCION_NO_LISTA'; END IF;
END $ready$;
COMMIT;
`;
  return { sql, sha256: sha256(sql), anterior, migraciones: lote.map((m) => m.archivo) };
}

/** El mismo lote, pero revierte al final: comprueba que nada queda a medias. */
export const conRollbackForzado = (sql) => {
  assert.match(sql, /COMMIT;\s*$/);
  return sql.replace(/COMMIT;\s*$/, "DO $f$ BEGIN RAISE EXCEPTION 'ENSAYO_ROLLBACK_FORZADO'; END $f$;\nCOMMIT;\n");
};

export const consultaColumnas = `SELECT coalesce(jsonb_object_agg(t,c),'{}') FROM (
  SELECT table_schema||'.'||table_name t, jsonb_agg(column_name ORDER BY column_name) c
  FROM information_schema.columns c JOIN pg_class k ON k.relname=c.table_name
  JOIN pg_namespace n ON n.oid=k.relnamespace AND n.nspname=c.table_schema
  WHERE table_schema IN ${ESQUEMAS} AND k.relkind='r' AND coalesce(c.is_generated,'NEVER')='NEVER'
  GROUP BY 1) q;`;

/** Huella de cada tabla con las columnas dadas: añadir una columna no la altera; cambiar un valor, sí. */
export const consultaHuellas = (columnas) => Object.entries(columnas).map(([t, cols]) => {
  const tabla = t.split('.').map(identificador).join('.');
  return `SELECT '${t}'||chr(9)||count(*)||chr(9)||md5(coalesce(string_agg(x,'' ORDER BY x),'')) FROM (SELECT md5(ROW(${cols.map(identificador).join(',')})::text) x FROM ${tabla}) q;`;
}).join('\n');

export function leerHuellas(salida) {
  const r = {};
  for (const l of salida.split('\n').filter(Boolean)) {
    const [t, n, h] = l.split('\t');
    r[t] = { filas: Number(n), huella: h };
  }
  return r;
}

export const consultaCatalogo = `SELECT count(*)||'/'||md5(string_agg(n.nspname||'.'||p.proname||md5(p.prosrc),'' ORDER BY n.nspname,p.proname,p.oid::regprocedure::text))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ${ESQUEMAS};`;

export const consultaEsquema = `SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]+$';`;

export const consultaFunciones = `SELECT coalesce(jsonb_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f';`;

export const consultaSalud = (requerido) => `SELECT jsonb_build_object('ready',s->'ready','requerido_aplicado',s#>'{contract,required_schema_applied}','esquema',s#>'{contract,schema_version}','cola_muerta',s#>'{backlog,dead_letter}') FROM (SELECT public.outbox_runtime_health_492(p_required_schema_version=>${requerido}) s) q;`;

/** Tablas y columnas perdidas, y tablas cuyos datos previos cambiaron. */
export function compararEstados(columnasAntes, columnasDespues, antes, despues) {
  const tablasPerdidas = Object.keys(columnasAntes).filter((t) => !columnasDespues[t]);
  const columnasPerdidas = Object.entries(columnasAntes).flatMap(([t, cs]) => cs.filter((c) => columnasDespues[t] && !columnasDespues[t].includes(c)).map((c) => `${t}.${c}`));
  const tablasConDatosCambiados = Object.entries(despues)
    .filter(([t, v]) => antes[t] && (antes[t].filas !== v.filas || antes[t].huella !== v.huella))
    .map(([t, v]) => ({ tabla: t, antes: antes[t].filas, despues: v.filas, mismasFilas: antes[t].filas === v.filas }));
  return { tablasPerdidas, columnasPerdidas, tablasConDatosCambiados };
}
