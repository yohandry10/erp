import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { CotizacionesCompraService } from "../services/cotizaciones-compra.service";
import { CreateCotizacionCompraDto } from "../dto/create-cotizacion-compra.dto";
import { UpdateCotizacionCompraDto } from "../dto/update-cotizacion-compra.dto";
import { RechazarCotizacionDto } from "../dto/rechazar-cotizacion.dto";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { RequirePermission } from "../../../common/decorators/require-permission.decorator";
import { CurrentTenant } from "../../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../auth/current-user.decorator";

import { ConvertirCotizacionOcDto } from '../../shared-dto/acciones-simples.dto';

@ApiTags("compras/cotizaciones")
@Controller("compras/cotizaciones")
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: proteger cotizaciones con permisos granulares.
export class CotizacionesCompraController {
  constructor(
    private readonly cotizacionesService: CotizacionesCompraService,
  ) {}

  @Post()
  @RequirePermission("compras.cotizaciones.crear")
  @ApiOperation({ summary: "Crear nueva cotización de compra" })
  @ApiResponse({ status: 201, description: "Cotización creada exitosamente" })
  @ApiResponse({ status: 400, description: "Datos inválidos" })
  @ApiResponse({
    status: 409,
    description: "Ya existe una cotización con ese número",
  })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createDto: CreateCotizacionCompraDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    // HARDENING: el tenant proviene del contexto, no del body.
    const cotizacion = await this.cotizacionesService.create(
      createDto,
      tenantId,
      user?.id,
    );

    return {
      success: true,
      message: "Cotización de compra creada exitosamente",
      data: cotizacion,
    };
  }

  @Get()
  @RequirePermission("compras.cotizaciones.ver")
  @ApiOperation({ summary: "Obtener lista de cotizaciones con filtros" })
  @ApiResponse({
    status: 200,
    description: "Cotizaciones obtenidas exitosamente",
  })
  @ApiQuery({
    name: "estado",
    required: false,
    description: "Filtrar por estado",
  })
  @ApiQuery({
    name: "proveedor_id",
    required: false,
    description: "Filtrar por proveedor",
  })
  @ApiQuery({
    name: "fecha_desde",
    required: false,
    description: "Fecha desde (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "fecha_hasta",
    required: false,
    description: "Fecha hasta (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Límite de resultados",
  })
  @ApiQuery({
    name: "offset",
    required: false,
    description: "Offset para paginación",
  })
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query("estado") estado?: string,
    @Query("proveedor_id") proveedorId?: string,
    @Query("fecha_desde") fechaDesde?: string,
    @Query("fecha_hasta") fechaHasta?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const filters: any = {};

    if (estado) {
      filters.estado = estado;
    }

    if (proveedorId) {
      filters.proveedor_id = proveedorId;
    }

    if (fechaDesde) {
      filters.fecha_desde = fechaDesde;
    }

    if (fechaHasta) {
      filters.fecha_hasta = fechaHasta;
    }

    if (limit) {
      filters.limit = parseInt(limit, 10);
    }

    if (offset) {
      filters.offset = parseInt(offset, 10);
    }

    const result = await this.cotizacionesService.findAll(tenantId, filters);

    return {
      success: true,
      data: result.data,
      count: result.count,
    };
  }

  @Get(":id")
  @RequirePermission("compras.cotizaciones.ver")
  @ApiOperation({ summary: "Obtener cotización por ID" })
  @ApiResponse({ status: 200, description: "Cotización encontrada" })
  @ApiResponse({ status: 404, description: "Cotización no encontrada" })
  async findOne(@Param("id") id: string, @CurrentTenant() tenantId: string) {
    // HARDENING: el tenant proviene del contexto.
    const cotizacion = await this.cotizacionesService.findById(id, tenantId);

    return {
      success: true,
      data: cotizacion,
    };
  }

  @Put(":id")
  @RequirePermission("compras.cotizaciones.editar")
  @ApiOperation({ summary: "Actualizar cotización de compra" })
  @ApiResponse({
    status: 200,
    description: "Cotización actualizada exitosamente",
  })
  @ApiResponse({
    status: 400,
    description: "Datos inválidos o cotización no editable",
  })
  @ApiResponse({ status: 404, description: "Cotización no encontrada" })
  @ApiResponse({
    status: 409,
    description: "Ya existe una cotización con ese número",
  })
  @HttpCode(HttpStatus.OK)
  async update(
    @Param("id") id: string,
    @Body() updateDto: UpdateCotizacionCompraDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    // HARDENING: ignoramos tenant externo; usamos contexto autenticado.
    const cotizacion = await this.cotizacionesService.update(
      id,
      updateDto,
      tenantId,
      user?.id,
    );

    return {
      success: true,
      message: "Cotización de compra actualizada exitosamente",
      data: cotizacion,
    };
  }

  @Post(":id/enviar")
  @RequirePermission("compras.cotizaciones.enviar")
  @ApiOperation({
    summary: "Enviar cotización (cambiar estado de BORRADOR a ENVIADA)",
  })
  @ApiResponse({ status: 200, description: "Cotización enviada exitosamente" })
  @ApiResponse({
    status: 400,
    description: "Cotización no puede ser enviada (estado inválido o vencida)",
  })
  @ApiResponse({ status: 404, description: "Cotización no encontrada" })
  @HttpCode(HttpStatus.OK)
  async enviar(
    @Param("id") id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    // HARDENING: ignoramos tenant proporcionado en body.
    const cotizacion = await this.cotizacionesService.enviar(id, tenantId, user?.id);

    return {
      success: true,
      message: "Cotización enviada exitosamente",
      data: cotizacion,
    };
  }

  @Post(":id/aprobar")
  @RequirePermission("compras.cotizaciones.aprobar")
  @ApiOperation({
    summary: "Aprobar cotización (cambiar estado de ENVIADA a APROBADA)",
  })
  @ApiResponse({ status: 200, description: "Cotización aprobada exitosamente" })
  @ApiResponse({
    status: 400,
    description: "Cotización no puede ser aprobada (estado inválido o vencida)",
  })
  @ApiResponse({ status: 404, description: "Cotización no encontrada" })
  @HttpCode(HttpStatus.OK)
  async aprobar(
    @Param("id") id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    // HARDENING: se fuerza tenant del contexto autenticado.
    const cotizacion = await this.cotizacionesService.aprobar(id, tenantId, user?.id);

    return {
      success: true,
      message: "Cotización aprobada exitosamente",
      data: cotizacion,
    };
  }

  @Post(":id/rechazar")
  @RequirePermission("compras.cotizaciones.rechazar")
  @ApiOperation({
    summary: "Rechazar cotización (cambiar estado de ENVIADA a RECHAZADA)",
  })
  @ApiResponse({
    status: 200,
    description: "Cotización rechazada exitosamente",
  })
  @ApiResponse({
    status: 400,
    description: "Cotización no puede ser rechazada (estado inválido)",
  })
  @ApiResponse({ status: 404, description: "Cotización no encontrada" })
  @HttpCode(HttpStatus.OK)
  async rechazar(
    @Param("id") id: string,
    @Body() body: RechazarCotizacionDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    const cotizacion = await this.cotizacionesService.rechazar(
      id,
      tenantId,
      body.motivo,
      user?.id,
    );

    return {
      success: true,
      message: "Cotización rechazada exitosamente",
      data: cotizacion,
    };
  }

  @Post(":id/convertir-oc")
  @RequirePermission("compras.cotizaciones.convertir_orden")
  @ApiOperation({ summary: "Convertir cotización aprobada a orden de compra" })
  @ApiResponse({
    status: 201,
    description: "Orden de compra creada exitosamente desde cotización",
  })
  @ApiResponse({
    status: 400,
    description:
      "Cotización no puede ser convertida (estado inválido, vencida, o ya convertida)",
  })
  @ApiResponse({ status: 404, description: "Cotización no encontrada" })
  @ApiResponse({
    status: 409,
    description: "Ya existe una orden de compra con ese número",
  })
  @HttpCode(HttpStatus.CREATED)
  async convertirAOrdenCompra(
    @Param("id") id: string,
    @Body() body: ConvertirCotizacionOcDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    const ordenCompra = await this.cotizacionesService.convertirAOrdenCompra(
      id,
      tenantId,
      body?.numero_oc,
      user?.id,
    );

    return {
      success: true,
      message: "Orden de compra creada exitosamente desde cotización",
      data: ordenCompra,
    };
  }
}
