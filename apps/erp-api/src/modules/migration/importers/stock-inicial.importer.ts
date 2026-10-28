import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { ImporterResult, ImporterRowError } from '../dto/import.dto';
import { ParsedCsv, nonEmpty, toDateOrNull, toNumber, validateHeaders } from '../util/csv-parser.util';
import { Importer, ImporterContext, emptyResult } from './importer.interface';
import { MigrationRunsService } from '../migration-runs.service';
import { mensajeFox } from './suministro-fox.importer';

const REQUIRED = [
  'external_id_producto',
  'sucursal_id',
  'almacen_id',
  'cantidad',
  'costo_unitario',
];
// Con almacen_codigo (FOX) no hacen falta los UUID: la sucursal es la del almacén o la principal.
const REQUIRED_POR_CODIGO = ['external_id_producto', 'almacen_codigo', 'cantidad', 'costo_unitario'];
const UUID = /^[0-9a-f-]{36}$/i;

/** Identidad de la fila: con lote, una apertura por lote en el mismo almacén. */
function externalIdStock(producto: string, almacenId: string, fechaCorte: string, lote: string | null) {
  return lote ? `stock:${producto}:${lote}:${almacenId}:${fechaCorte}` : `stock:${producto}:${almacenId}:${fechaCorte}`;
}
const loteDe = (row: Record<string, string>) => nonEmpty(row['lote'])?.toUpperCase() ?? null;

/** Filas del ensayo FOX: el producto se resuelve por código en la base. */
export function filasEnsayoStock(parsed: ParsedCsv, fechaCorte: string) {
  return parsed.rows.map((row, idx) => {
    const producto = nonEmpty(row['external_id_producto']) ?? '';
    const lote = loteDe(row);
    const codigo = nonEmpty(row['almacen_id']) ? null : nonEmpty(row['almacen_codigo'])?.trim() ?? null;
    return {
      external_id: externalIdStock(producto, codigo ?? (row['almacen_id'] ?? '').trim(), fechaCorte, lote),
      fila: idx + 2,
      stock: {
        producto_codigo: producto,
        ...(codigo ? { almacen_codigo: codigo } : { almacen_id: (row['almacen_id'] ?? '').trim() }),
        sucursal_id: (row['sucursal_id'] ?? '').trim(),
        fecha_corte: fechaCorte,
        cantidad: toNumber(row['cantidad']),
        costo_unitario: toNumber(row['costo_unitario']),
        ...(lote ? { lote, fecha_vencimiento: toDateOrNull(row['fecha_vencimiento']) } : {}),
        ...(nonEmpty(row['descripcion']) ? { notas: row['descripcion'].trim() } : {}),
      },
    };
  });
}

@Injectable()
export class StockInicialImporter implements Importer {
  readonly runType = 'stock_inicial' as const;
  readonly requiredHeaders = REQUIRED;
  private readonly logger = new Logger(StockInicialImporter.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly runs: MigrationRunsService,
  ) {}

  getTemplate() {
    // lote y fecha_vencimiento son obligatorios para productos con control de lote.
    // almacen_codigo reemplaza a los UUID cuando el almacén ya se migró con su código.
    const headers = [...REQUIRED, 'descripcion', 'lote', 'fecha_vencimiento', 'almacen_codigo'];
    const sample = [
      ['PROD-00001', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '120', '8.50', 'Stock inicial laboratorio', '', '', ''],
      ['PROD-00002', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '50', '120.00', 'Stock inicial farmacia', 'L2405A', '2027-05-31', ''],
      ['PROD-00003', '', '', '30', '4.20', 'Stock en almacén migrado de FOX', '', '', 'ALM-CALLAO'],
    ];
    return {
      filename: 'plantilla_migracion_stock_inicial.csv',
      content: [headers.join(','), ...sample.map((r) => r.join(','))].join('\n') + '\n',
    };
  }

  validate(parsed: ParsedCsv): ImporterRowError[] {
    const errs: ImporterRowError[] = [];
    const porCodigo = validateHeaders(parsed.headers, REQUIRED_POR_CODIGO).length === 0;
    const headerErrs = porCodigo ? [] : validateHeaders(parsed.headers, REQUIRED);
    headerErrs.forEach((m) => errs.push({ rowIndex: 1, message: m }));
    if (headerErrs.length > 0) return errs;

    parsed.rows.forEach((row, idx) => {
      const rowIndex = idx + 2;
      const externalProd = nonEmpty(row['external_id_producto']);
      if (!externalProd) {
        errs.push({ rowIndex, field: 'external_id_producto', message: 'external_id_producto requerido' });
      }
      const almacenCodigo = nonEmpty(row['almacen_id']) ? null : nonEmpty(row['almacen_codigo']);
      const sucursalId = nonEmpty(row['sucursal_id']);
      if (almacenCodigo ? sucursalId && !UUID.test(sucursalId) : !sucursalId || !UUID.test(sucursalId)) {
        errs.push({ rowIndex, externalId: externalProd, field: 'sucursal_id', message: 'sucursal_id debe ser UUID válido' });
      }
      const cantidad = toNumber(row['cantidad']);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        errs.push({ rowIndex, externalId: externalProd, field: 'cantidad', message: 'cantidad inválida (>0)' });
      }
      const costo = toNumber(row['costo_unitario']);
      if (!Number.isFinite(costo) || costo < 0) {
        errs.push({ rowIndex, externalId: externalProd, field: 'costo_unitario', message: 'costo_unitario inválido (>=0)' });
      }
      const almacenId = nonEmpty(row['almacen_id']);
      if (!almacenCodigo && (!almacenId || !UUID.test(almacenId))) {
        errs.push({ rowIndex, externalId: externalProd, field: 'almacen_id', message: 'almacen_id (UUID) o almacen_codigo requerido' });
      }
      const lote = loteDe(row);
      const vence = nonEmpty(row['fecha_vencimiento']);
      if (lote && lote.length > 80) {
        errs.push({ rowIndex, externalId: externalProd, field: 'lote', message: 'lote: hasta 80 caracteres' });
      }
      if (vence && (!lote || !/^\d{4}-\d{2}-\d{2}$/.test(vence) || Number.isNaN(Date.parse(vence)))) {
        errs.push({ rowIndex, externalId: externalProd, field: 'fecha_vencimiento', message: 'fecha_vencimiento exige lote y formato AAAA-MM-DD' });
      }
    });
    return errs;
  }

  async run(parsed: ParsedCsv, ctx: ImporterContext): Promise<ImporterResult> {
    const result = emptyResult(parsed.rows.length);

    if (!ctx.fechaCorte) {
      result.errors.push({ rowIndex: 1, message: 'fechaCorte es obligatoria para stock inicial' });
      result.errorRows = parsed.rows.length;
      return result;
    }

    const preErrs = this.validate(parsed);
    if (preErrs.length > 0 && preErrs.some((e) => e.rowIndex === 1)) {
      result.errors = preErrs;
      result.errorRows = preErrs.length;
      return result;
    }
    const errorsByRow = new Map<number, ImporterRowError[]>();
    preErrs.forEach((e) => {
      const arr = errorsByRow.get(e.rowIndex) ?? [];
      arr.push(e);
      errorsByRow.set(e.rowIndex, arr);
    });

    const client = this.supabase.getClient();

    const externalProdIds = Array.from(
      new Set(parsed.rows.map((r) => nonEmpty(r['external_id_producto'])).filter((v): v is string => !!v)),
    );
    const prodMap = new Map<string, string>();
    const codigoMap = new Map<string, string>();
    if (externalProdIds.length > 0) {
      const { data: prods, error: prodErr } = await client
        .from('productos')
        .select('id, external_id, codigo')
        .eq('tenant_id', ctx.tenantId)
        .in('external_id', externalProdIds);
      if (prodErr) {
        result.errors.push({ rowIndex: 1, message: `Error precargando productos: ${prodErr.message}` });
        result.errorRows = parsed.rows.length;
        return result;
      }
      (prods ?? []).forEach((p) => {
        if (p.external_id) prodMap.set(p.external_id, p.id);
      });
      // El alta normal de productos no asigna external_id. El código único por
      // tenant permite importar stock sin exigir una importación de catálogo.
      const { data: byCode, error: codeErr } = await client
        .from('productos')
        .select('id, codigo')
        .eq('tenant_id', ctx.tenantId)
        .in('codigo', externalProdIds.map((id) => id.toUpperCase()));
      if (codeErr) {
        result.errors.push({ rowIndex: 1, message: `Error precargando códigos de productos: ${codeErr.message}` });
        result.errorRows = parsed.rows.length;
        return result;
      }
      (byCode ?? []).forEach((p) => {
        if (p.codigo) codigoMap.set(p.codigo.toUpperCase(), p.id);
      });
    }

    // Almacenes por código: uno exacto (sin distinguir mayúsculas) o error de la fila.
    const codigosAlmacen = Array.from(new Set(parsed.rows
      .filter((r) => !nonEmpty(r['almacen_id']) && nonEmpty(r['almacen_codigo']))
      .map((r) => r['almacen_codigo'].trim())));
    const almacenes = new Map<string, Array<{ id: string; sucursal_id: string | null }>>();
    let sucursalPrincipal: string | null = null;
    if (codigosAlmacen.length > 0) {
      const { data: alms, error: almErr } = await client
        .from('almacenes')
        .select('id, codigo, sucursal_id')
        .eq('tenant_id', ctx.tenantId)
        .eq('activo', true)
        .in('codigo', Array.from(new Set([...codigosAlmacen, ...codigosAlmacen.map((c) => c.toUpperCase())])));
      const { data: suc, error: sucErr } = await client
        .from('sucursales')
        .select('id')
        .eq('tenant_id', ctx.tenantId)
        .order('es_principal', { ascending: false })
        .order('id')
        .limit(1);
      if (almErr || sucErr) {
        result.errors.push({ rowIndex: 1, message: `Error precargando almacenes: ${(almErr ?? sucErr)!.message}` });
        result.errorRows = parsed.rows.length;
        return result;
      }
      (alms ?? []).forEach((a: any) => {
        const k = String(a.codigo).toUpperCase();
        almacenes.set(k, [...(almacenes.get(k) ?? []), { id: a.id, sucursal_id: a.sucursal_id }]);
      });
      sucursalPrincipal = suc?.[0]?.id ?? null;
    }

    for (let i = 0; i < parsed.rows.length; i++) {
      const rowIndex = i + 2;
      const row = parsed.rows[i];
      const externalProd = nonEmpty(row['external_id_producto'])!;
      const rowErrors = errorsByRow.get(rowIndex);
      if (rowErrors && rowErrors.length > 0) {
        result.errors.push(...rowErrors);
        result.errorRows++;
        if (ctx.runCtx) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex,
            externalId: externalProd,
            status: 'error',
            targetTable: 'movimientos_inventario',
            errorMessage: rowErrors.map((e) => e.message).join('; '),
            rawData: row,
          });
        }
        continue;
      }

      const productoId = prodMap.get(externalProd) ?? codigoMap.get(externalProd.toUpperCase());
      if (!productoId) {
        const msg = `producto con external_id o código="${externalProd}" no existe en este tenant.`;
        result.errors.push({ rowIndex, externalId: externalProd, message: msg });
        result.errorRows++;
        if (ctx.runCtx) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex,
            externalId: externalProd,
            status: 'error',
            targetTable: 'movimientos_inventario',
            errorMessage: msg,
            rawData: row,
          });
        }
        continue;
      }

      // Las filas sin almacén válido se descartaron arriba.
      let almacenId = nonEmpty(row['almacen_id']);
      let sucursalId = nonEmpty(row['sucursal_id']);
      if (!almacenId) {
        const codigo = row['almacen_codigo'].trim();
        const candidatos = almacenes.get(codigo.toUpperCase()) ?? [];
        if (candidatos.length !== 1 || !(sucursalId ?? candidatos[0].sucursal_id ?? sucursalPrincipal)) {
          const msg = candidatos.length > 1
            ? `almacen_codigo="${codigo}" coincide con más de un almacén.`
            : candidatos.length === 0 ? `almacen_codigo="${codigo}" no existe en este tenant: migre antes los almacenes.`
              : 'La empresa no tiene sucursal para el almacén.';
          result.errors.push({ rowIndex, externalId: externalProd, field: 'almacen_codigo', message: msg });
          result.errorRows++;
          if (ctx.runCtx) {
            await this.runs.recordRow({
              runId: ctx.runCtx.runId,
              tenantId: ctx.tenantId,
              rowIndex,
              externalId: externalProd,
              status: 'error',
              targetTable: 'movimientos_inventario',
              errorMessage: msg,
              rawData: row,
            });
          }
          continue;
        }
        almacenId = candidatos[0].id;
        sucursalId = sucursalId ?? candidatos[0].sucursal_id ?? sucursalPrincipal;
      }
      const cantidad = toNumber(row['cantidad']);
      const costo = toNumber(row['costo_unitario']);

      if (ctx.dryRun) {
        result.okRows++;
        continue;
      }

      try {
        // La RPC 473 fija la huella antes de delegar el agregado fisico al
        // writer canonico 347. Un replay con otra cantidad/costo ya no queda
        // aceptado silenciosamente por la identidad fisica del movimiento.
        const { data: mov, error: movErr } = await client.rpc('importar_stock_inicial_tx', {
          p_tenant_id: ctx.tenantId,
          p_actor_id: ctx.startedBy,
          p_run_id: ctx.runCtx?.runId ?? null,
          p_external_id: externalIdStock(externalProd, almacenId, ctx.fechaCorte, loteDe(row)),
          p_stock: {
            producto_id: productoId,
            almacen_id: almacenId,
            sucursal_id: sucursalId,
            fecha_corte: ctx.fechaCorte,
            cantidad,
            costo_unitario: costo,
            external_id_producto: externalProd,
            notas: nonEmpty(row['descripcion']) ?? `Apertura migración al ${ctx.fechaCorte}`,
            ...(loteDe(row) ? { lote: loteDe(row), fecha_vencimiento: toDateOrNull(row['fecha_vencimiento']) } : {}),
          },
        });
        if (movErr) throw movErr;

        const action = String(mov?.action ?? '');
        const targetId = mov?.id ?? null;
        if (action === 'CREATED') result.created++;
        else if (action === 'IDEMPOTENT') result.skippedRows++;
        else result.updated++;
        if (action !== 'IDEMPOTENT') result.okRows++;
        if (ctx.runCtx) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex,
            externalId: externalProd,
            status: action === 'IDEMPOTENT' ? 'skipped' : 'ok',
            targetTable: 'movimientos_inventario',
            targetId,
            errorMessage: action === 'IDEMPOTENT' ? 'Apertura ya aplicada con la misma huella' : null,
          });
        }
      } catch (err: any) {
        const msg = mensajeFox(err?.message || String(err));
        this.logger.warn(`Error stock fila ${rowIndex} (${externalProd}): ${msg}`);
        result.errorRows++;
        result.errors.push({ rowIndex, externalId: externalProd, message: msg });
        if (ctx.runCtx) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex,
            externalId: externalProd,
            status: 'error',
            targetTable: 'movimientos_inventario',
            errorMessage: msg,
            rawData: row,
          });
        }
      }
    }

    return result;
  }
}
