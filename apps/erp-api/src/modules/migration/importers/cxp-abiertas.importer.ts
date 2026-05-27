import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { ImporterResult, ImporterRowError } from '../dto/import.dto';
import { ParsedCsv, nonEmpty, toDateOrNull, toNumber, validateHeaders } from '../util/csv-parser.util';
import { Importer, ImporterContext, emptyResult } from './importer.interface';
import { MigrationRunsService } from '../migration-runs.service';

const REQUIRED = [
  'external_id',
  'external_id_proveedor',
  'tipo_documento',
  'serie',
  'numero',
  'fecha_emision',
  'fecha_vencimiento',
  'moneda',
  'monto_total',
  'saldo_pendiente',
];

const TIPOS_DOC = new Set(['FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'NC', 'ND', 'RECIBO', 'OTRO']);
const MONEDAS = new Set(['PEN', 'USD', 'EUR']);

@Injectable()
export class CxpAbiertasImporter implements Importer {
  readonly runType = 'cxp_abiertas' as const;
  readonly requiredHeaders = REQUIRED;
  private readonly logger = new Logger(CxpAbiertasImporter.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly runs: MigrationRunsService,
  ) {}

  getTemplate() {
    const headers = [...REQUIRED, 'observaciones'];
    const sample = [
      'CXP-2024-00001',
      'PROV-00001',
      'FACTURA',
      'F002',
      '5678',
      '2024-12-20',
      '2025-01-19',
      'PEN',
      '2360.00',
      '1180.00',
      'Saldo inicial migrado desde ERP legacy',
    ];
    return {
      filename: 'plantilla_migracion_cxp_abiertas.csv',
      content: `${headers.join(',')}\n${sample.join(',')}\n`,
    };
  }

  validate(parsed: ParsedCsv): ImporterRowError[] {
    const errs: ImporterRowError[] = [];
    const headerErrs = validateHeaders(parsed.headers, REQUIRED);
    headerErrs.forEach((m) => errs.push({ rowIndex: 1, message: m }));
    if (headerErrs.length > 0) return errs;

    const seen = new Set<string>();
    parsed.rows.forEach((row, idx) => {
      const rowIndex = idx + 2;
      const externalId = nonEmpty(row['external_id']);
      if (!externalId) {
        errs.push({ rowIndex, field: 'external_id', message: 'external_id requerido' });
        return;
      }
      if (seen.has(externalId)) {
        errs.push({ rowIndex, externalId, message: `external_id duplicado en archivo: ${externalId}` });
      }
      seen.add(externalId);

      if (!nonEmpty(row['external_id_proveedor'])) {
        errs.push({ rowIndex, externalId, field: 'external_id_proveedor', message: 'external_id_proveedor requerido' });
      }
      const tipoDoc = String(row['tipo_documento'] || '').toUpperCase().trim();
      if (!TIPOS_DOC.has(tipoDoc)) {
        errs.push({ rowIndex, externalId, field: 'tipo_documento', message: `tipo_documento inválido: ${tipoDoc}` });
      }
      if (!nonEmpty(row['serie'])) errs.push({ rowIndex, externalId, field: 'serie', message: 'serie requerida' });
      if (!nonEmpty(row['numero'])) errs.push({ rowIndex, externalId, field: 'numero', message: 'numero requerido' });

      if (!toDateOrNull(row['fecha_emision'])) {
        errs.push({ rowIndex, externalId, field: 'fecha_emision', message: 'fecha_emision inválida (YYYY-MM-DD)' });
      }
      if (!toDateOrNull(row['fecha_vencimiento'])) {
        errs.push({ rowIndex, externalId, field: 'fecha_vencimiento', message: 'fecha_vencimiento inválida (YYYY-MM-DD)' });
      }

      const moneda = String(row['moneda'] || '').toUpperCase().trim();
      if (!MONEDAS.has(moneda)) {
        errs.push({ rowIndex, externalId, field: 'moneda', message: `moneda inválida (${moneda})` });
      }

      const total = toNumber(row['monto_total']);
      const saldo = toNumber(row['saldo_pendiente']);
      if (!Number.isFinite(total) || total < 0) {
        errs.push({ rowIndex, externalId, field: 'monto_total', message: 'monto_total inválido' });
      }
      if (!Number.isFinite(saldo) || saldo < 0) {
        errs.push({ rowIndex, externalId, field: 'saldo_pendiente', message: 'saldo_pendiente inválido' });
      }
      if (Number.isFinite(total) && Number.isFinite(saldo) && saldo > total + 0.001) {
        errs.push({
          rowIndex,
          externalId,
          field: 'saldo_pendiente',
          message: `saldo_pendiente (${saldo}) no puede exceder monto_total (${total})`,
        });
      }
    });
    return errs;
  }

  async run(parsed: ParsedCsv, ctx: ImporterContext): Promise<ImporterResult> {
    const result = emptyResult(parsed.rows.length);
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

    const externalProvIds = Array.from(
      new Set(parsed.rows.map((r) => nonEmpty(r['external_id_proveedor'])).filter((v): v is string => !!v)),
    );
    const provMap = new Map<string, string>();
    if (externalProvIds.length > 0 && !ctx.dryRun) {
      const { data: proveedores, error: provErr } = await client
        .from('proveedores')
        .select('id, external_id')
        .eq('tenant_id', ctx.tenantId)
        .in('external_id', externalProvIds);
      if (provErr) {
        result.errors.push({ rowIndex: 1, message: `No se pudo precargar proveedores: ${provErr.message}` });
        result.errorRows = parsed.rows.length;
        return result;
      }
      (proveedores ?? []).forEach((p) => {
        if (p.external_id) provMap.set(p.external_id, p.id);
      });
    }

    let sumaTotal = 0;

    for (let i = 0; i < parsed.rows.length; i++) {
      const rowIndex = i + 2;
      const row = parsed.rows[i];
      const externalId = nonEmpty(row['external_id'])!;
      const rowErrors = errorsByRow.get(rowIndex);
      if (rowErrors && rowErrors.length > 0) {
        result.errors.push(...rowErrors);
        result.errorRows++;
        if (ctx.runCtx) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex,
            externalId,
            status: 'error',
            targetTable: 'cuentas_por_pagar',
            errorMessage: rowErrors.map((e) => e.message).join('; '),
            rawData: row,
          });
        }
        continue;
      }

      const externalProv = nonEmpty(row['external_id_proveedor'])!;
      const proveedorId = ctx.dryRun ? '00000000-0000-0000-0000-000000000000' : provMap.get(externalProv);
      if (!proveedorId) {
        const msg = `proveedor con external_id="${externalProv}" no existe en este tenant. Importa primero los proveedores.`;
        result.errors.push({ rowIndex, externalId, field: 'external_id_proveedor', message: msg });
        result.errorRows++;
        if (ctx.runCtx) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex,
            externalId,
            status: 'error',
            targetTable: 'cuentas_por_pagar',
            errorMessage: msg,
            rawData: row,
          });
        }
        continue;
      }

      const monto = toNumber(row['monto_total']);
      const saldo = toNumber(row['saldo_pendiente']);
      const moneda = String(row['moneda']).toUpperCase().trim();
      sumaTotal += saldo;

      const numeroTexto = String(row['numero']).trim();
      const numeroNumerico = toNumber(row['numero']) || null;
      // CxP usa numero_documento como text (verificado en BD remota dev 2026-05-26);
      // si saldo === 0 la fila representa una CxP ya pagada al corte → estado PAGADA.
      // El check `ck_cuentas_por_pagar_montos_nonnegative` exige total > 0; data con monto_total=0
      // no debería entrar en esta importación, pero validamos defensivamente.
      const totalEfectivo = monto > 0 ? monto : 0.01;
      const payload: Record<string, any> = {
        tenant_id: ctx.tenantId,
        external_id: externalId,
        proveedor_id: proveedorId,
        referencia_tipo: 'MIGRACION_APERTURA',
        tipo_documento: String(row['tipo_documento']).toUpperCase().trim(),
        serie: row['serie'],
        numero: numeroNumerico,
        numero_documento: numeroTexto,
        fecha_emision: toDateOrNull(row['fecha_emision']),
        fecha_vencimiento: toDateOrNull(row['fecha_vencimiento']),
        moneda,
        total: totalEfectivo,
        subtotal: totalEfectivo,
        igv: 0,
        saldo,
        saldo_pendiente: saldo,
        retencion_total: 0,
        percepcion_total: 0,
        detraccion_total: 0,
        anticipo_total: 0,
        discrepancias: [],
        condiciones_pago: 'CONTADO',
        idempotency_key: `migracion_apertura:${externalId}`,
        estado: saldo > 0 ? 'PENDIENTE' : 'PAGADA',
        observaciones: nonEmpty(row['observaciones']),
        metadata: {
          origen: 'migracion_apertura',
          fecha_corte: ctx.fechaCorte ?? null,
          run_id: ctx.runCtx?.runId ?? null,
        },
      };

      if (ctx.dryRun) {
        result.okRows++;
        continue;
      }

      try {
        const { data: existing } = await client
          .from('cuentas_por_pagar')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .eq('external_id', externalId)
          .maybeSingle();

        let targetId: string | null = null;
        if (existing?.id) {
          const { data, error } = await client
            .from('cuentas_por_pagar')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
            .eq('tenant_id', ctx.tenantId)
            .select('id')
            .single();
          if (error) throw error;
          targetId = data?.id ?? null;
          result.updated++;
        } else {
          const { data, error } = await client
            .from('cuentas_por_pagar')
            .insert(payload)
            .select('id')
            .single();
          if (error) throw error;
          targetId = data?.id ?? null;
          result.created++;
        }
        result.okRows++;
        if (ctx.runCtx) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex,
            externalId,
            status: 'ok',
            targetTable: 'cuentas_por_pagar',
            targetId,
          });
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        this.logger.warn(`Error CxP fila ${rowIndex} (${externalId}): ${msg}`);
        result.errorRows++;
        result.errors.push({ rowIndex, externalId, message: msg });
        if (ctx.runCtx) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex,
            externalId,
            status: 'error',
            targetTable: 'cuentas_por_pagar',
            errorMessage: msg,
            rawData: row,
          });
        }
      }
    }

    if (ctx.runCtx && !ctx.dryRun) {
      try {
        await client
          .from('migration_runs')
          .update({
            metadata: {
              total_declarado: ctx.totalDeclarado ?? null,
              total_real_importado: sumaTotal,
              created: result.created,
              updated: result.updated,
            },
          })
          .eq('id', ctx.runCtx.runId);
      } catch (e) {
        this.logger.warn(`No se pudo anotar suma total en run: ${(e as Error).message}`);
      }
    }

    return result;
  }
}
