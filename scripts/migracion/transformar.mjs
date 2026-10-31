#!/usr/bin/env node
// Convierte el extracto en las plantillas de migración del ERP y calcula
// los totales de control con las mismas reglas que la conciliación (582):
// terceros, maestros, saldos abiertos (original - ejecutado > 0), balance,
// suministro y stock.
//
// Uso: node scripts/migracion/transformar.mjs <mapeo.json> <carpeta-extracto> <carpeta-salida>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { archivosExtracto, leerTabla } from './leer-extracto.mjs';

export const COLUMNAS = {
  clientes: ['external_id', 'tipo', 'tipo_documento', 'numero_documento', 'razon_social', 'direccion', 'email', 'telefono',
    'limite_credito', 'pais'],
  proveedores: ['external_id', 'tipo', 'tipo_documento', 'numero_documento', 'razon_social', 'direccion', 'email', 'telefono',
    'sujeto_detraccion', 'detraccion_tasa', 'sujeto_retencion', 'retencion_tasa', 'pais'],
  almacenes: ['id_origen_almacen', 'codigo', 'nombre', 'direccion', 'telefono', 'es_principal'],
  plan_cuentas: ['codigo', 'nombre', 'acepta_movimiento'],
  productos: ['id_origen_producto', 'codigo', 'nombre', 'categoria', 'unidad_medida', 'precio_venta', 'precio_compra',
    'afectacion_igv', 'controla_lote', 'requiere_vencimiento', 'dias_minimos_vida_util'],
  cuentas_bancarias: ['id_origen_cuenta', 'nombre', 'banco', 'numero_cuenta', 'moneda', 'cuenta_contable_codigo', 'tipo_cuenta',
    'saldo_apertura', 'fecha_apertura', 'tipo_cambio'],
  listas_precios: ['id_origen_lista', 'codigo', 'nombre', 'moneda', 'vigencia_desde', 'producto_codigo', 'precio_unitario',
    'vigencia_hasta', 'prioridad', 'cliente_codigo', 'cantidad_minima'],
  cxc: ['external_id', 'external_id_cliente', 'tipo_documento', 'serie', 'numero', 'fecha_emision', 'fecha_vencimiento', 'moneda',
    'monto_total', 'saldo_pendiente', 'observaciones'],
  cxp: ['external_id', 'external_id_proveedor', 'tipo_documento', 'serie', 'numero', 'fecha_emision', 'fecha_vencimiento', 'moneda',
    'monto_total', 'saldo_pendiente', 'observaciones'],
  balance: ['cuenta_contable_codigo', 'debe', 'haber', 'centro_costo_codigo', 'descripcion'],
  oc_compra: ['id_origen_oc', 'numero', 'proveedor_codigo', 'fecha_orden', 'moneda', 'producto_codigo', 'cantidad_original',
    'cantidad_recibida', 'precio_unitario', 'fecha_entrega_esperada', 'almacen_codigo', 'descripcion'],
  pedidos_venta: ['id_origen_pedido', 'numero', 'cliente_codigo', 'moneda', 'producto_codigo', 'cantidad_original',
    'cantidad_despachada', 'precio_unitario'],
  contratos: ['id_origen_contrato', 'numero', 'cliente_codigo', 'asunto', 'moneda', 'vigencia_desde', 'vigencia_hasta',
    'id_origen_linea', 'producto_codigo', 'cantidad_original', 'cantidad_ejecutada', 'precio_unitario', 'estado',
    'responsable_email', 'observaciones'],
  oc: ['id_origen_oc', 'id_origen_contrato', 'numero', 'fecha_emision', 'id_origen_linea', 'id_origen_linea_contrato',
    'cantidad_original', 'cantidad_entregada'],
  cronograma: ['id_origen_entrega', 'id_origen_oc', 'id_origen_linea_oc', 'fecha_programada', 'cantidad', 'destino', 'cantidad_entregada'],
  stock: ['external_id_producto', 'sucursal_id', 'almacen_id', 'cantidad', 'costo_unitario', 'descripcion', 'lote', 'fecha_vencimiento',
    'almacen_codigo'],
};
/** Archivo de cada salida, en el orden en que se importa. */
export const ARCHIVOS = {
  clientes: 'clientes.csv',
  proveedores: 'proveedores.csv',
  almacenes: 'almacenes.csv',
  plan_cuentas: 'plan_cuentas.csv',
  productos: 'productos.csv',
  cuentas_bancarias: 'cuentas_bancarias.csv',
  listas_precios: 'listas_precios.csv',
  cxc: 'cxc_abiertas.csv',
  cxp: 'cxp_abiertas.csv',
  balance: 'balance_apertura.csv',
  contratos: 'contratos_suministro.csv',
  oc: 'oc_suministro.csv',
  cronograma: 'cronograma_suministro.csv',
  oc_compra: 'oc_compra.csv',
  pedidos_venta: 'pedidos_venta.csv',
  stock: 'stock_inicial.csv',
};

const redondear = (n, d) => Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;

/** Evalúa una expresión del mapeo sobre una fila con sus tablas unidas. */
export function evaluar(expr, fila) {
  if (expr === undefined || expr === null) return '';
  if (typeof expr === 'string') {
    const [alias, campo] = expr.includes('.') ? expr.split('.', 2) : ['', expr];
    const fuente = alias ? fila[alias] : fila[''];
    if (!fuente) throw new Error(`Alias desconocido en "${expr}"`);
    if (!(campo in fuente)) throw new Error(`Campo inexistente "${expr}"`);
    return fuente[campo];
  }
  if ('valor' in expr) return expr.valor;
  if ('mapa' in expr) {
    const v = String(evaluar(expr.mapa, fila) ?? '').trim();
    if (v in expr.valores) return expr.valores[v];
    if ('defecto' in expr) return expr.defecto;
    throw new Error(`Valor "${v}" sin correspondencia en el mapa de ${JSON.stringify(expr.mapa)}`);
  }
  if ('resta' in expr) return redondear(Number(evaluar(expr.resta[0], fila) || 0) - Number(evaluar(expr.resta[1], fila) || 0), 6);
  if ('concat' in expr) return expr.concat.map((e) => String(evaluar(e, fila) ?? '').trim()).join(expr.sep ?? '');
  if ('primero' in expr) {
    for (const e of expr.primero) {
      const v = evaluar(e, fila);
      if (v !== null && v !== undefined && String(v).trim() !== '') return v;
    }
    return '';
  }
  if ('mayusculas' in expr) return String(evaluar(expr.mayusculas, fila) ?? '').trim().toUpperCase();
  throw new Error(`Expresión no reconocida: ${JSON.stringify(expr)}`);
}

function cumple(filtro, fila) {
  const v = evaluar(filtro.campo, fila);
  const s = typeof v === 'string' ? v.trim() : v;
  if ('en' in filtro) return filtro.en.includes(s);
  if ('distinto' in filtro) return s !== filtro.distinto;
  if ('mayor' in filtro) return Number(s) > filtro.mayor;
  if ('no_vacio' in filtro) return s !== null && s !== undefined && s !== '';
  throw new Error(`Filtro no reconocido: ${JSON.stringify(filtro)}`);
}

/** Texto de una celda CSV: fechas ISO, números con punto, sin separadores de miles. */
function celda(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(redondear(v, 6));
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function transformar(mapeo, tablas) {
  const salidas = {};
  const extracto = {};
  for (const [salida, def] of Object.entries(mapeo.salidas ?? {})) {
    if (!COLUMNAS[salida]) throw new Error(`Salida desconocida "${salida}"; use ${Object.keys(COLUMNAS).join(', ')}`);
    const principal = tablas[def.tabla];
    if (!principal) throw new Error(`${salida}: la tabla "${def.tabla}" no está en el extracto`);
    const indices = (def.unir ?? []).map((u) => {
      const t = tablas[u.tabla];
      if (!t) throw new Error(`${salida}: la tabla unida "${u.tabla}" no está en el extracto`);
      const idx = new Map();
      for (const f of t.filas) {
        const k = String(f[u.con] ?? '').trim().toUpperCase();
        if (idx.has(k)) throw new Error(`${salida}: "${u.tabla}.${u.con}" repite "${k}"; la unión debe ser única`);
        idx.set(k, f);
      }
      return { ...u, idx };
    });
    const filas = [];
    let descartadas = 0;
    for (const f of principal.filas) {
      const fila = { '': f };
      for (const u of indices) fila[u.como ?? u.tabla] = u.idx.get(String(f[u.campo] ?? '').trim().toUpperCase()) ?? null;
      if (indices.some((u) => !fila[u.como ?? u.tabla])) { descartadas++; continue; }
      if (!(def.filtro ?? []).every((fl) => cumple(fl, fila))) { descartadas++; continue; }
      filas.push(Object.fromEntries(COLUMNAS[salida].map((col) => [col, col in (def.columnas ?? {}) ? evaluar(def.columnas[col], fila) : ''])));
    }
    salidas[salida] = filas;
    extracto[salida] = { tabla: def.tabla, registros_tabla: principal.filas.length, borrados_tabla: principal.borrados, descartadas, filas: filas.length };
  }
  return { salidas, extracto, control: control(salidas) };
}

/** Totales de control con las reglas de la conciliación 582. */
export function control(salidas) {
  const n = (v) => Number(v || 0);
  const id = (v) => String(v ?? '').trim();
  const si = (v) => /^(si|sí|true|1|s)$/i.test(id(v));
  const suma = (filas, f, d = 2) => redondear(filas.reduce((s, x) => s + f(x), 0), d);
  const res = {};
  for (const k of ['clientes', 'proveedores', 'almacenes'])
    if (salidas[k]) res[k] = { registros: salidas[k].length };
  if (salidas.plan_cuentas) res.cuentas_contables = { registros: salidas.plan_cuentas.length };
  if (salidas.productos)
    res.productos = { registros: salidas.productos.length, con_lote: salidas.productos.filter((f) => si(f.controla_lote)).length };
  if (salidas.cuentas_bancarias)
    // En moneda local, como el cruce con el asiento de apertura.
    res.cuentas_bancarias = { registros: salidas.cuentas_bancarias.length,
      saldo_local: suma(salidas.cuentas_bancarias, (f) => redondear(n(f.saldo_apertura) * (n(f.tipo_cambio) || 1), 2)) };
  if (salidas.listas_precios)
    res.listas_precios = { registros: new Set(salidas.listas_precios.map((f) => id(f.id_origen_lista))).size, lineas: salidas.listas_precios.length };
  for (const k of ['cxc', 'cxp'])
    if (salidas[k]) res[k] = { registros: salidas[k].length, saldo: suma(salidas[k], (f) => n(f.saldo_pendiente)) };
  if (salidas.balance)
    res.balance = { lineas: salidas.balance.length, debe: suma(salidas.balance, (f) => n(f.debe)), haber: suma(salidas.balance, (f) => n(f.haber)) };
  for (const [k, clave, ejecutado] of [['oc_compra', 'id_origen_oc', 'cantidad_recibida'], ['pedidos_venta', 'id_origen_pedido', 'cantidad_despachada']]) {
    if (!salidas[k]) continue;
    const pendiente = (f) => n(f.cantidad_original) - n(f[ejecutado]);
    const abiertas = salidas[k].filter((f) => pendiente(f) > 0);
    res[k] = {
      registros: new Set(abiertas.map((f) => id(f[clave]))).size,
      lineas: abiertas.length,
      cantidad: suma(abiertas, pendiente, 4),
      valor: suma(abiertas, (f) => pendiente(f) * n(f.precio_unitario)),
    };
  }
  if (salidas.contratos) {
    const abiertas = salidas.contratos.filter((f) => n(f.cantidad_original) - n(f.cantidad_ejecutada) > 0);
    res.contratos = {
      registros: new Set(abiertas.map((f) => String(f.id_origen_contrato).trim())).size,
      lineas: abiertas.length,
      cantidad: redondear(abiertas.reduce((s, f) => s + n(f.cantidad_original) - n(f.cantidad_ejecutada), 0), 4),
      valor: redondear(abiertas.reduce((s, f) => s + (n(f.cantidad_original) - n(f.cantidad_ejecutada)) * n(f.precio_unitario), 0), 2),
    };
  }
  if (salidas.oc) {
    // La OC hereda el precio de la línea del contrato.
    const precio = new Map((salidas.contratos ?? []).map((f) => [`${String(f.id_origen_contrato).trim()}#${String(f.id_origen_linea).trim()}`, n(f.precio_unitario)]));
    const abiertas = salidas.oc.filter((f) => n(f.cantidad_original) - n(f.cantidad_entregada) > 0);
    res.oc = {
      registros: new Set(abiertas.map((f) => String(f.id_origen_oc).trim())).size,
      lineas: abiertas.length,
      cantidad: redondear(abiertas.reduce((s, f) => s + n(f.cantidad_original) - n(f.cantidad_entregada), 0), 4),
      ...(salidas.contratos ? { valor: redondear(abiertas.reduce((s, f) => s + (n(f.cantidad_original) - n(f.cantidad_entregada))
        * (precio.get(`${String(f.id_origen_contrato).trim()}#${String(f.id_origen_linea_contrato).trim()}`) ?? 0), 0), 2) } : {}),
    };
  }
  if (salidas.cronograma) {
    const abiertas = salidas.cronograma.filter((f) => n(f.cantidad) - n(f.cantidad_entregada) > 0);
    res.entregas = {
      registros: abiertas.length,
      cantidad: redondear(abiertas.reduce((s, f) => s + n(f.cantidad) - n(f.cantidad_entregada), 0), 4),
    };
  }
  if (salidas.stock) {
    res.stock = {
      registros: salidas.stock.length,
      lotes: new Set(salidas.stock.map((f) => String(f.lote ?? '').trim().toUpperCase()).filter(Boolean)).size,
      cantidad: redondear(salidas.stock.reduce((s, f) => s + n(f.cantidad), 0), 4),
      valor: redondear(salidas.stock.reduce((s, f) => s + redondear(n(f.cantidad) * n(f.costo_unitario), 2), 0), 2),
    };
  }
  return res;
}

export function escribir(resultado, carpeta, mapeo) {
  fs.mkdirSync(carpeta, { recursive: true });
  for (const [salida, filas] of Object.entries(resultado.salidas))
    fs.writeFileSync(path.join(carpeta, ARCHIVOS[salida]),
      [COLUMNAS[salida].join(','), ...filas.map((f) => COLUMNAS[salida].map((c) => celda(f[c])).join(','))].join('\n') + '\n');
  fs.writeFileSync(path.join(carpeta, 'control.json'), JSON.stringify(resultado.control, null, 2) + '\n');
  fs.writeFileSync(path.join(carpeta, 'extracto.json'), JSON.stringify({
    generado_en: new Date().toISOString(),
    fecha_corte: mapeo.fechaCorte ?? null,
    extracto: resultado.extracto,
    control: resultado.control,
  }, null, 2) + '\n');
}

export function cargarTablas(carpeta, opciones = {}) {
  const tablas = {};
  for (const f of archivosExtracto(carpeta)) {
    const t = leerTabla(path.join(carpeta, f), opciones);
    tablas[f.replace(/\.[^.]+$/, '').toUpperCase()] = t;
  }
  return tablas;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [mapeoPath, extracto, salida] = process.argv.slice(2);
  if (!mapeoPath || !extracto || !salida) {
    console.error('Uso: node scripts/migracion/transformar.mjs <mapeo.json> <carpeta-extracto> <carpeta-salida>');
    process.exit(2);
  }
  const mapeo = JSON.parse(fs.readFileSync(mapeoPath, 'utf8'));
  const resultado = transformar(mapeo, cargarTablas(extracto, { codificacion: mapeo.codificacion }));
  escribir(resultado, salida, mapeo);
  console.log(JSON.stringify({ archivos: Object.keys(resultado.salidas).map((s) => ARCHIVOS[s]), control: resultado.control }, null, 2));
}
