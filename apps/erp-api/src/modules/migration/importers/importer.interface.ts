import { ParsedCsv } from '../util/csv-parser.util';
import { ImporterResult, ImporterRowError, MigrationRunType } from '../dto/import.dto';
import { RunContext } from '../migration-runs.service';

export interface ImporterContext {
  tenantId: string;
  startedBy?: string | null;
  fechaCorte?: string | null;
  totalDeclarado?: number | null;
  dryRun: boolean;
  runCtx?: RunContext;
}

export interface Importer {
  readonly runType: MigrationRunType;
  readonly requiredHeaders: string[];
  getTemplate(): { filename: string; content: string };
  validate(parsed: ParsedCsv): ImporterRowError[];
  run(parsed: ParsedCsv, ctx: ImporterContext): Promise<ImporterResult>;
}

export function emptyResult(totalRows: number): ImporterResult {
  return {
    totalRows,
    okRows: 0,
    errorRows: 0,
    skippedRows: 0,
    errors: [],
    created: 0,
    updated: 0,
  };
}
