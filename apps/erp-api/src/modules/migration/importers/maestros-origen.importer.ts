import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { MigrationRunsService } from '../migration-runs.service';
import { nonEmpty } from '../util/csv-parser.util';
import { Importer } from './importer.interface';
import { FoxImporterBase, SpecFox, esVerdadero } from './suministro-fox.importer';

/** Unidades que el maestro de productos admite (SUNAT); FOX se homologa a ellas. */
export const UNIDADES_ERP = ['NIU', 'KGM', 'LTR', 'MTR', 'ZZ'];
const MONEDAS = ['PEN', 'USD', 'EUR', 'COP', 'ARS'];
const n = (v: string | undefined) => (nonEmpty(v) === null ? undefined : Number(v));
const txt = (v: string | undefined) => nonEmpty(v)?.trim();
const bool = (v: string | undefined) => (nonEmpty(v) === null ? undefined : esVerdadero(v));
/** Quita las claves vacías: la huella del registro no depende de columnas opcionales vacías. */
const limpio = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const moneda = (row: Record<string, string>, err: (f: string, m: string) => void) => {
  if (nonEmpty(row.moneda) && !MONEDAS.includes(row.moneda.trim().toUpperCase())) err('moneda', `moneda inválida (${row.moneda})`);
};
const noSupera = (original: string, ejecutado: string) => (row: Record<string, string>, err: (f: string, m: string) => void) => {
  if (Number(row[ejecutado]) > Number(row[original])) err(ejecutado, `${ejecutado} no puede superar ${original}`);
};

const base = { rpc: 'importar_maestro_fox_582' as const, opcionales: [] as string[], cabecera: [] as string[], numericas: [] as string[], fechas: [] as string[] };

export const SPECS_MAESTROS: Record<string, SpecFox> = {
  PRODUCTO: {
    ...base,
    runType: 'productos', entidad: 'PRODUCTO', tabla: 'productos', clave: 'id_origen_producto', claveLote: 'productos', unaFila: true,
    requeridas: ['id_origen_producto', 'codigo', 'nombre'],
    opcionales: ['categoria', 'unidad_medida', 'precio_venta', 'precio_compra', 'afectacion_igv', 'controla_lote',
      'requiere_vencimiento', 'dias_minimos_vida_util'],
    numericas: ['precio_venta', 'precio_compra', 'dias_minimos_vida_util'],
    booleanas: ['controla_lote', 'requiere_vencimiento'],
    validarFila: (row, err) => {
      if (nonEmpty(row.unidad_medida) && !UNIDADES_ERP.includes(row.unidad_medida.trim().toUpperCase()))
        err('unidad_medida', `unidad_medida debe ser ${UNIDADES_ERP.join(', ')} (homologue la unidad de FOX)`);
      if (nonEmpty(row.afectacion_igv) && !/^\d{2}$/.test(row.afectacion_igv.trim())) err('afectacion_igv', 'afectacion_igv es un código de 2 dígitos');
      if (nonEmpty(row.codigo) && row.codigo.trim().length > 60) err('codigo', 'codigo: hasta 60 caracteres');
    },
    ejemplo: [['P-1', 'MED-001', 'Amoxicilina 500 mg x 100', 'MEDICAMENTOS', 'NIU', '12.50', '8.00', '10', 'SI', 'SI', '90']],
    armar: ([f]) => limpio({
      codigo: f.codigo.trim(), nombre: f.nombre.trim(), categoria: txt(f.categoria), unidad_medida: txt(f.unidad_medida)?.toUpperCase(),
      precio_venta: n(f.precio_venta), precio_compra: n(f.precio_compra), afectacion_igv: txt(f.afectacion_igv),
      controla_lote: bool(f.controla_lote), requiere_vencimiento: bool(f.requiere_vencimiento),
      dias_minimos_vida_util: n(f.dias_minimos_vida_util),
    }),
  },
  ALMACEN: {
    ...base,
    runType: 'almacenes', entidad: 'ALMACEN', tabla: 'almacenes', clave: 'id_origen_almacen', claveLote: 'almacenes', unaFila: true,
    requeridas: ['id_origen_almacen', 'codigo', 'nombre'],
    opcionales: ['direccion', 'telefono', 'es_principal'],
    booleanas: ['es_principal'],
    ejemplo: [['A-01', 'ALM-CALLAO', 'Almacén Callao', 'Av. Argentina 1234', '01 555 0101', 'NO']],
    armar: ([f]) => limpio({
      codigo: f.codigo.trim(), nombre: f.nombre.trim(), direccion: txt(f.direccion), telefono: txt(f.telefono), es_principal: bool(f.es_principal),
    }),
  },
  CUENTA_CONTABLE: {
    ...base,
    runType: 'plan_cuentas', entidad: 'CUENTA_CONTABLE', tabla: 'plan_cuentas', clave: 'codigo', claveLote: 'cuentas_contables', unaFila: true,
    requeridas: ['codigo', 'nombre'],
    opcionales: ['acepta_movimiento'],
    booleanas: ['acepta_movimiento'],
    validarFila: (row, err) => {
      if (nonEmpty(row.codigo) && !/^\d{2,20}$/.test(row.codigo.trim())) err('codigo', 'codigo contable: sólo dígitos, de 2 a 20');
    },
    // Los padres antes que sus subcuentas: cada una cuelga del prefijo más largo ya existente.
    ordenar: (a, b) => a.id_origen.length - b.id_origen.length || a.id_origen.localeCompare(b.id_origen),
    ejemplo: [['104101', 'BCP cuenta corriente soles', 'SI'], ['104102', 'Interbank cuenta corriente', 'SI']],
    armar: ([f]) => limpio({ codigo: f.codigo.trim(), nombre: f.nombre.trim(), acepta_movimiento: bool(f.acepta_movimiento) }),
  },
  CUENTA_BANCARIA: {
    ...base,
    runType: 'cuentas_bancarias', entidad: 'CUENTA_BANCARIA', tabla: 'cuentas_bancarias', clave: 'id_origen_cuenta',
    claveLote: 'cuentas_bancarias', unaFila: true,
    requeridas: ['id_origen_cuenta', 'nombre', 'banco', 'numero_cuenta', 'moneda', 'cuenta_contable_codigo'],
    opcionales: ['tipo_cuenta', 'saldo_apertura', 'fecha_apertura', 'tipo_cambio'],
    numericas: ['saldo_apertura', 'tipo_cambio'],
    conSigno: ['saldo_apertura'],
    fechas: ['fecha_apertura'],
    validarFila: (row, err) => {
      moneda(row, err);
      if ((n(row.saldo_apertura) ?? 0) !== 0 && !nonEmpty(row.fecha_apertura)) err('fecha_apertura', 'el saldo de apertura exige fecha_apertura');
    },
    // En moneda extranjera, tipo_cambio de la fecha de apertura: el cruce con la contabilidad es en moneda local.
    ejemplo: [['B-1', 'BCP Soles', 'BCP', '193-1234567-0-11', 'PEN', '104101', 'CORRIENTE', '15000.00', '2026-10-31', ''],
      ['B-2', 'BCP Dólares', 'BCP', '193-7654321-1-22', 'USD', '104102', 'CORRIENTE', '4000.00', '2026-10-31', '3.7520']],
    armar: ([f]) => limpio({
      nombre: f.nombre.trim(), banco: f.banco.trim(), numero_cuenta: f.numero_cuenta.trim(), moneda: f.moneda.trim().toUpperCase(),
      cuenta_contable_codigo: f.cuenta_contable_codigo.trim(), tipo_cuenta: txt(f.tipo_cuenta)?.toUpperCase(),
      saldo_apertura: n(f.saldo_apertura), fecha_apertura: txt(f.fecha_apertura), tipo_cambio: n(f.tipo_cambio),
    }),
  },
  LISTA_PRECIOS: {
    ...base,
    runType: 'listas_precios', entidad: 'LISTA_PRECIOS', tabla: 'listas_precios_venta', clave: 'id_origen_lista', claveLote: 'listas_precios',
    requeridas: ['id_origen_lista', 'codigo', 'nombre', 'moneda', 'vigencia_desde', 'producto_codigo', 'precio_unitario'],
    opcionales: ['vigencia_hasta', 'prioridad', 'cliente_codigo', 'cantidad_minima'],
    cabecera: ['codigo', 'nombre', 'moneda', 'vigencia_desde', 'vigencia_hasta', 'prioridad', 'cliente_codigo'],
    numericas: ['precio_unitario', 'cantidad_minima', 'prioridad'],
    fechas: ['vigencia_desde', 'vigencia_hasta'],
    validarFila: moneda,
    ejemplo: [
      ['L-1', 'HOSP-2026', 'Hospitales 2026', 'PEN', '2026-01-01', 'MED-001', '11.50', '', '', '', '1'],
      ['L-1', 'HOSP-2026', 'Hospitales 2026', 'PEN', '2026-01-01', 'MED-002', '7.80', '', '', '', '1'],
    ],
    armar: (filas) => {
      const f = filas[0];
      return limpio({
        codigo: f.codigo.trim(), nombre: f.nombre.trim(), moneda: f.moneda.trim().toUpperCase(), vigencia_desde: f.vigencia_desde.trim(),
        vigencia_hasta: txt(f.vigencia_hasta), prioridad: n(f.prioridad), cliente_codigo: txt(f.cliente_codigo),
        lineas: filas.map((l) => limpio({ producto_codigo: l.producto_codigo.trim(), precio_unitario: Number(l.precio_unitario),
          cantidad_minima: n(l.cantidad_minima) })),
      });
    },
  },
  OC_COMPRA: {
    ...base,
    runType: 'oc_compra', entidad: 'OC_COMPRA', tabla: 'ordenes_compra', clave: 'id_origen_oc', claveLote: 'oc_compra',
    requeridas: ['id_origen_oc', 'numero', 'proveedor_codigo', 'fecha_orden', 'moneda', 'producto_codigo', 'cantidad_original',
      'cantidad_recibida', 'precio_unitario'],
    opcionales: ['fecha_entrega_esperada', 'almacen_codigo', 'descripcion'],
    cabecera: ['numero', 'proveedor_codigo', 'fecha_orden', 'moneda', 'fecha_entrega_esperada', 'almacen_codigo'],
    numericas: ['cantidad_original', 'cantidad_recibida', 'precio_unitario'],
    fechas: ['fecha_orden', 'fecha_entrega_esperada'],
    validarFila: (row, err) => { moneda(row, err); noSupera('cantidad_original', 'cantidad_recibida')(row, err); },
    ejemplo: [['OCC-7', 'OC-2026-0457', 'PRV-0012', '2026-10-20', 'PEN', 'MED-001', '500', '200', '7.90', '2026-11-05', 'ALM-CALLAO', '']],
    armar: (filas) => {
      const f = filas[0];
      return limpio({
        numero: f.numero.trim(), proveedor_codigo: f.proveedor_codigo.trim(), fecha_orden: f.fecha_orden.trim(), moneda: f.moneda.trim().toUpperCase(),
        fecha_entrega_esperada: txt(f.fecha_entrega_esperada), almacen_codigo: txt(f.almacen_codigo),
        lineas: filas.map((l) => limpio({ producto_codigo: l.producto_codigo.trim(), cantidad_original: Number(l.cantidad_original),
          cantidad_recibida: Number(l.cantidad_recibida), precio_unitario: Number(l.precio_unitario), descripcion: txt(l.descripcion) })),
      });
    },
  },
  PEDIDO_VENTA: {
    ...base,
    runType: 'pedidos_venta', entidad: 'PEDIDO_VENTA', tabla: 'pedidos_venta', clave: 'id_origen_pedido', claveLote: 'pedidos_venta',
    requeridas: ['id_origen_pedido', 'numero', 'cliente_codigo', 'moneda', 'producto_codigo', 'cantidad_original', 'cantidad_despachada',
      'precio_unitario'],
    cabecera: ['numero', 'cliente_codigo', 'moneda'],
    numericas: ['cantidad_original', 'cantidad_despachada', 'precio_unitario'],
    validarFila: (row, err) => { moneda(row, err); noSupera('cantidad_original', 'cantidad_despachada')(row, err); },
    ejemplo: [['PV-31', 'PED-2026-0931', 'CLI-0045', 'PEN', 'MED-001', '120', '40', '12.50']],
    armar: (filas) => {
      const f = filas[0];
      return {
        numero: f.numero.trim(), cliente_codigo: f.cliente_codigo.trim(), moneda: f.moneda.trim().toUpperCase(),
        lineas: filas.map((l) => ({ producto_codigo: l.producto_codigo.trim(), cantidad_original: Number(l.cantidad_original),
          cantidad_despachada: Number(l.cantidad_despachada), precio_unitario: Number(l.precio_unitario) })),
      };
    },
  },
};

class MaestroFoxImporter extends FoxImporterBase {
  readonly runType: Importer['runType'];
  constructor(supabase: SupabaseService, runs: MigrationRunsService, protected readonly spec: SpecFox) {
    super(supabase, runs);
    this.runType = spec.runType as Importer['runType'];
  }
}

/** Importadores de maestros y saldos abiertos FOX que faltaban (582). */
@Injectable()
export class MaestrosFoxImporters {
  readonly todos: Importer[];
  constructor(supabase: SupabaseService, runs: MigrationRunsService) {
    this.todos = Object.values(SPECS_MAESTROS).map((spec) => new MaestroFoxImporter(supabase, runs, spec));
  }
}
