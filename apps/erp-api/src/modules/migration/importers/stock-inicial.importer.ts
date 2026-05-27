import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { ImporterResult, ImporterRowError } from '../dto/import.dto';
import { ParsedCsv, nonEmpty, toNumber, validateHeaders } from '../util/csv-parser.util';
import { Importer, ImporterContext, emptyResult } from './importer.interface';
import { MigrationRunsService } from '../migration-runs.service';

const REQUIRED = [
  'external_id_producto',
  'sucursal_id',
  'cantidad',
  'costo_unitario',
];

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
    const headers = [...REQUIRED, 'almacen_id', 'descripcion'];
    const sample = [
      ['PROD-00001', '00000000-0000-0000-0000-000000000000', '120', '8.50', '', 'Stock inicial laboratorio'],
      ['PROD-00002', '00000000-0000-0000-0000-000000000000', '50', '120.00', '', 'Stock inicial farmacia'],
    ];
    return {
      filename: 'plantilla_migracion_stock_inicial.csv',
      content: [headers.join(','), ...sample.map((r) => r.join(','))].join('\n') + '\n',
    };
  }

  validate(parsed: ParsedCsv): ImporterRowError[] {
    const errs: ImporterRowError[] = [];
    const headerErrs = validateHeaders(parsed.headers, REQUIRED);
    headerErrs.forEach((m) => errs.push({ rowIndex: 1, message: m }));
    if (headerErrs.length > 0) return errs;

    parsed.rows.forEach((row, idx) => {
      const rowIndex = idx + 2;
      const externalProd = nonEmpty(row['external_id_producto']);
      if (!externalProd) {
        errs.push({ rowIndex, field: 'external_id_producto', message: 'external_id_producto requerido' });
      }
      const sucursalId = nonEmpty(row['sucursal_id']);
      if (!sucursalId || !/^[0-9a-f-]{36}$/i.test(sucursalId)) {
        errs.push({ rowIndex, externalId: externalProd, field: 'sucursal_id', message: 'sucursal_id debe ser UUID válido' });
      }
      const cantidad = toNumber(row['cantidad']);
      if (!Number.isFinite(cantidad) || cantidad < 0) {
        errs.push({ rowIndex, externalId: externalProd, field: 'cantidad', message: 'cantidad inválida (>=0)' });
      }
      const costo = toNumber(row['costo_unitario']);
      if (!Number.isFinite(costo) || costo < 0) {
        errs.push({ rowIndex, externalId: externalProd, field: 'costo_unitario', message: 'costo_unitario inválido (>=0)' });
      }
      const almacenId = nonEmpty(row['almacen_id']);
      if (almacenId && !/^[0-9a-f-]{36}$/i.test(almacenId)) {
        errs.push({ rowIndex, externalId: externalProd, field: 'almacen_id', message: 'almacen_id debe ser UUID válido' });
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
    if (externalProdIds.length > 0 && !ctx.dryRun) {
      const { data: prods, error: prodErr } = await client
        .from('productos')
        .select('id, external_id')
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

      const productoId = ctx.dryRun ? '00000000-0000-0000-0000-000000000000' : prodMap.get(externalProd);
      if (!productoId) {
        const msg = `producto con external_id="${externalProd}" no existe en este tenant. Importa productos primero.`;
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

      const sucursalId = row['sucursal_id'].trim();
      const almacenId = nonEmpty(row['almacen_id']);
      const cantidad = toNumber(row['cantidad']);
      const costo = toNumber(row['costo_unitario']);

      if (ctx.dryRun) {
        result.okRows++;
        continue;
      }

      try {
        // Idempotencia: si ya hay un movimiento de apertura para
        // (tenant, producto, sucursal, almacen, fecha_corte), skip.
        const { data: existingMov } = await client
          .from('movimientos_inventario')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .eq('producto_id', productoId)
          .eq('motivo', 'INGRESO_APERTURA')
          .eq('referencia_tipo', `MIGRACION_APERTURA_${ctx.fechaCorte}`)
          .contains('metadata', {
            fecha_corte: ctx.fechaCorte,
            sucursal_id: sucursalId,
            almacen_id: almacenId ?? null,
          })
          .maybeSingle();

        if (existingMov?.id) {
          result.skippedRows++;
          if (ctx.runCtx) {
            await this.runs.recordRow({
              runId: ctx.runCtx.runId,
              tenantId: ctx.tenantId,
              rowIndex,
              externalId: externalProd,
              status: 'skipped',
              targetTable: 'movimientos_inventario',
              targetId: existingMov.id,
              errorMessage: 'Apertura ya registrada para este producto/sucursal/fecha',
            });
          }
          continue;
        }

        // Upsert stock por sucursal/almacen
        const { error: stockErr } = await client
          .from('producto_stock_sucursal')
          .upsert(
            [
              {
                tenant_id: ctx.tenantId,
                producto_id: productoId,
                sucursal_id: sucursalId,
                almacen_id: almacenId,
                stock_actual: cantidad,
                stock_reservado: 0,
                estado: 'ACTIVO',
              },
            ],
            { onConflict: 'producto_id,sucursal_id,almacen_id' },
          );
        if (stockErr) throw stockErr;

        // Registrar movimiento INGRESO_APERTURA
        const { data: mov, error: movErr } = await client
          .from('movimientos_inventario')
          .insert({
            tenant_id: ctx.tenantId,
            producto_id: productoId,
            cantidad,
            tipo: 'ENTRADA',
            motivo: 'INGRESO_APERTURA',
            referencia_tipo: `MIGRACION_APERTURA_${ctx.fechaCorte}`,
            notas: nonEmpty(row['descripcion']) ?? `Apertura migración al ${ctx.fechaCorte}`,
            estado: 'ACTIVO',
            created_by: ctx.startedBy ?? null,
            metadata: {
              origen: 'migracion_apertura',
              fecha_corte: ctx.fechaCorte,
              costo_unitario: costo,
              valor_total: cantidad * costo,
              sucursal_id: sucursalId,
              almacen_id: almacenId,
              run_id: ctx.runCtx?.runId ?? null,
              external_id_producto: externalProd,
            },
          })
          .select('id')
          .single();
        if (movErr) throw movErr;

        result.created++;
        result.okRows++;
        if (ctx.runCtx) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex,
            externalId: externalProd,
            status: 'ok',
            targetTable: 'movimientos_inventario',
            targetId: mov?.id ?? null,
          });
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
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
