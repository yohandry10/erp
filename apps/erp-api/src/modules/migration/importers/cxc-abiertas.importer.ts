import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { ImporterResult, ImporterRowError } from '../dto/import.dto';
import { ParsedCsv, nonEmpty, toDateOrNull, toNumber, validateHeaders } from '../util/csv-parser.util';
import { Importer, ImporterContext, emptyResult } from './importer.interface';
import { MigrationRunsService } from '../migration-runs.service';

const REQUIRED = [
  'external_id',
  'external_id_cliente',
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
export class CxcAbiertasImporter implements Importer {
  readonly runType = 'cxc_abiertas' as const;
  readonly requiredHeaders = REQUIRED;
  private readonly logger = new Logger(CxcAbiertasImporter.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly runs: MigrationRunsService,
  ) {}

  getTemplate() {
    const headers = [...REQUIRED, 'observaciones'];
    const sample = [
      'CXC-2024-00001',
      'CLI-00001',
      'FACTURA',
      'F001',
      '12345',
      '2024-12-15',
      '2025-01-14',
      'PEN',
      '1180.00',
      '590.00',
      'Saldo inicial migrado desde ERP legacy',
    ];
    return {
      filename: 'plantilla_migracion_cxc_abiertas.csv',
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

      if (!nonEmpty(row['external_id_cliente'])) {
        errs.push({ rowIndex, externalId, field: 'external_id_cliente', message: 'external_id_cliente requerido' });
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

    // Pre-cargar mapa external_id_cliente → cliente_id para ahorrar queries por fila
    const externalCliIds = Array.from(
      new Set(parsed.rows.map((r) => nonEmpty(r['external_id_cliente'])).filter((v): v is string => !!v)),
    );
    const clienteMap = new Map<string, string>();
    if (externalCliIds.length > 0 && !ctx.dryRun) {
      const { data: clientes, error: cliErr } = await client
        .from('clientes')
        .select('id, external_id')
        .eq('tenant_id', ctx.tenantId)
        .in('external_id', externalCliIds);
      if (cliErr) {
        result.errors.push({ rowIndex: 1, message: `No se pudo precargar clientes: ${cliErr.message}` });
        result.errorRows = parsed.rows.length;
        return result;
      }
      (clientes ?? []).forEach((c) => {
        if (c.external_id) clienteMap.set(c.external_id, c.id);
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
            targetTable: 'cuentas_por_cobrar',
            errorMessage: rowErrors.map((e) => e.message).join('; '),
            rawData: row,
          });
        }
        continue;
      }

      const externalCliente = nonEmpty(row['external_id_cliente'])!;
      const clienteId = ctx.dryRun ? '00000000-0000-0000-0000-000000000000' : clienteMap.get(externalCliente);
      if (!clienteId) {
        const msg = `cliente con external_id="${externalCliente}" no existe en este tenant. Importa primero los clientes.`;
        result.errors.push({ rowIndex, externalId, field: 'external_id_cliente', message: msg });
        result.errorRows++;
        if (ctx.runCtx) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex,
            externalId,
            status: 'error',
            targetTable: 'cuentas_por_cobrar',
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

      const payload: Record<string, any> = {
        tenant_id: ctx.tenantId,
        external_id: externalId,
        cliente_id: clienteId,
        tipo_documento: String(row['tipo_documento']).toUpperCase().trim(),
        serie: row['serie'],
        numero: toNumber(row['numero']) || null,
        fecha_emision: toDateOrNull(row['fecha_emision']),
        fecha_vencimiento: toDateOrNull(row['fecha_vencimiento']),
        moneda,
        monto_total: monto,
        monto_original: monto,
        monto_pendiente: saldo,
        saldo,
        saldo_pendiente: saldo,
        dias_mora: 0,
        retencion_total: 0,
        percepcion_total: 0,
        detraccion_total: 0,
        anticipo_total: 0,
        estado: saldo > 0 ? 'PENDIENTE' : 'CANCELADO',
        event_source: 'migracion.apertura',
        idempotency_key: `migracion_apertura:${externalId}`,
        observaciones: nonEmpty(row['observaciones']),
        activo: true,
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
          .from('cuentas_por_cobrar')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .eq('external_id', externalId)
          .maybeSingle();

        let targetId: string | null = null;
        if (existing?.id) {
          const { data, error } = await client
            .from('cuentas_por_cobrar')
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
            .from('cuentas_por_cobrar')
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
            targetTable: 'cuentas_por_cobrar',
            targetId,
          });
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        this.logger.warn(`Error CxC fila ${rowIndex} (${externalId}): ${msg}`);
        result.errorRows++;
        result.errors.push({ rowIndex, externalId, message: msg });
        if (ctx.runCtx) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex,
            externalId,
            status: 'error',
            targetTable: 'cuentas_por_cobrar',
            errorMessage: msg,
            rawData: row,
          });
        }
      }
    }

    // Anotar suma total en metadata del run (para CHK_002 del validador)
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
