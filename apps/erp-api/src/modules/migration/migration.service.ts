import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { MigrationRunsService } from './migration-runs.service';
import { MigrationImportDto, MigrationPreviewDto, MigrationRunType, ImporterResult } from './dto/import.dto';
import { parseCsv } from './util/csv-parser.util';
import { Importer, ImporterContext } from './importers/importer.interface';
import { ClientesImporter } from './importers/clientes.importer';
import { ProveedoresImporter } from './importers/proveedores.importer';
import { CxcAbiertasImporter } from './importers/cxc-abiertas.importer';
import { CxpAbiertasImporter } from './importers/cxp-abiertas.importer';
import { BalanceAperturaImporter } from './importers/balance-apertura.importer';
import { StockInicialImporter } from './importers/stock-inicial.importer';
import { ComprobantesHistoricoImporter } from './importers/comprobantes-historico.importer';

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);
  private readonly importers: Map<MigrationRunType, Importer>;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly runs: MigrationRunsService,
    clientesImporter: ClientesImporter,
    proveedoresImporter: ProveedoresImporter,
    cxcImporter: CxcAbiertasImporter,
    cxpImporter: CxpAbiertasImporter,
    balanceImporter: BalanceAperturaImporter,
    stockImporter: StockInicialImporter,
    comprobantesImporter: ComprobantesHistoricoImporter,
  ) {
    this.importers = new Map<MigrationRunType, Importer>();
    [
      clientesImporter,
      proveedoresImporter,
      cxcImporter,
      cxpImporter,
      balanceImporter,
      stockImporter,
      comprobantesImporter,
    ].forEach((imp) => this.importers.set(imp.runType, imp));
  }

  getImporter(runType: MigrationRunType): Importer {
    const imp = this.importers.get(runType);
    if (!imp) {
      throw new BadRequestException(`Tipo de importación no soportado: ${runType}`);
    }
    return imp;
  }

  getTemplate(runType: MigrationRunType) {
    return this.getImporter(runType).getTemplate();
  }

  preview(body: MigrationPreviewDto) {
    const csv = this.decodeCsv(body.fileBase64);
    const parsed = parseCsv(csv);
    const importer = this.getImporter(body.runType);
    const errors = importer.validate(parsed);
    return {
      success: errors.length === 0,
      totalRows: parsed.totalLines,
      errors,
      sample: parsed.rows.slice(0, 5),
      headers: parsed.headers,
      requiredHeaders: importer.requiredHeaders,
    };
  }

  async import(runType: MigrationRunType, body: MigrationImportDto, tenantId: string, userId?: string): Promise<{
    runId: string | null;
    status: string;
    result: ImporterResult;
  }> {
    const csv = this.decodeCsv(body.fileBase64);
    const parsed = parseCsv(csv);
    if (parsed.totalLines === 0) {
      throw new BadRequestException('CSV vacío');
    }

    const importer = this.getImporter(runType);

    // Validación previa cualitativa (no escribe)
    const earlyErrors = importer.validate(parsed);
    const dryRun = !!body.dryRun;

    // En dry run: NO crear migration_run; solo reportar
    if (dryRun) {
      const ctx: ImporterContext = {
        tenantId,
        startedBy: userId ?? null,
        fechaCorte: body.fechaCorte ?? null,
        totalDeclarado: body.totalDeclarado ?? null,
        dryRun: true,
      };
      const result = await importer.run(parsed, ctx);
      return { runId: null, status: 'dry_run', result };
    }

    // Persistir run
    const runCtx = await this.runs.startRun({
      tenantId,
      runType,
      startedBy: userId,
      sourceFilename: body.filename ?? null,
      fechaCorte: body.fechaCorte ?? null,
      totalRows: parsed.totalLines,
      totalDeclarado: body.totalDeclarado ?? null,
      dryRun: false,
    });

    let result: ImporterResult;
    try {
      const ctx: ImporterContext = {
        tenantId,
        startedBy: userId ?? null,
        fechaCorte: body.fechaCorte ?? null,
        totalDeclarado: body.totalDeclarado ?? null,
        dryRun: false,
        runCtx,
      };
      result = await importer.run(parsed, ctx);
    } catch (err: any) {
      this.logger.error(`Run ${runCtx.runId} falló: ${err?.message}`);
      result = {
        totalRows: parsed.totalLines,
        okRows: 0,
        errorRows: parsed.totalLines,
        skippedRows: 0,
        errors: [{ rowIndex: 1, message: `Error inesperado: ${err?.message ?? err}` }],
        created: 0,
        updated: 0,
      };
    }

    await this.runs.finishRun({ runId: runCtx.runId, result });

    return {
      runId: runCtx.runId,
      status: result.errorRows === 0 ? 'completed' : result.okRows === 0 ? 'failed' : 'partial',
      result: { ...result, errors: [...earlyErrors, ...result.errors].slice(0, 200) },
    };
  }

  async validarApertura(tenantId: string, fechaCorte?: string) {
    const { data, error } = await this.supabase
      .getClient()
      .rpc('validar_migracion_apertura', {
        p_tenant_id: tenantId,
        p_fecha_corte: fechaCorte ?? null,
      });
    if (error) {
      throw new BadRequestException(`Error invocando validador: ${error.message}`);
    }
    const checks = (data ?? []) as Array<{ check_name: string; status: string; detalle: string; expected: number; actual: number; diff: number }>;
    const summary = {
      total: checks.length,
      ok: checks.filter((c) => c.status === 'OK').length,
      fail: checks.filter((c) => c.status === 'FAIL').length,
      skip: checks.filter((c) => c.status === 'SKIP').length,
    };
    return { summary, checks };
  }

  listRuns(tenantId: string, runType?: MigrationRunType, limit = 50) {
    return this.runs.listRuns(tenantId, runType, limit);
  }

  getRunDetail(tenantId: string, runId: string) {
    return this.runs.getRunDetail(tenantId, runId);
  }

  private decodeCsv(fileBase64: string): string {
    const normalized = fileBase64.replace(/\s+/g, '');
    if (
      normalized.length === 0 ||
      normalized.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) ||
      /=[A-Za-z0-9+/]/.test(normalized)
    ) {
      throw new BadRequestException('fileBase64 inválido (no es base64)');
    }

    const buffer = Buffer.from(normalized, 'base64');
    if (buffer.toString('base64') !== normalized) {
      throw new BadRequestException('fileBase64 inválido (no es base64)');
    }

    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw new BadRequestException('fileBase64 inválido (debe contener CSV UTF-8)');
    }
  }
}
