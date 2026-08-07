import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CurrentTenant, CurrentUser } from "../../../common";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { RequirePermission } from "../../../common/decorators/require-permission.decorator";
import {
  CreateTipoCambioDto,
  ListarTiposCambioQueryDto,
  TipoCambioResponseDto,
  RevaluacionQueryDto,
  EjecutarRevaluacionDto,
  RevaluacionResponseDto,
} from "@erp-suite/dtos";
import { TiposCambioService } from "../services/tipos-cambio.service";
import { RevaluacionService } from "../services/revaluacion.service";

@ApiTags("contabilidad")
@Controller("contabilidad")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContabilidadMultimonedaController {
  constructor(
    private readonly tiposCambioService: TiposCambioService,
    private readonly revaluacionService: RevaluacionService,
  ) {}

  @Get("tipos-cambio")
  @RequirePermission("contabilidad.tipos_cambio.read")
  @ApiOperation({ summary: "Listar cotizaciones registradas" })
  @ApiResponse({ status: 200, type: [TipoCambioResponseDto] })
  async listarTiposCambio(
    @CurrentTenant() tenantId: string,
    @Query() query: ListarTiposCambioQueryDto,
  ) {
    const resultado = await this.tiposCambioService.listar(tenantId, query);

    return {
      success: true,
      ...resultado,
      message: "Tipos de cambio obtenidos exitosamente",
    };
  }

  @Get("tipos-cambio/vigente")
  @RequirePermission("contabilidad.tipos_cambio.read")
  @ApiOperation({
    summary: "Cotización vigente de un par a una fecha",
    description:
      "Si no hay cotización para la fecha exacta devuelve la última anterior, " +
      "marcando el resultado con vigente_desde_fecha_anterior.",
  })
  @ApiResponse({ status: 200, type: TipoCambioResponseDto })
  async obtenerVigente(
    @CurrentTenant() tenantId: string,
    @Query("moneda_origen") monedaOrigen: string,
    @Query("fecha") fecha: string,
    @Query("moneda_destino") monedaDestino?: string,
  ) {
    const destino =
      monedaDestino || (await this.tiposCambioService.obtenerMonedaLocal(tenantId));
    const cotizacion = await this.tiposCambioService.obtenerVigente(
      tenantId,
      monedaOrigen,
      destino,
      fecha,
    );

    return {
      success: true,
      data: cotizacion,
      message: cotizacion
        ? "Cotización vigente obtenida"
        : `No hay cotización ${monedaOrigen}/${destino} vigente al ${fecha}`,
    };
  }

  @Get("moneda-local")
  @RequirePermission("contabilidad.tipos_cambio.read")
  @ApiOperation({ summary: "Moneda local del tenant, derivada de su país" })
  async obtenerMonedaLocal(@CurrentTenant() tenantId: string) {
    const moneda = await this.tiposCambioService.obtenerMonedaLocal(tenantId);
    return { success: true, data: { moneda }, message: "Moneda local obtenida" };
  }

  @Post("tipos-cambio")
  @RequirePermission("contabilidad.tipos_cambio.crear")
  @ApiOperation({
    summary: "Registrar o corregir la cotización de un par para una fecha",
    description:
      "Si ya existe una cotización para el mismo par y fecha, se reemplaza: " +
      "corregir el tipo de cambio del día es una operación habitual.",
  })
  @ApiResponse({ status: 201, type: TipoCambioResponseDto })
  async registrarTipoCambio(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() dto: CreateTipoCambioDto,
  ) {
    const tipoCambio = await this.tiposCambioService.registrar(tenantId, userId, dto);

    return {
      success: true,
      data: tipoCambio,
      message: `Tipo de cambio ${tipoCambio.moneda_origen}/${tipoCambio.moneda_destino} del ${dto.fecha} registrado`,
    };
  }

  @Delete("tipos-cambio/:id")
  @RequirePermission("contabilidad.tipos_cambio.eliminar")
  @ApiOperation({ summary: "Eliminar una cotización" })
  async eliminarTipoCambio(
    @CurrentTenant() tenantId: string,
    @Param("id") id: string,
  ) {
    await this.tiposCambioService.eliminar(tenantId, id);
    return { success: true, message: "Tipo de cambio eliminado" };
  }

  @Get("revaluacion/simular")
  @RequirePermission("contabilidad.revaluacion.simular")
  @ApiOperation({
    summary: "Simular la diferencia de cambio no realizada a una fecha de corte",
    description:
      "No escribe nada. Devuelve posición por posición la diferencia y el detalle " +
      "de lo que quedó excluido y por qué.",
  })
  @ApiResponse({ status: 200, type: RevaluacionResponseDto })
  async simularRevaluacion(
    @CurrentTenant() tenantId: string,
    @Query() query: RevaluacionQueryDto,
  ) {
    const resultado = await this.revaluacionService.simular(tenantId, query.fecha);

    return {
      success: true,
      data: resultado,
      message: `Simulación de revaluación al ${query.fecha}`,
    };
  }

  @Post("revaluacion")
  @RequirePermission("contabilidad.revaluacion.ejecutar")
  @ApiOperation({
    summary: "Registrar el asiento de diferencia de cambio no realizada",
    description:
      "Idempotente por fecha de corte: un segundo intento sobre la misma fecha se rechaza.",
  })
  @ApiResponse({ status: 201, type: RevaluacionResponseDto })
  @ApiResponse({
    status: 400,
    description:
      "No hay diferencia que registrar, el período está cerrado, o el corte ya fue ejecutado",
  })
  async ejecutarRevaluacion(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() dto: EjecutarRevaluacionDto,
  ) {
    const resultado = await this.revaluacionService.ejecutar(
      tenantId,
      userId,
      dto.fecha,
      dto.concepto,
    );

    return {
      success: true,
      data: resultado,
      message: `Revaluación al ${dto.fecha} registrada en el asiento ${resultado.numero_asiento ?? resultado.asiento_id}`,
    };
  }
}
