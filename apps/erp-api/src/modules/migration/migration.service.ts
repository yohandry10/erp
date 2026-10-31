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
  OrigenEnsayoDto,
  ImporterResult,
  ImporterRowError,
  MigrationImportDto,
  MigrationPreviewDto,
  MigrationRunType,
} from './dto/import.dto';
import { CsvFormatError, nonEmpty, parseCsv, toNumber } from './util/csv-parser.util';
import { Importer, ImporterContext } from './importers/importer.interface';
import { ClientesImporter, payloadCliente } from './importers/clientes.importer';
import { ProveedoresImporter, payloadProveedor } from './importers/proveedores.importer';
import { CxcAbiertasImporter, payloadDocumentoApertura } from './importers/cxc-abiertas.importer';
import { CxpAbiertasImporter } from './importers/cxp-abiertas.importer';
import { BalanceAperturaImporter } from './importers/balance-apertura.importer';
import { filasEnsayoStock, StockInicialImporter } from './importers/stock-inicial.importer';
import { ComprobantesHistoricoImporter } from './importers/comprobantes-historico.importer';
import {
  mensajeOrigen,
  ContratosSuministroImporter,
  CronogramaSuministroImporter,
  OcSuministroImporter,
  SPECS,
  SpecOrigen,
  construirLote,
} from './importers/suministro-origen.importer';
import { MaestrosOrigenImporters, SPECS_MAESTROS } from './importers/maestros-origen.importer';

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
    maestrosOrigen: MaestrosOrigenImporters,
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
      ...maestrosOrigen.todos,
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
        sistemaOrigen: body.sistemaOrigen ?? null,
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
        sistemaOrigen: body.sistemaOrigen ?? null,
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
   * Ensayo integral en la base y revertido: terceros, maestros, saldos
   * abiertos, balance, suministro y stock en el orden real, con las mismas
   * validaciones y payloads de cada importador, errores por registro y
   * conciliación contra el control.
   */
  async ensayoOrigen(dto: OrigenEnsayoDto, tenantId: string, userId: string) {
    const lote: Record<string, unknown[]> = {};
    const errores: Array<ImporterRowError & { archivo: string }> = [];
    const leer = (archivo: keyof OrigenEnsayoDto) => this.parseCsvFile(this.decodeCsv(dto[archivo] as string));
    const anotar = (archivo: string, e: ImporterRowError[]) => {
      errores.push(...e.map((x) => ({ ...x, archivo })));
      return new Set(e.map((x) => x.rowIndex));
    };
    const fechaCorte = dto.fechaCorte?.slice(0, 10) ?? null;
    if ((dto.cxc || dto.cxp || dto.balance || dto.stock) && !fechaCorte)
      throw new BadRequestException('fechaCorte es obligatoria para saldos abiertos, balance y stock inicial');

    const terceros = [['clientes', 'clientes', payloadCliente], ['proveedores', 'proveedores', payloadProveedor]] as const;
    for (const [archivo, runType, armar] of terceros) {
      if (!dto[archivo]) continue;
      const parsed = leer(archivo);
      const conError = anotar(archivo, this.getImporter(runType).validate(parsed));
      lote[archivo] = conError.has(1) ? [] : parsed.rows
        .map((row, i) => ({ id_origen: nonEmpty(row.external_id), fila: i + 2, payload: armar(row) }))
        .filter((r) => !conError.has(r.fila));
    }
    const documentos = [['cxc', 'cxc_abiertas', 'external_id_cliente'], ['cxp', 'cxp_abiertas', 'external_id_proveedor']] as const;
    for (const [archivo, runType, tercero] of documentos) {
      if (!dto[archivo]) continue;
      const parsed = leer(archivo);
      const conError = anotar(archivo, this.getImporter(runType).validate(parsed));
      lote[archivo] = conError.has(1) ? [] : parsed.rows
        .map((row, i) => ({ id_origen: nonEmpty(row.external_id), fila: i + 2,
          payload: { ...payloadDocumentoApertura(row), codigo_tercero: (row[tercero] ?? '').trim() } }))
        .filter((r) => !conError.has(r.fila));
    }
    if (dto.balance) {
      // Un solo asiento: una fila inválida invalida el balance completo.
      const parsed = leer('balance');
      const conError = anotar('balance', this.getImporter('balance_apertura').validate(parsed));
      lote.balance = conError.size ? [] : parsed.rows.map((row, i) => ({ fila: i + 2, payload: {
        cuenta_contable_codigo: row.cuenta_contable_codigo.trim(), debe: toNumber(row.debe), haber: toNumber(row.haber),
        centro_costo_codigo: nonEmpty(row.centro_costo_codigo), descripcion: nonEmpty(row.descripcion),
      } }));
    }
    const especificos: Array<[keyof OrigenEnsayoDto, SpecOrigen]> = [
      ['almacenes', SPECS_MAESTROS.ALMACEN], ['plan_cuentas', SPECS_MAESTROS.CUENTA_CONTABLE], ['productos', SPECS_MAESTROS.PRODUCTO],
      ['cuentas_bancarias', SPECS_MAESTROS.CUENTA_BANCARIA], ['listas_precios', SPECS_MAESTROS.LISTA_PRECIOS],
      ['contratos', SPECS.CONTRATO], ['oc', SPECS.OC], ['cronograma', SPECS.ENTREGA],
      ['oc_compra', SPECS_MAESTROS.OC_COMPRA], ['pedidos_venta', SPECS_MAESTROS.PEDIDO_VENTA],
    ];
    for (const [archivo, spec] of especificos) {
      if (!dto[archivo]) continue;
      const { registros, errores: e } = construirLote(spec, leer(archivo));
      anotar(archivo, e);
      lote[spec.claveLote] = registros.map((r) => ({ id_origen: r.id_origen, fila: r.fila, payload: r.payload }));
    }
    if (dto.stock && fechaCorte) {
      const parsed = leer('stock');
      const conError = anotar('stock', this.getImporter('stock_inicial').validate(parsed));
      lote.stock = conError.has(1)
        ? []
        : filasEnsayoStock(parsed, fechaCorte).filter((f) => !conError.has(f.fila));
    }
    if (!Object.keys(lote).length) throw new BadRequestException('Adjunte al menos un archivo para ensayar');
    const { data, error } = await this.supabase.getLongRunningClient().rpc('ensayar_migracion_origen_582', {
      p_tenant_id: tenantId,
      p_actor_id: userId,
      p_lote: lote,
      p_control: dto.control ?? null,
      p_fecha_corte: fechaCorte,
      ...(dto.sistemaOrigen ? { p_origen: dto.sistemaOrigen } : {}),
    });
    if (error) origenFailure(error);
    if (!Array.isArray(data?.registros)) throw new ServiceUnavailableException('El ensayo no devolvió resultados. Reintente.');
    const registros = data.registros.map((r: { error?: string }) => (r.error ? { ...r, error: mensajeOrigen(r.error) } : r));
    return { success: true, data: { ...data, registros, errores_archivo: errores } };
  }

  async conciliarOrigen(control: Record<string, unknown>, tenantId: string, userId: string, sistemaOrigen?: string) {
    const { data, error } = await this.supabase.getLongRunningClient().rpc('conciliar_migracion_origen_582', {
      p_tenant_id: tenantId,
      p_actor_id: userId,
      p_control: control,
      ...(sistemaOrigen ? { p_origen: sistemaOrigen } : {}),
    });
    if (error) origenFailure(error);
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

/** Entidades que la conciliación 582 compara contra el extracto. */
export const CONTROL_ORIGEN = ['clientes', 'proveedores', 'almacenes', 'cuentas_contables', 'productos', 'cuentas_bancarias',
  'listas_precios', 'cxc', 'cxp', 'balance', 'stock', 'contratos', 'oc', 'entregas', 'oc_compra', 'pedidos_venta'];

function origenFailure(error: { code?: string; message?: string }): never {
  if (error.code === '42501') throw new ForbiddenException('No tiene permiso para migrar o conciliar desde el sistema anterior.');
  if (error.code === '22023') {
    const codigo = (error.message || '').split(':')[0].trim();
    if (codigo === 'MIGRATION_SOURCE_NAME_INVALID') throw new BadRequestException('El sistema de origen admite de 2 a 30 letras, números, espacios, punto, guion o guion bajo.');
    throw new BadRequestException(codigo === 'MIGRATION_SOURCE_CONTROL_INVALID'
      ? `Los totales de control sólo admiten: ${CONTROL_ORIGEN.join(', ')}.`
      : 'Revise el lote: entidades y archivos válidos.');
  }
  throw new ServiceUnavailableException('El servicio de migración no está disponible. Reintente.');
}
