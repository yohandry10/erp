import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { ConciliacionService } from './conciliacion.service';
import { CrearConciliacionDto, ListarConciliacionesDto, ImportarCsvDto, MatchAutomaticoDto, MarcarItemDto, RegistrarPlantillaCsvDto, CerrarConciliacionDto } from './dto';

@ApiTags('Finanzas - Conciliación')
@ApiBearerAuth()
@Controller('api/finanzas/conciliacion')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: conciliación bancaria requiere permisos granulares.
export class ConciliacionController {
  constructor(private readonly conciliacionService: ConciliacionService) {}

  @Get()
  @RequirePermission('finanzas.conciliacion.ver')
  @ApiOperation({
    summary: 'Listar conciliaciones bancarias',
    description: 'Obtiene la lista de conciliaciones bancarias con filtros opcionales por cuenta bancaria, estado y período.',
  })
  @ApiResponse({ status: 200, description: 'Lista de conciliaciones obtenida exitosamente' })
  async listarConciliaciones(
    @Query() query: ListarConciliacionesDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.conciliacionService.listarConciliaciones(tenantId, query);
  }

  @Get(':id')
  @RequirePermission('finanzas.conciliacion.ver')
  @ApiOperation({
    summary: 'Obtener conciliación por ID',
    description: 'Obtiene los detalles completos de una conciliación bancaria específica, incluyendo información de la cuenta bancaria asociada.',
  })
  @ApiResponse({ status: 200, description: 'Conciliación obtenida exitosamente' })
  @ApiResponse({ status: 404, description: 'Conciliación no encontrada' })
  async obtenerConciliacion(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.conciliacionService.obtenerConciliacion(tenantId, id);
  }

  @Post()
  @RequirePermission('finanzas.conciliacion.gestionar')
  @ApiOperation({
    summary: 'Crear período de conciliación',
    description: 'Crea un nuevo período de conciliación bancaria. Calcula automáticamente el saldo inicial (movimientos anteriores a fecha_desde) y saldo final (movimientos hasta fecha_hasta). Valida que no exista otra conciliación para el mismo período y cuenta.',
  })
  @ApiResponse({ status: 201, description: 'Conciliación creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o conciliación duplicada' })
  @ApiResponse({ status: 404, description: 'Cuenta bancaria no encontrada' })
  async crearConciliacion(
    @Body() crearConciliacionDto: CrearConciliacionDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.conciliacionService.crearConciliacion(tenantId, crearConciliacionDto, user?.id);
  }

  @Post(':id/importar-csv')
  @RequirePermission('finanzas.conciliacion.gestionar')
  @ApiOperation({
    summary: 'Importar extracto bancario CSV',
    description: 'Importa un extracto bancario en formato CSV. Soporta múltiples formatos de bancos peruanos (BCP, BBVA, Interbank, Scotiabank) y un formato genérico. Parsea los movimientos, los normaliza y los almacena como movimientos de extracto. Actualiza el saldo del banco en la conciliación y calcula la diferencia con el saldo según libros.',
  })
  @ApiResponse({ status: 200, description: 'Extracto importado exitosamente' })
  @ApiResponse({ status: 400, description: 'CSV inválido o conciliación cerrada' })
  @ApiResponse({ status: 404, description: 'Conciliación no encontrada' })
  async importarCsv(
    @Param('id') id: string,
    @Body() importarCsvDto: ImportarCsvDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.conciliacionService.importarCsv(tenantId, id, importarCsvDto);
  }

  @Post(':id/match-automatico')
  @RequirePermission('finanzas.conciliacion.gestionar')
  @ApiOperation({
    summary: 'Ejecutar match automático de movimientos',
    description: 'Ejecuta el proceso de conciliación automática entre los movimientos del sistema y los movimientos del extracto bancario. Intenta hacer match por: 1) Referencia exacta (número de operación), 2) Monto exacto + fecha con tolerancia configurable (±N días). Los movimientos que hacen match se marcan como conciliados automáticamente.',
  })
  @ApiResponse({ status: 200, description: 'Match automático ejecutado exitosamente' })
  @ApiResponse({ status: 400, description: 'Conciliación cerrada o datos inválidos' })
  @ApiResponse({ status: 404, description: 'Conciliación no encontrada' })
  async matchAutomatico(
    @Param('id') id: string,
    @Body() matchAutomaticoDto: MatchAutomaticoDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.conciliacionService.matchAutomatico(tenantId, id, matchAutomaticoDto);
  }

  @Post(':id/marcar-item')
  @RequirePermission('finanzas.conciliacion.gestionar')
  @ApiOperation({
    summary: 'Marcar match manual entre movimiento del sistema y extracto',
    description: 'Permite realizar una conciliación manual entre un movimiento del sistema y un movimiento del extracto bancario. Valida que ambos movimientos existan, no estén conciliados, pertenezcan a la misma cuenta y sean del mismo tipo (ABONO/CARGO). Registra la diferencia si existe.',
  })
  @ApiResponse({ status: 200, description: 'Match manual realizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Movimientos ya conciliados, tipos no coinciden o conciliación cerrada' })
  @ApiResponse({ status: 404, description: 'Conciliación o movimientos no encontrados' })
  async marcarItem(
    @Param('id') id: string,
    @Body() marcarItemDto: MarcarItemDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.conciliacionService.marcarItem(tenantId, id, marcarItemDto);
  }

  @Get(':id/diferencias')
  @RequirePermission('finanzas.conciliacion.ver')
  @ApiOperation({
    summary: 'Obtener reporte de diferencias de conciliación',
    description: 'Genera un reporte detallado de las diferencias entre los movimientos del sistema y los movimientos del extracto bancario. Incluye totales por tipo (abonos/cargos), movimientos conciliados vs pendientes, y porcentaje de conciliación. Útil para revisar el estado antes de cerrar la conciliación.',
  })
  @ApiResponse({ status: 200, description: 'Reporte de diferencias generado exitosamente' })
  @ApiResponse({ status: 404, description: 'Conciliación no encontrada' })
  async obtenerDiferencias(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.conciliacionService.obtenerDiferencias(tenantId, id);
  }

  @Post(':id/cerrar')
  @RequirePermission('finanzas.conciliacion.gestionar')
  @ApiOperation({
    summary: 'Cerrar conciliación bancaria',
    description: 'Cierra una conciliación bancaria después de validar que todos los ítems han sido procesados. Valida que: 1) Se haya importado un extracto bancario, 2) Todos los movimientos estén conciliados (o se fuerce el cierre). Marca todos los movimientos conciliados como definitivos, genera un reporte de diferencias y bloquea futuras modificaciones. Una vez cerrada, la conciliación no puede ser modificada.',
  })
  @ApiResponse({ status: 200, description: 'Conciliación cerrada exitosamente' })
  @ApiResponse({ status: 400, description: 'Conciliación ya cerrada, tiene movimientos pendientes, o no se ha importado extracto' })
  @ApiResponse({ status: 404, description: 'Conciliación no encontrada' })
  async cerrarConciliacion(
    @Param('id') id: string,
    @Body() cerrarConciliacionDto: CerrarConciliacionDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.conciliacionService.cerrarConciliacion(
      tenantId, 
      id, 
      user?.id,
      cerrarConciliacionDto.forzar_cierre || false
    );
  }

  @Get('pendientes')
  @RequirePermission('finanzas.conciliacion.ver')
  @ApiOperation({
    summary: 'Obtener conciliaciones pendientes',
    description: 'Obtiene la lista de conciliaciones bancarias que están pendientes de completar (estado ABIERTA o EN_PROCESO). Incluye información de la cuenta bancaria, período, saldos y porcentaje de avance de conciliación. Útil para monitorear el estado de las conciliaciones en curso.',
  })
  @ApiResponse({ status: 200, description: 'Lista de conciliaciones pendientes obtenida exitosamente' })
  async obtenerConciliacionesPendientes(
    @CurrentTenant() tenantId: string,
  ) {
    return this.conciliacionService.obtenerConciliacionesPendientes(tenantId);
  }

  @Get('plantillas-csv')
  @RequirePermission('finanzas.conciliacion.ver')
  @ApiOperation({
    summary: 'Listar plantillas CSV disponibles',
    description: 'Obtiene la lista de todas las plantillas CSV configuradas para importar extractos bancarios. Incluye plantillas predefinidas para bancos peruanos (BCP, BBVA, Interbank, Scotiabank) y plantillas personalizadas registradas.',
  })
  @ApiResponse({ status: 200, description: 'Lista de plantillas obtenida exitosamente' })
  async listarPlantillasCsv() {
    return this.conciliacionService.listarPlantillasCsv();
  }

  @Post('plantillas-csv')
  @RequirePermission('finanzas.conciliacion.gestionar')
  @ApiOperation({
    summary: 'Registrar plantilla CSV personalizada',
    description: 'Registra una nueva plantilla CSV personalizada para importar extractos bancarios de bancos no soportados por defecto. Permite definir el formato de columnas, separadores, formato de fecha y otras configuraciones específicas del banco.',
  })
  @ApiResponse({ status: 201, description: 'Plantilla registrada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos de plantilla inválidos' })
  async registrarPlantillaCsv(
    @Body() registrarPlantillaDto: RegistrarPlantillaCsvDto,
  ) {
    return this.conciliacionService.registrarPlantillaCsv(registrarPlantillaDto);
  }
}
