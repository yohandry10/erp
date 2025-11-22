import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { RmaService } from './rma.service';
import { AprobarRmaDto, CrearRmaDto, GenerarNotaCreditoDto, RecepcionarRmaDto } from './dto';

@ApiTags('Ventas - RMA')
@ApiBearerAuth()
@Controller('ventas/rma')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: RMA requiere permisos específicos.
export class RmaController {
  constructor(private readonly rmaService: RmaService) {}

  @Get()
  @RequirePermission('ventas.rma.ver')
  @ApiOperation({ summary: 'Listar solicitudes RMA' })
  async listar(@CurrentTenant() tenantId: string, @Query('estado') estado?: string) {
    return this.rmaService.listar(tenantId, estado);
  }

  @Get(':id')
  @RequirePermission('ventas.rma.ver')
  @ApiOperation({ summary: 'Obtener detalle de una RMA' })
  async obtener(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.rmaService.obtenerPorId(tenantId, id);
  }

  @Post()
  @RequirePermission('ventas.rma.crear')
  @ApiOperation({ summary: 'Crear una solicitud de RMA' })
  async crear(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CrearRmaDto,
  ) {
    return this.rmaService.crear(tenantId, userId, dto);
  }

  @Post(':id/aprobar')
  @RequirePermission('ventas.rma.aprobar')
  @ApiOperation({ summary: 'Aprobar o rechazar una RMA' })
  async aprobar(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: AprobarRmaDto,
  ) {
    return this.rmaService.aprobar(tenantId, userId, id, dto);
  }

  @Post(':id/recepcionar')
  @RequirePermission('ventas.rma.recepcionar')
  @ApiOperation({ summary: 'Registrar la recepción física de una RMA' })
  async recepcionar(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: RecepcionarRmaDto,
  ) {
    return this.rmaService.recepcionar(tenantId, userId, id, dto);
  }

  @Post(':id/nota-credito')
  @RequirePermission('ventas.rma.generar_nota_credito')
  @ApiOperation({ summary: 'Generar nota de crédito para una RMA' })
  async generarNotaCredito(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: GenerarNotaCreditoDto,
  ) {
    return this.rmaService.generarNotaCredito(tenantId, userId, id, dto);
  }
}
