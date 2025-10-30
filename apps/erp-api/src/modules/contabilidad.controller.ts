import { Controller, Get, Post, Put, Delete, Body, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
// Remover import viejo:
// import { AccountingIntegrationService } from '../shared/integration/accounting-integration.service';

// Agregar imports nuevos:
import { AccountingEntriesService } from '../shared/integration/accounting-entries.service';
import { AccountingBooksService } from '../shared/integration/accounting-books.service';
import { AccountingReportsService } from '../shared/integration/accounting-reports.service';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { CurrentTenant, CurrentUser, SuperAdminGuard } from '../common';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CreatePeriodoDto, PeriodoResponseDto, CreatePresupuestoDto, UpdatePresupuestoDto, PresupuestoResponseDto, ListarAsientosQueryDto, AsientoResponseDto, CreateAsientoManualDto } from '@erp-suite/dtos';
import { PeriodosService } from './contabilidad/services/periodos.service';
import { EstadosFinancierosService } from './contabilidad/services/estados-financieros.service';
import { PresupuestosService } from './contabilidad/services/presupuestos.service';
import { AsientosService } from './contabilidad/services/asientos.service';
import { CentrosCostoService } from './contabilidad/services/centros-costo.service';
import { OutboxEventsService } from './contabilidad/services/outbox-events.service';
import { AsientosGeneratorService } from './contabilidad/services/asientos-generator.service';

@ApiTags('contabilidad')
@Controller('contabilidad')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: permisos granulares obligatorios.
export class ContabilidadController {

  constructor(
    private readonly accountingService: AccountingBooksService,
    private readonly supabaseService: SupabaseService,
    private readonly periodosService: PeriodosService,
    private readonly estadosFinancierosService: EstadosFinancierosService,
    private readonly presupuestosService: PresupuestosService,
    private readonly asientosService: AsientosService,
    private readonly centrosCostoService: CentrosCostoService,
    private readonly outboxEventsService: OutboxEventsService,
    private readonly asientosGeneratorService: AsientosGeneratorService
  ) {
    console.log('📚 [ContabilidadController] Inicializado con AccountingBooksService');
  }

  // =============================================
  // 📅 GESTIÓN DE PERÍODOS CONTABLES
  // =============================================

  @Post('periodos')
  @RequirePermission('contabilidad.periodos.crear') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Crear nuevo período contable' })
  @ApiResponse({ 
    status: 201, 
    description: 'Período contable creado exitosamente',
    type: PeriodoResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Datos inválidos o período ya existe' 
  })
  async crearPeriodo(
    @CurrentTenant() tenantId: string,
    @Body() createPeriodoDto: CreatePeriodoDto
  ): Promise<{ success: boolean; data: PeriodoResponseDto; message: string }> {
    try {
      console.log(`📅 [Contabilidad] Creando período ${createPeriodoDto.anio}-${createPeriodoDto.mes} para tenant ${tenantId}`);
      
      const periodo = await this.periodosService.crearPeriodo(
        tenantId,
        createPeriodoDto.anio,
        createPeriodoDto.mes
      );

      return {
        success: true,
        data: periodo as PeriodoResponseDto,
        message: `Período ${createPeriodoDto.anio}-${String(createPeriodoDto.mes).padStart(2, '0')} creado exitosamente`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error creando período:', error);
      throw error;
    }
  }

  @Get('periodos')
  @RequirePermission('contabilidad.periodos.read') // HARDENING: lectura de periodos.
  @ApiOperation({ summary: 'Obtener todos los períodos contables del tenant' })
  @ApiResponse({ 
    status: 200, 
    description: 'Períodos contables obtenidos exitosamente',
    type: [PeriodoResponseDto]
  })
  async obtenerPeriodos(
    @CurrentTenant() tenantId: string
  ): Promise<{ success: boolean; data: PeriodoResponseDto[] }> {
    try {
      console.log(`📅 [Contabilidad] Obteniendo períodos para tenant ${tenantId}`);
      
      const periodos = await this.periodosService.obtenerPeriodos(tenantId);

      return {
        success: true,
        data: periodos as PeriodoResponseDto[]
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo períodos:', error);
      throw error;
    }
  }

  @Get('periodos/:id')
  @RequirePermission('contabilidad.periodos.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener un período contable específico por ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Período contable obtenido exitosamente',
    type: PeriodoResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Período no encontrado' 
  })
  async obtenerPeriodoPorId(
    @CurrentTenant() tenantId: string,
    @Param('id') periodoId: string
  ): Promise<{ success: boolean; data: PeriodoResponseDto | null }> {
    try {
      console.log(`📅 [Contabilidad] Obteniendo período ${periodoId} para tenant ${tenantId}`);
      
      // Get the period by ID and verify it belongs to the tenant
      const { data, error } = await this.supabaseService
        .getClient()
        .from('periodos_contables')
        .select('*')
        .eq('id', periodoId)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !data) {
        return {
          success: false,
          data: null
        };
      }

      return {
        success: true,
        data: data as PeriodoResponseDto
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo período:', error);
      throw error;
    }
  }

  @Get('periodos/:id/validar-cierre')
  @RequirePermission('contabilidad.periodos.validar') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Validar si un período puede ser cerrado' })
  @ApiResponse({ 
    status: 200, 
    description: 'Validaciones del período',
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Período no encontrado' 
  })
  async validarCierrePeriodo(
    @CurrentTenant() tenantId: string,
    @Param('id') periodoId: string
  ): Promise<{ 
    asientos: { valido: boolean; asientosDescuadrados: any[] };
    eventos: { valido: boolean; eventosPendientes: number };
  }> {
    try {
      console.log(`🔍 [Contabilidad] Validando cierre de período ${periodoId} para tenant ${tenantId}`);
      
      // Get the period by ID to extract anio and mes
      const { data: periodoData, error: periodoError } = await this.supabaseService
        .getClient()
        .from('periodos_contables')
        .select('*')
        .eq('id', periodoId)
        .eq('tenant_id', tenantId)
        .single();

      if (periodoError || !periodoData) {
        throw new Error('Período no encontrado');
      }

      // Validate asientos
      const validacionAsientos = await this.periodosService.validarAsientosCuadran(
        tenantId,
        periodoData.anio,
        periodoData.mes
      );

      // Validate eventos
      const validacionEventos = await this.periodosService.validarEventosPendientes(
        tenantId,
        periodoData.anio,
        periodoData.mes
      );

      return {
        asientos: validacionAsientos,
        eventos: validacionEventos
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error validando cierre de período:', error);
      throw error;
    }
  }

  @Post('periodos/:id/cerrar')
  @RequirePermission('contabilidad.periodos.cerrar') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Cerrar un período contable' })
  @ApiResponse({ 
    status: 200, 
    description: 'Período contable cerrado exitosamente',
    type: PeriodoResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'No se puede cerrar el período (asientos descuadrados o eventos pendientes)' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Período no encontrado' 
  })
  async cerrarPeriodo(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') periodoId: string
  ): Promise<{ success: boolean; data: PeriodoResponseDto; message: string }> {
    try {
      console.log(`🔒 [Contabilidad] Cerrando período ${periodoId} para tenant ${tenantId} por usuario ${userId}`);
      
      // Get the period by ID to extract anio and mes
      const { data: periodoData, error: periodoError } = await this.supabaseService
        .getClient()
        .from('periodos_contables')
        .select('*')
        .eq('id', periodoId)
        .eq('tenant_id', tenantId)
        .single();

      if (periodoError || !periodoData) {
        throw new Error('Período no encontrado');
      }

      // Call the service method with validations
      const periodoCerrado = await this.periodosService.cerrarPeriodo(
        tenantId,
        periodoData.anio,
        periodoData.mes,
        userId
      );

      return {
        success: true,
        data: periodoCerrado as PeriodoResponseDto,
        message: `Período ${periodoData.anio}-${String(periodoData.mes).padStart(2, '0')} cerrado exitosamente`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error cerrando período:', error);
      throw error;
    }
  }

  @Post('periodos/:id/reabrir')
  @RequirePermission('contabilidad.periodos.reabrir') // HARDENING: permisos granulares.
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Reabrir un período contable cerrado (solo superadmin)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Período contable reabierto exitosamente',
    type: PeriodoResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'El período ya está abierto o no existe' 
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Acceso denegado: se requieren privilegios de super-administrador' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Período no encontrado' 
  })
  async reabrirPeriodo(
    @CurrentTenant() tenantId: string,
    @Param('id') periodoId: string
  ): Promise<{ success: boolean; data: PeriodoResponseDto; message: string }> {
    try {
      console.log(`🔓 [Contabilidad] Reabriendo período ${periodoId} para tenant ${tenantId}`);
      
      // Get the period by ID to extract anio and mes
      const { data: periodoData, error: periodoError } = await this.supabaseService
        .getClient()
        .from('periodos_contables')
        .select('*')
        .eq('id', periodoId)
        .eq('tenant_id', tenantId)
        .single();

      if (periodoError || !periodoData) {
        throw new Error('Período no encontrado');
      }

      // Call the service method to reopen
      const periodoReabierto = await this.periodosService.reabrirPeriodo(
        tenantId,
        periodoData.anio,
        periodoData.mes
      );

      return {
        success: true,
        data: periodoReabierto as PeriodoResponseDto,
        message: `Período ${periodoData.anio}-${String(periodoData.mes).padStart(2, '0')} reabierto exitosamente`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error reabriendo período:', error);
      throw error;
    }
  }

  @Post('periodos/:id/bloquear')
  @RequirePermission('contabilidad.periodos.bloquear') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Bloquear un período contable' })
  @ApiResponse({ 
    status: 200, 
    description: 'Período contable bloqueado exitosamente',
    type: PeriodoResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'El período no existe' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Período no encontrado' 
  })
  async bloquearPeriodo(
    @CurrentTenant() tenantId: string,
    @Param('id') periodoId: string
  ): Promise<{ success: boolean; data: PeriodoResponseDto; message: string }> {
    try {
      console.log(`🚫 [Contabilidad] Bloqueando período ${periodoId} para tenant ${tenantId}`);
      
      // Get the period by ID to extract anio and mes
      const { data: periodoData, error: periodoError } = await this.supabaseService
        .getClient()
        .from('periodos_contables')
        .select('*')
        .eq('id', periodoId)
        .eq('tenant_id', tenantId)
        .single();

      if (periodoError || !periodoData) {
        throw new Error('Período no encontrado');
      }

      // Call the service method to block
      const periodoBloqueado = await this.periodosService.bloquearPeriodo(
        tenantId,
        periodoData.anio,
        periodoData.mes
      );

      return {
        success: true,
        data: periodoBloqueado as PeriodoResponseDto,
        message: `Período ${periodoData.anio}-${String(periodoData.mes).padStart(2, '0')} bloqueado exitosamente`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error bloqueando período:', error);
      throw error;
    }
  }

  // =============================================
  // 💰 GESTIÓN DE PRESUPUESTOS
  // =============================================

  @Post('presupuestos')
  @RequirePermission('contabilidad.presupuestos.crear') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Crear nuevo presupuesto por centro de costo, cuenta y período' })
  @ApiResponse({ 
    status: 201, 
    description: 'Presupuesto creado exitosamente',
    type: PresupuestoResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Datos inválidos o presupuesto duplicado (ya existe para el mismo centro, cuenta y período)' 
  })
  async crearPresupuesto(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() createPresupuestoDto: CreatePresupuestoDto
  ): Promise<{ success: boolean; data: PresupuestoResponseDto; message: string }> {
    try {
      console.log(`💰 [Contabilidad] Creando presupuesto para tenant ${tenantId}`);
      
      const presupuesto = await this.presupuestosService.crearPresupuesto(
        tenantId,
        createPresupuestoDto,
        userId
      );

      return {
        success: true,
        data: presupuesto as PresupuestoResponseDto,
        message: 'Presupuesto creado exitosamente'
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error creando presupuesto:', error);
      throw error;
    }
  }

  @Get('presupuestos')
  @RequirePermission('contabilidad.presupuestos.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Listar presupuestos con filtros opcionales' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de presupuestos obtenida exitosamente',
    type: [PresupuestoResponseDto]
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Parámetros inválidos' 
  })
  async listarPresupuestos(
    @CurrentTenant() tenantId: string,
    @Query('centro_costo_id') centroCostoId?: string,
    @Query('cuenta_id') cuentaId?: string,
    @Query('periodo_contable_id') periodoContableId?: string,
    @Query('estado') estado?: string
  ): Promise<{ success: boolean; data: PresupuestoResponseDto[]; message?: string }> {
    try {
      console.log(`💰 [Contabilidad] Listando presupuestos para tenant ${tenantId}`);
      
      // Construir filtros
      const filters: any = {};
      if (centroCostoId) filters.centro_costo_id = centroCostoId;
      if (cuentaId) filters.cuenta_id = cuentaId;
      if (periodoContableId) filters.periodo_contable_id = periodoContableId;
      if (estado) filters.estado = estado;

      const presupuestos = await this.presupuestosService.obtenerPresupuestos(
        tenantId,
        filters
      );

      return {
        success: true,
        data: presupuestos as PresupuestoResponseDto[],
        message: `${presupuestos.length} presupuesto(s) encontrado(s)`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error listando presupuestos:', error);
      throw error;
    }
  }

  @Get('presupuestos/:id')
  @RequirePermission('contabilidad.presupuestos.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener un presupuesto específico por ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Presupuesto obtenido exitosamente',
    type: PresupuestoResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Presupuesto no encontrado' 
  })
  async obtenerPresupuestoPorId(
    @CurrentTenant() tenantId: string,
    @Param('id') presupuestoId: string
  ): Promise<{ success: boolean; data: PresupuestoResponseDto; message?: string }> {
    try {
      console.log(`💰 [Contabilidad] Obteniendo presupuesto ${presupuestoId} para tenant ${tenantId}`);
      
      const presupuesto = await this.presupuestosService.obtenerPresupuestoPorId(
        tenantId,
        presupuestoId
      );

      return {
        success: true,
        data: presupuesto as PresupuestoResponseDto,
        message: 'Presupuesto obtenido exitosamente'
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo presupuesto:', error);
      throw error;
    }
  }

  @Put('presupuestos/:id')
  @RequirePermission('contabilidad.presupuestos.actualizar') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Actualizar un presupuesto existente' })
  @ApiResponse({ 
    status: 200, 
    description: 'Presupuesto actualizado exitosamente',
    type: PresupuestoResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Datos inválidos o período cerrado' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Presupuesto no encontrado' 
  })
  async actualizarPresupuesto(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') presupuestoId: string,
    @Body() updatePresupuestoDto: UpdatePresupuestoDto
  ): Promise<{ success: boolean; data: PresupuestoResponseDto; message: string }> {
    try {
      console.log(`💰 [Contabilidad] Actualizando presupuesto ${presupuestoId} para tenant ${tenantId}`);
      
      const presupuesto = await this.presupuestosService.actualizarPresupuesto(
        tenantId,
        presupuestoId,
        updatePresupuestoDto,
        userId
      );

      return {
        success: true,
        data: presupuesto as PresupuestoResponseDto,
        message: 'Presupuesto actualizado exitosamente'
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error actualizando presupuesto:', error);
      throw error;
    }
  }

  @Delete('presupuestos/:id')
  @RequirePermission('contabilidad.presupuestos.eliminar') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Eliminar un presupuesto existente' })
  @ApiResponse({ 
    status: 200, 
    description: 'Presupuesto eliminado exitosamente',
    type: PresupuestoResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'No se puede eliminar el presupuesto (período cerrado)' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Presupuesto no encontrado' 
  })
  async eliminarPresupuesto(
    @CurrentTenant() tenantId: string,
    @Param('id') presupuestoId: string
  ): Promise<{ success: boolean; data: PresupuestoResponseDto; message: string }> {
    try {
      console.log(`💰 [Contabilidad] Eliminando presupuesto ${presupuestoId} para tenant ${tenantId}`);
      
      const presupuesto = await this.presupuestosService.eliminarPresupuesto(
        tenantId,
        presupuestoId
      );

      return {
        success: true,
        data: presupuesto as PresupuestoResponseDto,
        message: 'Presupuesto eliminado exitosamente'
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error eliminando presupuesto:', error);
      throw error;
    }
  }

  @Get('presupuestos/centro/:centroId/periodo/:periodoId')
  @RequirePermission('contabilidad.presupuestos.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener presupuestos por centro de costo y período' })
  @ApiResponse({ 
    status: 200, 
    description: 'Presupuestos obtenidos exitosamente con cálculos de ejecución',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            centro_costo: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                codigo: { type: 'string' },
                nombre: { type: 'string' }
              }
            },
            periodo: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                anio: { type: 'number' },
                mes: { type: 'number' },
                estado: { type: 'string' }
              }
            },
            presupuestos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  cuenta: { type: 'object' },
                  monto_presupuestado: { type: 'number' },
                  monto_ejecutado: { type: 'number' },
                  monto_comprometido: { type: 'number' },
                  monto_disponible: { type: 'number' },
                  porcentaje_ejecutado: { type: 'number' },
                  alerta: { type: 'string', enum: ['NORMAL', 'ADVERTENCIA', 'SOBREGIRO'] }
                }
              }
            },
            resumen: {
              type: 'object',
              properties: {
                total_presupuestado: { type: 'number' },
                total_ejecutado: { type: 'number' },
                total_disponible: { type: 'number' },
                porcentaje_ejecucion_global: { type: 'number' }
              }
            }
          }
        },
        message: { type: 'string' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Centro de costo o período no encontrado' 
  })
  async obtenerPresupuestosPorCentroYPeriodo(
    @CurrentTenant() tenantId: string,
    @Param('centroId') centroCostoId: string,
    @Param('periodoId') periodoContableId: string
  ): Promise<{ success: boolean; data: any; message: string }> {
    try {
      console.log(`💰 [Contabilidad] Obteniendo presupuestos para centro ${centroCostoId} y período ${periodoContableId}`);
      
      // Verificar que el centro de costo existe y pertenece al tenant
      const { data: centroCosto, error: errorCentro } = await this.supabaseService
        .getClient()
        .from('centros_costo')
        .select('id, codigo, nombre, descripcion')
        .eq('id', centroCostoId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (errorCentro || !centroCosto) {
        return {
          success: false,
          data: null,
          message: 'Centro de costo no encontrado o no pertenece a su organización'
        };
      }

      // Verificar que el período existe y pertenece al tenant
      const { data: periodo, error: errorPeriodo } = await this.supabaseService
        .getClient()
        .from('periodos_contables')
        .select('id, anio, mes, estado')
        .eq('id', periodoContableId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (errorPeriodo || !periodo) {
        return {
          success: false,
          data: null,
          message: 'Período contable no encontrado o no pertenece a su organización'
        };
      }

      // Obtener presupuestos con cálculos
      const presupuestos = await this.presupuestosService.obtenerPresupuestosPorCentroYPeriodo(
        tenantId,
        centroCostoId,
        periodoContableId
      );

      // Calcular resumen
      const totalPresupuestado = presupuestos.reduce((sum, p) => sum + p.monto_presupuestado, 0);
      const totalEjecutado = presupuestos.reduce((sum, p) => sum + p.monto_ejecutado, 0);
      const totalDisponible = presupuestos.reduce((sum, p) => sum + p.monto_disponible, 0);
      const porcentajeEjecucionGlobal = totalPresupuestado > 0 
        ? (totalEjecutado / totalPresupuestado) * 100 
        : 0;

      return {
        success: true,
        data: {
          centro_costo: centroCosto,
          periodo: periodo,
          presupuestos: presupuestos,
          resumen: {
            total_presupuestos: presupuestos.length,
            total_presupuestado: totalPresupuestado,
            total_ejecutado: totalEjecutado,
            total_comprometido: presupuestos.reduce((sum, p) => sum + (p.monto_comprometido || 0), 0),
            total_disponible: totalDisponible,
            porcentaje_ejecucion_global: porcentajeEjecucionGlobal,
            alertas: {
              sobregiros: presupuestos.filter(p => p.alerta === 'SOBREGIRO').length,
              advertencias: presupuestos.filter(p => p.alerta === 'ADVERTENCIA').length,
              normales: presupuestos.filter(p => p.alerta === 'NORMAL').length
            }
          }
        },
        message: `${presupuestos.length} presupuesto(s) encontrado(s) para ${centroCosto.nombre} en ${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo presupuestos por centro y período:', error);
      throw error;
    }
  }

  @Get('presupuestos/comparacion/:periodoId')
  @RequirePermission('contabilidad.presupuestos.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener comparación de presupuesto vs real para todos los centros de costo en un período' })
  @ApiResponse({ 
    status: 200, 
    description: 'Comparación de presupuesto vs real obtenida exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            periodo: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                anio: { type: 'number' },
                mes: { type: 'number' },
                estado: { type: 'string' },
                descripcion: { type: 'string' }
              }
            },
            centros_costo: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  centro_costo: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      codigo: { type: 'string' },
                      nombre: { type: 'string' },
                      descripcion: { type: 'string' }
                    }
                  },
                  cuentas: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        cuenta: { type: 'object' },
                        monto_presupuestado: { type: 'number' },
                        monto_ejecutado: { type: 'number' },
                        monto_comprometido: { type: 'number' },
                        monto_disponible: { type: 'number' },
                        porcentaje_ejecutado: { type: 'number' },
                        variacion: { type: 'number' },
                        variacion_porcentaje: { type: 'number' },
                        alerta: { type: 'string', enum: ['NORMAL', 'ADVERTENCIA', 'SOBREGIRO'] }
                      }
                    }
                  },
                  totales: {
                    type: 'object',
                    properties: {
                      presupuestado: { type: 'number' },
                      ejecutado: { type: 'number' },
                      comprometido: { type: 'number' },
                      disponible: { type: 'number' },
                      variacion: { type: 'number' },
                      porcentaje_ejecucion: { type: 'number' },
                      variacion_porcentaje: { type: 'number' },
                      alerta: { type: 'string' }
                    }
                  }
                }
              }
            },
            resumen_global: {
              type: 'object',
              properties: {
                total_presupuestado: { type: 'number' },
                total_ejecutado: { type: 'number' },
                total_comprometido: { type: 'number' },
                total_disponible: { type: 'number' },
                total_variacion: { type: 'number' },
                porcentaje_ejecucion: { type: 'number' },
                variacion_porcentaje: { type: 'number' },
                total_centros: { type: 'number' },
                total_cuentas: { type: 'number' },
                alertas: {
                  type: 'object',
                  properties: {
                    sobregiros: { type: 'number' },
                    advertencias: { type: 'number' },
                    normales: { type: 'number' }
                  }
                }
              }
            }
          }
        },
        message: { type: 'string' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Período no encontrado' 
  })
  async obtenerComparacionPresupuestoVsReal(
    @CurrentTenant() tenantId: string,
    @Param('periodoId') periodoContableId: string
  ): Promise<{ success: boolean; data: any; message: string }> {
    try {
      console.log(`💰 [Contabilidad] Obteniendo comparación presupuesto vs real para período ${periodoContableId}`);
      
      const comparacion = await this.presupuestosService.obtenerComparacionPresupuestoVsReal(
        tenantId,
        periodoContableId
      );

      return {
        success: true,
        data: comparacion,
        message: `Comparación generada para ${comparacion.centros_costo.length} centro(s) de costo con ${comparacion.resumen_global.total_cuentas} cuenta(s) presupuestada(s)`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo comparación presupuesto vs real:', error);
      throw error;
    }
  }

  @Post('presupuestos/:id/actualizar-ejecucion')
  @RequirePermission('contabilidad.presupuestos.ejecucion') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Actualizar la ejecución presupuestal de un presupuesto específico' })
  @ApiResponse({ 
    status: 200, 
    description: 'Ejecución presupuestal actualizada exitosamente',
    type: PresupuestoResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Presupuesto no encontrado' 
  })
  async actualizarEjecucionPresupuestal(
    @CurrentTenant() tenantId: string,
    @Param('id') presupuestoId: string
  ): Promise<{ success: boolean; data: PresupuestoResponseDto; message: string }> {
    try {
      console.log(`💰 [Contabilidad] Actualizando ejecución presupuestal para presupuesto ${presupuestoId}`);
      
      const presupuesto = await this.presupuestosService.actualizarEjecucionPresupuestal(
        tenantId,
        presupuestoId
      );

      // Determinar mensaje según nivel de alerta
      let mensaje = 'Ejecución presupuestal actualizada exitosamente';
      if (presupuesto.porcentaje_ejecutado > 100) {
        mensaje += ` - ⚠️ SOBREGIRO: ${presupuesto.porcentaje_ejecutado}% ejecutado`;
      } else if (presupuesto.porcentaje_ejecutado > 90) {
        mensaje += ` - ⚠️ ADVERTENCIA: ${presupuesto.porcentaje_ejecutado}% ejecutado`;
      }

      return {
        success: true,
        data: presupuesto as PresupuestoResponseDto,
        message: mensaje
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error actualizando ejecución presupuestal:', error);
      throw error;
    }
  }

  @Post('presupuestos/periodo/:periodoId/actualizar-ejecucion')
  @RequirePermission('contabilidad.presupuestos.ejecucion') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Actualizar la ejecución presupuestal de todos los presupuestos de un período' })
  @ApiResponse({ 
    status: 200, 
    description: 'Ejecución presupuestal actualizada para todos los presupuestos del período',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            actualizados: { type: 'number' },
            errores: { type: 'number' }
          }
        },
        message: { type: 'string' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Período no encontrado' 
  })
  async actualizarEjecucionPresupuestalPorPeriodo(
    @CurrentTenant() tenantId: string,
    @Param('periodoId') periodoContableId: string
  ): Promise<{ success: boolean; data: { actualizados: number; errores: number }; message: string }> {
    try {
      console.log(`💰 [Contabilidad] Actualizando ejecución presupuestal para todos los presupuestos del período ${periodoContableId}`);
      
      const resultado = await this.presupuestosService.actualizarEjecucionPresupuestalPorPeriodo(
        tenantId,
        periodoContableId
      );

      return {
        success: true,
        data: resultado,
        message: `Actualización masiva completada: ${resultado.actualizados} presupuesto(s) actualizado(s), ${resultado.errores} error(es)`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error actualizando ejecución presupuestal por período:', error);
      throw error;
    }
  }

  // =============================================
  // 🚨 ALERTAS DE SOBREGIRO PRESUPUESTAL
  // =============================================

  @Get('presupuestos/alertas')
  @RequirePermission('contabilidad.presupuestos.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener todas las alertas de sobregiro presupuestal activas' })
  @ApiResponse({ 
    status: 200, 
    description: 'Alertas de sobregiro obtenidas exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              presupuesto_id: { type: 'string' },
              nivel_alerta: { type: 'string', enum: ['SOBREGIRO', 'ADVERTENCIA'] },
              severidad: { type: 'string', enum: ['CRITICO', 'ALTO'] },
              porcentaje_ejecutado: { type: 'number' },
              monto_presupuestado: { type: 'number' },
              monto_ejecutado: { type: 'number' },
              monto_comprometido: { type: 'number' },
              monto_disponible: { type: 'number' },
              excedente: { type: 'number' },
              centro_costo: { type: 'object' },
              cuenta: { type: 'object' },
              periodo: { type: 'object' },
              mensaje: { type: 'string' },
              fecha_deteccion: { type: 'string' }
            }
          }
        },
        message: { type: 'string' }
      }
    }
  })
  async obtenerAlertasSobregiro(
    @CurrentTenant() tenantId: string,
    @Query('periodo_id') periodoContableId?: string
  ): Promise<{ success: boolean; data: any[]; message: string }> {
    try {
      console.log(`🚨 [Contabilidad] Obteniendo alertas de sobregiro para tenant ${tenantId}`);
      
      const alertas = await this.presupuestosService.obtenerAlertasSobregiro(
        tenantId,
        periodoContableId
      );

      const sobregiros = alertas.filter(a => a.nivel_alerta === 'SOBREGIRO').length;
      const advertencias = alertas.filter(a => a.nivel_alerta === 'ADVERTENCIA').length;

      return {
        success: true,
        data: alertas,
        message: `${alertas.length} alerta(s) detectada(s): ${sobregiros} sobregiro(s), ${advertencias} advertencia(s)`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo alertas de sobregiro:', error);
      throw error;
    }
  }

  @Get('presupuestos/alertas/resumen')
  @RequirePermission('contabilidad.presupuestos.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener resumen de alertas agrupadas por nivel de severidad' })
  @ApiResponse({ 
    status: 200, 
    description: 'Resumen de alertas obtenido exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            total_alertas: { type: 'number' },
            sobregiros: {
              type: 'object',
              properties: {
                cantidad: { type: 'number' },
                total_excedente: { type: 'number' },
                alertas: { type: 'array' }
              }
            },
            advertencias: {
              type: 'object',
              properties: {
                cantidad: { type: 'number' },
                total_en_riesgo: { type: 'number' },
                alertas: { type: 'array' }
              }
            },
            fecha_generacion: { type: 'string' }
          }
        },
        message: { type: 'string' }
      }
    }
  })
  async obtenerResumenAlertas(
    @CurrentTenant() tenantId: string,
    @Query('periodo_id') periodoContableId?: string
  ): Promise<{ success: boolean; data: any; message: string }> {
    try {
      console.log(`📊 [Contabilidad] Obteniendo resumen de alertas para tenant ${tenantId}`);
      
      const resumen = await this.presupuestosService.obtenerResumenAlertas(
        tenantId,
        periodoContableId
      );

      return {
        success: true,
        data: resumen,
        message: `Resumen generado: ${resumen.total_alertas} alerta(s) total(es)`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo resumen de alertas:', error);
      throw error;
    }
  }

  // =============================================
  // 🏢 CENTROS DE COSTO
  // =============================================

  @Get('centros-costo')
  @RequirePermission('contabilidad.centros_costo.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Listar todos los centros de costo del tenant' })
  @ApiResponse({ 
    status: 200, 
    description: 'Centros de costo obtenidos exitosamente'
  })
  async listarCentrosCosto(
    @CurrentTenant() tenantId: string
  ): Promise<{ success: boolean; data: any[] }> {
    try {
      console.log(`🏢 [Contabilidad] Listando centros de costo para tenant ${tenantId}`);
      
      const centros = await this.centrosCostoService.listarCentrosCosto(tenantId);

      return {
        success: true,
        data: centros
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error listando centros de costo:', error);
      throw error;
    }
  }

  @Get('centros-costo/:id')
  @RequirePermission('contabilidad.centros_costo.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener un centro de costo específico por ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Centro de costo obtenido exitosamente'
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Centro de costo no encontrado' 
  })
  async obtenerCentroCosto(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string
  ): Promise<{ success: boolean; data: any }> {
    try {
      console.log(`🏢 [Contabilidad] Obteniendo centro de costo ${id} para tenant ${tenantId}`);
      
      const centro = await this.centrosCostoService.obtenerCentroCosto(tenantId, id);

      return {
        success: true,
        data: centro
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo centro de costo:', error);
      throw error;
    }
  }

  @Post('centros-costo')
  @RequirePermission('contabilidad.centros_costo.crear') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Crear nuevo centro de costo' })
  @ApiResponse({ 
    status: 201, 
    description: 'Centro de costo creado exitosamente'
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Datos inválidos o código duplicado' 
  })
  async crearCentroCosto(
    @CurrentTenant() tenantId: string,
    @Body() body: { codigo: string; nombre: string; descripcion?: string }
  ): Promise<{ success: boolean; data: any; message: string }> {
    try {
      console.log(`🏢 [Contabilidad] Creando centro de costo ${body.codigo} para tenant ${tenantId}`);
      
      const centro = await this.centrosCostoService.crearCentroCosto(
        tenantId,
        body.codigo,
        body.nombre,
        body.descripcion
      );

      return {
        success: true,
        data: centro,
        message: `Centro de costo ${body.codigo} creado exitosamente`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error creando centro de costo:', error);
      throw error;
    }
  }

  @Put('centros-costo/:id')
  @RequirePermission('contabilidad.centros_costo.actualizar') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Actualizar un centro de costo existente' })
  @ApiResponse({ 
    status: 200, 
    description: 'Centro de costo actualizado exitosamente'
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Centro de costo no encontrado' 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Datos inválidos o código duplicado' 
  })
  async actualizarCentroCosto(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: { codigo?: string; nombre?: string; descripcion?: string; activo?: boolean }
  ): Promise<{ success: boolean; data: any; message: string }> {
    try {
      console.log(`🏢 [Contabilidad] Actualizando centro de costo ${id} para tenant ${tenantId}`);
      
      const centro = await this.centrosCostoService.actualizarCentroCosto(
        tenantId,
        id,
        body
      );

      return {
        success: true,
        data: centro,
        message: `Centro de costo actualizado exitosamente`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error actualizando centro de costo:', error);
      throw error;
    }
  }

  @Get('centros-costo/:id/asientos')
  @RequirePermission('contabilidad.centros_costo.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener asientos contables por centro de costo' })
  @ApiResponse({ 
    status: 200, 
    description: 'Asientos contables obtenidos exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              numero_asiento: { type: 'string' },
              fecha: { type: 'string', format: 'date' },
              concepto: { type: 'string' },
              referencia: { type: 'string' },
              total_debe: { type: 'number' },
              total_haber: { type: 'number' },
              estado: { type: 'string' },
              detalles: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    cuenta_id: { type: 'string' },
                    cuenta_codigo: { type: 'string' },
                    cuenta_nombre: { type: 'string' },
                    debe: { type: 'number' },
                    haber: { type: 'number' },
                    concepto: { type: 'string' },
                    centro_costo_id: { type: 'string' },
                    centro_costo_nombre: { type: 'string' }
                  }
                }
              }
            }
          }
        },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
            totalPages: { type: 'number' }
          }
        },
        message: { type: 'string' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Centro de costo no encontrado' 
  })
  async obtenerAsientosPorCentro(
    @CurrentTenant() tenantId: string,
    @Param('id') centroCostoId: string,
    @Query('fecha_desde') fechaDesde?: string,
    @Query('fecha_hasta') fechaHasta?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ): Promise<{ success: boolean; data: any[]; pagination: any; message: string }> {
    try {
      console.log(`🏢 [Contabilidad] Obteniendo asientos para centro de costo ${centroCostoId}`);
      
      const filters = {
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 50
      };

      const resultado = await this.centrosCostoService.obtenerAsientosPorCentro(
        tenantId,
        centroCostoId,
        filters
      );

      return {
        success: true,
        data: resultado.data,
        pagination: {
          total: resultado.total,
          page: resultado.page,
          limit: resultado.limit,
          totalPages: resultado.totalPages
        },
        message: `${resultado.total} asiento(s) encontrado(s) para el centro de costo`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo asientos por centro de costo:', error);
      throw error;
    }
  }

  @Get('centros-costo/:id/reporte-gastos')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener reporte de gastos por centro de costo' })
  @ApiResponse({ 
    status: 200, 
    description: 'Reporte de gastos obtenido exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            centro_costo: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                codigo: { type: 'string' },
                nombre: { type: 'string' },
                descripcion: { type: 'string' },
                activo: { type: 'boolean' }
              }
            },
            periodo: {
              type: 'object',
              properties: {
                fecha_desde: { type: 'string', format: 'date' },
                fecha_hasta: { type: 'string', format: 'date' }
              }
            },
            gastos_por_cuenta: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  cuenta_id: { type: 'string' },
                  cuenta_codigo: { type: 'string' },
                  cuenta_nombre: { type: 'string' },
                  total_debe: { type: 'number' },
                  total_haber: { type: 'number' },
                  saldo: { type: 'number' },
                  cantidad_movimientos: { type: 'number' }
                }
              }
            },
            resumen: {
              type: 'object',
              properties: {
                total_gastos: { type: 'number' },
                total_movimientos: { type: 'number' },
                cuenta_mayor_gasto: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    codigo: { type: 'string' },
                    nombre: { type: 'string' },
                    monto: { type: 'number' }
                  }
                }
              }
            }
          }
        },
        message: { type: 'string' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Centro de costo no encontrado' 
  })
  async obtenerReporteGastosPorCentro(
    @CurrentTenant() tenantId: string,
    @Param('id') centroCostoId: string,
    @Query('fecha_desde') fechaDesde?: string,
    @Query('fecha_hasta') fechaHasta?: string
  ): Promise<{ success: boolean; data: any; message: string }> {
    try {
      console.log(`📊 [Contabilidad] Generando reporte de gastos para centro de costo ${centroCostoId}`);
      
      const filters = {
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta
      };

      const reporte = await this.centrosCostoService.obtenerReporteGastosPorCentro(
        tenantId,
        centroCostoId,
        filters
      );

      return {
        success: true,
        data: reporte,
        message: `Reporte generado: ${reporte.gastos_por_cuenta.length} cuenta(s) con gastos, total: S/ ${reporte.resumen.total_gastos.toFixed(2)}`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error generando reporte de gastos por centro de costo:', error);
      throw error;
    }
  }

  // =============================================
  // 📊 ESTADOS FINANCIEROS
  // =============================================

  @Get('estados/balance-comprobacion')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Balance de Comprobación por período' })
  @ApiResponse({ 
    status: 200, 
    description: 'Balance de Comprobación obtenido exitosamente'
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Parámetros inválidos (anio y mes son requeridos)' 
  })
  async getBalanceComprobacionPorPeriodo(
    @CurrentTenant() tenantId: string,
    @Query('anio') anio?: string,
    @Query('mes') mes?: string
  ): Promise<{ success: boolean; data: any; message?: string }> {
    try {
      // Validar parámetros requeridos
      if (!anio || !mes) {
        return {
          success: false,
          data: null,
          message: 'Los parámetros anio y mes son requeridos'
        };
      }

      const anioNum = parseInt(anio, 10);
      const mesNum = parseInt(mes, 10);

      // Validar rangos
      if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
        return {
          success: false,
          data: null,
          message: 'Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12'
        };
      }

      console.log(`⚖️ [Contabilidad] Obteniendo Balance de Comprobación para ${anioNum}-${mesNum}, tenant: ${tenantId}`);

      const balance = await this.estadosFinancierosService.getBalanceComprobacion(
        tenantId,
        anioNum,
        mesNum
      );

      // Calcular totales
      const totalDebe = balance.reduce((sum, item) => sum + item.debe, 0);
      const totalHaber = balance.reduce((sum, item) => sum + item.haber, 0);
      const diferencia = totalDebe - totalHaber;

      return {
        success: true,
        data: {
          periodo: {
            anio: anioNum,
            mes: mesNum,
            descripcion: `${anioNum}-${String(mesNum).padStart(2, '0')}`
          },
          cuentas: balance,
          totales: {
            debe: totalDebe,
            haber: totalHaber,
            diferencia: diferencia,
            cuadrado: Math.abs(diferencia) < 0.01 // Tolerancia de 1 centavo
          },
          resumen: {
            total_cuentas: balance.length,
            cuentas_con_saldo: balance.filter(c => Math.abs(c.saldo_final) > 0.01).length
          }
        }
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo Balance de Comprobación:', error);
      throw error;
    }
  }
  
  @Get('estados/estado-resultados')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Estado de Resultados (P&L) por período' })
  @ApiResponse({ 
    status: 200, 
    description: 'Estado de Resultados obtenido exitosamente'
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Parámetros inválidos (anio y mes son requeridos)' 
  })
  async getEstadoResultadosPorPeriodo(
    @CurrentTenant() tenantId: string,
    @Query('anio') anio?: string,
    @Query('mes') mes?: string
  ): Promise<{ success: boolean; data: any; message?: string }> {
    try {
      // Validar parámetros requeridos
      if (!anio || !mes) {
        return {
          success: false,
          data: null,
          message: 'Los parámetros anio y mes son requeridos'
        };
      }

      const anioNum = parseInt(anio, 10);
      const mesNum = parseInt(mes, 10);

      // Validar rangos
      if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
        return {
          success: false,
          data: null,
          message: 'Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12'
        };
      }

      console.log(`📊 [Contabilidad] Obteniendo Estado de Resultados para ${anioNum}-${mesNum}, tenant: ${tenantId}`);

      const estadoResultados = await this.estadosFinancierosService.getEstadoResultados(
        tenantId,
        anioNum,
        mesNum
      );

      return {
        success: true,
        data: {
          periodo: {
            anio: anioNum,
            mes: mesNum,
            descripcion: `${anioNum}-${String(mesNum).padStart(2, '0')}`
          },
          ...estadoResultados,
          resumen: {
            margen_bruto: estadoResultados.ingresos.total_ingresos > 0 
              ? (estadoResultados.costos.utilidad_bruta / estadoResultados.ingresos.total_ingresos) * 100 
              : 0,
            margen_neto: estadoResultados.ingresos.total_ingresos > 0 
              ? (estadoResultados.utilidad_neta / estadoResultados.ingresos.total_ingresos) * 100 
              : 0,
          }
        }
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo Estado de Resultados:', error);
      throw error;
    }
  }

  @Get('estados/balance-general')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Balance General por período' })
  @ApiResponse({ 
    status: 200, 
    description: 'Balance General obtenido exitosamente'
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Parámetros inválidos (anio y mes son requeridos)' 
  })
  async getBalanceGeneralPorPeriodo(
    @CurrentTenant() tenantId: string,
    @Query('anio') anio?: string,
    @Query('mes') mes?: string
  ): Promise<{ success: boolean; data: any; message?: string }> {
    try {
      // Validar parámetros requeridos
      if (!anio || !mes) {
        return {
          success: false,
          data: null,
          message: 'Los parámetros anio y mes son requeridos'
        };
      }

      const anioNum = parseInt(anio, 10);
      const mesNum = parseInt(mes, 10);

      // Validar rangos
      if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
        return {
          success: false,
          data: null,
          message: 'Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12'
        };
      }

      console.log(`🏦 [Contabilidad] Obteniendo Balance General para ${anioNum}-${mesNum}, tenant: ${tenantId}`);

      const balanceGeneral = await this.estadosFinancierosService.getBalanceGeneral(
        tenantId,
        anioNum,
        mesNum
      );

      // Validar ecuación contable
      const totalActivosPasivosPatrimonio = balanceGeneral.pasivos.total_pasivos + balanceGeneral.patrimonio.total_patrimonio;
      const diferencia = balanceGeneral.activos.total_activos - totalActivosPasivosPatrimonio;
      const ecuacionCuadra = Math.abs(diferencia) < 0.01; // Tolerancia de 1 centavo

      return {
        success: true,
        data: {
          periodo: {
            anio: anioNum,
            mes: mesNum,
            descripcion: `${anioNum}-${String(mesNum).padStart(2, '0')}`
          },
          ...balanceGeneral,
          validacion: {
            ecuacion_contable: 'Activos = Pasivos + Patrimonio',
            activos: balanceGeneral.activos.total_activos,
            pasivos_patrimonio: totalActivosPasivosPatrimonio,
            diferencia: diferencia,
            cuadrado: ecuacionCuadra
          }
        }
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo Balance General:', error);
      throw error;
    }
  }

  @Get('estados/balance-comprobacion/formatted')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Balance de Comprobación formateado según estándares contables' })
  @ApiResponse({ 
    status: 200, 
    description: 'Balance de Comprobación formateado obtenido exitosamente'
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Parámetros inválidos (anio y mes son requeridos)' 
  })
  async getBalanceComprobacionFormateado(
    @CurrentTenant() tenantId: string,
    @Query('anio') anio?: string,
    @Query('mes') mes?: string,
    @Query('showCurrency') showCurrency?: string
  ): Promise<{ success: boolean; data: any; message?: string }> {
    try {
      if (!anio || !mes) {
        return {
          success: false,
          data: null,
          message: 'Los parámetros anio y mes son requeridos'
        };
      }

      const anioNum = parseInt(anio, 10);
      const mesNum = parseInt(mes, 10);
      const mostrarMoneda = showCurrency === 'true';

      if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
        return {
          success: false,
          data: null,
          message: 'Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12'
        };
      }

      console.log(`⚖️ [Contabilidad] Obteniendo Balance de Comprobación formateado para ${anioNum}-${mesNum}, tenant: ${tenantId}`);

      const balance = await this.estadosFinancierosService.getBalanceComprobacionFormatted(
        tenantId,
        anioNum,
        mesNum,
        mostrarMoneda
      );

      return {
        success: true,
        data: {
          periodo: {
            anio: anioNum,
            mes: mesNum,
            descripcion: `${anioNum}-${String(mesNum).padStart(2, '0')}`
          },
          cuentas: balance,
          formato: {
            moneda: 'S/',
            decimales: 2,
            separador_miles: ',',
            negativos: 'paréntesis'
          }
        }
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo Balance de Comprobación formateado:', error);
      throw error;
    }
  }

  @Get('estados/estado-resultados/formatted')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Estado de Resultados formateado según estándares contables' })
  @ApiResponse({ 
    status: 200, 
    description: 'Estado de Resultados formateado obtenido exitosamente'
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Parámetros inválidos (anio y mes son requeridos)' 
  })
  async getEstadoResultadosFormateado(
    @CurrentTenant() tenantId: string,
    @Query('anio') anio?: string,
    @Query('mes') mes?: string,
    @Query('showCurrency') showCurrency?: string
  ): Promise<{ success: boolean; data: any; message?: string }> {
    try {
      if (!anio || !mes) {
        return {
          success: false,
          data: null,
          message: 'Los parámetros anio y mes son requeridos'
        };
      }

      const anioNum = parseInt(anio, 10);
      const mesNum = parseInt(mes, 10);
      const mostrarMoneda = showCurrency === 'true';

      if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
        return {
          success: false,
          data: null,
          message: 'Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12'
        };
      }

      console.log(`📊 [Contabilidad] Obteniendo Estado de Resultados formateado para ${anioNum}-${mesNum}, tenant: ${tenantId}`);

      const estadoResultados = await this.estadosFinancierosService.getEstadoResultadosFormatted(
        tenantId,
        anioNum,
        mesNum,
        mostrarMoneda
      );

      return {
        success: true,
        data: {
          periodo: {
            anio: anioNum,
            mes: mesNum,
            descripcion: `${anioNum}-${String(mesNum).padStart(2, '0')}`
          },
          ...estadoResultados,
          formato: {
            moneda: 'S/',
            decimales: 2,
            separador_miles: ',',
            negativos: 'paréntesis'
          }
        }
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo Estado de Resultados formateado:', error);
      throw error;
    }
  }

  @Get('estados/balance-general/formatted')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Balance General formateado según estándares contables' })
  @ApiResponse({ 
    status: 200, 
    description: 'Balance General formateado obtenido exitosamente'
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Parámetros inválidos (anio y mes son requeridos)' 
  })
  async getBalanceGeneralFormateado(
    @CurrentTenant() tenantId: string,
    @Query('anio') anio?: string,
    @Query('mes') mes?: string,
    @Query('showCurrency') showCurrency?: string
  ): Promise<{ success: boolean; data: any; message?: string }> {
    try {
      if (!anio || !mes) {
        return {
          success: false,
          data: null,
          message: 'Los parámetros anio y mes son requeridos'
        };
      }

      const anioNum = parseInt(anio, 10);
      const mesNum = parseInt(mes, 10);
      const mostrarMoneda = showCurrency === 'true';

      if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
        return {
          success: false,
          data: null,
          message: 'Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12'
        };
      }

      console.log(`🏦 [Contabilidad] Obteniendo Balance General formateado para ${anioNum}-${mesNum}, tenant: ${tenantId}`);

      const balanceGeneral = await this.estadosFinancierosService.getBalanceGeneralFormatted(
        tenantId,
        anioNum,
        mesNum,
        mostrarMoneda
      );

      return {
        success: true,
        data: {
          periodo: {
            anio: anioNum,
            mes: mesNum,
            descripcion: `${anioNum}-${String(mesNum).padStart(2, '0')}`
          },
          ...balanceGeneral,
          formato: {
            moneda: 'S/',
            decimales: 2,
            separador_miles: ',',
            negativos: 'paréntesis'
          }
        }
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo Balance General formateado:', error);
      throw error;
    }
  }

  @Post('estados/refrescar')
  @RequirePermission('contabilidad.reportes.actualizar') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Refrescar vistas materializadas de estados financieros' })
  @ApiResponse({ 
    status: 200, 
    description: 'Vistas materializadas refrescadas exitosamente'
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Parámetros inválidos (anio y mes son requeridos)' 
  })
  @ApiResponse({ 
    status: 500, 
    description: 'Error al refrescar vistas materializadas' 
  })
  async refrescarEstadosFinancieros(
    @CurrentTenant() tenantId: string,
    @Body() body: { anio: number; mes: number }
  ): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const { anio, mes } = body;

      // Validar parámetros requeridos
      if (!anio || !mes) {
        return {
          success: false,
          message: 'Los parámetros anio y mes son requeridos'
        };
      }

      // Validar rangos
      if (isNaN(anio) || isNaN(mes) || mes < 1 || mes > 12) {
        return {
          success: false,
          message: 'Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12'
        };
      }

      console.log(`🔄 [Contabilidad] Refrescando estados financieros para ${anio}-${mes}, tenant: ${tenantId}`);

      const startTime = Date.now();

      // Verificar si existen vistas materializadas
      const { data: views, error: viewsError } = await this.supabaseService
        .getClient()
        .from('pg_matviews')
        .select('matviewname')
        .in('matviewname', ['mv_balance_comprobacion', 'mv_estado_resultados', 'mv_balance_general']);

      if (viewsError) {
        console.warn('⚠️ No se pudieron verificar las vistas materializadas:', viewsError);
      }

      const existingViews = views?.map(v => v.matviewname) || [];
      const refreshedViews: string[] = [];
      const errors: string[] = [];

      // Refrescar cada vista materializada si existe
      for (const viewName of ['mv_balance_comprobacion', 'mv_estado_resultados', 'mv_balance_general']) {
        if (existingViews.includes(viewName)) {
          try {
            console.log(`🔄 Refrescando vista: ${viewName}`);
            
            // Ejecutar REFRESH MATERIALIZED VIEW
            const { error: refreshError } = await this.supabaseService
              .getClient()
              .rpc('refresh_materialized_view', { 
                view_name: viewName,
                tenant_id: tenantId,
                p_anio: anio,
                p_mes: mes
              });

            if (refreshError) {
              console.error(`❌ Error refrescando ${viewName}:`, refreshError);
              errors.push(`${viewName}: ${refreshError.message}`);
            } else {
              refreshedViews.push(viewName);
              console.log(`✅ Vista ${viewName} refrescada exitosamente`);
            }
          } catch (error) {
            console.error(`❌ Error refrescando ${viewName}:`, error);
            errors.push(`${viewName}: ${error.message}`);
          }
        } else {
          console.log(`ℹ️ Vista ${viewName} no existe, se omite`);
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Si no hay vistas materializadas, informar al usuario
      if (existingViews.length === 0) {
        console.log('ℹ️ No se encontraron vistas materializadas. Los estados financieros se calculan en tiempo real.');
        return {
          success: true,
          message: 'No hay vistas materializadas configuradas. Los estados financieros se calculan en tiempo real desde las tablas base.',
          data: {
            periodo: {
              anio,
              mes,
              descripcion: `${anio}-${String(mes).padStart(2, '0')}`
            },
            vistas_materializadas: false,
            duracion_ms: duration,
            nota: 'Para mejorar el rendimiento, considere crear vistas materializadas ejecutando la migración correspondiente.'
          }
        };
      }

      // Si hubo errores pero también éxitos
      if (errors.length > 0 && refreshedViews.length > 0) {
        return {
          success: true,
          message: `Vistas refrescadas parcialmente. ${refreshedViews.length} exitosas, ${errors.length} con errores.`,
          data: {
            periodo: {
              anio,
              mes,
              descripcion: `${anio}-${String(mes).padStart(2, '0')}`
            },
            vistas_refrescadas: refreshedViews,
            errores: errors,
            duracion_ms: duration
          }
        };
      }

      // Si solo hubo errores
      if (errors.length > 0 && refreshedViews.length === 0) {
        return {
          success: false,
          message: 'Error al refrescar las vistas materializadas',
          data: {
            periodo: {
              anio,
              mes,
              descripcion: `${anio}-${String(mes).padStart(2, '0')}`
            },
            errores: errors,
            duracion_ms: duration
          }
        };
      }

      // Todo exitoso
      return {
        success: true,
        message: `${refreshedViews.length} vistas materializadas refrescadas exitosamente`,
        data: {
          periodo: {
            anio,
            mes,
            descripcion: `${anio}-${String(mes).padStart(2, '0')}`
          },
          vistas_refrescadas: refreshedViews,
          duracion_ms: duration
        }
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error refrescando estados financieros:', error);
      return {
        success: false,
        message: `Error al refrescar estados financieros: ${error.message}`
      };
    }
  }

  @Get('balance-general')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Balance General (legacy endpoint - usar /estados/balance-general)' })
  @ApiResponse({ status: 200, description: 'Balance General obtenido exitosamente' })
  async getBalanceGeneral(
    @CurrentTenant() tenantId: string,
    @Query('anio') anio?: string,
    @Query('mes') mes?: string
  ) {
    try {
      // Si se proporcionan anio y mes, usar el nuevo servicio
      if (anio && mes) {
        const anioNum = parseInt(anio, 10);
        const mesNum = parseInt(mes, 10);

        // Validar rangos
        if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
          return {
            success: false,
            data: null,
            message: 'Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12'
          };
        }

        console.log(`🏦 [Contabilidad] Usando nuevo servicio para ${anioNum}-${mesNum}`);

        const balanceGeneral = await this.estadosFinancierosService.getBalanceGeneral(
          tenantId,
          anioNum,
          mesNum
        );

        // Validar ecuación contable
        const totalActivosPasivosPatrimonio = balanceGeneral.pasivos.total_pasivos + balanceGeneral.patrimonio.total_patrimonio;
        const diferencia = balanceGeneral.activos.total_activos - totalActivosPasivosPatrimonio;
        const ecuacionCuadra = Math.abs(diferencia) < 0.01;

        return {
          success: true,
          data: {
            periodo: {
              anio: anioNum,
              mes: mesNum,
              descripcion: `${anioNum}-${String(mesNum).padStart(2, '0')}`
            },
            ...balanceGeneral,
            validacion: {
              ecuacion_contable: 'Activos = Pasivos + Patrimonio',
              activos: balanceGeneral.activos.total_activos,
              pasivos_patrimonio: totalActivosPasivosPatrimonio,
              diferencia: diferencia,
              cuadrado: ecuacionCuadra
            }
          }
        };
      }

      // Fallback: retornar estructura vacía si no se proporcionan parámetros
      return {
        success: false,
        data: null,
        message: 'Los parámetros anio y mes son requeridos'
      };
    } catch (error) {
      console.error('❌ Error obteniendo Balance General:', error);
      throw error;
    }
  }

  @Get('flujo-efectivo')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Estado de Flujo de Efectivo' })
  @ApiResponse({ status: 200, description: 'Flujo de Efectivo obtenido exitosamente' })
  getFlujoEfectivo(@Query() periodo: any) {
    // TODO: Implement real cash flow statement
    return {
      success: true,
      data: {
        operacion: {
          utilidadNeta: 0,
          depreciacion: 0,
          cambiosCapitalTrabajo: 0,
          flujoOperacion: 0
        },
        inversion: {
          compraActivos: 0,
          ventaActivos: 0,
          flujoInversion: 0
        },
        financiamiento: {
          prestamosRecibidos: 0,
          pagosPrestamos: 0,
          aportesSocios: 0,
          dividendos: 0,
          flujoFinanciamiento: 0
        },
        resumen: {
          flujoNetoEfectivo: 0,
          efectivoInicial: 0,
          efectivoFinal: 0
        }
      }
    };
  }

  @Get('plan-cuentas')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Plan de Cuentas' })
  @ApiResponse({ status: 200, description: 'Plan de Cuentas obtenido exitosamente' })
  async getPlanCuentas() {
    try {
      console.log('📚 Obteniendo plan de cuentas...');
      const planCuentas = await this.accountingService.getPlanCuentas();
      
      return {
        success: true,
        data: planCuentas
      };
    } catch (error) {
      console.error('❌ Error obteniendo plan de cuentas:', error);
      return {
        success: false,
        message: 'Error obteniendo plan de cuentas',
        data: []
      };
    }
  }

  @Get('ratios-financieros')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Ratios Financieros' })
  @ApiResponse({ status: 200, description: 'Ratios Financieros obtenidos exitosamente' })
  getRatiosFinancieros() {
    // TODO: Implement real financial ratios calculation
    return {
      success: true,
      data: {
        liquidez: {
          ratioLiquidez: 0,
          pruebaAcida: 0,
          capitalTrabajo: 0
        },
        rentabilidad: {
          margenBruto: 0,
          margenOperativo: 0,
          margenNeto: 0,
          roa: 0,
          roe: 0
        },
        endeudamiento: {
          ratioDeuda: 0,
          ratioCobertura: 0,
          apalancamiento: 0
        },
        eficiencia: {
          rotacionActivos: 0,
          rotacionInventario: 0,
          rotacionCuentasCobrar: 0
        }
      }
    };
  }

  @Post('asiento-contable')
  @RequirePermission('contabilidad.asientos.crear') // HARDENING: creación manual de asiento.
  @ApiOperation({ summary: 'Crear nuevo asiento contable manual' })
  @ApiResponse({ 
    status: 201, 
    description: 'Asiento contable creado exitosamente',
    type: AsientoResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Datos inválidos o asiento descuadrado' 
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Período contable cerrado o bloqueado' 
  })
  async crearAsientoContable(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() createAsientoDto: CreateAsientoManualDto
  ): Promise<{ success: boolean; data: AsientoResponseDto; message: string }> {
    try {
      console.log(`📝 [Contabilidad] Creando asiento manual para tenant ${tenantId}`);
      
      const asiento = await this.asientosService.crearAsientoManual(
        tenantId,
        userId,
        createAsientoDto
      );

      return {
        success: true,
        data: asiento,
        message: `Asiento contable ${asiento.numero_asiento} creado exitosamente`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error creando asiento manual:', error);
      throw error;
    }
  }

  @Get('asientos-contables')
  @RequirePermission('contabilidad.asientos.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener listado de asientos contables con filtros' })
  @ApiResponse({ 
    status: 200, 
    description: 'Asientos contables obtenidos exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'array',
          items: { type: 'object' }
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        totalPages: { type: 'number' }
      }
    }
  })
  async getAsientosContables(
    @CurrentTenant() tenantId: string,
    @Query() filtros: ListarAsientosQueryDto
  ) {
    try {
      console.log('📚 [Contabilidad] Obteniendo asientos contables para tenant', tenantId, filtros);
      
      const resultado = await this.asientosService.listarAsientos(tenantId, filtros);
      
      return {
        success: true,
        ...resultado
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo asientos contables:', error);
      throw error;
    }
  }

  @Get('asientos-contables/:id')
  @RequirePermission('contabilidad.asientos.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener un asiento contable específico por ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Asiento contable obtenido exitosamente',
    type: AsientoResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Asiento no encontrado' 
  })
  async getAsientoContablePorId(
    @CurrentTenant() tenantId: string,
    @Param('id') asientoId: string
  ): Promise<{ success: boolean; data: AsientoResponseDto }> {
    try {
      console.log(`📚 [Contabilidad] Obteniendo asiento ${asientoId} para tenant ${tenantId}`);
      
      const asiento = await this.asientosService.obtenerAsientoPorId(tenantId, asientoId);
      
      return {
        success: true,
        data: asiento
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo asiento:', error);
      throw error;
    }
  }

  @Get('libro-mayor/:cuentaCodigo')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener libro mayor de una cuenta específica' })
  @ApiResponse({ status: 200, description: 'Libro mayor obtenido exitosamente' })
  async getLibroMayor(@Param('cuentaCodigo') cuentaCodigo: string, @Query() filtros: any) {
    try {
      console.log(`📊 Generando Libro Mayor para cuenta: ${cuentaCodigo}`, filtros);
      
      const libroMayor = await this.accountingService.getLibroMayorPorCuenta(cuentaCodigo, filtros);
      
      return {
        success: true,
        data: libroMayor
      };
    } catch (error) {
      console.error('❌ Error generando Libro Mayor:', error);
      return {
        success: false,
        message: 'Error generando Libro Mayor',
        data: null
      };
    }
  }

  @Get('libro-mayor-completo')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener libro mayor de todas las cuentas con movimientos' })
  @ApiResponse({ status: 200, description: 'Libro mayor completo obtenido exitosamente' })
  async getLibroMayorCompleto(@Query() filtros: any) {
    try {
      console.log('📊 Generando Libro Mayor Completo...', filtros);
      
      const libroMayorCompleto = await this.accountingService.getLibroMayorCompleto(filtros);
      
      return {
        success: true,
        data: libroMayorCompleto
      };
    } catch (error) {
      console.error('❌ Error generando Libro Mayor Completo:', error);
      return {
        success: false,
        message: 'Error generando Libro Mayor Completo',
        data: []
      };
    }
  }

  @Get('balance-comprobacion')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Balance de Comprobación (legacy endpoint - usar /estados/balance-comprobacion)' })
  @ApiResponse({ status: 200, description: 'Balance de Comprobación obtenido exitosamente' })
  async getBalanceComprobacion(
    @CurrentTenant() tenantId: string,
    @Query('anio') anio?: string,
    @Query('mes') mes?: string,
    @Query() filtros?: any
  ) {
    try {
      console.log('⚖️ Generando Balance de Comprobación...', { anio, mes, filtros });
      
      // Si se proporcionan anio y mes, usar el nuevo servicio
      if (anio && mes) {
        const anioNum = parseInt(anio, 10);
        const mesNum = parseInt(mes, 10);

        // Validar rangos
        if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
          return {
            success: false,
            data: null,
            message: 'Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12'
          };
        }

        console.log(`⚖️ [Contabilidad] Usando nuevo servicio para ${anioNum}-${mesNum}`);

        const balance = await this.estadosFinancierosService.getBalanceComprobacion(
          tenantId,
          anioNum,
          mesNum
        );

        // Calcular totales
        const totalDebe = balance.reduce((sum, item) => sum + item.debe, 0);
        const totalHaber = balance.reduce((sum, item) => sum + item.haber, 0);
        const diferencia = totalDebe - totalHaber;

        return {
          success: true,
          data: {
            periodo: {
              anio: anioNum,
              mes: mesNum,
              descripcion: `${anioNum}-${String(mesNum).padStart(2, '0')}`
            },
            cuentas: balance,
            totales: {
              debe: totalDebe,
              haber: totalHaber,
              diferencia: diferencia,
              cuadrado: Math.abs(diferencia) < 0.01
            },
            resumen: {
              total_cuentas: balance.length,
              cuentas_con_saldo: balance.filter(c => Math.abs(c.saldo_final) > 0.01).length
            }
          }
        };
      }

      // Fallback al servicio antiguo si no se proporcionan anio y mes
      const balanceComprobacion = await this.accountingService.getBalanceComprobacion(filtros);
      
      return {
        success: true,
        data: balanceComprobacion
      };
    } catch (error) {
      console.error('❌ Error generando Balance de Comprobación:', error);
      return {
        success: false,
        message: 'Error generando Balance de Comprobación',
        data: null
      };
    }
  }

  @Get('kardex-valorizado')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Kardex Valorizado de Inventarios' })
  @ApiResponse({ status: 200, description: 'Kardex Valorizado obtenido exitosamente' })
  async getKardexValorizado(@Query() filtros: any) {
    try {
      console.log('📦 Generando Kardex Valorizado...', filtros);
      
      const kardexValorizado = await this.accountingService.getKardexValorizado(filtros);
      
      return {
        success: true,
        data: kardexValorizado
      };
    } catch (error) {
      console.error('❌ Error generando Kardex Valorizado:', error);
      return {
        success: false,
        message: 'Error generando Kardex Valorizado',
        data: null
      };
    }
  }

  @Post('cierre-contable')
  @RequirePermission('contabilidad.cierre.ejecutar') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Realizar cierre contable del período' })
  @ApiResponse({ status: 200, description: 'Cierre contable realizado exitosamente' })
  realizarCierreContable(@Body() cierreData: any) {
    // TODO: Implement real accounting period closing
    return {
      success: true,
      data: {
        periodo: cierreData.periodo || '',
        fechaCierre: new Date().toISOString(),
        estado: 'CERRADO'
      },
      message: 'Cierre contable realizado exitosamente'
    };
  }

  // =============================================
  // 📋 LIBROS DE MEDIA PRIORIDAD
  // =============================================

  @Get('libro-caja-bancos')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Libro de Caja y Bancos' })
  @ApiResponse({ status: 200, description: 'Libro de Caja y Bancos obtenido exitosamente' })
  async getLibroCajaBancos(@Query() filtros: any) {
    try {
      console.log('💰 Generando Libro de Caja y Bancos...', filtros);
      
      const libroCajaBancos = await this.accountingService.getLibroCajaBancos(filtros);
      
      return {
        success: true,
        data: libroCajaBancos
      };
    } catch (error) {
      console.error('❌ Error generando Libro de Caja y Bancos:', error);
      return {
        success: false,
        message: 'Error generando Libro de Caja y Bancos',
        data: null
      };
    }
  }

  @Get('registro-activos-fijos')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Registro de Activos Fijos' })
  @ApiResponse({ status: 200, description: 'Registro de Activos Fijos obtenido exitosamente' })
  async getRegistroActivosFijos(@Query() filtros: any) {
    try {
      console.log('🏦 Generando Registro de Activos Fijos...', filtros);
      
      const registroActivosFijos = await this.accountingService.getRegistroActivosFijos(filtros);
      
      return {
        success: true,
        data: registroActivosFijos
      };
    } catch (error) {
      console.error('❌ Error generando Registro de Activos Fijos:', error);
      return {
        success: false,
        message: 'Error generando Registro de Activos Fijos',
        data: null
      };
    }
  }

  @Get('libro-planillas')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Libro de Planillas Oficial' })
  @ApiResponse({ status: 200, description: 'Libro de Planillas obtenido exitosamente' })
  async getLibroPlanillas(@Query() filtros: any) {
    try {
      console.log('👥 Generando Libro de Planillas...', filtros);
      
      const libroPlanillas = await this.accountingService.getLibroPlanillas(filtros);
      
      return {
        success: true,
        data: libroPlanillas
      };
    } catch (error) {
      console.error('❌ Error generando Libro de Planillas:', error);
      return {
        success: false,
        message: 'Error generando Libro de Planillas',
        data: null
      };
    }
  }

  // =============================================
  // 📱 LIBROS DE BAJA PRIORIDAD (ELECTRÓNICOS SUNAT)
  // =============================================

  @Get('libro-inventarios-balances')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Libro de Inventarios y Balances' })
  @ApiResponse({ status: 200, description: 'Libro de Inventarios y Balances obtenido exitosamente' })
  async getLibroInventariosBalances(@Query() filtros: any) {
    try {
      console.log('📦 Generando Libro de Inventarios y Balances...', filtros);
      
      const libroInventariosBalances = await this.accountingService.getLibroInventariosBalances(filtros);
      
      return {
        success: true,
        data: libroInventariosBalances
      };
    } catch (error) {
      console.error('❌ Error generando Libro de Inventarios y Balances:', error);
      return {
        success: false,
        message: 'Error generando Libro de Inventarios y Balances',
        data: null
      };
    }
  }

  @Get('registro-costos')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Registro de Costos' })
  @ApiResponse({ status: 200, description: 'Registro de Costos obtenido exitosamente' })
  async getRegistroCostos(@Query() filtros: any) {
    try {
      console.log('🏭 Generando Registro de Costos...', filtros);
      
      const registroCostos = await this.accountingService.getRegistroCostos(filtros);
      
      return {
        success: true,
        data: registroCostos
      };
    } catch (error) {
      console.error('❌ Error generando Registro de Costos:', error);
      return {
        success: false,
        message: 'Error generando Registro de Costos',
        data: null
      };
    }
  }

  @Get('libros-electronicos-sunat')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Libros Electrónicos SUNAT' })
  @ApiResponse({ status: 200, description: 'Libros Electrónicos SUNAT obtenidos exitosamente' })
  async getLibrosElectronicosSunat(@Query() filtros: any) {
    try {
      console.log('📱 Generando Libros Electrónicos SUNAT...', filtros);
      
      const librosElectronicos = await this.accountingService.getLibrosElectronicosSunat(filtros);
      
      return {
        success: true,
        data: librosElectronicos
      };
    } catch (error) {
      console.error('❌ Error generando Libros Electrónicos SUNAT:', error);
      return {
        success: false,
        message: 'Error generando Libros Electrónicos SUNAT',
        data: null
      };
    }
  }

  @Get('libro-diario')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Libro Diario (Registro cronológico de asientos)' })
  @ApiResponse({ status: 200, description: 'Libro Diario obtenido exitosamente' })
  async getLibroDiario(
    @CurrentTenant() tenantId: string,
    @Query() filtros: any
  ) {
    try {
      console.log('📖 Generando Libro Diario...', filtros);
      
      // HARDENING: forzamos uso del tenant actual para toda consulta.
      const filtrosConTenant = { ...filtros, tenant_id: tenantId };

      // 1. Obtener asientos contables principales
      const asientos = await this.accountingService.getAsientosContables(filtrosConTenant);
      
      // 2. 🎯 OBTENER ASIENTOS DE RRHH desde tabla temporal
      let asientosRrhh = [];
      try {
        const { data: rrhhAsientos, error: rrhhError } = await this.supabaseService.getClient()
          .from('asientos_contables_rrhh')
          .select('*')
          .eq('tenant_id', tenantId) // ✅ Filtro de tenant
          .order('fecha', { ascending: false });
          
        if (!rrhhError && rrhhAsientos) {
          // Formatear asientos de RRHH para incluir en el libro diario
          asientosRrhh = rrhhAsientos.map(asiento => ({
            numero_asiento: `RRHH-${asiento.planilla_id?.substring(0, 8)}-${asiento.cuenta}`,
            fecha: asiento.fecha,
            concepto: asiento.descripcion,
            referencia: `RRHH-${asiento.planilla_id}`,
            total_debe: asiento.debe || 0,
            total_haber: asiento.haber || 0,
            estado: 'RRHH',
            detalle_asientos: [{
              cuenta_id: asiento.cuenta,
              debe: asiento.debe || 0,
              haber: asiento.haber || 0,
              concepto: asiento.descripcion
            }]
          }));
          
          console.log(`📊 [Contabilidad] Encontrados ${asientosRrhh.length} asientos de RRHH`);
        }
      } catch (rrhhError) {
        console.warn('⚠️ Error obteniendo asientos RRHH:', rrhhError);
      }
      
      // 3. Combinar todos los asientos
      const todosLosAsientos = [...asientos, ...asientosRrhh];
      
      // Formatear para Libro Diario (cronológico)
      const libroDiario = todosLosAsientos.map(asiento => ({
        numeroAsiento: asiento.numero_asiento,
        fecha: asiento.fecha,
        concepto: asiento.concepto,
        referencia: asiento.referencia,
        detalles: (asiento.detalle_asientos || []).map(detalle => ({
          cuentaId: detalle.cuenta_id,
          cuentaCodigo: detalle.cuenta_id, // Usar el ID como código temporalmente
          cuentaNombre: detalle.cuenta_id, // Usar el ID como nombre temporalmente
          descripcion: detalle.concepto || 'Movimiento contable',
          debe: parseFloat(detalle.debe || 0),
          haber: parseFloat(detalle.haber || 0)
        })),
        totalDebe: parseFloat(asiento.total_debe || 0),
        totalHaber: parseFloat(asiento.total_haber || 0),
        estado: asiento.estado
      }));

      // Ordenar por fecha descendente
      libroDiario.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

      return {
        success: true,
        data: {
          periodo: filtros.fechaDesde && filtros.fechaHasta 
            ? `${filtros.fechaDesde} al ${filtros.fechaHasta}`
            : 'Todos los registros',
          totalAsientos: libroDiario.length,
          totalDebe: libroDiario.reduce((sum, a) => sum + a.totalDebe, 0),
          totalHaber: libroDiario.reduce((sum, a) => sum + a.totalHaber, 0),
          asientos: libroDiario,
          fuentes: {
            contabilidad: asientos.length,
            rrhh: asientosRrhh.length
          }
        }
      };
    } catch (error) {
      console.error('❌ Error generando Libro Diario:', error);
      return {
        success: false,
        message: 'Error generando Libro Diario',
        data: null
      };
    }
  }

  @Get('registro-ventas')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Registro de Ventas (Libro de Ventas e Ingresos)' })
  @ApiResponse({ status: 200, description: 'Registro de Ventas obtenido exitosamente' })
  async getRegistroVentas(@Query() filtros: any) {
    try {
      console.log('📝 Generando Registro de Ventas...', filtros);
      
      const registroVentas = await this.accountingService.getRegistroVentas(filtros);
      
      return {
        success: true,
        data: registroVentas
      };
    } catch (error) {
      console.error('❌ Error generando Registro de Ventas:', error);
      return {
        success: false,
        message: 'Error generando Registro de Ventas',
        data: null
      };
    }
  }

  @Get('registro-compras')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Registro de Compras' })
  @ApiResponse({ status: 200, description: 'Registro de Compras obtenido exitosamente' })
  async getRegistroCompras(@Query() filtros: any) {
    try {
      console.log('🛒 Generando Registro de Compras...', filtros);
      
      const registroCompras = await this.accountingService.getRegistroCompras(filtros);
      
      return {
        success: true,
        data: registroCompras
      };
    } catch (error) {
      console.error('❌ Error generando Registro de Compras:', error);
      return {
        success: false,
        message: 'Error generando Registro de Compras',
        data: null
      };
    }
  }

  @Get('registro-consignaciones')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener Registro de Consignaciones' })
  @ApiResponse({ status: 200, description: 'Registro de Consignaciones obtenido exitosamente' })
  async getRegistroConsignaciones(
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
    @Query('estado') estado?: string
  ) {
    try {
      console.log('📋 [ContabilidadController] Obteniendo registro de consignaciones...');
      
      const filtros = {
        fechaDesde,
        fechaHasta,
        estado
      };
      
      const consignaciones = await this.accountingService.getRegistroConsignaciones(filtros);
      
      return {
        success: true,
        data: consignaciones,
        message: 'Registro de consignaciones obtenido exitosamente'
      };
    } catch (error) {
      console.error('❌ [ContabilidadController] Error obteniendo registro de consignaciones:', error);
      throw error;
    }
  }

  @Post('registro-consignaciones')
  @RequirePermission('contabilidad.consignaciones.crear') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Crear nueva consignación' })
  @ApiResponse({ status: 201, description: 'Consignación creada exitosamente' })
  async createConsignacion(@Body() consignacionData: any) {
    try {
      console.log('📋 [ContabilidadController] Creando nueva consignación...');
      
      const consignacion = await this.accountingService.createConsignacion(consignacionData);
      
      return {
        success: true,
        data: consignacion,
        message: 'Consignación creada exitosamente'
      };
    } catch (error) {
      console.error('❌ [ContabilidadController] Error creando consignación:', error);
      throw error;
    }
  }

  @Post('registro-consignaciones/:id/estado')
  @RequirePermission('contabilidad.consignaciones.actualizar') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Actualizar estado de consignación' })
  @ApiResponse({ status: 200, description: 'Estado de consignación actualizado exitosamente' })
  async updateEstadoConsignacion(
    @Param('id') id: string,
    @Body('estado') nuevoEstado: string
  ) {
    try {
      console.log('📋 [ContabilidadController] Actualizando estado de consignación...');
      
      const consignacion = await this.accountingService.updateEstadoConsignacion(id, nuevoEstado);
      
      return {
        success: true,
        data: consignacion,
        message: 'Estado de consignación actualizado exitosamente'
      };
    } catch (error) {
      console.error('❌ [ContabilidadController] Error actualizando estado:', error);
      throw error;
    }
  }

  // =============================================
  // 🔄 GESTIÓN DE EVENTOS FALLIDOS
  // =============================================

  @Get('eventos/estadisticas')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener estadísticas de eventos (pendientes, procesados, fallidos, procesados hoy)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Estadísticas de eventos obtenidas exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            pending: { type: 'number', description: 'Eventos pendientes de procesar' },
            processed: { type: 'number', description: 'Total de eventos procesados' },
            processed_today: { type: 'number', description: 'Eventos procesados hoy' },
            failed: { type: 'number', description: 'Eventos fallidos' },
            dead_letter: { type: 'number', description: 'Eventos en dead letter (fallidos permanentemente)' },
            avg_processing_time_ms: { type: 'number', nullable: true, description: 'Tiempo promedio de procesamiento en milisegundos' }
          }
        },
        message: { type: 'string' }
      }
    }
  })
  async getEstadisticasEventos(@CurrentTenant() tenantId: string) {
    try {
      console.log('📊 [ContabilidadController] Obteniendo estadísticas de eventos...');
      
      const stats = await this.outboxEventsService.obtenerEstadisticasEventos();
      
      return {
        success: true,
        data: stats,
        message: `Estadísticas: ${stats.pending} pendientes, ${stats.processed_today} procesados hoy, ${stats.failed} fallidos`
      };
    } catch (error) {
      console.error('❌ [ContabilidadController] Error obteniendo estadísticas:', error);
      return {
        success: false,
        message: 'Error obteniendo estadísticas de eventos',
        data: {
          pending: 0,
          processed: 0,
          processed_today: 0,
          failed: 0,
          dead_letter: 0,
          avg_processing_time_ms: null
        }
      };
    }
  }

  @Get('eventos/fallidos')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener lista de eventos fallidos' })
  @ApiResponse({ status: 200, description: 'Eventos fallidos obtenidos exitosamente' })
  async getEventosFallidos(
    @CurrentTenant() tenantId: string,
    @Query('limit') limit?: number
  ) {
    try {
      console.log('🔴 [ContabilidadController] Obteniendo eventos fallidos...');
      
      const eventos = await this.outboxEventsService.leerEventosFallidos(limit || 100);
      
      return {
        success: true,
        data: eventos,
        message: `${eventos.length} evento(s) fallido(s) encontrado(s)`
      };
    } catch (error) {
      console.error('❌ [ContabilidadController] Error obteniendo eventos fallidos:', error);
      return {
        success: false,
        message: 'Error obteniendo eventos fallidos',
        data: []
      };
    }
  }

  @Get('eventos/dead-letter')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener lista de eventos en dead letter (fallidos permanentemente)' })
  @ApiResponse({ status: 200, description: 'Eventos dead letter obtenidos exitosamente' })
  async getEventosDeadLetter(
    @CurrentTenant() tenantId: string,
    @Query('limit') limit?: number
  ) {
    try {
      console.log('💀 [ContabilidadController] Obteniendo eventos dead letter...');
      
      const eventos = await this.outboxEventsService.leerEventosDeadLetter(limit || 100);
      
      return {
        success: true,
        data: eventos,
        message: `${eventos.length} evento(s) dead letter encontrado(s)`
      };
    } catch (error) {
      console.error('❌ [ContabilidadController] Error obteniendo eventos dead letter:', error);
      return {
        success: false,
        message: 'Error obteniendo eventos dead letter',
        data: []
      };
    }
  }

  @Post('eventos/:eventId/reintentar')
  @RequirePermission('contabilidad.eventos.reintentar') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Reintentar un evento fallido' })
  @ApiResponse({ status: 200, description: 'Evento reiniciado exitosamente' })
  async reintentarEvento(
    @CurrentTenant() tenantId: string,
    @Param('eventId') eventId: string
  ) {
    try {
      console.log(`🔄 [ContabilidadController] Reintentando evento ${eventId}...`);
      
      const resultado = await this.asientosGeneratorService.reiniciarEventoFallido(eventId);
      
      return {
        success: true,
        data: { eventId, reiniciado: true },
        message: 'Evento reiniciado para reprocesamiento'
      };
    } catch (error) {
      console.error('❌ [ContabilidadController] Error reintentando evento:', error);
      return {
        success: false,
        message: 'Error reintentando evento',
        data: null
      };
    }
  }

  @Get('eventos/estadisticas-fallidos')
  @RequirePermission('contabilidad.reportes.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener estadísticas detalladas de eventos fallidos por tipo' })
  @ApiResponse({ status: 200, description: 'Estadísticas de eventos fallidos obtenidas exitosamente' })
  async getEstadisticasEventosFallidos(@CurrentTenant() tenantId: string) {
    try {
      console.log('📊 [ContabilidadController] Obteniendo estadísticas de eventos fallidos...');
      
      const stats = await this.asientosGeneratorService.obtenerEstadisticasEventosFallidos();
      
      return {
        success: true,
        data: stats,
        message: 'Estadísticas de eventos fallidos obtenidas exitosamente'
      };
    } catch (error) {
      console.error('❌ [ContabilidadController] Error obteniendo estadísticas de fallidos:', error);
      return {
        success: false,
        message: 'Error obteniendo estadísticas de eventos fallidos',
        data: {
          total_fallidos: 0,
          total_dead_letter: 0,
          por_tipo: {}
        }
      };
    }
  }

  // =============================================
  // 📒 GESTIÓN DE ASIENTOS CONTABLES
  // =============================================

  @Get('asientos')
  @RequirePermission('contabilidad.asientos.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Listar asientos contables con filtros opcionales' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de asientos contables obtenida exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/AsientoResponseDto' }
        },
        total: { type: 'number', description: 'Total de registros' },
        page: { type: 'number', description: 'Página actual' },
        limit: { type: 'number', description: 'Límite por página' },
        totalPages: { type: 'number', description: 'Total de páginas' },
        message: { type: 'string' }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Parámetros inválidos' 
  })
  async listarAsientos(
    @CurrentTenant() tenantId: string,
    @Query() filters: ListarAsientosQueryDto
  ): Promise<{ 
    success: boolean; 
    data: AsientoResponseDto[]; 
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    message: string 
  }> {
    try {
      console.log(`📒 [Contabilidad] Listando asientos para tenant ${tenantId} con filtros:`, filters);
      
      const resultado = await this.asientosService.listarAsientos(tenantId, filters);

      return {
        success: true,
        data: resultado.data,
        total: resultado.total,
        page: resultado.page,
        limit: resultado.limit,
        totalPages: resultado.totalPages,
        message: `${resultado.total} asiento(s) encontrado(s)`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error listando asientos:', error);
      throw error;
    }
  }

  @Get('asientos/estadisticas/por-tipo')
  @RequirePermission('contabilidad.asientos.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener estadísticas de asientos generados por tipo de evento' })
  @ApiResponse({ 
    status: 200, 
    description: 'Estadísticas de asientos por tipo obtenidas exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tipo: { type: 'string', description: 'Tipo de evento (VentaFacturada, CobroRegistrado, etc.)' },
              cantidad: { type: 'number', description: 'Cantidad de asientos generados' }
            }
          }
        },
        message: { type: 'string' }
      }
    }
  })
  async obtenerEstadisticasAsientosPorTipo(
    @CurrentTenant() tenantId: string
  ): Promise<{ 
    success: boolean; 
    data: { tipo: string; cantidad: number }[]; 
    message: string 
  }> {
    try {
      console.log(`📊 [Contabilidad] Obteniendo estadísticas de asientos por tipo para tenant ${tenantId}`);
      
      const estadisticas = await this.asientosService.obtenerEstadisticasAsientosPorTipo(tenantId);

      return {
        success: true,
        data: estadisticas,
        message: `Estadísticas de ${estadisticas.length} tipo(s) de asientos obtenidas`
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo estadísticas de asientos por tipo:', error);
      return {
        success: false,
        data: [],
        message: 'Error obteniendo estadísticas de asientos por tipo'
      };
    }
  }

  @Get('asientos/:id')
  @RequirePermission('contabilidad.asientos.read') // HARDENING: permisos granulares.
  @ApiOperation({ summary: 'Obtener un asiento contable específico por ID con sus detalles' })
  @ApiResponse({ 
    status: 200, 
    description: 'Asiento contable obtenido exitosamente',
    type: AsientoResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Asiento no encontrado' 
  })
  async obtenerAsientoPorId(
    @CurrentTenant() tenantId: string,
    @Param('id') asientoId: string
  ): Promise<{ success: boolean; data: AsientoResponseDto; message: string }> {
    try {
      console.log(`📒 [Contabilidad] Obteniendo asiento ${asientoId} para tenant ${tenantId}`);
      
      const asiento = await this.asientosService.obtenerAsientoPorId(tenantId, asientoId);

      return {
        success: true,
        data: asiento,
        message: 'Asiento contable obtenido exitosamente'
      };
    } catch (error) {
      console.error('❌ [Contabilidad] Error obteniendo asiento:', error);
      throw error;
    }
  }
}
