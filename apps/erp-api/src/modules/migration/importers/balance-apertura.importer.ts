import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { ImporterResult, ImporterRowError } from '../dto/import.dto';
import { ParsedCsv, nonEmpty, toNumber, validateHeaders } from '../util/csv-parser.util';
import { Importer, ImporterContext, emptyResult } from './importer.interface';
import { MigrationRunsService } from '../migration-runs.service';

const REQUIRED = ['cuenta_contable_codigo', 'debe', 'haber'];

@Injectable()
export class BalanceAperturaImporter implements Importer {
  readonly runType = 'balance_apertura' as const;
  readonly requiredHeaders = REQUIRED;
  private readonly logger = new Logger(BalanceAperturaImporter.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly runs: MigrationRunsService,
  ) {}

  getTemplate() {
    const headers = [...REQUIRED, 'centro_costo_codigo', 'descripcion'];
    const sample = [
      ['1011', '50000.00', '0.00', '', 'Saldo inicial caja'],
      ['1041', '120000.00', '0.00', '', 'Saldo inicial banco BCP'],
      ['1212', '85000.00', '0.00', '', 'CxC clientes (resumen migración)'],
      ['4212', '0.00', '70000.00', '', 'CxP proveedores (resumen migración)'],
      ['5011', '0.00', '185000.00', '', 'Capital social'],
    ];
    return {
      filename: 'plantilla_migracion_balance_apertura.csv',
      content: [headers.join(','), ...sample.map((r) => r.join(','))].join('\n') + '\n',
    };
  }

  validate(parsed: ParsedCsv): ImporterRowError[] {
    const errs: ImporterRowError[] = [];
    const headerErrs = validateHeaders(parsed.headers, REQUIRED);
    headerErrs.forEach((m) => errs.push({ rowIndex: 1, message: m }));
    if (headerErrs.length > 0) return errs;

    let sumDebe = 0;
    let sumHaber = 0;
    parsed.rows.forEach((row, idx) => {
      const rowIndex = idx + 2;
      const cuenta = nonEmpty(row['cuenta_contable_codigo']);
      if (!cuenta) {
        errs.push({ rowIndex, field: 'cuenta_contable_codigo', message: 'cuenta_contable_codigo requerido' });
      }
      const debe = toNumber(row['debe']);
      const haber = toNumber(row['haber']);
      if (!Number.isFinite(debe) || debe < 0) {
        errs.push({ rowIndex, field: 'debe', message: 'debe inválido (>=0)' });
      }
      if (!Number.isFinite(haber) || haber < 0) {
        errs.push({ rowIndex, field: 'haber', message: 'haber inválido (>=0)' });
      }
      if (Number.isFinite(debe) && Number.isFinite(haber)) {
        if (debe > 0 && haber > 0) {
          errs.push({ rowIndex, message: 'Una fila no puede tener debe y haber simultáneamente > 0' });
        }
        if (debe === 0 && haber === 0) {
          errs.push({ rowIndex, message: 'Una fila debe tener debe o haber > 0' });
        }
        sumDebe += debe;
        sumHaber += haber;
      }
    });

    if (parsed.rows.length > 0 && Math.abs(sumDebe - sumHaber) > 0.01) {
      errs.push({
        rowIndex: 1,
        message: `Balance de apertura no cuadra: sum(debe)=${sumDebe.toFixed(2)} vs sum(haber)=${sumHaber.toFixed(2)} (diff=${(sumDebe - sumHaber).toFixed(2)})`,
      });
    }

    return errs;
  }

  async run(parsed: ParsedCsv, ctx: ImporterContext): Promise<ImporterResult> {
    const result = emptyResult(parsed.rows.length);

    if (!ctx.fechaCorte) {
      result.errors.push({ rowIndex: 1, message: 'fechaCorte es obligatoria para balance de apertura' });
      result.errorRows = parsed.rows.length;
      return result;
    }

    const preErrs = this.validate(parsed);
    if (preErrs.length > 0) {
      result.errors = preErrs;
      result.errorRows = preErrs.length;
      // No procesar si hay errores: balance de apertura es atómico
      return result;
    }

    const client = this.supabase.getClient();

    // Pre-cargar plan_cuentas
    const codigos = Array.from(new Set(parsed.rows.map((r) => nonEmpty(r['cuenta_contable_codigo'])!).filter(Boolean)));
    const { data: cuentas, error: ctaErr } = await client
      .from('plan_cuentas')
      .select('id, codigo')
      .eq('tenant_id', ctx.tenantId)
      .in('codigo', codigos);
    if (ctaErr) {
      result.errors.push({ rowIndex: 1, message: `Error cargando plan_cuentas: ${ctaErr.message}` });
      result.errorRows = parsed.rows.length;
      return result;
    }
    const cuentaMap = new Map<string, string>();
    (cuentas ?? []).forEach((c) => cuentaMap.set(c.codigo, c.id));
    const missing = codigos.filter((c) => !cuentaMap.has(c));
    if (missing.length > 0) {
      result.errors.push({
        rowIndex: 1,
        message: `Cuentas contables no encontradas en el plan de cuentas: ${missing.join(', ')}. Importa primero el plan de cuentas o créalas manualmente.`,
      });
      result.errorRows = parsed.rows.length;
      return result;
    }

    // Pre-cargar centros_costo si vienen
    const ccCodigos = Array.from(new Set(parsed.rows.map((r) => nonEmpty(r['centro_costo_codigo'])).filter((v): v is string => !!v)));
    const ccMap = new Map<string, string>();
    if (ccCodigos.length > 0) {
      const { data: ccs } = await client
        .from('centros_costo')
        .select('id, codigo')
        .eq('tenant_id', ctx.tenantId)
        .in('codigo', ccCodigos);
      (ccs ?? []).forEach((c) => ccMap.set(c.codigo, c.id));
      const missingCc = ccCodigos.filter((c) => !ccMap.has(c));
      if (missingCc.length > 0) {
        result.errors.push({
          rowIndex: 1,
          message: `Centros de costo no encontrados: ${missingCc.join(', ')}`,
        });
        result.errorRows = parsed.rows.length;
        return result;
      }
    }

    if (ctx.dryRun) {
      result.okRows = parsed.rows.length;
      return result;
    }

    const externalIdAsiento = `APERTURA-${ctx.fechaCorte}`;
    let totalDebe = 0;
    let totalHaber = 0;
    parsed.rows.forEach((r) => {
      totalDebe += toNumber(r['debe']);
      totalHaber += toNumber(r['haber']);
    });

    // Idempotencia: si ya existe un asiento APERTURA con este external_id, borrar su detalle y re-crear
    try {
      const { data: existing } = await client
        .from('asientos_contables')
        .select('id')
        .eq('tenant_id', ctx.tenantId)
        .eq('external_id', externalIdAsiento)
        .maybeSingle();

      if (existing?.id) {
        await client
          .from('detalle_asientos')
          .delete()
          .eq('tenant_id', ctx.tenantId)
          .eq('asiento_id', existing.id);
        await client
          .from('asientos_contables')
          .delete()
          .eq('tenant_id', ctx.tenantId)
          .eq('id', existing.id);
      }

      // numero_asiento secuencial por (tenant, fecha)
      const { data: maxRow } = await client
        .from('asientos_contables')
        .select('numero_asiento')
        .eq('tenant_id', ctx.tenantId)
        .gte('fecha', `${ctx.fechaCorte}T00:00:00Z`)
        .lte('fecha', `${ctx.fechaCorte}T23:59:59Z`)
        .order('numero_asiento', { ascending: false })
        .limit(1);
      const siguienteNumero = ((maxRow?.[0] as any)?.numero_asiento ?? 0) + 1;

      const { data: asiento, error: asErr } = await client
        .from('asientos_contables')
        .insert({
          tenant_id: ctx.tenantId,
          external_id: externalIdAsiento,
          numero_asiento: siguienteNumero,
          tipo_asiento: 'APERTURA',
          fecha: `${ctx.fechaCorte}T00:00:00Z`,
          referencia: externalIdAsiento,
          origen: 'MIGRACION',
          concepto: `Asiento de apertura por migración (${ctx.fechaCorte})`,
          descripcion: `Saldos iniciales migrados desde ERP externo al ${ctx.fechaCorte}`,
          total_debe: totalDebe,
          total_haber: totalHaber,
          estado: 'confirmado',
          created_by: ctx.startedBy ?? null,
          usuario_id: ctx.startedBy ?? null,
          metadata: {
            origen: 'migracion_apertura',
            run_id: ctx.runCtx?.runId ?? null,
            fecha_corte: ctx.fechaCorte,
          },
        })
        .select('id')
        .single();
      if (asErr || !asiento) throw asErr ?? new Error('No se pudo crear asiento de apertura');

      const detalleRows = parsed.rows.map((row, idx) => {
        const cuentaId = cuentaMap.get(row['cuenta_contable_codigo'])!;
        const ccCod = nonEmpty(row['centro_costo_codigo']);
        return {
          tenant_id: ctx.tenantId,
          asiento_id: asiento.id,
          cuenta_id: cuentaId,
          centro_costo_id: ccCod ? ccMap.get(ccCod) : null,
          debe: toNumber(row['debe']),
          haber: toNumber(row['haber']),
          fecha: `${ctx.fechaCorte}T00:00:00Z`,
          descripcion: nonEmpty(row['descripcion']),
          estado: 'ACTIVO',
          metadata: { row_index: idx + 2 },
        };
      });

      const { error: detErr } = await client.from('detalle_asientos').insert(detalleRows);
      if (detErr) {
        // Rollback manual del asiento si falla el detalle
        await client.from('asientos_contables').delete().eq('id', asiento.id);
        throw detErr;
      }

      result.created = 1;
      result.okRows = parsed.rows.length;
      // Registrar cada fila como OK
      if (ctx.runCtx) {
        for (let i = 0; i < parsed.rows.length; i++) {
          await this.runs.recordRow({
            runId: ctx.runCtx.runId,
            tenantId: ctx.tenantId,
            rowIndex: i + 2,
            status: 'ok',
            targetTable: 'detalle_asientos',
            targetId: asiento.id,
          });
        }
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      this.logger.error(`Error creando asiento de apertura: ${msg}`);
      result.errorRows = parsed.rows.length;
      result.errors.push({ rowIndex: 1, message: `No se pudo crear asiento de apertura: ${msg}` });
    }

    return result;
  }
}
