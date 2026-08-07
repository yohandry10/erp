import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsISO8601, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { CurrentTenant, CurrentUser } from '../../../common';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AjustesTributariosMensuales, TributosMensualesService } from '../services/tributos-mensuales.service';

class PeriodoTributarioQueryDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  periodo!: string;
}

class CalcularTributoMensualDto implements AjustesTributariosMensuales {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  periodo!: string;

  @IsOptional() @IsNumber() @Min(0) saldo_favor_anterior?: number;
  @IsOptional() @IsNumber() @Min(0) retenciones_igv?: number;
  @IsOptional() @IsNumber() @Min(0) percepciones_igv?: number;
  @IsOptional() @IsNumber() @Min(0) otros_creditos_igv?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) coeficiente_renta?: number;
  @IsOptional() @IsString() notas?: string;
}

class RegistrarConstanciaDto {
  @IsString()
  @Matches(/\S/)
  constancia!: string;

  @IsOptional()
  @IsISO8601()
  fecha_presentacion?: string;
}

@ApiTags('contabilidad')
@Controller('contabilidad/impuestos')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContabilidadTributosController {
  constructor(private readonly service: TributosMensualesService) {}

  @Get('mensual')
  @RequirePermission('contabilidad.reportes.read')
  @ApiOperation({ summary: 'Calcular borrador peruano IGV/Renta desde CPE y CxP; no presenta a SUNAT' })
  async calcularBase(
    @CurrentTenant() tenantId: string,
    @Query() query: PeriodoTributarioQueryDto,
  ) {
    return { success: true, data: await this.service.calcular(tenantId, query.periodo) };
  }

  @Post('mensual/calcular')
  @RequirePermission('contabilidad.reportes.read')
  @ApiOperation({ summary: 'Previsualizar cálculo mensual con créditos y coeficiente informados' })
  async calcular(
    @CurrentTenant() tenantId: string,
    @Body() dto: CalcularTributoMensualDto,
  ) {
    const { periodo, ...ajustes } = dto;
    return { success: true, data: await this.service.calcular(tenantId, periodo, ajustes) };
  }

  @Post('mensual')
  @RequirePermission('contabilidad.reportes.actualizar')
  @ApiOperation({ summary: 'Congelar una nueva versión del borrador mensual; no presenta a SUNAT' })
  async guardar(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CalcularTributoMensualDto,
  ) {
    const { periodo, ...ajustes } = dto;
    return {
      success: true,
      data: await this.service.guardar(tenantId, userId, periodo, ajustes),
      message: 'Borrador tributario versionado. Aún debe presentarse en SUNAT.',
    };
  }

  @Get('declaraciones')
  @RequirePermission('contabilidad.reportes.read')
  @ApiOperation({ summary: 'Listar versiones de borradores y constancias tributarias' })
  async listar(
    @CurrentTenant() tenantId: string,
    @Query('limite') limite?: string,
  ) {
    return { success: true, data: await this.service.listar(tenantId, Number(limite) || 24) };
  }

  @Post('declaraciones/:id/constancia')
  @RequirePermission('contabilidad.reportes.actualizar')
  @ApiOperation({ summary: 'Registrar la constancia obtenida externamente en SUNAT' })
  async registrarConstancia(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegistrarConstanciaDto,
  ) {
    return {
      success: true,
      data: await this.service.registrarConstancia(
        tenantId,
        userId,
        id,
        dto.constancia,
        dto.fecha_presentacion,
      ),
      message: 'Constancia SUNAT registrada como evidencia externa.',
    };
  }
}
