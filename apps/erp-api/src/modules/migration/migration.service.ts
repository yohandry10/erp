import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { MigrationRunsService } from './migration-runs.service';
import {
  FoxEnsayoDto,
  ImporterResult,
  ImporterRowError,
  MigrationImportDto,
  MigrationPreviewDto,
  MigrationRunType,
} from './dto/import.dto';
import { CsvFormatError, parseCsv } from './util/csv-parser.util';
import { Importer, ImporterContext } from './importers/importer.interface';
import { ClientesImporter } from './importers/clientes.importer';
import { ProveedoresImporter } from './importers/proveedores.importer';
import { CxcAbiertasImporter } from './importers/cxc-abiertas.importer';
import { CxpAbiertasImporter } from './importers/cxp-abiertas.importer';
import { BalanceAperturaImporter } from './importers/balance-apertura.importer';
import { filasEnsayoStock, StockInicialImporter } from './importers/stock-inicial.importer';
import { ComprobantesHistoricoImporter } from './importers/comprobantes-historico.importer';
import {
  construirLoteFox,
  mensajeFox,
  ContratosSuministroImporter,
  CronogramaSuministroImporter,
  OcSuministroImporter,
} from './importers/suministro-fox.importer';

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
    contratosImporter: ContratosSuministroImporter,
    ocImporter: OcSuministroImporter,
    cronogramaImporter: CronogramaSuministroImporter,
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
      contratosImporter,
      ocImporter,
      cronogramaImporter,
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
    const parsed = this.parseCsvFile(csv);
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
    const parsed = this.parseCsvFile(csv);
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

    await this.runs.finishRun({ runId: runCtx.runId, tenantId, result });

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

  /**
   * Ensayo FOX completo en la base y revertido: contratos, OC, cronograma y
   * stock en orden, errores por registro y conciliación contra el control.
   */
  async ensayoFox(dto: FoxEnsayoDto, tenantId: string, userId: string) {
    const lote: Record<string, unknown[]> = {};
    const errores: Array<ImporterRowError & { archivo: string }> = [];
    const archivos = [
      ['contratos', 'CONTRATO', 'contratos'],
      ['oc', 'OC', 'oc'],
      ['cronograma', 'ENTREGA', 'entregas'],
    ] as const;
    for (const [archivo, entidad, clave] of archivos) {
      const contenido = dto[archivo];
      if (!contenido) continue;
      const { registros, errores: e } = construirLoteFox(entidad, this.parseCsvFile(this.decodeCsv(contenido)));
      errores.push(...e.map((x) => ({ ...x, archivo })));
      lote[clave] = registros.map((r) => ({ id_origen: r.id_origen, fila: r.fila, payload: r.payload }));
    }
    if (dto.stock) {
      if (!dto.fechaCorte) throw new BadRequestException('fechaCorte es obligatoria para el stock inicial');
      const parsed = this.parseCsvFile(this.decodeCsv(dto.stock));
      const e = this.getImporter('stock_inicial').validate(parsed);
      errores.push(...e.map((x) => ({ ...x, archivo: 'stock' })));
      const conError = new Set(e.map((x) => x.rowIndex));
      lote.stock = conError.has(1)
        ? []
        : filasEnsayoStock(parsed, dto.fechaCorte.slice(0, 10)).filter((f) => !conError.has(f.fila));
    }
    if (!Object.keys(lote).length) throw new BadRequestException('Adjunte al menos un archivo para ensayar');
    const { data, error } = await this.supabase.getClient().rpc('ensayar_migracion_fox_580', {
      p_tenant_id: tenantId,
      p_actor_id: userId,
      p_lote: lote,
      p_control: dto.control ?? null,
    });
    if (error) foxFailure(error);
    if (!Array.isArray(data?.registros)) throw new ServiceUnavailableException('El ensayo no devolvió resultados. Reintente.');
    const registros = data.registros.map((r: { error?: string }) => (r.error ? { ...r, error: mensajeFox(r.error) } : r));
    return { success: true, data: { ...data, registros, errores_archivo: errores } };
  }

  async conciliarFox(control: Record<string, unknown>, tenantId: string, userId: string) {
    const { data, error } = await this.supabase.getClient().rpc('conciliar_migracion_fox_580', {
      p_tenant_id: tenantId,
      p_actor_id: userId,
      p_control: control,
    });
    if (error) foxFailure(error);
    if (!Array.isArray(data?.entidades)) throw new ServiceUnavailableException('La conciliación no devolvió resultados. Reintente.');
    return { success: true, data };
  }

  listRuns(tenantId: string, runType?: MigrationRunType, limit = 50) {
    return this.runs.listRuns(tenantId, runType, limit);
  }

  getRunDetail(tenantId: string, runId: string) {
    return this.runs.getRunDetail(tenantId, runId);
  }

  private parseCsvFile(csv: string) {
    try { return parseCsv(csv); }
    catch (error) {
      if (error instanceof CsvFormatError) throw new BadRequestException(error.message);
      throw error;
    }
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

function foxFailure(error: { code?: string; message?: string }): never {
  if (error.code === '42501') throw new ForbiddenException('No tiene permiso para migrar o conciliar contratos FOX.');
  if (error.code === '22023') {
    const codigo = (error.message || '').split(':')[0].trim();
    throw new BadRequestException(codigo === 'MIGRATION_FOX_CONTROL_INVALID'
      ? 'Los totales de control sólo admiten contratos, oc, entregas y stock.'
      : 'Revise el lote: entidades y archivos válidos.');
  }
  throw new ServiceUnavailableException('El servicio de migración no está disponible. Reintente.');
}
