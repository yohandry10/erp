import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { ImporterResult, ImporterRowError } from '../dto/import.dto';
import { ParsedCsv, nonEmpty, toNumber, validateHeaders } from '../util/csv-parser.util';
import { validateDocumento } from '../util/peru-doc.util';
import { Importer, ImporterContext, emptyResult } from './importer.interface';
import { MigrationRunsService } from '../migration-runs.service';

const REQUIRED = ['external_id', 'tipo', 'tipo_documento', 'numero_documento', 'razon_social'];

const TIPOS = new Set(['PERSONA', 'EMPRESA']);
const TIPOS_DOC = new Set(['DNI', 'RUC', 'CE', 'CEX', 'PASAPORTE', 'PAS']);

@Injectable()
export class ClientesImporter implements Importer {
  readonly runType = 'clientes' as const;
  readonly requiredHeaders = REQUIRED;
  private readonly logger = new Logger(ClientesImporter.name);

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
      'limite_credito',
      'pais',
    ];
    const sample = [
      'CLI-00001',
      'EMPRESA',
      'RUC',
      '20123456789',
      'EMPRESA DEMO SAC',
      'AV. EJEMPLO 123, LIMA',
      'contacto@demo.com',
      '+51 999 999 999',
      '5000.00',
      'PE',
    ];
    return {
      filename: 'plantilla_migracion_clientes.csv',
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
        errs.push({ rowIndex, externalId, message: `external_id duplicado dentro del archivo: ${externalId}` });
      }
      seen.add(externalId);

      const tipo = String(row['tipo'] || '').toUpperCase().trim();
      if (!TIPOS.has(tipo)) {
        errs.push({ rowIndex, externalId, field: 'tipo', message: `tipo inválido (${tipo}). Debe ser PERSONA o EMPRESA` });
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
        else if (numDoc.length < 6 || numDoc.length > 20) {
          errs.push({
            rowIndex,
            externalId,
            field: 'numero_documento',
            message: 'numero_documento debe tener entre 6 y 20 caracteres para el maestro canónico',
          });
        }
      }
      if (!nonEmpty(row['razon_social'])) {
        errs.push({ rowIndex, externalId, field: 'razon_social', message: 'razon_social requerido' });
      }
      if (row['limite_credito']) {
        const lc = toNumber(row['limite_credito']);
        if (!Number.isFinite(lc) || lc < 0) {
          errs.push({ rowIndex, externalId, field: 'limite_credito', message: 'limite_credito inválido' });
        }
      }
      if (row['email'] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row['email'])) {
        errs.push({ rowIndex, externalId, field: 'email', message: 'email inválido' });
      }
    });
    return errs;
  }

  async run(parsed: ParsedCsv, ctx: ImporterContext): Promise<ImporterResult> {
    const result = emptyResult(parsed.rows.length);
    const preErrs = this.validate(parsed);
    if (preErrs.length > 0 && preErrs.some((e) => e.rowIndex === 1)) {
      // Falló validación de encabezados → no procesar
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
            targetTable: 'clientes',
            errorMessage: rowErrors.map((e) => e.message).join('; '),
            rawData: row,
          });
        }
        continue;
      }

      const tipoDoc = String(row['tipo_documento']).toUpperCase().trim();
      const numDocTexto = String(row['numero_documento']).trim();
      const payload: Record<string, any> = {
        tipo: String(row['tipo']).toUpperCase().trim(),
        documento_tipo: tipoDoc,
        documento_identidad: numDocTexto,
        documento_numero: numDocTexto,
        razon_social: row['razon_social'],
        direccion: nonEmpty(row['direccion']),
        email: nonEmpty(row['email']),
        pais: nonEmpty(row['pais']) ?? 'PE',
        telefono: nonEmpty(row['telefono']),
      };

      const lc = toNumber(row['limite_credito']);
      if (Number.isFinite(lc) && lc > 0) {
        payload.limite_credito = lc;
      }

      if (ctx.dryRun) {
        result.okRows++;
        continue;
      }

      try {
        const { data, error } = await client.rpc('importar_cliente_historico_tx', {
          p_tenant_id: ctx.tenantId,
          p_actor_id: ctx.startedBy,
          p_run_id: ctx.runCtx?.runId ?? null,
          p_external_id: externalId,
          p_cliente: payload,
        });
        if (error) throw error;
        const targetId = data?.id ?? null;
        const action = String(data?.action ?? '');
        if (action === 'CREATED') result.created++;
        else if (action === 'IDEMPOTENT') result.skippedRows++;
        else result.updated++;
        if (action !== 'IDEMPOTENT') result.okRows++;
        if (ctx.runCtx) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex,
            externalId,
            status: action === 'IDEMPOTENT' ? 'skipped' : 'ok',
            targetTable: 'clientes',
            targetId,
            errorMessage: action === 'IDEMPOTENT' ? 'Fila ya aplicada con la misma huella' : null,
          });
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        this.logger.warn(`Error en fila ${rowIndex} (cliente ${externalId}): ${msg}`);
        result.errorRows++;
        result.errors.push({ rowIndex, externalId, message: msg });
        if (ctx.runCtx) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex,
            externalId,
            status: 'error',
            targetTable: 'clientes',
            errorMessage: msg,
            rawData: row,
          });
        }
      }
    }

    return result;
  }
}
