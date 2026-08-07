import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import {
  ConciliarPartidasDto,
  ConciliacionResponseDto,
  EstadoConciliacion,
  ListarPartidasAbiertasQueryDto,
  PartidaAbiertaDto,
  ResumenPartidasDto
} from '@erp-suite/dtos';

/** Entrada mínima del algoritmo de reparto. */
export interface PartidaParaCasar {
  detalle_id: string;
  /** Saldo abierto con signo: positivo deudor, negativo acreedor. */
  pendiente: number;
}

export interface RepartoConciliacion {
  aplicaciones: Array<{ detalle_id: string; monto_aplicado: number }>;
  montoConciliado: number;
  estado: EstadoConciliacion;
  saldoNoConciliado: number;
}

@Injectable()
export class ConciliacionPartidasService {
  private readonly logger = new Logger(ConciliacionPartidasService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  private round2(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
  }

  /**
   * Reparte el importe casable entre las partidas seleccionadas.
   *
   * Función pura y estática: es el corazón de la conciliación y donde un error
   * no se nota. Todo el cálculo va en céntimos enteros — con decimales, casar
   * tres facturas contra un cobro deja residuos que hacen que una partida
   * parezca abierta por 0,01 para siempre.
   *
   * Sólo se puede casar hasta el menor de los dos lados: si hay 1.000 al debe y
   * 300 al haber, se aplican 300 y la conciliación es PARCIAL.
   */
  static repartir(partidas: PartidaParaCasar[]): RepartoConciliacion {
    const enCentimos = partidas.map(p => ({
      detalle_id: p.detalle_id,
      pendiente: Math.round(p.pendiente * 100)
    }));

    const deudoras = enCentimos.filter(p => p.pendiente > 0);
    const acreedoras = enCentimos.filter(p => p.pendiente < 0);

    if (deudoras.length === 0 || acreedoras.length === 0) {
      throw new BadRequestException(
        'La conciliación necesita partidas de los dos lados: no se puede casar ' +
          'un grupo que sólo tiene cargos o sólo abonos.'
      );
    }

    const totalDeudor = deudoras.reduce((sum, p) => sum + p.pendiente, 0);
    const totalAcreedor = acreedoras.reduce((sum, p) => sum - p.pendiente, 0);
    const aplicable = Math.min(totalDeudor, totalAcreedor);

    if (aplicable <= 0) {
      throw new BadRequestException('No hay importe que conciliar en las partidas seleccionadas.');
    }

    // Se consume cada lado en el orden recibido —el llamador las ordena por
    // fecha— hasta agotar el importe casable. El lado mayor queda parcialmente
    // aplicado, que es exactamente lo que representa una conciliación parcial.
    const aplicaciones: Array<{ detalle_id: string; monto_aplicado: number }> = [];

    const consumir = (grupo: Array<{ detalle_id: string; pendiente: number }>) => {
      let restante = aplicable;
      for (const partida of grupo) {
        if (restante <= 0) break;
        const disponible = Math.abs(partida.pendiente);
        const aplicado = Math.min(disponible, restante);
        if (aplicado > 0) {
          aplicaciones.push({ detalle_id: partida.detalle_id, monto_aplicado: aplicado / 100 });
          restante -= aplicado;
        }
      }
    };

    consumir(deudoras);
    consumir(acreedoras);

    const esTotal = totalDeudor === totalAcreedor;

    return {
      aplicaciones,
      montoConciliado: aplicable / 100,
      estado: esTotal ? EstadoConciliacion.TOTAL : EstadoConciliacion.PARCIAL,
      // Con signo, para que se lea de qué lado quedó el saldo suelto.
      saldoNoConciliado: (totalDeudor - totalAcreedor) / 100
    };
  }

  // --------------------------------------------------------------------------
  // Consulta
  // --------------------------------------------------------------------------

  /** Partidas con saldo abierto en una cuenta conciliable. */
  async obtenerPartidasAbiertas(
    tenantId: string,
    filtros: ListarPartidasAbiertasQueryDto
  ): Promise<ResumenPartidasDto> {
    await this.exigirCuentaConciliable(tenantId, filtros.cuenta_id);

    let query = this.supabaseService
      .getClient()
      .from('detalle_asientos')
      .select(
        `id, asiento_id, cuenta_id, debe, haber, concepto, monto_conciliado,
         asientos_contables!fk_detalle_asientos_asiento_id!inner(fecha, numero_asiento, referencia, estado)`
      )
      .eq('tenant_id', tenantId)
      .eq('cuenta_id', filtros.cuenta_id);

    if (filtros.fecha_desde) {
      query = query.gte('asientos_contables.fecha', filtros.fecha_desde);
    }
    if (filtros.fecha_hasta) {
      query = query.lte('asientos_contables.fecha', filtros.fecha_hasta);
    }

    const { data, error } = await query.order('fecha', {
      ascending: true,
      foreignTable: 'asientos_contables'
    });

    if (error) {
      throw new Error(`Error obteniendo partidas abiertas: ${error.message}`);
    }

    const partidas: PartidaAbiertaDto[] = [];

    for (const fila of data || []) {
      const asiento = (fila as any).asientos_contables ?? {};

      // Un borrador todavía no está en el libro y un anulado ya no tiene
      // efecto: ninguno de los dos genera partida que casar.
      const estado = String(asiento.estado ?? 'CONFIRMADO').toUpperCase();
      if (estado !== 'CONFIRMADO') continue;

      const debe = Number(fila.debe) || 0;
      const haber = Number(fila.haber) || 0;
      const conciliado = Number(fila.monto_conciliado) || 0;
      const bruto = this.round2(debe - haber);
      const pendiente = this.round2(bruto - Math.sign(bruto) * conciliado);

      if (Math.abs(pendiente) < 0.005) continue;

      partidas.push({
        detalle_id: fila.id,
        asiento_id: fila.asiento_id,
        numero_asiento: asiento.numero_asiento,
        fecha: asiento.fecha,
        concepto: fila.concepto ?? undefined,
        referencia: asiento.referencia ?? undefined,
        debe,
        haber,
        monto_conciliado: conciliado,
        pendiente
      });
    }

    const totalDeudor = this.round2(
      partidas.filter(p => p.pendiente > 0).reduce((sum, p) => sum + p.pendiente, 0)
    );
    const totalAcreedor = this.round2(
      partidas.filter(p => p.pendiente < 0).reduce((sum, p) => sum - p.pendiente, 0)
    );

    return {
      cuenta_id: filtros.cuenta_id,
      total_deudor: totalDeudor,
      total_acreedor: totalAcreedor,
      saldo_abierto: this.round2(totalDeudor - totalAcreedor),
      partidas
    };
  }

  // --------------------------------------------------------------------------
  // Conciliación
  // --------------------------------------------------------------------------

  async conciliar(
    tenantId: string,
    userId: string,
    dto: ConciliarPartidasDto
  ): Promise<ConciliacionResponseDto> {
    const ids = [...new Set(dto.detalle_ids)];

    if (ids.length !== dto.detalle_ids.length) {
      throw new BadRequestException(
        'Hay partidas repetidas en la selección: cada apunte puede aparecer una sola vez.'
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('detalle_asientos')
      .select(
        `id, cuenta_id, debe, haber, monto_conciliado,
         asientos_contables!fk_detalle_asientos_asiento_id!inner(fecha, estado)`
      )
      .eq('tenant_id', tenantId)
      .in('id', ids);

    if (error) {
      throw new Error(`Error obteniendo las partidas a conciliar: ${error.message}`);
    }

    const filas = data || [];
    if (filas.length !== ids.length) {
      throw new NotFoundException(
        'Alguna de las partidas seleccionadas no existe o no pertenece a su organización.'
      );
    }

    // Casar apuntes de cuentas distintas no significa nada contablemente.
    const cuentas = new Set(filas.map((f: any) => f.cuenta_id));
    if (cuentas.size > 1) {
      throw new BadRequestException(
        'Todas las partidas deben pertenecer a la misma cuenta contable.'
      );
    }

    const cuentaId = filas[0].cuenta_id;
    await this.exigirCuentaConciliable(tenantId, cuentaId);

    const noConfirmadas = filas.filter(
      (f: any) => String(f.asientos_contables?.estado ?? 'CONFIRMADO').toUpperCase() !== 'CONFIRMADO'
    );
    if (noConfirmadas.length > 0) {
      throw new BadRequestException(
        'Sólo se pueden conciliar partidas de asientos confirmados.'
      );
    }

    // Orden por fecha: al aplicar parcialmente, se cancela primero lo más
    // antiguo, que es la convención contable habitual.
    const ordenadas = [...filas].sort((a: any, b: any) =>
      String(a.asientos_contables?.fecha ?? '').localeCompare(
        String(b.asientos_contables?.fecha ?? '')
      )
    );

    const partidas: PartidaParaCasar[] = ordenadas.map((fila: any) => {
      const bruto = this.round2(Number(fila.debe || 0) - Number(fila.haber || 0));
      const conciliado = Number(fila.monto_conciliado) || 0;
      return {
        detalle_id: fila.id,
        pendiente: this.round2(bruto - Math.sign(bruto) * conciliado)
      };
    });

    const cerradas = partidas.filter(p => Math.abs(p.pendiente) < 0.005);
    if (cerradas.length > 0) {
      throw new BadRequestException(
        `${cerradas.length} de las partidas seleccionadas ya están conciliadas por completo.`
      );
    }

    const reparto = ConciliacionPartidasService.repartir(partidas);

    const fecha = dto.fecha ?? new Date().toISOString().slice(0, 10);
    const { data: conciliacion, error: errorConciliacion } = await this.supabaseService
      .getClient()
      .rpc('conciliar_partidas_tx', {
        p_tenant_id: tenantId,
        p_cuenta_id: cuentaId,
        p_estado: reparto.estado,
        p_monto_conciliado: reparto.montoConciliado,
        p_fecha: fecha,
        p_observaciones: dto.observaciones ?? null,
        p_created_by: userId,
        p_aplicaciones: reparto.aplicaciones
      });

    if (errorConciliacion || !conciliacion) {
      throw new Error(`Error creando la conciliación: ${errorConciliacion?.message}`);
    }

    this.logger.log(
      `🔗 Conciliación ${reparto.estado} en la cuenta ${cuentaId}: ${reparto.montoConciliado} sobre ${ids.length} partidas`
    );

    return {
      id: conciliacion.id,
      cuenta_id: cuentaId,
      estado: reparto.estado,
      monto_conciliado: reparto.montoConciliado,
      fecha: conciliacion.fecha ?? fecha,
      observaciones: conciliacion.observaciones ?? undefined,
      lineas: reparto.aplicaciones.map(a => ({
        detalle_asiento_id: a.detalle_id,
        monto_aplicado: a.monto_aplicado
      })),
      saldo_no_conciliado: reparto.saldoNoConciliado
    };
  }

  /**
   * Deshace una conciliación y devuelve las partidas a su estado abierto.
   * No toca los asientos: conciliar nunca los modificó.
   */
  async desconciliar(tenantId: string, conciliacionId: string): Promise<void> {
    const { error } = await this.supabaseService.getClient().rpc('desconciliar_partidas_tx', {
      p_tenant_id: tenantId,
      p_conciliacion_id: conciliacionId
    });

    if (error) {
      if (String(error.message).includes('CONCILIACION_NO_ENCONTRADA')) {
        throw new NotFoundException(`Conciliación ${conciliacionId} no encontrada`);
      }
      throw new Error(`Error deshaciendo la conciliación: ${error.message}`);
    }

    this.logger.log(`🔗 Conciliación ${conciliacionId} deshecha`);
  }

  async listarConciliaciones(
    tenantId: string,
    cuentaId?: string
  ): Promise<ConciliacionResponseDto[]> {
    let query = this.supabaseService
      .getClient()
      .from('conciliaciones_partidas')
      .select('*')
      .eq('tenant_id', tenantId);

    if (cuentaId) {
      query = query.eq('cuenta_id', cuentaId);
    }

    const { data, error } = await query.order('fecha', { ascending: false });

    if (error) {
      throw new Error(`Error listando conciliaciones: ${error.message}`);
    }

    return (data || []) as ConciliacionResponseDto[];
  }

  // --------------------------------------------------------------------------
  // Internos
  // --------------------------------------------------------------------------

  private async exigirCuentaConciliable(tenantId: string, cuentaId: string): Promise<void> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('plan_cuentas')
      .select('id, codigo, nombre, conciliable')
      .eq('tenant_id', tenantId)
      .eq('id', cuentaId)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundException(`Cuenta contable ${cuentaId} no encontrada`);
    }

    if (!data.conciliable) {
      throw new BadRequestException(
        `La cuenta ${data.codigo} - ${data.nombre} no está marcada como conciliable. ` +
          'Sólo las cuentas de terceros llevan partidas abiertas.'
      );
    }
  }

}
