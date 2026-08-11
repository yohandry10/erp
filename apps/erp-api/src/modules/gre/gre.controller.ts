import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GreService } from './gre.service';
import {
  CreateGuiaRemisionDto,
  GreAutoConfigDto,
  GreCancelDto,
  GreListQueryDto,
} from './gre.types';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GreReporteQueryDto } from './dto/gre-reporte.dto';

@ApiTags('gre')
@Controller('gre')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class GreController {
  constructor(private readonly greService: GreService) {}

  @Get('guias')
  @RequirePermission('gre.guias.ver')
  @ApiOperation({ summary: 'Listar guías de remisión del tenant' })
  async findAllGuias(
    @Query() filters: GreListQueryDto,
    @CurrentTenant() tenantId: string,
  ) {
    const guias = await this.greService.findAllGuias(tenantId, filters);
    return {
      success: true,
      data: guias,
      message: `Se encontraron ${guias.length} guías de remisión`,
    };
  }

  @Get('guias/:id')
  @RequirePermission('gre.guias.ver')
  @ApiOperation({ summary: 'Obtener una GRE con sus líneas' })
  async findGuiaById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return {
      success: true,
      data: await this.greService.findGuiaById(id, tenantId),
    };
  }

  @Post('guias')
  @RequirePermission('gre.guias.emitir')
  @ApiOperation({ summary: 'Crear una GRE interna atómica; la firma depende de las credenciales del cliente' })
  @ApiResponse({ status: 201, description: 'GRE creada en BORRADOR o FIRMADO' })
  async createGuia(
    @Body() greData: CreateGuiaRemisionDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const nuevaGuia = await this.greService.createGuia(
      greData,
      tenantId,
      this.requireActor(actorId),
      idempotencyKey,
    );
    return {
      success: true,
      message: nuevaGuia.estado === 'FIRMADO'
        ? `GRE ${nuevaGuia.numero} creada y firmada`
        : `GRE ${nuevaGuia.numero} creada; firma pendiente de credenciales válidas`,
      data: nuevaGuia,
    };
  }

  @Post('guias/:id/firmar')
  @RequirePermission('gre.guias.emitir')
  @ApiOperation({ summary: 'Firmar o reintentar la firma de una GRE existente' })
  async firmarGuia(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      data: await this.greService.firmarGuia(
        id,
        tenantId,
        this.requireActor(actorId),
        this.requireIdempotencyKey(idempotencyKey),
      ),
    };
  }

  @Post('guias/:id/enviar-sunat')
  @RequirePermission('gre.guias.enviar')
  @ApiOperation({ summary: 'Reservar y transmitir la GRE firmada una sola vez' })
  async enviarManualmenteSunat(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      data: await this.greService.enviarManualmenteSunat(
        id,
        tenantId,
        this.requireActor(actorId),
        { idempotencyKey: this.requireIdempotencyKey(idempotencyKey) },
      ),
    };
  }

  @Post('guias/:id/reenviar')
  @RequirePermission('gre.guias.reenviar')
  @ApiOperation({ summary: 'Reintentar un error técnico de transmisión GRE' })
  async reenviarGre(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      data: await this.greService.reenviarGre(
        id,
        tenantId,
        this.requireActor(actorId),
        { idempotencyKey: this.requireIdempotencyKey(idempotencyKey) },
      ),
    };
  }

  @Post('guias/:id/consultar-sunat')
  @RequirePermission('gre.guias.consultar')
  @ApiOperation({ summary: 'Consultar y persistir el estado SUNAT con claim idempotente' })
  async consultarEstadoSunat(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      data: await this.greService.consultarEstadoGre(
        id,
        tenantId,
        this.requireActor(actorId),
        this.requireIdempotencyKey(idempotencyKey),
      ),
    };
  }

  @Post('guias/:id/anular')
  @RequirePermission('gre.guias.emitir')
  @ApiOperation({ summary: 'Anular una GRE interna antes de su transmisión' })
  async anularGuia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: GreCancelDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      data: await this.greService.anularGuia(
        id,
        tenantId,
        this.requireActor(actorId),
        body.motivo,
        this.requireIdempotencyKey(idempotencyKey),
      ),
    };
  }

  @Get('guias/:id/estado-sunat')
  @RequirePermission('gre.guias.ver')
  @ApiOperation({ summary: 'Leer el último estado SUNAT persistido, sin mutar ni transmitir' })
  async obtenerEstadoSunatPersistido(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
  ) {
    const gre = await this.greService.findGuiaById(id, tenantId);
    return {
      success: true,
      data: {
        id: gre.id,
        estado: gre.estado,
        sunatStatus: gre.sunatStatus,
        numeroSunat: gre.numeroSunat,
        errorMessage: gre.errorMessage,
        lastConsultedAt: gre.lastConsultedAt,
      },
    };
  }

  @Get('guias/:id/xml')
  @RequirePermission('gre.guias.descargar_xml')
  @ApiOperation({ summary: 'Descargar el XML firmado congelado de la GRE' })
  async obtenerXmlFirmado(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
    @Res() res: any,
  ) {
    const xml = await this.greService.obtenerXmlFirmado(id, tenantId);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${xml.filename}"`);
    return res.send(xml.content);
  }

  @Get('guias/:id/pdf')
  @RequirePermission('gre.guias.ver')
  @ApiOperation({ summary: 'Descargar representación legible de una GRE' })
  async obtenerRepresentacionImpresa(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
    @Res() res: any,
  ) {
    const documento = await this.greService.generarRepresentacionGre(id, tenantId);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${documento.filename}"`);
    return res.send(documento.content);
  }

  @Get('reporte')
  @RequirePermission('gre.reportes.ver')
  async generateReport(
    @CurrentTenant() tenantId: string,
    @Res() res: any,
    @Query() query: GreReporteQueryDto,
  ) {
    const csv = await this.greService.generarCsvGre(tenantId, query.anio, query.mes);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="gre_${query.anio || 'all'}_${query.mes || 'all'}.csv"`);
    return res.send(csv);
  }

  @Get('stats')
  @RequirePermission('gre.reportes.ver')
  async getStats(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.greService.getStats(tenantId) };
  }

  @Post('evaluate-auto-creation')
  @RequirePermission('gre.configuracion.evaluar')
  async evaluateAutoCreation(
    @CurrentTenant() tenantId: string,
    @Body() body: { saleId: string; total: number; cpeId?: string },
  ) {
    const shouldCreate = await this.greService.evaluateAutoGRECreation({
      tenantId,
      saleId: body.saleId,
      total: body.total,
      cpeId: body.cpeId,
    });
    return { success: true, data: { shouldCreate, saleId: body.saleId, total: body.total } };
  }

  @Get('auto-config')
  @RequirePermission('gre.configuracion.ver')
  async getAutoConfig(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.greService.getGREThresholdConfig(tenantId) };
  }

  @Post('auto-config')
  @RequirePermission('gre.configuracion.actualizar')
  async updateAutoConfig(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string | undefined,
    @Body() body: GreAutoConfigDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      data: await this.greService.updateAutoConfig(
        tenantId,
        this.requireActor(actorId),
        body,
        this.requireIdempotencyKey(idempotencyKey),
      ),
    };
  }

  private requireActor(actorId?: string): string {
    if (!actorId) throw new BadRequestException('Actor autenticado requerido');
    return actorId;
  }

  private requireIdempotencyKey(value?: string): string {
    const key = String(value || '').trim();
    if (!key) throw new BadRequestException('Idempotency-Key requerido');
    if (key.length > 200) throw new BadRequestException('Idempotency-Key excede 200 caracteres');
    return key;
  }
}
