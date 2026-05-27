import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { MigrationRunType, ImporterResult, ImporterRowError } from './dto/import.dto';

export interface RunContext {
  runId: string;
  tenantId: string;
  runType: MigrationRunType;
}

@Injectable()
export class MigrationRunsService {
  private readonly logger = new Logger(MigrationRunsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async startRun(opts: {
    tenantId: string;
    runType: MigrationRunType;
    startedBy?: string | null;
    sourceFilename?: string | null;
    fechaCorte?: string | null;
    totalRows: number;
    totalDeclarado?: number | null;
    dryRun?: boolean;
  }): Promise<RunContext> {
    const { data, error } = await this.supabase
      .getClient()
      .from('migration_runs')
      .insert({
        tenant_id: opts.tenantId,
        run_type: opts.runType,
        status: 'in_progress',
        total_rows: opts.totalRows,
        ok_rows: 0,
        error_rows: 0,
        skipped_rows: 0,
        fecha_corte: opts.fechaCorte ?? null,
        source_filename: opts.sourceFilename ?? null,
        started_by: opts.startedBy ?? null,
        metadata: {
          total_declarado: opts.totalDeclarado ?? null,
          dry_run: !!opts.dryRun,
        },
      })
      .select('id')
      .single();

    if (error || !data) {
      this.logger.error(`No se pudo crear migration_run: ${error?.message}`);
      throw new Error(`No se pudo iniciar el run de migración: ${error?.message}`);
    }
    return { runId: data.id, tenantId: opts.tenantId, runType: opts.runType };
  }

  async recordRow(opts: {
    runId: string;
    tenantId: string;
    rowIndex: number;
    externalId?: string | null;
    status: 'ok' | 'error' | 'skipped';
    targetTable?: string;
    targetId?: string | null;
    errorMessage?: string | null;
    rawData?: Record<string, any>;
  }): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('migration_run_rows')
      .insert({
        run_id: opts.runId,
        tenant_id: opts.tenantId,
        row_index: opts.rowIndex,
        external_id: opts.externalId ?? null,
        status: opts.status,
        target_table: opts.targetTable ?? null,
        target_id: opts.targetId ?? null,
        error_message: opts.errorMessage ?? null,
        raw_data: opts.rawData ?? null,
      });
    if (error) {
      // No fallar la migración por un fallo en logging; solo loguear
      this.logger.warn(`No se pudo registrar migration_run_row: ${error.message}`);
    }
  }

  async finishRun(opts: {
    runId: string;
    result: ImporterResult;
    extraMetadata?: Record<string, any>;
  }): Promise<void> {
    const { result } = opts;
    const status =
      result.errorRows === 0 && result.okRows > 0
        ? 'completed'
        : result.okRows === 0 && result.errorRows > 0
          ? 'failed'
          : result.errorRows > 0
            ? 'partial'
            : 'completed';

    const errorsSummary = result.errors.slice(0, 50);

    const { error } = await this.supabase
      .getClient()
      .from('migration_runs')
      .update({
        status,
        ok_rows: result.okRows,
        error_rows: result.errorRows,
        skipped_rows: result.skippedRows,
        finished_at: new Date().toISOString(),
        errors_summary: errorsSummary,
        metadata: {
          created: result.created,
          updated: result.updated,
          ...(opts.extraMetadata ?? {}),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', opts.runId);

    if (error) {
      this.logger.error(`No se pudo finalizar migration_run ${opts.runId}: ${error.message}`);
    }
  }

  async listRuns(tenantId: string, runType?: MigrationRunType, limit = 50): Promise<any[]> {
    let q = this.supabase
      .getClient()
      .from('migration_runs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('started_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200));
    if (runType) q = q.eq('run_type', runType);
    const { data, error } = await q;
    if (error) {
      this.logger.error(`Error listando runs: ${error.message}`);
      return [];
    }
    return data ?? [];
  }

  async getRunDetail(tenantId: string, runId: string): Promise<{ run: any; rows: any[] } | null> {
    const { data: run, error: runErr } = await this.supabase
      .getClient()
      .from('migration_runs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', runId)
      .maybeSingle();
    if (runErr || !run) return null;
    const { data: rows, error: rowsErr } = await this.supabase
      .getClient()
      .from('migration_run_rows')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('run_id', runId)
      .order('row_index', { ascending: true })
      .limit(2000);
    if (rowsErr) {
      this.logger.warn(`No se pudieron leer filas del run ${runId}: ${rowsErr.message}`);
    }
    return { run, rows: rows ?? [] };
  }
}
