import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { ListarAsientosQueryDto, AsientoResponseDto, DetalleAsientoDto, CreateAsientoManualDto } from '@erp-suite/dtos';
import { PeriodosService } from './periodos.service';

@Injectable()
export class AsientosService {
  private readonly logger = new Logger(AsientosService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly periodosService: PeriodosService
  ) {}

  /**
   * Lista asientos contables con filtros opcionales
   * @param tenantId - ID del tenant
   * @param filters - Filtros de búsqueda
   * @returns Lista de asientos contables con paginación
   */
  async listarAsientos(
    tenantId: string,
    filters: ListarAsientosQueryDto
  ): Promise<{
    data: AsientoResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const offset = (page - 1) * limit;

      this.logger.log(
        `📋 Listando asientos para tenant ${tenantId} con filtros: ${JSON.stringify(filters)}`
      );

      // Construir query base
      let query = this.supabaseService
        .getClient()
        .from('asientos_contables')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId);

      // Aplicar filtros
      if (filters.fecha_desde) {
        query = query.gte('fecha', filters.fecha_desde);
      }

      if (filters.fecha_hasta) {
        query = query.lte('fecha', filters.fecha_hasta);
      }

      // Note: origen column doesn't exist in DB yet, will be added in future migration
      // if (filters.origen) {
      //   query = query.eq('origen', filters.origen);
      // }

      if (filters.estado) {
        query = query.eq('estado', filters.estado);
      }

      if (filters.numero_asiento) {
        query = query.ilike('numero_asiento', `%${filters.numero_asiento}%`);
      }

      if (filters.referencia) {
        query = query.ilike('referencia', `%${filters.referencia}%`);
      }

      // Si se filtra por cuenta o centro de costo, necesitamos hacer un join con detalle_asientos
      if (filters.cuenta_id || filters.cuenta_codigo || filters.centro_costo_id) {
        // Primero obtenemos los IDs de asientos que cumplen con el filtro de detalle
        let detalleQuery = this.supabaseService
          .getClient()
          .from('detalle_asientos')
          .select('asiento_id');

        if (filters.cuenta_id) {
          detalleQuery = detalleQuery.eq('cuenta_id', filters.cuenta_id);
        }

        if (filters.cuenta_codigo) {
          // Necesitamos hacer un join con plan_cuentas
          const { data: cuentas } = await this.supabaseService
            .getClient()
            .from('plan_cuentas')
            .select('id')
            .eq('tenant_id', tenantId)
            .ilike('codigo', `%${filters.cuenta_codigo}%`);

          if (cuentas && cuentas.length > 0) {
            const cuentaIds = cuentas.map((c) => c.id);
            detalleQuery = detalleQuery.in('cuenta_id', cuentaIds);
          } else {
            // No hay cuentas que coincidan, retornar vacío
            return {
              data: [],
              total: 0,
              page,
              limit,
              totalPages: 0
            };
          }
        }

        if (filters.centro_costo_id) {
          detalleQuery = detalleQuery.eq('centro_costo_id', filters.centro_costo_id);
        }

        const { data: detalles } = await detalleQuery;

        if (detalles && detalles.length > 0) {
          const asientoIds = [...new Set(detalles.map((d) => d.asiento_id))];
          query = query.in('id', asientoIds);
        } else {
          // No hay detalles que coincidan, retornar vacío
          return {
            data: [],
            total: 0,
            page,
            limit,
            totalPages: 0
          };
        }
      }

      // Ordenar por fecha descendente (más recientes primero)
      query = query.order('fecha', { ascending: false });
      query = query.order('numero_asiento', { ascending: false });

      // Aplicar paginación
      query = query.range(offset, offset + limit - 1);

      const { data: asientos, error, count } = await query;

      if (error) {
        this.logger.error(`❌ Error listando asientos: ${error.message}`);
        throw error;
      }

      // Obtener detalles para cada asiento
      const asientosConDetalles = await Promise.all(
        (asientos || []).map(async (asiento) => {
          const detalles = await this.obtenerDetallesAsiento(tenantId, asiento.id);
          return {
            ...asiento,
            detalles
          };
        })
      );

      const totalPages = Math.ceil((count || 0) / limit);

      this.logger.log(
        `✅ Encontrados ${count} asientos, mostrando página ${page} de ${totalPages}`
      );

      return {
        data: asientosConDetalles as AsientoResponseDto[],
        total: count || 0,
        page,
        limit,
        totalPages
      };
    } catch (error) {
      this.logger.error(`❌ Error listando asientos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene un asiento contable por ID con sus detalles
   * @param tenantId - ID del tenant
   * @param asientoId - ID del asiento
   * @returns Asiento contable con detalles
   */
  async obtenerAsientoPorId(
    tenantId: string,
    asientoId: string
  ): Promise<AsientoResponseDto> {
    try {
      this.logger.log(`📋 Obteniendo asiento ${asientoId} para tenant ${tenantId}`);

      const { data: asiento, error } = await this.supabaseService
        .getClient()
        .from('asientos_contables')
        .select('*')
        .eq('id', asientoId)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !asiento) {
        throw new NotFoundException(`Asiento contable ${asientoId} no encontrado`);
      }

      // Obtener detalles del asiento
      const detalles = await this.obtenerDetallesAsiento(tenantId, asientoId);

      return {
        ...asiento,
        detalles
      } as AsientoResponseDto;
    } catch (error) {
      this.logger.error(`❌ Error obteniendo asiento: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crea un asiento contable manual
   * @param tenantId - ID del tenant
   * @param userId - ID del usuario que crea el asiento
   * @param createAsientoDto - Datos del asiento a crear
   * @returns Asiento contable creado con sus detalles
   */
  async crearAsientoManual(
    tenantId: string,
    userId: string,
    createAsientoDto: CreateAsientoManualDto
  ): Promise<AsientoResponseDto> {
    try {
      this.logger.log(`📝 Creando asiento manual para tenant ${tenantId}`);

      // Validar que el período contable esté abierto
      const fecha = new Date(createAsientoDto.fecha);
      await this.periodosService.validarPeriodoAbierto(tenantId, fecha);

      // Validar que el asiento cuadre (debe = haber)
      const totalDebe = createAsientoDto.detalles.reduce((sum, d) => sum + d.debe, 0);
      const totalHaber = createAsientoDto.detalles.reduce((sum, d) => sum + d.haber, 0);
      const totalDebeCents = Math.round(totalDebe * 100);
      const totalHaberCents = Math.round(totalHaber * 100);

      if (totalDebeCents !== totalHaberCents) {
        throw new BadRequestException(
          `El asiento no cuadra: Debe=${totalDebe.toFixed(2)}, Haber=${totalHaber.toFixed(2)}`
        );
      }

      // Validar que haya al menos 2 detalles
      if (createAsientoDto.detalles.length < 2) {
        throw new BadRequestException('El asiento debe tener al menos 2 movimientos (debe y haber)');
      }

      // Validar que cada detalle tenga solo debe o haber, no ambos
      for (const detalle of createAsientoDto.detalles) {
        if (detalle.debe > 0 && detalle.haber > 0) {
          throw new BadRequestException('Cada movimiento debe tener solo debe o haber, no ambos');
        }
        if (detalle.debe === 0 && detalle.haber === 0) {
          throw new BadRequestException('Cada movimiento debe tener un monto mayor a cero');
        }
      }

      // Validar que las cuentas existan
      const cuentaIds = createAsientoDto.detalles.map(d => d.cuenta_id);
      const { data: cuentas, error: cuentasError } = await this.supabaseService
        .getClient()
        .from('plan_cuentas')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('id', cuentaIds);

      if (cuentasError) {
        throw new Error(`Error validando cuentas: ${cuentasError.message}`);
      }

      if (!cuentas || cuentas.length !== cuentaIds.length) {
        throw new BadRequestException('Una o más cuentas no existen o no pertenecen a su organización');
      }

      // Crear asiento contable
      const { data: asiento, error: asientoError } = await this.supabaseService
        .getClient()
        .from('asientos_contables')
        .insert({
          tenant_id: tenantId,
          fecha: fecha.toISOString(),
          concepto: createAsientoDto.concepto,
          referencia: createAsientoDto.referencia,
          total_debe: totalDebe,
          total_haber: totalHaber,
          estado: 'CONFIRMADO'
        })
        .select()
        .single();

      if (asientoError) {
        this.logger.error(`❌ Error creando asiento: ${asientoError.message}`);
        throw new Error(`Error creando asiento contable: ${asientoError.message}`);
      }

      // Crear detalles del asiento
      const detallesConAsientoId = createAsientoDto.detalles.map(detalle => ({
        asiento_id: asiento.id,
        cuenta_id: detalle.cuenta_id,
        debe: detalle.debe,
        haber: detalle.haber,
        concepto: detalle.concepto,
        centro_costo_id: detalle.centro_costo_id
      }));

      const { error: detallesError } = await this.supabaseService
        .getClient()
        .from('detalle_asientos')
        .insert(detallesConAsientoId);

      if (detallesError) {
        this.logger.error(`❌ Error creando detalles: ${detallesError.message}`);
        // Rollback: eliminar asiento
        await this.supabaseService
          .getClient()
          .from('asientos_contables')
          .delete()
          .eq('id', asiento.id);
        throw new Error(`Error creando detalles del asiento: ${detallesError.message}`);
      }

      this.logger.log(
        `✅ Asiento manual ${asiento.codigo ?? asiento.numero_asiento ?? asiento.id} creado exitosamente para tenant ${tenantId}`
      );

      // Obtener el asiento completo con detalles
      return await this.obtenerAsientoPorId(tenantId, asiento.id);
    } catch (error) {
      this.logger.error(`❌ Error creando asiento manual: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de asientos generados por tipo
   * @param tenantId - ID del tenant
   * @returns Estadísticas de asientos por tipo de evento
   */
  async obtenerEstadisticasAsientosPorTipo(tenantId: string): Promise<{
    tipo: string;
    cantidad: number;
  }[]> {
    try {
      this.logger.log(`📊 Obteniendo estadísticas de asientos por tipo para tenant ${tenantId}`);

      // Query SQL para obtener conteo de asientos por tipo de evento
      const { data, error } = await this.supabaseService
        .getClient()
        .rpc('get_asientos_por_tipo', { p_tenant_id: tenantId });

      if (error) {
        this.logger.error(`❌ Error obteniendo estadísticas por tipo: ${error.message}`);
        // Si la función no existe, usar query alternativa
        return await this.obtenerEstadisticasAsientosPorTipoFallback(tenantId);
      }

      this.logger.log(`✅ Estadísticas de asientos por tipo obtenidas: ${data?.length || 0} tipos`);
      return data || [];
    } catch (error) {
      this.logger.error(`❌ Error obteniendo estadísticas por tipo: ${error.message}`);
      // Fallback a query alternativa
      return await this.obtenerEstadisticasAsientosPorTipoFallback(tenantId);
    }
  }

  /**
   * Método fallback para obtener estadísticas cuando la función RPC no existe
   * @param tenantId - ID del tenant
   * @returns Estadísticas de asientos por tipo
   */
  private async obtenerEstadisticasAsientosPorTipoFallback(tenantId: string): Promise<{
    tipo: string;
    cantidad: number;
  }[]> {
    try {
      // Obtener asientos con source_event_id
      const { data: asientos, error: asientosError } = await this.supabaseService
        .getClient()
        .from('asientos_contables')
        .select('source_event_id')
        .eq('tenant_id', tenantId)
        .not('source_event_id', 'is', null);

      if (asientosError) {
        this.logger.error(`❌ Error en fallback: ${asientosError.message}`);
        return [];
      }

      if (!asientos || asientos.length === 0) {
        return [];
      }

      // Obtener eventos correspondientes
      const eventIds = asientos.map(a => a.source_event_id);
      const { data: eventos, error: eventosError } = await this.supabaseService
        .getClient()
        .from('outbox_events')
        .select('id, event_type')
        .in('id', eventIds);

      if (eventosError) {
        this.logger.error(`❌ Error obteniendo eventos: ${eventosError.message}`);
        return [];
      }

      // Contar por tipo
      const conteo: Record<string, number> = {};
      eventos?.forEach(evento => {
        const tipo = evento.event_type || 'Manual';
        conteo[tipo] = (conteo[tipo] || 0) + 1;
      });

      // Contar asientos manuales (sin source_event_id)
      const { count: manualesCount } = await this.supabaseService
        .getClient()
        .from('asientos_contables')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .is('source_event_id', null);

      if (manualesCount && manualesCount > 0) {
        conteo['Manual'] = manualesCount;
      }

      // Convertir a array
      return Object.entries(conteo).map(([tipo, cantidad]) => ({
        tipo,
        cantidad
      }));
    } catch (error) {
      this.logger.error(`❌ Error en fallback: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtiene los detalles de un asiento contable con información de cuentas y centros de costo
   * @param tenantId - ID del tenant
   * @param asientoId - ID del asiento
   * @returns Lista de detalles del asiento
   */
  private async obtenerDetallesAsiento(
    tenantId: string,
    asientoId: string
  ): Promise<DetalleAsientoDto[]> {
    try {
      // Obtener detalles con información de cuentas
      const { data: detalles, error } = await this.supabaseService
        .getClient()
        .from('detalle_asientos')
        .select(
          `
          id,
          cuenta_id,
          debe,
          haber,
          concepto,
          centro_costo_id,
          plan_cuentas!fk_detalle_asientos_cuenta_id (
            codigo,
            nombre
          )
        `
        )
        .eq('asiento_id', asientoId);

      if (error) {
        this.logger.error(`❌ Error obteniendo detalles del asiento: ${error.message}`);
        throw error;
      }

      const centroCostoIds = [
        ...new Set((detalles || []).map((detalle: any) => detalle.centro_costo_id).filter(Boolean)),
      ];
      const centrosCostoPorId = new Map<string, string>();

      if (centroCostoIds.length > 0) {
        const { data: centrosCosto, error: centrosCostoError } = await this.supabaseService
          .getClient()
          .from('centros_costo')
          .select('id, nombre')
          .eq('tenant_id', tenantId)
          .in('id', centroCostoIds);

        if (centrosCostoError) {
          this.logger.warn(`⚠️ Error obteniendo centros de costo de detalles: ${centrosCostoError.message}`);
        }

        (centrosCosto || []).forEach((centro: any) => {
          centrosCostoPorId.set(centro.id, centro.nombre);
        });
      }

      // Mapear los detalles con la información de cuentas y centros de costo
      return (detalles || []).map((detalle: any) => ({
        id: detalle.id,
        cuenta_id: detalle.cuenta_id,
        cuenta_codigo: detalle.plan_cuentas?.codigo || '',
        cuenta_nombre: detalle.plan_cuentas?.nombre || '',
        debe: detalle.debe,
        haber: detalle.haber,
        concepto: detalle.concepto,
        centro_costo_id: detalle.centro_costo_id,
        centro_costo_nombre: detalle.centro_costo_id
          ? centrosCostoPorId.get(detalle.centro_costo_id)
          : undefined
      }));
    } catch (error) {
      this.logger.error(`❌ Error obteniendo detalles del asiento: ${error.message}`);
      return [];
    }
  }
}
