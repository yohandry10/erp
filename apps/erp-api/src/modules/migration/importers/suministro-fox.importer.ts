import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { ImporterResult, ImporterRowError } from '../dto/import.dto';
import { MigrationRunsService } from '../migration-runs.service';
import { ParsedCsv, nonEmpty, validateHeaders } from '../util/csv-parser.util';
import { Importer, ImporterContext, emptyResult } from './importer.interface';

/** Registro FOX agrupado: un contrato u OC reúne varias filas (una por línea). */
export interface RegistroFox {
  id_origen: string;
  fila: number;
  filas: number[];
  payload: Record<string, unknown>;
}

type EntidadFox = 'CONTRATO' | 'OC' | 'ENTREGA';
type Spec = {
  runType: 'contratos_suministro' | 'oc_suministro' | 'cronograma_suministro';
  entidad: EntidadFox;
  tabla: string;
  clave: string;
  requeridas: string[];
  opcionales: string[];
  cabecera: string[];
  numericas: string[];
  fechas: string[];
  ejemplo: string[][];
  armar: (filas: Record<string, string>[]) => Record<string, unknown>;
};

const MENSAJES: Record<string, string> = {
  MIGRATION_FOX_CLIENT_NOT_FOUND: 'El cliente no existe o es ambiguo: importe antes los clientes con su código FOX',
  MIGRATION_FOX_PRODUCT_NOT_FOUND: 'El producto no existe o es ambiguo en el ERP',
  MIGRATION_FOX_PARENT_NOT_FOUND: 'Falta migrar antes el contrato, la OC o la línea de la que depende',
  MIGRATION_FOX_SOURCE_CHANGED: 'Ya se migró con otros datos; el registro cambió en FOX',
  MIGRATION_FOX_NOTHING_OPEN: 'No tiene saldo abierto: queda como historia en FOX',
  MIGRATION_FOX_QUANTITY_INVALID: 'Cantidades inválidas: lo ejecutado no puede superar lo original',
  MIGRATION_FOX_DUPLICATE_LINE: 'La OC repite una línea del contrato',
  MIGRATION_FOX_RESPONSIBLE_NOT_FOUND: 'El responsable no es un usuario activo de la empresa',
  MIGRATION_FOX_LINES_REQUIRED: 'El registro no trae líneas',
  MIGRATION_FOX_INPUT_INVALID: 'Datos inválidos',
  MIGRATION_STOCK_LOT_REQUIRED: 'El producto controla lotes: indique lote y vencimiento',
  MIGRATION_STOCK_LOT_NOT_CONTROLLED: 'El producto no controla lotes: configure su política antes de migrar con lote',
  MIGRATION_STOCK_EXPIRY_REQUIRED: 'El lote exige fecha de vencimiento',
  MIGRATION_STOCK_PRODUCT_NOT_FOUND: 'El producto no existe, está inactivo o no controla stock',
  MIGRATION_STOCK_WAREHOUSE_NOT_FOUND: 'El almacén no existe en la empresa',
  MIGRATION_STOCK_BRANCH_NOT_FOUND: 'La sucursal no existe en la empresa',
  MIGRATION_STOCK_IDEMPOTENCY_COLLISION: 'Esa apertura ya se migró con otros datos',
  MIGRATION_STOCK_INVALID_PAYLOAD: 'Datos de stock inválidos',
  SUPPLY_OC_EXCEEDS_CONTRACT: 'La OC supera el saldo de la línea del contrato',
  SUPPLY_SCHEDULE_EXCEEDS_OC: 'El cronograma supera lo pendiente de la OC',
  SUPPLY_DATE_OUTSIDE_CONTRACT: 'La fecha está fuera de la vigencia del contrato o antes de la OC',
  SUPPLY_QUANTITY_INVALID: 'Cantidad o precio inválido (hasta 4 y 6 decimales)',
  SUPPLY_PARTY_INVALID: 'Cliente o responsable inactivo',
};

/** Traduce el código de la base a un mensaje para quien migra, conservando el detalle. */
export function mensajeFox(raw: string) {
  if (/suministro_contratos_tenant_id_numero_key/.test(raw)) return 'Ya existe un contrato con ese número en la empresa';
  const [codigo, ...resto] = raw.split(':');
  const base = MENSAJES[codigo.trim()];
  const detalle = resto.join(':').trim();
  return base ? `${base}${detalle ? ` (${detalle})` : ''}` : raw;
}

const DECIMAL = /^\d+(\.\d{1,6})?$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MONEDAS = ['PEN', 'USD', 'EUR', 'COP', 'ARS'];

function fechaValida(v: string) {
  if (!FECHA.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const num = (v: string | undefined) => (nonEmpty(v) === null ? 0 : Number(v));

export const SPECS: Record<EntidadFox, Spec> = {
  CONTRATO: {
    runType: 'contratos_suministro',
    entidad: 'CONTRATO',
    tabla: 'suministro_contratos',
    clave: 'id_origen_contrato',
    requeridas: ['id_origen_contrato', 'numero', 'cliente_codigo', 'asunto', 'moneda', 'vigencia_desde', 'vigencia_hasta',
      'id_origen_linea', 'producto_codigo', 'cantidad_original', 'cantidad_ejecutada', 'precio_unitario'],
    opcionales: ['estado', 'responsable_email', 'observaciones'],
    cabecera: ['numero', 'cliente_codigo', 'asunto', 'moneda', 'vigencia_desde', 'vigencia_hasta', 'estado', 'responsable_email', 'observaciones'],
    numericas: ['cantidad_original', 'cantidad_ejecutada', 'precio_unitario'],
    fechas: ['vigencia_desde', 'vigencia_hasta'],
    ejemplo: [
      ['C-100', 'LP-012-2026', 'CLI-0045', 'Suministro anual de insumos', 'PEN', '2026-01-01', '2026-12-31', '1', 'MED-001', '1000', '600', '12.50', 'VIGENTE', '', ''],
      ['C-100', 'LP-012-2026', 'CLI-0045', 'Suministro anual de insumos', 'PEN', '2026-01-01', '2026-12-31', '2', 'MED-002', '300', '300', '8.00', 'VIGENTE', '', ''],
    ],
    armar: (filas) => {
      const f = filas[0];
      return {
        numero: f.numero.trim(), cliente_codigo: f.cliente_codigo.trim(), asunto: f.asunto.trim(),
        moneda: f.moneda.trim().toUpperCase(), vigencia_desde: f.vigencia_desde.trim(), vigencia_hasta: f.vigencia_hasta.trim(),
        estado: (nonEmpty(f.estado) ?? 'VIGENTE').toUpperCase(),
        ...(nonEmpty(f.responsable_email) ? { responsable_email: f.responsable_email.trim() } : {}),
        ...(nonEmpty(f.observaciones) ? { observaciones: f.observaciones.trim() } : {}),
        lineas: filas.map((l) => ({
          id_origen: l.id_origen_linea.trim(), producto_codigo: l.producto_codigo.trim(),
          cantidad_original: num(l.cantidad_original), cantidad_ejecutada: num(l.cantidad_ejecutada),
          precio_unitario: num(l.precio_unitario),
        })),
      };
    },
  },
  OC: {
    runType: 'oc_suministro',
    entidad: 'OC',
    tabla: 'suministro_ordenes_cliente',
    clave: 'id_origen_oc',
    requeridas: ['id_origen_oc', 'id_origen_contrato', 'numero', 'fecha_emision', 'id_origen_linea', 'id_origen_linea_contrato',
      'cantidad_original', 'cantidad_entregada'],
    opcionales: [],
    cabecera: ['id_origen_contrato', 'numero', 'fecha_emision'],
    numericas: ['cantidad_original', 'cantidad_entregada'],
    fechas: ['fecha_emision'],
    ejemplo: [['OC-9', 'C-100', 'OC-2026-031', '2026-09-15', '1', '1', '300', '100']],
    armar: (filas) => ({
      contrato_id_origen: filas[0].id_origen_contrato.trim(), numero: filas[0].numero.trim(), fecha_emision: filas[0].fecha_emision.trim(),
      lineas: filas.map((l) => ({
        id_origen: l.id_origen_linea.trim(), contrato_linea_id_origen: l.id_origen_linea_contrato.trim(),
        cantidad_original: num(l.cantidad_original), cantidad_entregada: num(l.cantidad_entregada),
      })),
    }),
  },
  ENTREGA: {
    runType: 'cronograma_suministro',
    entidad: 'ENTREGA',
    tabla: 'suministro_entregas_programadas',
    clave: 'id_origen_entrega',
    requeridas: ['id_origen_entrega', 'id_origen_oc', 'id_origen_linea_oc', 'fecha_programada', 'cantidad', 'destino'],
    opcionales: ['cantidad_entregada'],
    cabecera: [],
    numericas: ['cantidad', 'cantidad_entregada'],
    fechas: ['fecha_programada'],
    ejemplo: [['E-1', 'OC-9', '1', '2026-11-10', '120', 'Almacén del hospital', '0']],
    armar: (filas) => ({
      oc_id_origen: filas[0].id_origen_oc.trim(), oc_linea_id_origen: filas[0].id_origen_linea_oc.trim(),
      fecha_programada: filas[0].fecha_programada.trim(), cantidad: num(filas[0].cantidad),
      cantidad_entregada: num(filas[0].cantidad_entregada), destino: filas[0].destino.trim(),
    }),
  },
};

/**
 * Valida el archivo y agrupa sus filas en registros FOX. Las filas de un mismo
 * contrato u OC repiten la cabecera y deben coincidir en ella.
 */
export function construirLoteFox(entidad: EntidadFox, parsed: ParsedCsv) {
  const spec = SPECS[entidad];
  const errores: ImporterRowError[] = validateHeaders(parsed.headers, spec.requeridas).map((message) => ({ rowIndex: 1, message }));
  if (errores.length) return { registros: [] as RegistroFox[], errores };
  const grupos = new Map<string, Array<{ fila: number; row: Record<string, string> }>>();
  parsed.rows.forEach((row, i) => {
    const fila = i + 2;
    const id = nonEmpty(row[spec.clave]);
    const err = (field: string, message: string) => errores.push({ rowIndex: fila, externalId: id, field, message });
    for (const campo of spec.requeridas) if (!nonEmpty(row[campo]) && !spec.numericas.includes(campo)) err(campo, `${campo} requerido`);
    for (const campo of spec.requeridas.filter((c) => c.startsWith('id_origen')))
      if (nonEmpty(row[campo]) && (row[campo].trim().length > 120 || row[campo].includes('#')))
        err(campo, `${campo}: hasta 120 caracteres y sin "#"`);
    for (const campo of spec.numericas) {
      const v = nonEmpty(row[campo]);
      if ((spec.requeridas.includes(campo) || v !== null) && !DECIMAL.test(v ?? '')) err(campo, `${campo} debe ser un número con punto decimal`);
    }
    for (const campo of spec.fechas) if (nonEmpty(row[campo]) && !fechaValida(row[campo].trim())) err(campo, `${campo} debe ser AAAA-MM-DD`);
    if (entidad === 'CONTRATO' && nonEmpty(row.moneda) && !MONEDAS.includes(row.moneda.trim().toUpperCase()))
      err('moneda', `moneda inválida (${row.moneda})`);
    if (entidad === 'CONTRATO' && nonEmpty(row.estado) && !['VIGENTE', 'BORRADOR'].includes(row.estado.trim().toUpperCase()))
      err('estado', 'estado debe ser VIGENTE o BORRADOR');
    if (!id) return;
    const grupo = grupos.get(id) ?? [];
    const primera = grupo[0]?.row;
    if (primera)
      for (const campo of spec.cabecera)
        if ((primera[campo] ?? '').trim() !== (row[campo] ?? '').trim())
          err(campo, `${campo} difiere de la fila ${grupo[0].fila} del mismo ${spec.clave}`);
    if (entidad === 'ENTREGA' && primera) err(spec.clave, `${spec.clave} repetido`);
    grupo.push({ fila, row });
    grupos.set(id, grupo);
  });
  const registros: RegistroFox[] = [];
  const conError = new Set(errores.map((e) => e.rowIndex));
  for (const [id, grupo] of grupos) {
    if (grupo.some((g) => conError.has(g.fila))) continue;
    registros.push({ id_origen: id, fila: grupo[0].fila, filas: grupo.map((g) => g.fila), payload: spec.armar(grupo.map((g) => g.row)) });
  }
  return { registros, errores, grupos };
}

abstract class SuministroFoxImporter implements Importer {
  abstract readonly runType: Spec['runType'];
  protected abstract readonly entidad: EntidadFox;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly runs: MigrationRunsService,
  ) {}

  get requiredHeaders() {
    return SPECS[this.entidad].requeridas;
  }

  getTemplate() {
    const spec = SPECS[this.entidad];
    const headers = [...spec.requeridas, ...spec.opcionales];
    return {
      filename: `plantilla_migracion_${spec.runType}.csv`,
      content: [headers.join(','), ...spec.ejemplo.map((r) => r.slice(0, headers.length).join(','))].join('\n') + '\n',
    };
  }

  validate(parsed: ParsedCsv): ImporterRowError[] {
    return construirLoteFox(this.entidad, parsed).errores;
  }

  async run(parsed: ParsedCsv, ctx: ImporterContext): Promise<ImporterResult> {
    const result = emptyResult(parsed.rows.length);
    const { registros, errores } = construirLoteFox(this.entidad, parsed);
    result.errors.push(...errores);
    if (errores.some((e) => e.rowIndex === 1)) {
      result.errorRows = parsed.rows.length;
      return result;
    }
    const filasConError = new Set(errores.map((e) => e.rowIndex));
    result.errorRows = filasConError.size;
    const client = this.supabase.getClient();
    const spec = SPECS[this.entidad];

    if (ctx.dryRun) {
      // Ensayo en la base, revertido: valida productos, padres y saldos sin escribir.
      const clave = { CONTRATO: 'contratos', OC: 'oc', ENTREGA: 'entregas' }[this.entidad];
      const { data, error } = await client.rpc('ensayar_migracion_fox_580', {
        p_tenant_id: ctx.tenantId,
        p_actor_id: ctx.startedBy,
        p_lote: { [clave]: registros.map((r) => ({ id_origen: r.id_origen, fila: r.fila, payload: r.payload })) },
        p_control: null,
      });
      if (error) throw new Error(error.message);
      for (const r of registros) {
        const res = (data?.registros ?? []).find((x: any) => x.id_origen === r.id_origen);
        if (res?.ok) result.okRows += r.filas.length;
        else {
          result.errorRows += r.filas.length;
          result.errors.push({ rowIndex: r.fila, externalId: r.id_origen, message: res?.error ? mensajeFox(res.error) : 'Sin resultado del ensayo' });
        }
      }
      return result;
    }

    for (const r of registros) {
      let status: 'ok' | 'skipped' | 'error' = 'ok';
      let targetId: string | null = null;
      let message: string | null = null;
      const { data, error } = await client.rpc('importar_suministro_fox_580', {
        p_tenant_id: ctx.tenantId,
        p_actor_id: ctx.startedBy,
        p_run_id: ctx.runCtx?.runId ?? null,
        p_entidad: this.entidad,
        p_id_origen: r.id_origen,
        p_payload: r.payload,
      });
      if (error) {
        status = 'error';
        message = mensajeFox(error.message);
        result.errorRows += r.filas.length;
        result.errors.push({ rowIndex: r.fila, externalId: r.id_origen, message });
      } else if (data?.action === 'IDEMPOTENT') {
        status = 'skipped';
        targetId = data.id;
        message = 'Ya migrado con el mismo contenido';
        result.skippedRows += r.filas.length;
      } else {
        targetId = data?.id ?? null;
        result.created++;
        result.okRows += r.filas.length;
      }
      if (ctx.runCtx)
        for (const fila of r.filas)
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex: fila,
            externalId: r.id_origen,
            status,
            targetTable: spec.tabla,
            targetId,
            errorMessage: message,
            rawData: status === 'error' ? parsed.rows[fila - 2] : undefined,
          });
    }
    if (ctx.runCtx)
      for (const e of errores)
        await this.runs.recordRow({
          runId: ctx.runCtx.runId,
          tenantId: ctx.tenantId,
          rowIndex: e.rowIndex,
          externalId: e.externalId ?? null,
          status: 'error',
          targetTable: spec.tabla,
          errorMessage: e.message,
          rawData: parsed.rows[e.rowIndex - 2],
        });
    return result;
  }
}

@Injectable()
export class ContratosSuministroImporter extends SuministroFoxImporter {
  readonly runType = 'contratos_suministro' as const;
  protected readonly entidad = 'CONTRATO' as const;
}

@Injectable()
export class OcSuministroImporter extends SuministroFoxImporter {
  readonly runType = 'oc_suministro' as const;
  protected readonly entidad = 'OC' as const;
}

@Injectable()
export class CronogramaSuministroImporter extends SuministroFoxImporter {
  readonly runType = 'cronograma_suministro' as const;
  protected readonly entidad = 'ENTREGA' as const;
}
