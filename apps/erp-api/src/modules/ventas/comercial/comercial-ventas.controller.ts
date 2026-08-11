import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ComercialVentasService } from './comercial-ventas.service';
import {
  CambiarEstadoReglaDto,
  CrearConsolidadoVentasDto,
  CrearListaPreciosDto,
  CrearReglaComisionDto,
  ResolverPreciosDto,
} from './dto';

@ApiTags('Ventas - Gestión comercial')
@ApiBearerAuth()
@Controller('ventas/comercial')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ComercialVentasController {
  constructor(private readonly comercial: ComercialVentasService) {}

  @Get('catalogos')
  @RequirePermission('ventas.precios.ver')
  @ApiOperation({ summary: 'Catálogos para precios, comisiones y consolidados' })
  catalogos(@CurrentTenant() tenantId: string) {
    return this.comercial.catalogos(tenantId);
  }

  @Get('listas-precios')
  @RequirePermission('ventas.precios.ver')
  listarListas(
    @CurrentTenant() tenantId: string,
    @Query('incluir_inactivas') incluirInactivas?: string,
  ) {
    return this.comercial.listarListasPrecios(tenantId, incluirInactivas !== 'false');
  }

  @Post('listas-precios')
  @RequirePermission('ventas.precios.gestionar')
  crearLista(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CrearListaPreciosDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.comercial.crearListaPrecios(tenantId, userId, dto, idempotencyKey);
  }

  @Patch('listas-precios/:id/estado')
  @RequirePermission('ventas.precios.gestionar')
  cambiarEstadoLista(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CambiarEstadoReglaDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.comercial.cambiarEstado(
      tenantId, userId, 'LISTA_PRECIOS', id, dto, idempotencyKey,
    );
  }

  @Post('precios/resolver')
  @RequirePermission('ventas.precios.ver')
  resolver(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ResolverPreciosDto,
  ) {
    return this.comercial.resolverPrecios(tenantId, userId, dto);
  }

  @Get('comisiones/reglas')
  @RequirePermission('ventas.comisiones.ver')
  listarReglas(
    @CurrentTenant() tenantId: string,
    @Query('incluir_inactivas') incluirInactivas?: string,
  ) {
    return this.comercial.listarReglasComision(tenantId, incluirInactivas !== 'false');
  }

  @Post('comisiones/reglas')
  @RequirePermission('ventas.comisiones.gestionar')
  crearRegla(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CrearReglaComisionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.comercial.crearReglaComision(tenantId, userId, dto, idempotencyKey);
  }

  @Patch('comisiones/reglas/:id/estado')
  @RequirePermission('ventas.comisiones.gestionar')
  cambiarEstadoRegla(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CambiarEstadoReglaDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.comercial.cambiarEstado(
      tenantId, userId, 'REGLA_COMISION', id, dto, idempotencyKey,
    );
  }

  @Get('comisiones/movimientos')
  @RequirePermission('ventas.comisiones.ver')
  listarMovimientos(
    @CurrentTenant() tenantId: string,
    @Query('vendedor_id') vendedorId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.comercial.listarMovimientosComision(tenantId, vendedorId, desde, hasta);
  }

  @Get('consolidados/candidatos')
  @RequirePermission('ventas.consolidados.crear')
  candidatos(@CurrentTenant() tenantId: string, @Query('limit') limit?: string) {
    return this.comercial.listarCandidatosConsolidado(tenantId, Number(limit || 100));
  }

  @Get('consolidados')
  @RequirePermission('ventas.consolidados.ver')
  listarConsolidados(@CurrentTenant() tenantId: string) {
    return this.comercial.listarConsolidados(tenantId);
  }

  @Get('consolidados/:id')
  @RequirePermission('ventas.consolidados.ver')
  obtenerConsolidado(
    @CurrentTenant() tenantId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.comercial.obtenerConsolidado(tenantId, id);
  }

  @Post('consolidados')
  @RequirePermission('ventas.consolidados.crear')
  crearConsolidado(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CrearConsolidadoVentasDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.comercial.crearConsolidado(tenantId, userId, dto, idempotencyKey);
  }
}
