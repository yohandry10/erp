import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { AsientosService } from './asientos.service';
import {
  CreatePlantillaAsientoDto,
  UpdatePlantillaAsientoDto,
  GenerarDesdePlantillaDto,
  PlantillaAsientoResponseDto,
  PeriodicidadPlantilla,
  MESES_POR_PERIODICIDAD,
  DetallePlantillaDto,
  EstadoAsiento,
  AsientoResponseDto
} from '@erp-suite/dtos';
import { buildDeterministicUuid } from '../../../common/util/deterministic-uuid.util';

import { fechaHoyDelTenant } from '../../../shared/utils/fecha-tenant.util';
@Injectable()
export class PlantillasAsientosService {
  private readonly logger = new Logger(PlantillasAsientosService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly asientosService: AsientosService
  ) {}

  // --------------------------------------------------------------------------
  // Agenda
  // --------------------------------------------------------------------------

  /**
   * Fecha de la siguiente generación a partir de una fecha dada.
   *
   * Función pura y estática porque es donde vive toda la aritmética delicada:
   * el día 31 en un mes de 30, el 29 de febrero, y el "último día del mes" que
   * en un ERP contable es un caso de uso real, no un caso borde.
   */
  static calcularProximaEjecucion(
    desde: Date,
    periodicidad: PeriodicidadPlantilla,
    diaEjecucion?: number | null
  ): Date | null {
    const meses = MESES_POR_PERIODICIDAD[periodicidad];
    if (!meses) {
      return null;
    }

    const anio = desde.getUTCFullYear();
    const mes = desde.getUTCMonth() + meses;
    const ultimoDiaDelMesDestino = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();

    let dia: number;
    if (diaEjecucion === -1) {
      dia = ultimoDiaDelMesDestino;
    } else if (diaEjecucion && diaEjecucion > 0) {
      // Un día 31 en un mes de 30 se ancla al último día, no salta al mes
      // siguiente: la provisión de septiembre debe caer en septiembre.
      dia = Math.min(diaEjecucion, ultimoDiaDelMesDestino);
    } else {
      dia = Math.min(desde.getUTCDate(), ultimoDiaDelMesDestino);
    }

    return new Date(Date.UTC(anio, mes, dia));
  }

  /** Etiqueta del período que consume el índice único del historial. */
  static periodoDe(fecha: Date): string {
    return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------

  async listar(tenantId: string, soloActivas = false): Promise<PlantillaAsientoResponseDto[]> {
    let query = this.supabaseService
      .getClient()
      .from('plantillas_asientos')
      .select('*')
      .eq('tenant_id', tenantId);

    if (soloActivas) {
      query = query.eq('activa', true);
    }

    const { data, error } = await query.order('nombre', { ascending: true });

    if (error) {
      throw new Error(`Error listando plantillas: ${error.message}`);
    }

    return (data || []) as PlantillaAsientoResponseDto[];
  }

  async obtener(tenantId: string, plantillaId: string): Promise<PlantillaAsientoResponseDto> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('plantillas_asientos')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', plantillaId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Plantilla ${plantillaId} no encontrada`);
    }

    const detalles = await this.obtenerDetalles(tenantId, plantillaId);
    const totalDebe = this.round2(detalles.reduce((sum, d) => sum + d.debe, 0));
    const totalHaber = this.round2(detalles.reduce((sum, d) => sum + d.haber, 0));

    return {
      ...data,
      detalles,
      total_debe: totalDebe,
      total_haber: totalHaber
    } as PlantillaAsientoResponseDto;
  }

  async crear(
    tenantId: string,
    userId: string,
    dto: CreatePlantillaAsientoDto
  ): Promise<PlantillaAsientoResponseDto> {
    this.validarDetalles(dto.detalles);

    const periodicidad = dto.periodicidad ?? PeriodicidadPlantilla.NINGUNA;

    const { data: plantilla, error } = await this.supabaseService.getClient().rpc(
      'guardar_plantilla_contable_tx_473',
      {
        p_tenant_id: tenantId,
        p_actor_id: userId,
        p_plantilla_id: null,
        p_plantilla: this.construirCabeceraRpc(dto, periodicidad),
        p_detalles: dto.detalles
      }
    );

    if (error || !plantilla) {
      throw new Error(`Error creando plantilla: ${error?.message}`);
    }

    this.logger.log(`🧾 Plantilla "${dto.nombre}" creada para ${tenantId}`);
    return this.obtener(tenantId, plantilla.id);
  }

  async actualizar(
    tenantId: string,
    userId: string,
    plantillaId: string,
    dto: UpdatePlantillaAsientoDto
  ): Promise<PlantillaAsientoResponseDto> {
    await this.obtener(tenantId, plantillaId);
    this.validarDetalles(dto.detalles);

    const periodicidad = dto.periodicidad ?? PeriodicidadPlantilla.NINGUNA;

    const { error } = await this.supabaseService.getClient().rpc(
      'guardar_plantilla_contable_tx_473',
      {
        p_tenant_id: tenantId,
        p_actor_id: userId,
        p_plantilla_id: plantillaId,
        p_plantilla: this.construirCabeceraRpc(dto, periodicidad),
        p_detalles: dto.detalles
      }
    );

    if (error) {
      throw new Error(`Error actualizando plantilla: ${error.message}`);
    }

    return this.obtener(tenantId, plantillaId);
  }

  async eliminar(tenantId: string, userId: string, plantillaId: string): Promise<void> {
    // El historial se conserva por ON DELETE SET NULL. Cabecera y lineas se
    // eliminan en una sola transaccion para no dejar plantillas vacias.
    const { error } = await this.supabaseService.getClient().rpc(
      'eliminar_plantilla_contable_tx_473',
      {
        p_tenant_id: tenantId,
        p_actor_id: userId,
        p_plantilla_id: plantillaId
      }
    );

    if (error) {
      throw new Error(`Error eliminando plantilla: ${error.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // Generación
  // --------------------------------------------------------------------------

  /**
   * Instancia un asiento a partir de la plantilla.
   *
   * `automatico` distingue la generación del scheduler de la que dispara una
   * persona, y con ello el registro en el historial.
   */
  async generar(
    tenantId: string,
    userId: string,
    plantillaId: string,
    dto: GenerarDesdePlantillaDto = {},
    automatico = false
  ): Promise<AsientoResponseDto> {
    const plantilla = await this.obtener(tenantId, plantillaId);

    if (!plantilla.activa) {
      throw new BadRequestException(
        `La plantilla "${plantilla.nombre}" está inactiva y no puede generar asientos.`
      );
    }

    const detalles = dto.detalles?.length ? dto.detalles : plantilla.detalles ?? [];
    this.validarDetalles(detalles);

    const fecha = dto.fecha ?? (await fechaHoyDelTenant(this.supabaseService.getClient(), tenantId));
    const periodo = PlantillasAsientosService.periodoDe(new Date(fecha));
    const sourceEventId = buildDeterministicUuid(
      `plantilla-asiento:${tenantId}:${plantillaId}:${periodo}`
    );

    // El índice único del historial es la barrera real contra duplicados; esta
    // comprobación solo existe para dar un mensaje entendible antes de chocar.
    const { data: yaGenerado } = await this.supabaseService
      .getClient()
      .from('plantillas_asientos_historial')
      .select('id, asiento_id')
      .eq('tenant_id', tenantId)
      .eq('plantilla_id', plantillaId)
      .eq('periodo', periodo)
      .maybeSingle();

    if (yaGenerado?.id) {
      throw new BadRequestException(
        `La plantilla "${plantilla.nombre}" ya generó un asiento para el período ${periodo} ` +
          `(asiento ${yaGenerado.asiento_id}).`
      );
    }

    // El historial da trazabilidad, pero la identidad contable vive también en
    // el asiento. Si el asiento se creó y falló la escritura del historial, la
    // clave determinista impide que un reintento duplique la provisión.
    const { data: asientoExistente, error: errorAsientoExistente } = await this.supabaseService
      .getClient()
      .from('asientos_contables')
      .select('id, numero_asiento')
      .eq('tenant_id', tenantId)
      .eq('source_event_id', sourceEventId)
      .maybeSingle();

    if (errorAsientoExistente) {
      throw new Error(
        `Error verificando la idempotencia de la plantilla: ${errorAsientoExistente.message}`
      );
    }

    if (asientoExistente?.id) {
      throw new BadRequestException(
        `La plantilla "${plantilla.nombre}" ya generó un asiento para el período ${periodo} ` +
          `(asiento ${asientoExistente.numero_asiento ?? asientoExistente.id}).`
      );
    }

    const asiento = await this.asientosService.crearAsientoManual(tenantId, userId, {
      fecha,
      concepto: dto.concepto ?? plantilla.concepto,
      referencia: dto.referencia ?? plantilla.referencia,
      estado: dto.estado ?? plantilla.crear_en_estado ?? EstadoAsiento.BORRADOR,
      detalles: detalles.map(detalle => ({
        cuenta_id: detalle.cuenta_id,
        debe: detalle.debe,
        haber: detalle.haber,
        concepto: detalle.concepto,
        centro_costo_id: detalle.centro_costo_id
      }))
    }, {
      sourceEventId,
      origen: 'PLANTILLA_CONTABLE',
      tipoAsiento: 'AJUSTE',
      plantillaId,
      plantillaPeriodo: periodo,
      plantillaGeneradoPor: userId,
      plantillaAutomatico: automatico
    });

    this.logger.log(
      `🧾 Plantilla "${plantilla.nombre}" generó el asiento ${asiento.id} para ${periodo}`
    );
    return asiento;
  }

  /**
   * Avanza la agenda de una plantilla recurrente tras generarla.
   * Si la nueva fecha supera `fecha_fin`, la plantilla se desactiva sola.
   */
  async avanzarAgenda(tenantId: string, plantillaId: string, generadaEn: Date): Promise<void> {
    const plantilla = await this.obtener(tenantId, plantillaId);
    const proxima = PlantillasAsientosService.calcularProximaEjecucion(
      generadaEn,
      plantilla.periodicidad,
      plantilla.dia_ejecucion
    );

    const superaFin =
      proxima !== null &&
      plantilla.fecha_fin !== undefined &&
      plantilla.fecha_fin !== null &&
      proxima > new Date(plantilla.fecha_fin);

    await this.supabaseService
      .getClient()
      .from('plantillas_asientos')
      .update({
        ultima_ejecucion: generadaEn.toISOString().slice(0, 10),
        proxima_ejecucion: proxima && !superaFin ? proxima.toISOString().slice(0, 10) : null,
        activa: superaFin ? false : plantilla.activa,
        updated_at: new Date().toISOString()
      })
      .eq('id', plantillaId)
      .eq('tenant_id', tenantId);
  }

  /** Plantillas recurrentes cuya fecha de generación ya venció. */
  /** Fecha de calendario del tenant, para no fechar nada con el reloj del servidor. */
  async fechaHoyDe(tenantId: string): Promise<string> {
    return fechaHoyDelTenant(this.supabaseService.getClient(), tenantId);
  }

  async obtenerVencidas(
    hasta: string,
  ): Promise<Array<{ id: string; tenant_id: string; proxima_ejecucion: string }>> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('plantillas_asientos')
      .select('id, tenant_id, proxima_ejecucion')
      .eq('activa', true)
      .not('proxima_ejecucion', 'is', null)
      .lte('proxima_ejecucion', hasta)
      .limit(200);

    if (error) {
      throw new Error(`Error obteniendo plantillas vencidas: ${error.message}`);
    }

    return (data || []) as Array<{ id: string; tenant_id: string; proxima_ejecucion: string }>;
  }

  // --------------------------------------------------------------------------
  // Internos
  // --------------------------------------------------------------------------

  private round2(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
  }

  /**
   * Mismas reglas de partida doble que el asiento real. Validarlas en la
   * plantilla evita que el error aparezca meses después, cuando el scheduler
   * intente instanciarla de madrugada.
   */
  private validarDetalles(detalles: DetallePlantillaDto[]): void {
    if (!detalles || detalles.length < 2) {
      throw new BadRequestException('La plantilla debe tener al menos 2 movimientos.');
    }

    for (const detalle of detalles) {
      if (detalle.debe > 0 && detalle.haber > 0) {
        throw new BadRequestException('Cada movimiento debe tener solo debe o haber, no ambos.');
      }
      if (detalle.debe === 0 && detalle.haber === 0) {
        throw new BadRequestException('Cada movimiento debe tener un monto mayor a cero.');
      }
    }

    const totalDebe = detalles.reduce((sum, d) => sum + d.debe, 0);
    const totalHaber = detalles.reduce((sum, d) => sum + d.haber, 0);

    if (Math.round(totalDebe * 100) !== Math.round(totalHaber * 100)) {
      throw new BadRequestException(
        `La plantilla no cuadra: Debe=${totalDebe.toFixed(2)}, Haber=${totalHaber.toFixed(2)}`
      );
    }
  }

  private async obtenerDetalles(
    tenantId: string,
    plantillaId: string
  ): Promise<DetallePlantillaDto[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('plantillas_asientos_detalle')
      .select('cuenta_id, debe, haber, concepto, centro_costo_id, orden')
      .eq('tenant_id', tenantId)
      .eq('plantilla_id', plantillaId)
      .order('orden', { ascending: true });

    if (error) {
      throw new Error(`Error obteniendo detalles de la plantilla: ${error.message}`);
    }

    return (data || []).map((fila: any) => ({
      cuenta_id: fila.cuenta_id,
      debe: Number(fila.debe) || 0,
      haber: Number(fila.haber) || 0,
      concepto: fila.concepto ?? '',
      centro_costo_id: fila.centro_costo_id ?? undefined
    }));
  }

  private construirCabeceraRpc(
    dto: CreatePlantillaAsientoDto | UpdatePlantillaAsientoDto,
    periodicidad: PeriodicidadPlantilla
  ): Record<string, unknown> {
    return {
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? null,
      concepto: dto.concepto,
      referencia: dto.referencia ?? null,
      periodicidad,
      dia_ejecucion: dto.dia_ejecucion ?? null,
      fecha_inicio: dto.fecha_inicio ?? null,
      fecha_fin: dto.fecha_fin ?? null,
      crear_en_estado: dto.crear_en_estado ?? EstadoAsiento.BORRADOR,
      activa: dto.activa ?? true
    };
  }
}
