import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { PeriodosService } from './periodos.service';
import { PlanCuentasService } from './plan-cuentas.service';
import { TiposCambioService } from './tipos-cambio.service';
import {
  LadoTipoCambio,
  PosicionRevaluacionDto,
  RevaluacionResponseDto,
  EstadoAsiento
} from '@erp-suite/dtos';
import { buildDeterministicUuid } from '../../../common/util/deterministic-uuid.util';

/** Cuentas PCGE del resultado por diferencia de cambio. */
const CUENTA_PERDIDA_CAMBIO = '676';
const CUENTA_GANANCIA_CAMBIO = '776';
const CUENTA_CXC = '12';
const CUENTA_CXP = '42';

const ESTADOS_NO_REVALUABLES = new Set(['ANULADA', 'ANULADO', 'PAGADA', 'PAGADO']);

interface PosicionCruda {
  tipo: 'CXC' | 'CXP';
  documento_id: string;
  referencia?: string;
  moneda: string;
  pendiente: number;
  tipo_cambio_origen: number | null;
  estado?: string;
}

@Injectable()
export class RevaluacionService {
  private readonly logger = new Logger(RevaluacionService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly periodosService: PeriodosService,
    private readonly planCuentasService: PlanCuentasService,
    private readonly tiposCambioService: TiposCambioService
  ) {}

  private round2(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
  }

  /**
   * Calcula la diferencia de cambio no realizada de las posiciones monetarias
   * en moneda extranjera a una fecha de corte, sin escribir nada.
   *
   * Solo entran cuentas por cobrar y por pagar. Las cuentas bancarias en moneda
   * extranjera quedan fuera a propósito: revaluarlas exige conocer el valor en
   * moneda local con el que están contabilizadas, y eso no es reconstruible
   * mientras los asientos históricos no lleven la moneda en la línea.
   */
  async simular(tenantId: string, fecha: string): Promise<RevaluacionResponseDto> {
    const monedaLocal = await this.tiposCambioService.obtenerMonedaLocal(tenantId);
    const crudas = await this.obtenerPosiciones(tenantId, monedaLocal);

    const posiciones: PosicionRevaluacionDto[] = [];
    const excluidas: Array<{ tipo: string; documento_id: string; motivo: string }> = [];

    // Una cotización por moneda: el mismo par se consulta una sola vez aunque
    // haya cientos de documentos.
    const cotizaciones = new Map<string, { compra: number; venta: number } | null>();

    for (const cruda of crudas) {
      if (!cruda.tipo_cambio_origen || cruda.tipo_cambio_origen <= 0) {
        excluidas.push({
          tipo: cruda.tipo,
          documento_id: cruda.documento_id,
          motivo:
            'El documento no registra el tipo de cambio con el que se contabilizó, ' +
            'por lo que su diferencia de cambio no es calculable.'
        });
        continue;
      }

      if (!cotizaciones.has(cruda.moneda)) {
        const vigente = await this.tiposCambioService.obtenerVigente(
          tenantId,
          cruda.moneda,
          monedaLocal,
          fecha
        );
        cotizaciones.set(
          cruda.moneda,
          vigente ? { compra: Number(vigente.compra), venta: Number(vigente.venta) } : null
        );
      }

      const cotizacion = cotizaciones.get(cruda.moneda);
      if (!cotizacion) {
        excluidas.push({
          tipo: cruda.tipo,
          documento_id: cruda.documento_id,
          motivo: `No hay tipo de cambio ${cruda.moneda}/${monedaLocal} vigente al ${fecha}.`
        });
        continue;
      }

      // Activos al tipo de cambio compra, pasivos al de venta.
      const lado = cruda.tipo === 'CXC' ? LadoTipoCambio.COMPRA : LadoTipoCambio.VENTA;
      const tipoCambioCierre =
        lado === LadoTipoCambio.COMPRA ? cotizacion.compra : cotizacion.venta;

      const valorContabilizado = this.round2(cruda.pendiente * cruda.tipo_cambio_origen);
      const valorACierre = this.round2(cruda.pendiente * tipoCambioCierre);
      const variacion = this.round2(valorACierre - valorContabilizado);

      // En un activo, que valga más es ganancia. En un pasivo, que valga más es
      // pérdida: se debe más en moneda local por la misma deuda.
      const diferencia = cruda.tipo === 'CXC' ? variacion : this.round2(-variacion);

      if (diferencia === 0) {
        continue;
      }

      posiciones.push({
        tipo: cruda.tipo,
        documento_id: cruda.documento_id,
        referencia: cruda.referencia,
        moneda: cruda.moneda,
        saldo_moneda_origen: cruda.pendiente,
        tipo_cambio_origen: cruda.tipo_cambio_origen,
        tipo_cambio_cierre: tipoCambioCierre,
        valor_contabilizado: valorContabilizado,
        valor_a_cierre: valorACierre,
        diferencia
      });
    }

    const totalGanancia = this.round2(
      posiciones.filter(p => p.diferencia > 0).reduce((sum, p) => sum + p.diferencia, 0)
    );
    const totalPerdida = this.round2(
      posiciones.filter(p => p.diferencia < 0).reduce((sum, p) => sum - p.diferencia, 0)
    );

    return {
      fecha,
      moneda_local: monedaLocal,
      posiciones,
      total_ganancia: totalGanancia,
      total_perdida: totalPerdida,
      diferencia_neta: this.round2(totalGanancia - totalPerdida),
      excluidas: excluidas.length > 0 ? excluidas : undefined
    };
  }

  /**
   * Genera el asiento de diferencia de cambio no realizada a la fecha de corte.
   *
   * Es idempotente por fecha: el `source_event_id` se deriva de la fecha de
   * corte y el índice único de `asientos_contables` impide una segunda
   * ejecución del mismo corte.
   */
  async ejecutar(
    tenantId: string,
    userId: string,
    fecha: string,
    concepto?: string
  ): Promise<RevaluacionResponseDto> {
    const resultado = await this.simular(tenantId, fecha);

    if (resultado.posiciones.length === 0) {
      throw new BadRequestException(
        `No hay diferencia de cambio que registrar al ${fecha}. ` +
          'Verifique que existan saldos en moneda extranjera y cotizaciones cargadas.'
      );
    }

    const fechaCorte = new Date(fecha);
    await this.periodosService.validarPeriodoAbierto(tenantId, fechaCorte);

    const sourceEventId = buildDeterministicUuid(`revaluacion:${tenantId}:${fecha}`);

    const { data: existente } = await this.supabaseService
      .getClient()
      .from('asientos_contables')
      .select('id, numero_asiento')
      .eq('tenant_id', tenantId)
      .eq('source_event_id', sourceEventId)
      .maybeSingle();

    if (existente?.id) {
      throw new BadRequestException(
        `Ya existe un asiento de revaluación para el ${fecha} ` +
          `(asiento ${existente.numero_asiento ?? existente.id}). ` +
          'Revérselo antes de volver a ejecutar el corte.'
      );
    }

    const lineas = await this.construirLineas(tenantId, resultado);
    const totalDebe = this.round2(lineas.reduce((sum, l) => sum + l.debe, 0));
    const totalHaber = this.round2(lineas.reduce((sum, l) => sum + l.haber, 0));

    if (Math.round(totalDebe * 100) !== Math.round(totalHaber * 100)) {
      // No debería ocurrir: el cálculo es una identidad algebraica. Si ocurre,
      // es preferible no escribir nada a dejar el libro descuadrado.
      throw new Error(
        `El asiento de revaluación no cuadra (debe=${totalDebe}, haber=${totalHaber}). ` +
          'No se registró nada.'
      );
    }

    const { data: asiento, error: asientoError } = await this.supabaseService
      .getClient()
      .rpc('crear_asiento_con_detalles_tx', {
        p_tenant_id: tenantId,
        p_asiento: {
          fecha: fechaCorte.toISOString(),
          concepto: concepto || `Diferencia de cambio no realizada al ${fecha}`,
          referencia: `REVAL-${fecha}`,
          tipo_asiento: 'AJUSTE',
          origen: 'REVALUACION_MONEDA',
          source_event_id: sourceEventId,
          estado: EstadoAsiento.CONFIRMADO,
          created_by: userId,
          confirmado_por: userId,
          confirmado_en: new Date().toISOString()
        },
        p_detalles: lineas.map(linea => ({
          cuenta_id: linea.cuenta_id,
          debe: linea.debe,
          haber: linea.haber,
          concepto: linea.concepto
        }))
      });

    if (asientoError || !asiento) {
      if (asientoError?.code === '23505') {
        throw new BadRequestException(
          `Ya existe un asiento de revaluación para el ${fecha}.`
        );
      }
      throw new Error(`Error creando asiento de revaluación: ${asientoError?.message}`);
    }

    this.logger.log(
      `💱 Revaluación al ${fecha} registrada para ${tenantId}: asiento ${asiento.id}, ` +
        `neto ${resultado.diferencia_neta}`
    );

    return {
      ...resultado,
      asiento_id: asiento.id,
      numero_asiento: asiento.numero_asiento
    };
  }

  /**
   * Diferencia de cambio realizada al liquidar un documento en moneda
   * extranjera.
   *
   * Es un cálculo puro para que el flujo de pagos pueda incorporarlo dentro de
   * su propia transacción sin depender de este servicio para nada más.
   */
  static calcularDiferenciaRealizada(params: {
    tipo: 'CXC' | 'CXP';
    importeMonedaOrigen: number;
    tipoCambioOrigen: number;
    tipoCambioLiquidacion: number;
  }): number {
    const { tipo, importeMonedaOrigen, tipoCambioOrigen, tipoCambioLiquidacion } = params;

    if (tipoCambioOrigen <= 0 || tipoCambioLiquidacion <= 0) {
      throw new BadRequestException('Los tipos de cambio deben ser mayores a cero.');
    }

    const variacion = importeMonedaOrigen * (tipoCambioLiquidacion - tipoCambioOrigen);
    const diferencia = tipo === 'CXC' ? variacion : -variacion;

    return Math.round((diferencia + Number.EPSILON) * 100) / 100;
  }

  /**
   * Traduce el resultado de la simulación a líneas de asiento.
   *
   * El resultado se registra en bruto: la ganancia va a 776 y la pérdida a 676
   * sin compensarse entre sí, porque compensarlas ocultaría la exposición real
   * en el estado de resultados. Las cuentas patrimoniales sí van netas, que es
   * como efectivamente varía su saldo.
   */
  private async construirLineas(
    tenantId: string,
    resultado: RevaluacionResponseDto
  ): Promise<Array<{ cuenta_id: string; debe: number; haber: number; concepto: string }>> {
    const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(tenantId, [
      CUENTA_CXC,
      CUENTA_CXP,
      CUENTA_PERDIDA_CAMBIO,
      CUENTA_GANANCIA_CAMBIO
    ]);

    // Variación del valor en moneda local de cada grupo patrimonial.
    const variacionCxC = this.round2(
      resultado.posiciones
        .filter(p => p.tipo === 'CXC')
        .reduce((sum, p) => sum + (p.valor_a_cierre - p.valor_contabilizado), 0)
    );
    const variacionCxP = this.round2(
      resultado.posiciones
        .filter(p => p.tipo === 'CXP')
        .reduce((sum, p) => sum + (p.valor_a_cierre - p.valor_contabilizado), 0)
    );

    const lineas: Array<{ cuenta_id: string; debe: number; haber: number; concepto: string }> = [];

    if (variacionCxC !== 0) {
      lineas.push({
        cuenta_id: cuentas.get(CUENTA_CXC)!.id,
        debe: variacionCxC > 0 ? variacionCxC : 0,
        haber: variacionCxC < 0 ? -variacionCxC : 0,
        concepto: `Ajuste por diferencia de cambio en cuentas por cobrar al ${resultado.fecha}`
      });
    }

    if (variacionCxP !== 0) {
      // Si el pasivo vale más en moneda local, la cuenta se abona.
      lineas.push({
        cuenta_id: cuentas.get(CUENTA_CXP)!.id,
        debe: variacionCxP < 0 ? -variacionCxP : 0,
        haber: variacionCxP > 0 ? variacionCxP : 0,
        concepto: `Ajuste por diferencia de cambio en cuentas por pagar al ${resultado.fecha}`
      });
    }

    if (resultado.total_perdida > 0) {
      lineas.push({
        cuenta_id: cuentas.get(CUENTA_PERDIDA_CAMBIO)!.id,
        debe: resultado.total_perdida,
        haber: 0,
        concepto: `Pérdida por diferencia de cambio al ${resultado.fecha}`
      });
    }

    if (resultado.total_ganancia > 0) {
      lineas.push({
        cuenta_id: cuentas.get(CUENTA_GANANCIA_CAMBIO)!.id,
        debe: 0,
        haber: resultado.total_ganancia,
        concepto: `Ganancia por diferencia de cambio al ${resultado.fecha}`
      });
    }

    return lineas;
  }

  /** Posiciones monetarias abiertas en moneda distinta a la local. */
  private async obtenerPosiciones(
    tenantId: string,
    monedaLocal: string
  ): Promise<PosicionCruda[]> {
    const client = this.supabaseService.getClient();

    const [cxcResult, cxpResult] = await Promise.all([
      client
        .from('cuentas_por_cobrar')
        .select('id, moneda, estado, monto_pendiente, saldo_pendiente, saldo, tipo_cambio_origen, serie, numero')
        .eq('tenant_id', tenantId)
        .not('moneda', 'is', null)
        .neq('moneda', monedaLocal),
      client
        .from('cuentas_por_pagar')
        .select('id, moneda, estado, saldo, saldo_pendiente, tipo_cambio_origen, numero_documento')
        .eq('tenant_id', tenantId)
        .not('moneda', 'is', null)
        .neq('moneda', monedaLocal)
    ]);

    if (cxcResult.error) {
      throw new Error(`Error obteniendo cuentas por cobrar: ${cxcResult.error.message}`);
    }
    if (cxpResult.error) {
      throw new Error(`Error obteniendo cuentas por pagar: ${cxpResult.error.message}`);
    }

    const posiciones: PosicionCruda[] = [];

    for (const fila of cxcResult.data || []) {
      const pendiente = Number(fila.monto_pendiente ?? fila.saldo_pendiente ?? fila.saldo ?? 0);
      if (pendiente <= 0 || ESTADOS_NO_REVALUABLES.has(String(fila.estado || '').toUpperCase())) {
        continue;
      }
      posiciones.push({
        tipo: 'CXC',
        documento_id: fila.id,
        referencia: [fila.serie, fila.numero].filter(Boolean).join('-') || undefined,
        moneda: String(fila.moneda).toUpperCase(),
        pendiente,
        tipo_cambio_origen: fila.tipo_cambio_origen ? Number(fila.tipo_cambio_origen) : null,
        estado: fila.estado
      });
    }

    for (const fila of cxpResult.data || []) {
      const pendiente = Number(fila.saldo ?? fila.saldo_pendiente ?? 0);
      if (pendiente <= 0 || ESTADOS_NO_REVALUABLES.has(String(fila.estado || '').toUpperCase())) {
        continue;
      }
      posiciones.push({
        tipo: 'CXP',
        documento_id: fila.id,
        referencia: fila.numero_documento ? String(fila.numero_documento) : undefined,
        moneda: String(fila.moneda).toUpperCase(),
        pendiente,
        tipo_cambio_origen: fila.tipo_cambio_origen ? Number(fila.tipo_cambio_origen) : null,
        estado: fila.estado
      });
    }

    return posiciones;
  }
}
