import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  esCompraFiscal,
  esEstadoFiscal,
  esVentaFiscal,
  importeFiscal,
} from './documento-fiscal.rules';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

export type RegimenTributarioPeru = 'NRUS' | 'RER' | 'MYPE' | 'GENERAL';

export interface AjustesTributariosMensuales {
  saldo_favor_anterior?: number;
  retenciones_igv?: number;
  percepciones_igv?: number;
  otros_creditos_igv?: number;
  coeficiente_renta?: number | null;
  notas?: string;
}

export interface FuentesTributariasMensuales {
  ventas_gravadas: number;
  ventas_exoneradas: number;
  ventas_inafectas: number;
  exportaciones: number;
  igv_ventas: number;
  compras_gravadas: number;
  igv_compras: number;
  ingresos_netos_acumulados: number;
  compras_totales_mes: number;
  cantidad_ventas: number;
  cantidad_compras: number;
}

export interface AdvertenciaTributaria {
  codigo: string;
  mensaje: string;
  bloquea_presentacion?: boolean;
}

const UIT_2026 = 5500;
const LIMITE_RMT_300_UIT_2026 = 300 * UIT_2026;

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(Math.max(parsed, 0) * 100) / 100;
}

/**
 * Suma aplicando el signo fiscal de cada fila: la nota de crédito resta.
 *
 * El importe guardado de una nota de crédito es positivo --el DTO de CxP lo
 * exige con `@Min(0)`-- de modo que sin este signo una nota de crédito de compra
 * aumentaba el crédito fiscal en vez de reducirlo, y el error era del doble de
 * su IGV. Es la misma regla que el Registro de Compras ya aplicaba.
 */
function sum(rows: any[], field: string): number {
  return rows.reduce(
    (total, row) => total + importeFiscal(row?.tipo_documento, row?.[field]),
    0,
  );
}

/**
 * Consolida las filas crudas en las magnitudes del periodo, aplicando las mismas
 * reglas fiscales que los libros: solo los tipos que forman cada registro, sin
 * documentos anulados, y la nota de credito restando.
 *
 * Es una funcion pura y exportada a proposito. Esto vivia dentro de un metodo
 * privado, y es justo donde estaba el defecto: la declaracion no filtraba por
 * tipo ni aplicaba el signo, de modo que un TICKET de POS contaba como venta y
 * una nota de credito sumaba en vez de restar. Un calculo de impuestos que no se
 * puede probar sin base de datos no se prueba.
 */
export function consolidarFuentesMensuales(
  ventasMesRaw: any[],
  ventasAnioRaw: any[],
  comprasMesRaw: any[],
): { fuentes: FuentesTributariasMensuales; ventasMes: any[]; comprasMes: any[] } {
  const esVenta = (fila: any) =>
    esVentaFiscal(fila?.tipo_documento) && esEstadoFiscal(fila?.estado);
  const esCompra = (fila: any) =>
    esCompraFiscal(fila?.tipo_documento) && esEstadoFiscal(fila?.estado);

  const ventasMes = (ventasMesRaw || []).filter(esVenta);
  const ventasAnio = (ventasAnioRaw || []).filter(esVenta);
  const comprasMes = (comprasMesRaw || []).filter(esCompra);

  const ingresosAcumulados = ['total_gravadas', 'total_exoneradas', 'total_inafectas', 'total_exportacion']
    .reduce((total, field) => total + sum(ventasAnio, field), 0);

  const fuentes: FuentesTributariasMensuales = {
    ventas_gravadas: sum(ventasMes, 'total_gravadas'),
    ventas_exoneradas: sum(ventasMes, 'total_exoneradas'),
    ventas_inafectas: sum(ventasMes, 'total_inafectas'),
    exportaciones: sum(ventasMes, 'total_exportacion'),
    igv_ventas: sum(ventasMes, 'total_igv'),
    compras_gravadas: sum(comprasMes, 'subtotal'),
    igv_compras: sum(comprasMes, 'igv'),
    ingresos_netos_acumulados: ingresosAcumulados,
    compras_totales_mes: sum(comprasMes, 'total'),
    cantidad_ventas: ventasMes.length,
    cantidad_compras: comprasMes.length,
  };

  return { fuentes, ventasMes, comprasMes };
}

export function normalizarRegimenPeru(value: unknown): RegimenTributarioPeru {
  const regimen = String(value || '').trim().toUpperCase();
  if (regimen === 'RUS') return 'NRUS';
  if (['NRUS', 'RER', 'MYPE', 'GENERAL'].includes(regimen)) {
    return regimen as RegimenTributarioPeru;
  }
  throw new BadRequestException('Configure un régimen peruano válido: NRUS, RER, MYPE o GENERAL.');
}

export function calcularTributoMensualPeru(
  regimen: RegimenTributarioPeru,
  fuentes: FuentesTributariasMensuales,
  ajustes: AjustesTributariosMensuales = {},
) {
  const warnings: AdvertenciaTributaria[] = [];
  const ventasGravadas = money(fuentes.ventas_gravadas);
  const ventasExoneradas = money(fuentes.ventas_exoneradas);
  const ventasInafectas = money(fuentes.ventas_inafectas);
  const exportaciones = money(fuentes.exportaciones);
  const igvVentas = money(fuentes.igv_ventas);
  const comprasGravadas = money(fuentes.compras_gravadas);
  const igvCompras = money(fuentes.igv_compras);
  const ingresosNetosMes = money(ventasGravadas + ventasExoneradas + ventasInafectas + exportaciones);
  const ingresosNetosAcumulados = money(fuentes.ingresos_netos_acumulados);
  const saldoFavorAnterior = money(ajustes.saldo_favor_anterior);
  const retencionesIgv = money(ajustes.retenciones_igv);
  const percepcionesIgv = money(ajustes.percepciones_igv);
  const otrosCreditosIgv = money(ajustes.otros_creditos_igv);
  const creditoTotal = money(igvCompras + saldoFavorAnterior + retencionesIgv + percepcionesIgv + otrosCreditosIgv);
  const diferenciaIgv = Math.round((igvVentas - creditoTotal) * 100) / 100;

  let igvResultante = money(diferenciaIgv);
  let saldoFavorSiguiente = money(-diferenciaIgv);
  let pagoCuentaRenta = 0;
  let nrusCategoria: number | null = null;
  let nrusCuota: number | null = null;
  let coeficiente: number | null = null;
  let formulario = 'FV 621 IGV - Renta Mensual';

  if (regimen === 'NRUS') {
    formulario = 'Formulario Virtual 1611 - NRUS';
    igvResultante = 0;
    saldoFavorSiguiente = 0;
    const referencia = Math.max(ingresosNetosMes, money(fuentes.compras_totales_mes));
    if (referencia <= 5000) {
      nrusCategoria = 1;
      nrusCuota = 20;
    } else if (referencia <= 8000) {
      nrusCategoria = 2;
      nrusCuota = 50;
    } else {
      warnings.push({
        codigo: 'NRUS_LIMITE_EXCEDIDO',
        mensaje: 'Los ingresos o adquisiciones del mes superan S/ 8,000; revise el cambio de régimen antes de declarar.',
        bloquea_presentacion: true,
      });
    }
  } else if (regimen === 'RER') {
    pagoCuentaRenta = money(ingresosNetosMes * 0.015);
  } else {
    const informado = ajustes.coeficiente_renta;
    if (informado !== undefined && informado !== null) {
      const parsed = Number(informado);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new BadRequestException('El coeficiente de renta debe ser un decimal entre 0 y 1.');
      }
      coeficiente = parsed;
    }
    const tasaMinima = regimen === 'MYPE' && ingresosNetosAcumulados <= LIMITE_RMT_300_UIT_2026
      ? 0.01
      : 0.015;
    const tasaAplicable = regimen === 'MYPE' && ingresosNetosAcumulados <= LIMITE_RMT_300_UIT_2026
      ? tasaMinima
      : Math.max(coeficiente ?? 0, tasaMinima);
    pagoCuentaRenta = money(ingresosNetosMes * tasaAplicable);
    if (tasaMinima === 0.015 && coeficiente === null) {
      warnings.push({
        codigo: 'COEFICIENTE_NO_INFORMADO',
        mensaje: 'Se aplicó provisionalmente 1.5%. Confirme el coeficiente del impuesto a la renta antes de presentar.',
      });
    }
  }

  if (fuentes.cantidad_compras === 0) {
    warnings.push({
      codigo: 'SIN_COMPRAS',
      mensaje: 'No se encontraron compras para el período; contraste el crédito fiscal con la propuesta RCE de SIRE.',
    });
  }
  if (fuentes.cantidad_ventas === 0) {
    warnings.push({
      codigo: 'SIN_VENTAS',
      mensaje: 'No se encontraron comprobantes de venta para el período; contraste con la propuesta RVIE de SIRE.',
    });
  }

  return {
    regimen,
    formulario,
    uit: UIT_2026,
    limite_rmt_300_uit: LIMITE_RMT_300_UIT_2026,
    ventas_gravadas: ventasGravadas,
    ventas_exoneradas: ventasExoneradas,
    ventas_inafectas: ventasInafectas,
    exportaciones,
    igv_ventas: igvVentas,
    compras_gravadas: comprasGravadas,
    igv_compras: igvCompras,
    saldo_favor_anterior: saldoFavorAnterior,
    retenciones_igv: retencionesIgv,
    percepciones_igv: percepcionesIgv,
    otros_creditos_igv: otrosCreditosIgv,
    igv_resultante: igvResultante,
    saldo_favor_siguiente: saldoFavorSiguiente,
    ingresos_netos_mes: ingresosNetosMes,
    ingresos_netos_acumulados: ingresosNetosAcumulados,
    coeficiente_renta: coeficiente,
    pago_cuenta_renta: pagoCuentaRenta,
    nrus_categoria: nrusCategoria,
    nrus_cuota: nrusCuota,
    warnings,
  };
}

@Injectable()
export class TributosMensualesService {
  constructor(private readonly supabase: SupabaseService) {}

  private validarPeriodo(periodo: string): { desde: string; hasta: string; inicioAnio: string } {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo || '')) {
      throw new BadRequestException('El período debe tener formato YYYY-MM.');
    }
    const [year, month] = periodo.split('-').map(Number);
    const siguiente = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    return { desde: `${periodo}-01`, hasta: siguiente, inicioAnio: `${year}-01-01` };
  }

  private async obtenerConfiguracion(tenantId: string) {
    const { data, error } = await this.supabase.getClient()
      .from('empresa_config')
      .select('pais, regimen_tributario')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw new Error(`No se pudo leer la configuración tributaria: ${error.message}`);
    if (!data) throw new BadRequestException('Complete la configuración fiscal de la empresa.');
    if (String(data.pais || '').toUpperCase() !== 'PE') {
      throw new BadRequestException('Este espacio corresponde exclusivamente a tributación peruana.');
    }
    return { regimen: normalizarRegimenPeru(data.regimen_tributario) };
  }

  private async obtenerFuentes(tenantId: string, periodo: string): Promise<{
    fuentes: FuentesTributariasMensuales;
    snapshot: Record<string, unknown>;
  }> {
    const { desde, hasta, inicioAnio } = this.validarPeriodo(periodo);
    const client = this.supabase.getClient();
    const [ventasMesResult, ventasAnioResult, comprasMesResult] = await Promise.all([
      client.from('cpe')
        .select('id, tipo_documento, estado, total_gravadas, total_exoneradas, total_inafectas, total_exportacion, total_igv')
        .eq('tenant_id', tenantId).gte('fecha_emision', desde).lt('fecha_emision', hasta)
        .not('estado', 'in', '("ANULADO","ANULADA","CANCELADO","CANCELADA","RECHAZADO")'),
      client.from('cpe')
        .select('id, tipo_documento, estado, total_gravadas, total_exoneradas, total_inafectas, total_exportacion')
        .eq('tenant_id', tenantId).gte('fecha_emision', inicioAnio).lt('fecha_emision', hasta)
        .not('estado', 'in', '("ANULADO","ANULADA","CANCELADO","CANCELADA","RECHAZADO")'),
      client.from('cuentas_por_pagar')
        .select('id, tipo_documento, estado, subtotal, igv, total')
        .eq('tenant_id', tenantId).gte('fecha_emision', desde).lt('fecha_emision', hasta)
        .not('estado', 'in', '("ANULADO","ANULADA","CANCELADO","CANCELADA","RECHAZADO")'),
    ]);
    for (const result of [ventasMesResult, ventasAnioResult, comprasMesResult]) {
      if (result.error) throw new Error(`No se pudieron consolidar las fuentes tributarias: ${result.error.message}`);
    }
    const { fuentes, ventasMes, comprasMes } = consolidarFuentesMensuales(
      ventasMesResult.data || [],
      ventasAnioResult.data || [],
      comprasMesResult.data || [],
    );
    const corte = new Date().toISOString();
    return {
      fuentes,
      snapshot: {
        corte,
        periodo,
        ventas_origen: 'cpe',
        compras_origen: 'cuentas_por_pagar',
        cantidad_ventas: ventasMes.length,
        cantidad_compras: comprasMes.length,
        advertencia: 'Contrastar con propuestas RVIE/RCE de SIRE antes de presentar.',
      },
    };
  }

  async calcular(tenantId: string, periodo: string, ajustes: AjustesTributariosMensuales = {}) {
    const [{ regimen }, { fuentes, snapshot }] = await Promise.all([
      this.obtenerConfiguracion(tenantId),
      this.obtenerFuentes(tenantId, periodo),
    ]);
    const calculo = calcularTributoMensualPeru(regimen, fuentes, ajustes);
    const { data: declaracion } = await this.supabase.getClient()
      .from('tributos_declaraciones_mensuales')
      .select('*').eq('tenant_id', tenantId).eq('periodo', periodo).eq('vigente', true)
      .maybeSingle();
    return { periodo, ...calculo, source_snapshot: snapshot, declaracion_vigente: declaracion || null };
  }

  async guardar(tenantId: string, userId: string, periodo: string, ajustes: AjustesTributariosMensuales = {}) {
    const calculo = await this.calcular(tenantId, periodo, ajustes);
    const payload = {
      ...calculo,
      periodo,
      fuente_corte_at: (calculo.source_snapshot as any).corte,
      notas: ajustes.notas?.trim() || null,
    };
    delete (payload as any).declaracion_vigente;
    delete (payload as any).formulario;
    delete (payload as any).uit;
    delete (payload as any).limite_rmt_300_uit;
    const { data, error } = await this.supabase.getClient().rpc('guardar_tributo_mensual_tx', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_payload: payload,
    });
    if (error) throw new Error(`No se pudo guardar el borrador tributario: ${error.message}`);
    return data;
  }

  async listar(tenantId: string, limite = 24) {
    const safeLimit = Math.min(Math.max(Number(limite) || 24, 1), 120);
    const { data, error } = await this.supabase.getClient()
      .from('tributos_declaraciones_mensuales').select('*')
      .eq('tenant_id', tenantId).order('periodo', { ascending: false })
      .order('version', { ascending: false }).limit(safeLimit);
    if (error) throw new Error(`No se pudieron listar las declaraciones: ${error.message}`);
    return data || [];
  }

  async registrarConstancia(
    tenantId: string,
    userId: string,
    declaracionId: string,
    constancia: string,
    fechaPresentacion?: string,
  ) {
    const { data: existente, error: findError } = await this.supabase.getClient()
      .from('tributos_declaraciones_mensuales')
      .select('id, warnings').eq('tenant_id', tenantId).eq('id', declaracionId).maybeSingle();
    if (findError) throw new Error(`No se pudo verificar el borrador: ${findError.message}`);
    if (!existente) throw new NotFoundException('Borrador tributario no encontrado.');
    const bloqueada = Array.isArray(existente.warnings)
      && existente.warnings.some((warning: any) => warning?.bloquea_presentacion === true);
    if (bloqueada) {
      throw new BadRequestException('El borrador tiene observaciones que bloquean registrar la presentación.');
    }
    const { data, error } = await this.supabase.getClient().rpc('registrar_constancia_tributo_mensual_tx', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_declaracion_id: declaracionId,
      p_constancia: constancia,
      p_fecha_presentacion: fechaPresentacion || null,
    });
    if (error) throw new Error(`No se pudo registrar la constancia SUNAT: ${error.message}`);
    return data;
  }
}
