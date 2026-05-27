import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { ImporterResult, ImporterRowError } from '../dto/import.dto';
import { ParsedCsv, nonEmpty, toDateOrNull, toNumber, validateHeaders } from '../util/csv-parser.util';
import { Importer, ImporterContext, emptyResult } from './importer.interface';
import { MigrationRunsService } from '../migration-runs.service';

/**
 * Importer de CPE histórico (modo migración):
 *  - NO envía a SUNAT
 *  - NO emite evento factura.emitida (no genera asiento contable)
 *  - El balance histórico ya vive en el asiento de apertura
 *  - Solo guarda registro de la emisión histórica para trazabilidad y reportes
 */

const REQUIRED = [
  'external_id',
  'tipo_documento',
  'serie',
  'numero',
  'fecha_emision',
  'external_id_cliente',
  'moneda',
  'subtotal',
  'igv',
  'total',
];

const TIPOS_DOC = new Set(['FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'NC', 'ND']);
const MONEDAS = new Set(['PEN', 'USD', 'EUR']);

@Injectable()
export class ComprobantesHistoricoImporter implements Importer {
  readonly runType = 'comprobantes_historico' as const;
  readonly requiredHeaders = REQUIRED;
  private readonly logger = new Logger(ComprobantesHistoricoImporter.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly runs: MigrationRunsService,
  ) {}

  getTemplate() {
    const headers = [...REQUIRED, 'observaciones'];
    const sample = [
      'CPE-2024-F001-12345',
      'FACTURA',
      'F001',
      '12345',
      '2024-12-15',
      'CLI-00001',
      'PEN',
      '1000.00',
      '180.00',
      '1180.00',
      'Comprobante histórico migrado (no SUNAT)',
    ];
    return {
      filename: 'plantilla_migracion_comprobantes_historico.csv',
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
        errs.push({ rowIndex, externalId, message: `external_id duplicado: ${externalId}` });
      }
      seen.add(externalId);

      const tipoDoc = String(row['tipo_documento'] || '').toUpperCase().trim();
      if (!TIPOS_DOC.has(tipoDoc)) {
        errs.push({ rowIndex, externalId, field: 'tipo_documento', message: `tipo_documento inválido: ${tipoDoc}` });
      }
      if (!nonEmpty(row['serie'])) errs.push({ rowIndex, externalId, field: 'serie', message: 'serie requerida' });
      const numero = toNumber(row['numero']);
      if (!Number.isFinite(numero) || numero <= 0) {
        errs.push({ rowIndex, externalId, field: 'numero', message: 'numero inválido' });
      }
      if (!toDateOrNull(row['fecha_emision'])) {
        errs.push({ rowIndex, externalId, field: 'fecha_emision', message: 'fecha_emision inválida (YYYY-MM-DD)' });
      }
      if (!nonEmpty(row['external_id_cliente'])) {
        errs.push({ rowIndex, externalId, field: 'external_id_cliente', message: 'external_id_cliente requerido' });
      }
      const moneda = String(row['moneda'] || '').toUpperCase().trim();
      if (!MONEDAS.has(moneda)) {
        errs.push({ rowIndex, externalId, field: 'moneda', message: `moneda inválida (${moneda})` });
      }
      const subtotal = toNumber(row['subtotal']);
      const igv = toNumber(row['igv']);
      const total = toNumber(row['total']);
      if (!Number.isFinite(subtotal) || subtotal < 0) {
        errs.push({ rowIndex, externalId, field: 'subtotal', message: 'subtotal inválido' });
      }
      if (!Number.isFinite(igv) || igv < 0) {
        errs.push({ rowIndex, externalId, field: 'igv', message: 'igv inválido' });
      }
      if (!Number.isFinite(total) || total < 0) {
        errs.push({ rowIndex, externalId, field: 'total', message: 'total inválido' });
      }
      if (Number.isFinite(subtotal) && Number.isFinite(igv) && Number.isFinite(total)) {
        if (Math.abs(subtotal + igv - total) > 0.05) {
          errs.push({
            rowIndex,
            externalId,
            message: `subtotal + igv (${(subtotal + igv).toFixed(2)}) no coincide con total (${total.toFixed(2)})`,
          });
        }
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

    const externalCliIds = Array.from(
      new Set(parsed.rows.map((r) => nonEmpty(r['external_id_cliente'])).filter((v): v is string => !!v)),
    );
    const clienteMap = new Map<string, { id: string; razon: string; numDoc: string; tipoDoc: string }>();
    if (externalCliIds.length > 0 && !ctx.dryRun) {
      const { data: clientes, error: cliErr } = await client
        .from('clientes')
        .select('id, external_id, razon_social, codigo, ruc, tipo_documento')
        .eq('tenant_id', ctx.tenantId)
        .in('external_id', externalCliIds);
      if (cliErr) {
        result.errors.push({ rowIndex: 1, message: `Error precargando clientes: ${cliErr.message}` });
        result.errorRows = parsed.rows.length;
        return result;
      }
      (clientes ?? []).forEach((c: any) => {
        if (c.external_id) {
          clienteMap.set(c.external_id, {
            id: c.id,
            razon: c.razon_social ?? '',
            numDoc: c.ruc ?? c.codigo ?? '',
            tipoDoc: c.tipo_documento ?? 'RUC',
          });
        }
      });
    }

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
            targetTable: 'cpe',
            errorMessage: rowErrors.map((e) => e.message).join('; '),
            rawData: row,
          });
        }
        continue;
      }

      const externalCli = nonEmpty(row['external_id_cliente'])!;
      const cliente = ctx.dryRun ? null : clienteMap.get(externalCli);
      if (!ctx.dryRun && !cliente) {
        const msg = `cliente con external_id="${externalCli}" no existe. Importa clientes primero.`;
        result.errors.push({ rowIndex, externalId, message: msg });
        result.errorRows++;
        if (ctx.runCtx) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex,
            externalId,
            status: 'error',
            targetTable: 'cpe',
            errorMessage: msg,
            rawData: row,
          });
        }
        continue;
      }

      const tipoDoc = String(row['tipo_documento']).toUpperCase().trim();
      const numero = toNumber(row['numero']);
      const subtotal = toNumber(row['subtotal']);
      const igv = toNumber(row['igv']);
      const total = toNumber(row['total']);

      const payload: Record<string, any> = {
        tenant_id: ctx.tenantId,
        tipo_documento: tipoDoc,
        serie: row['serie'],
        numero,
        fecha_emision: toDateOrNull(row['fecha_emision']),
        moneda: String(row['moneda']).toUpperCase().trim(),
        tipo_cambio: 1,
        cliente_id: cliente?.id ?? null,
        documento_receptor: cliente?.numDoc ?? null,
        tipo_documento_receptor: cliente?.tipoDoc ?? null,
        razon_social_receptor: cliente?.razon ?? null,
        total_gravadas: subtotal,
        total_igv: igv,
        total_venta: total,
        subtotal,
        igv,
        total,
        estado: 'MIGRADO',
        metadata: {
          origen: 'migracion_historica',
          external_id: externalId,
          run_id: ctx.runCtx?.runId ?? null,
          observaciones: nonEmpty(row['observaciones']),
          no_sunat: true,
          no_evento_factura: true,
        },
      };

      if (ctx.dryRun) {
        result.okRows++;
        continue;
      }

      try {
        // Idempotencia: dedup por metadata.external_id (cpe no tiene columna external_id en este release;
        // si se agrega en una migración futura, cambiar este path por la columna directa).
        const { data: existing } = await client
          .from('cpe')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .eq('tipo_documento', tipoDoc)
          .eq('serie', row['serie'])
          .eq('numero', numero)
          .maybeSingle();

        let targetId: string | null = null;
        if (existing?.id) {
          const { data, error } = await client
            .from('cpe')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
            .eq('tenant_id', ctx.tenantId)
            .select('id')
            .single();
          if (error) throw error;
          targetId = data?.id ?? null;
          result.updated++;
        } else {
          const { data, error } = await client.from('cpe').insert(payload).select('id').single();
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
            targetTable: 'cpe',
            targetId,
          });
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        this.logger.warn(`Error CPE histórico fila ${rowIndex} (${externalId}): ${msg}`);
        result.errorRows++;
        result.errors.push({ rowIndex, externalId, message: msg });
        if (ctx.runCtx) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex,
            externalId,
            status: 'error',
            targetTable: 'cpe',
            errorMessage: msg,
            rawData: row,
          });
        }
      }
    }

    return result;
  }
}
