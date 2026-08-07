import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EstadosFinancierosService } from './estados-financieros.service';
import { AdvertenciaTributaria, normalizarRegimenPeru } from './tributos-mensuales.service';

export interface AjustesTributariosAnuales {
  adiciones_tributarias?: number;
  deducciones_tributarias?: number;
  perdidas_compensables?: number;
  pagos_cuenta_renta?: number;
  credito_itan_renta?: number;
  otros_creditos_renta?: number;
  deducciones_itan?: number;
  notas?: string;
}

export interface FuentesTributariasAnuales {
  ingresos_netos: number;
  resultado_contable: number;
  activos_netos: number;
  pagos_cuenta_renta: number;
  ejercicio_cerrado: boolean;
  balance_descuadrado?: boolean;
  diferencia_balance?: number;
}

const UIT_POR_EJERCICIO: Record<number, number> = {
  2024: 5150,
  2025: 5350,
  2026: 5500,
};

function roundMoney(value: unknown, clamp = true): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  const rounded = Math.round(parsed * 100) / 100;
  return clamp ? Math.max(rounded, 0) : rounded;
}

export function calcularRentaAnualItanPeru(
  ejercicio: number,
  regimen: 'MYPE' | 'GENERAL',
  fuentes: FuentesTributariasAnuales,
  ajustes: AjustesTributariosAnuales = {},
) {
  const uit = UIT_POR_EJERCICIO[ejercicio];
  if (!uit) {
    throw new BadRequestException(`No hay UIT verificada para el ejercicio ${ejercicio}.`);
  }
  const warnings: AdvertenciaTributaria[] = [];
  const ingresosNetos = roundMoney(fuentes.ingresos_netos);
  const resultadoContable = roundMoney(fuentes.resultado_contable, false);
  const adiciones = roundMoney(ajustes.adiciones_tributarias);
  const deducciones = roundMoney(ajustes.deducciones_tributarias);
  const perdidas = roundMoney(ajustes.perdidas_compensables);
  const rentaNeta = roundMoney(resultadoContable + adiciones - deducciones - perdidas);
  const limiteRmt = 15 * uit;
  const impuestoRenta = regimen === 'MYPE'
    ? roundMoney(Math.min(rentaNeta, limiteRmt) * 0.10 + Math.max(rentaNeta - limiteRmt, 0) * 0.295)
    : roundMoney(rentaNeta * 0.295);
  const pagosCuenta = ajustes.pagos_cuenta_renta === undefined
    ? roundMoney(fuentes.pagos_cuenta_renta)
    : roundMoney(ajustes.pagos_cuenta_renta);
  const creditoItan = roundMoney(ajustes.credito_itan_renta);
  const otrosCreditos = roundMoney(ajustes.otros_creditos_renta);
  const diferenciaRenta = roundMoney(impuestoRenta - pagosCuenta - creditoItan - otrosCreditos, false);
  const activosNetos = roundMoney(fuentes.activos_netos);
  const deduccionesItan = roundMoney(ajustes.deducciones_itan);
  const activosAjustados = roundMoney(activosNetos - deduccionesItan);
  const baseItan = roundMoney(activosAjustados - 1_000_000);
  const itan = roundMoney(baseItan * 0.004);
  const formulario = ingresosNetos > 1700 * uit ? 'FV710_COMPLETO' : 'FV710_SIMPLIFICADO';

  if (!fuentes.ejercicio_cerrado) {
    warnings.push({
      codigo: 'EJERCICIO_NO_CERRADO',
      mensaje: 'Diciembre no figura cerrado; el resultado y los activos todavía pueden cambiar.',
      bloquea_presentacion: true,
    });
  }
  if (fuentes.balance_descuadrado) {
    warnings.push({
      codigo: 'BALANCE_DESCUADRADO',
      mensaje: `La ecuación contable presenta una diferencia de S/ ${roundMoney(fuentes.diferencia_balance, false).toFixed(2)}.`,
      bloquea_presentacion: true,
    });
  }
  if (resultadoContable < 0 && rentaNeta > 0) {
    warnings.push({
      codigo: 'PERDIDA_CONTABLE_CON_RENTA',
      mensaje: 'Las adiciones generan renta imponible pese a la pérdida contable; documente cada reparación tributaria.',
    });
  }
  warnings.push({
    codigo: 'CONCILIACION_MANUAL',
    mensaje: 'Adiciones, deducciones, pérdidas y exclusiones ITAN deben sustentarse con papeles de trabajo y asesoría tributaria.',
  });
  if (formulario === 'FV710_COMPLETO') {
    warnings.push({
      codigo: 'BALANCE_FV710_COMPLETO',
      mensaje: 'Los ingresos superan 1,700 UIT; prepare también el balance de comprobación y anexos del FV 710 Completo.',
    });
  }

  return {
    ejercicio,
    regimen,
    formulario,
    uit,
    ingresos_netos: ingresosNetos,
    resultado_contable: resultadoContable,
    adiciones_tributarias: adiciones,
    deducciones_tributarias: deducciones,
    perdidas_compensables: perdidas,
    renta_neta_imponible: rentaNeta,
    impuesto_renta_calculado: impuestoRenta,
    pagos_cuenta_renta: pagosCuenta,
    credito_itan_renta: creditoItan,
    otros_creditos_renta: otrosCreditos,
    renta_por_pagar: roundMoney(diferenciaRenta),
    saldo_favor_renta: roundMoney(-diferenciaRenta),
    activos_netos: activosNetos,
    deducciones_itan: deduccionesItan,
    base_imponible_itan: baseItan,
    itan_calculado: itan,
    warnings,
  };
}

@Injectable()
export class TributosAnualesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly estadosFinancieros: EstadosFinancierosService,
  ) {}

  private validarEjercicio(ejercicio: number): number {
    const parsed = Number(ejercicio);
    if (!Number.isInteger(parsed) || parsed < 2024 || parsed > new Date().getFullYear()) {
      throw new BadRequestException('El ejercicio debe ser un año soportado entre 2024 y el año actual.');
    }
    if (!UIT_POR_EJERCICIO[parsed]) {
      throw new BadRequestException(`No hay UIT verificada para el ejercicio ${parsed}.`);
    }
    return parsed;
  }

  private async configuracion(tenantId: string): Promise<'MYPE' | 'GENERAL'> {
    const { data, error } = await this.supabase.getClient().from('empresa_config')
      .select('pais, regimen_tributario').eq('tenant_id', tenantId).maybeSingle();
    if (error) throw new Error(`No se pudo leer la configuración fiscal: ${error.message}`);
    if (!data || String(data.pais || 'PE').toUpperCase() !== 'PE') {
      throw new BadRequestException('Renta Anual FV 710 está disponible sólo para empresas peruanas.');
    }
    const regimen = normalizarRegimenPeru(data.regimen_tributario);
    if (regimen !== 'MYPE' && regimen !== 'GENERAL') {
      throw new BadRequestException('FV 710 anual corresponde a Régimen MYPE Tributario o Régimen General. Si cambió de régimen durante el año, requiere revisión manual.');
    }
    return regimen;
  }

  private async fuentes(tenantId: string, ejercicio: number) {
    const desde = `${ejercicio}-01-01`;
    const hasta = `${ejercicio + 1}-01-01`;
    const client = this.supabase.getClient();
    const [estado, balance, ventasResult, pagosResult, periodoResult] = await Promise.all([
      this.estadosFinancieros.getEstadoResultados(tenantId, ejercicio, 12),
      this.estadosFinancieros.getBalanceGeneral(tenantId, ejercicio, 12),
      client.from('cpe').select('id, total_gravadas, total_exoneradas, total_inafectas, total_exportacion')
        .eq('tenant_id', tenantId).gte('fecha_emision', desde).lt('fecha_emision', hasta)
        .not('estado', 'in', '("ANULADO","ANULADA","CANCELADO","CANCELADA","RECHAZADO")'),
      client.from('tributos_declaraciones_mensuales').select('pago_cuenta_renta')
        .eq('tenant_id', tenantId).gte('periodo', `${ejercicio}-01`).lte('periodo', `${ejercicio}-12`)
        .eq('estado', 'PRESENTADA'),
      client.from('periodos_contables').select('estado').eq('tenant_id', tenantId)
        .eq('anio', ejercicio).eq('mes', 12).maybeSingle(),
    ]);
    if (ventasResult.error) throw new Error(`No se pudieron consolidar ventas anuales: ${ventasResult.error.message}`);
    if (pagosResult.error) throw new Error(`No se pudieron consolidar pagos mensuales: ${pagosResult.error.message}`);
    if (periodoResult.error) throw new Error(`No se pudo verificar el cierre anual: ${periodoResult.error.message}`);
    const ventas = ventasResult.data || [];
    const ingresosNetos = ventas.reduce((total, row: any) => total
      + Number(row.total_gravadas || 0) + Number(row.total_exoneradas || 0)
      + Number(row.total_inafectas || 0) + Number(row.total_exportacion || 0), 0);
    const pagosCuenta = (pagosResult.data || []).reduce((total: number, row: any) => total + Number(row.pago_cuenta_renta || 0), 0);
    const advertenciaBalance = (balance as any).advertencia_balance;
    const corte = new Date().toISOString();
    return {
      fuentes: {
        ingresos_netos: ingresosNetos,
        resultado_contable: Number(estado.utilidad_neta || 0),
        activos_netos: Number(balance.activos.total_activos || 0),
        pagos_cuenta_renta: pagosCuenta,
        ejercicio_cerrado: periodoResult.data?.estado === 'CERRADO',
        balance_descuadrado: advertenciaBalance?.desbalanceado === true,
        diferencia_balance: Number(advertenciaBalance?.diferencia || 0),
      } as FuentesTributariasAnuales,
      snapshot: {
        corte,
        ejercicio,
        ventas_origen: 'cpe',
        cantidad_ventas: ventas.length,
        resultado_origen: 'estado_resultados_diciembre',
        activos_origen: 'balance_general_diciembre',
        pagos_cuenta_origen: 'declaraciones_mensuales_presentadas',
        ejercicio_cerrado: periodoResult.data?.estado === 'CERRADO',
      },
    };
  }

  async calcular(tenantId: string, ejercicioInput: number, ajustes: AjustesTributariosAnuales = {}) {
    const ejercicio = this.validarEjercicio(ejercicioInput);
    const [regimen, { fuentes, snapshot }] = await Promise.all([
      this.configuracion(tenantId),
      this.fuentes(tenantId, ejercicio),
    ]);
    const calculo = calcularRentaAnualItanPeru(ejercicio, regimen, fuentes, ajustes);
    const { data: declaracion, error } = await this.supabase.getClient()
      .from('tributos_declaraciones_anuales').select('*')
      .eq('tenant_id', tenantId).eq('ejercicio', ejercicio).eq('vigente', true).maybeSingle();
    if (error) throw new Error(`No se pudo leer el borrador anual: ${error.message}`);
    return { ...calculo, source_snapshot: snapshot, declaracion_vigente: declaracion || null };
  }

  async guardar(tenantId: string, userId: string, ejercicio: number, ajustes: AjustesTributariosAnuales) {
    const calculo = await this.calcular(tenantId, ejercicio, ajustes);
    const payload: any = {
      ...calculo,
      fuente_corte_at: calculo.source_snapshot.corte,
      notas: ajustes.notas?.trim() || null,
    };
    delete payload.declaracion_vigente;
    const { data, error } = await this.supabase.getClient().rpc('guardar_tributo_anual_tx', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_payload: payload,
    });
    if (error) throw new Error(`No se pudo guardar el borrador anual: ${error.message}`);
    return data;
  }

  async listar(tenantId: string, limite = 12) {
    const { data, error } = await this.supabase.getClient().from('tributos_declaraciones_anuales')
      .select('*').eq('tenant_id', tenantId).order('ejercicio', { ascending: false })
      .order('version', { ascending: false }).limit(Math.min(Math.max(limite, 1), 60));
    if (error) throw new Error(`No se pudo listar Renta Anual: ${error.message}`);
    return data || [];
  }

  async registrarConstancia(tenantId: string, userId: string, id: string, constancia: string, fecha?: string) {
    const { data: row, error: findError } = await this.supabase.getClient()
      .from('tributos_declaraciones_anuales').select('id, warnings')
      .eq('tenant_id', tenantId).eq('id', id).maybeSingle();
    if (findError) throw new Error(`No se pudo verificar el borrador anual: ${findError.message}`);
    if (!row) throw new NotFoundException('Borrador anual no encontrado.');
    if (Array.isArray(row.warnings) && row.warnings.some((warning: any) => warning?.bloquea_presentacion)) {
      throw new BadRequestException('Cierre el ejercicio y corrija el balance antes de registrar la constancia.');
    }
    const { data, error } = await this.supabase.getClient().rpc('registrar_constancia_tributo_anual_tx', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_declaracion_id: id,
      p_constancia: constancia,
      p_fecha_presentacion: fecha || null,
    });
    if (error) throw new Error(`No se pudo registrar la constancia anual: ${error.message}`);
    return data;
  }
}
