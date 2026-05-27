import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { ImporterResult, ImporterRowError } from '../dto/import.dto';
import { ParsedCsv, nonEmpty, toBoolean, toNumber, validateHeaders } from '../util/csv-parser.util';
import { toSafeIntegerDocumento, validateDocumento } from '../util/peru-doc.util';
import { Importer, ImporterContext, emptyResult } from './importer.interface';
import { MigrationRunsService } from '../migration-runs.service';

const REQUIRED = ['external_id', 'tipo', 'tipo_documento', 'numero_documento', 'razon_social'];
const TIPOS = new Set(['PERSONA', 'EMPRESA']);
const TIPOS_DOC = new Set(['DNI', 'RUC', 'CE', 'CEX', 'PASAPORTE', 'PAS']);

@Injectable()
export class ProveedoresImporter implements Importer {
  readonly runType = 'proveedores' as const;
  readonly requiredHeaders = REQUIRED;
  private readonly logger = new Logger(ProveedoresImporter.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly runs: MigrationRunsService,
  ) {}

  getTemplate() {
    const headers = [
      'external_id',
      'tipo',
      'tipo_documento',
      'numero_documento',
      'razon_social',
      'direccion',
      'email',
      'telefono',
      'sujeto_detraccion',
      'detraccion_tasa',
      'sujeto_retencion',
      'retencion_tasa',
      'pais',
    ];
    const sample = [
      'PROV-00001',
      'EMPRESA',
      'RUC',
      '20987654321',
      'PROVEEDOR DEMO SAC',
      'AV. SOL 456, AREQUIPA',
      'ventas@prov-demo.com',
      '+51 944 444 444',
      'false',
      '0.04',
      'false',
      '0.03',
      'PE',
    ];
    return {
      filename: 'plantilla_migracion_proveedores.csv',
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

      const tipo = String(row['tipo'] || '').toUpperCase().trim();
      if (!TIPOS.has(tipo)) {
        errs.push({ rowIndex, externalId, field: 'tipo', message: `tipo inválido (${tipo})` });
      }
      const tipoDoc = String(row['tipo_documento'] || '').toUpperCase().trim();
      if (!TIPOS_DOC.has(tipoDoc)) {
        errs.push({ rowIndex, externalId, field: 'tipo_documento', message: `tipo_documento inválido (${tipoDoc})` });
      }
      const numDoc = nonEmpty(row['numero_documento']);
      if (!numDoc) {
        errs.push({ rowIndex, externalId, field: 'numero_documento', message: 'numero_documento requerido' });
      } else if (TIPOS_DOC.has(tipoDoc)) {
        const docErr = validateDocumento(tipoDoc, numDoc);
        if (docErr) errs.push({ rowIndex, externalId, field: 'numero_documento', message: docErr });
      }
      if (!nonEmpty(row['razon_social'])) {
        errs.push({ rowIndex, externalId, field: 'razon_social', message: 'razon_social requerido' });
      }
      ['detraccion_tasa', 'retencion_tasa'].forEach((f) => {
        if (row[f]) {
          const v = toNumber(row[f]);
          if (!Number.isFinite(v) || v < 0 || v > 1) {
            errs.push({ rowIndex, externalId, field: f, message: `${f} fuera de rango (0..1)` });
          }
        }
      });
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
            targetTable: 'proveedores',
            errorMessage: rowErrors.map((e) => e.message).join('; '),
            rawData: row,
          });
        }
        continue;
      }

      const tipoDoc = String(row['tipo_documento']).toUpperCase().trim();
      const numDocTexto = String(row['numero_documento']).trim();
      const numDocInt = toSafeIntegerDocumento(numDocTexto);

      const payload: Record<string, any> = {
        tenant_id: ctx.tenantId,
        external_id: externalId,
        tipo: String(row['tipo']).toUpperCase().trim(),
        tipo_documento: tipoDoc,
        documento_tipo: tipoDoc,
        numero_documento: numDocInt,
        documento_numero: numDocInt,
        razon_social: row['razon_social'],
        nombre: row['razon_social'],
        codigo: numDocTexto,
        ruc: tipoDoc === 'RUC' ? numDocTexto : null,
        direccion: nonEmpty(row['direccion']),
        email: nonEmpty(row['email']),
        pais: nonEmpty(row['pais']) ?? 'PE',
        sujeto_detraccion: toBoolean(row['sujeto_detraccion'], false),
        sujeto_retencion: toBoolean(row['sujeto_retencion'], false),
        activo: true,
        estado: 'ACTIVO',
      };

      const dt = toNumber(row['detraccion_tasa']);
      if (Number.isFinite(dt) && dt > 0) payload.detraccion_tasa = dt;
      const rt = toNumber(row['retencion_tasa']);
      if (Number.isFinite(rt) && rt > 0) payload.retencion_tasa = rt;

      const tel = nonEmpty(row['telefono']);
      if (tel) payload.metadata = { telefono: tel };

      if (ctx.dryRun) {
        result.okRows++;
        continue;
      }

      try {
        const { data: existing } = await client
          .from('proveedores')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .eq('external_id', externalId)
          .maybeSingle();

        let targetId: string | null = null;
        if (existing?.id) {
          const { data, error } = await client
            .from('proveedores')
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
            .from('proveedores')
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
            targetTable: 'proveedores',
            targetId,
          });
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        this.logger.warn(`Error en fila ${rowIndex} (proveedor ${externalId}): ${msg}`);
        result.errorRows++;
        result.errors.push({ rowIndex, externalId, message: msg });
        if (ctx.runCtx) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex,
            externalId,
            status: 'error',
            targetTable: 'proveedores',
            errorMessage: msg,
            rawData: row,
          });
        }
      }
    }

    return result;
  }
}
