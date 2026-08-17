import {
  Controller,
  Get,
  Post,
  Put,
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
  ListarAsientosQueryDto,
  AsientoResponseDto,
  CreateAsientoManualDto,
  UpdateAsientoManualDto,
  AnularAsientoDto,
  ReversarAsientoDto,
} from "@erp-suite/dtos";
import { AsientosService } from "../services/asientos.service";

@ApiTags("contabilidad")
@Controller("contabilidad")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContabilidadAsientosController {
  constructor(private readonly asientosService: AsientosService) {}

  @Post("asiento-contable")
  @RequirePermission("contabilidad.asientos.crear") // HARDENING: creación manual de asiento.
  @ApiOperation({ summary: "Crear nuevo asiento contable manual" })
  @ApiResponse({
    status: 201,
    description: "Asiento contable creado exitosamente",
    type: AsientoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Datos inválidos o asiento descuadrado",
  })
  @ApiResponse({
    status: 403,
    description: "Período contable cerrado o bloqueado",
  })
  async crearAsientoContable(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() createAsientoDto: CreateAsientoManualDto,
  ): Promise<{ success: boolean; data: AsientoResponseDto; message: string }> {
    try {
      console.log(
        `📝 [Contabilidad] Creando asiento manual para tenant ${tenantId}`,
      );

      const asiento = await this.asientosService.crearAsientoManual(
        tenantId,
        userId,
        createAsientoDto,
      );

      return {
        success: true,
        data: asiento,
        message: `Asiento contable ${asiento.numero_asiento} creado exitosamente`,
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error creando asiento manual:", error);
      throw error;
    }
  }

  @Get("asientos-contables")
  @RequirePermission("contabilidad.asientos.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary: "Obtener listado de asientos contables con filtros",
  })
  @ApiResponse({
    status: 200,
    description: "Asientos contables obtenidos exitosamente",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "array",
          items: { type: "object" },
        },
        total: { type: "number" },
        page: { type: "number" },
        limit: { type: "number" },
        totalPages: { type: "number" },
      },
    },
  })
  async getAsientosContables(
    @CurrentTenant() tenantId: string,
    @Query() filtros: ListarAsientosQueryDto,
  ) {
    try {
      console.log(
        "📚 [Contabilidad] Obteniendo asientos contables para tenant",
        tenantId,
        filtros,
      );

      const resultado = await this.asientosService.listarAsientos(
        tenantId,
        filtros,
      );

      return {
        success: true,
        ...resultado,
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error obteniendo asientos contables:",
        error,
      );
      throw error;
    }
  }

  @Get("asientos-contables/:id")
  @RequirePermission("contabilidad.asientos.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener un asiento contable específico por ID" })
  @ApiResponse({
    status: 200,
    description: "Asiento contable obtenido exitosamente",
    type: AsientoResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Asiento no encontrado",
  })
  async getAsientoContablePorId(
    @CurrentTenant() tenantId: string,
    @Param("id") asientoId: string,
  ): Promise<{ success: boolean; data: AsientoResponseDto }> {
    try {
      console.log(
        `📚 [Contabilidad] Obteniendo asiento ${asientoId} para tenant ${tenantId}`,
      );

      const asiento = await this.asientosService.obtenerAsientoPorId(
        tenantId,
        asientoId,
      );

      return {
        success: true,
        data: asiento,
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error obteniendo asiento:", error);
      throw error;
    }
  }

  @Get("asientos")
  @RequirePermission("contabilidad.asientos.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Listar asientos contables con filtros opcionales" })
  @ApiResponse({
    status: 200,
    description: "Lista de asientos contables obtenida exitosamente",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "array",
          items: { $ref: "#/components/schemas/AsientoResponseDto" },
        },
        total: { type: "number", description: "Total de registros" },
        page: { type: "number", description: "Página actual" },
        limit: { type: "number", description: "Límite por página" },
        totalPages: { type: "number", description: "Total de páginas" },
        message: { type: "string" },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "Parámetros inválidos",
  })
  async listarAsientos(
    @CurrentTenant() tenantId: string,
    @Query() filters: ListarAsientosQueryDto,
  ): Promise<{
    success: boolean;
    data: AsientoResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    message: string;
  }> {
    try {
      console.log(
        `📒 [Contabilidad] Listando asientos para tenant ${tenantId} con filtros:`,
        filters,
      );

      const resultado = await this.asientosService.listarAsientos(
        tenantId,
        filters,
      );

      return {
        success: true,
        data: resultado.data,
        total: resultado.total,
        page: resultado.page,
        limit: resultado.limit,
        totalPages: resultado.totalPages,
        message: `${resultado.total} asiento(s) encontrado(s)`,
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error listando asientos:", error);
      throw error;
    }
  }

  @Get("asientos/estadisticas/por-tipo")
  @RequirePermission("contabilidad.asientos.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary: "Obtener estadísticas de asientos generados por tipo de evento",
  })
  @ApiResponse({
    status: 200,
    description: "Estadísticas de asientos por tipo obtenidas exitosamente",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tipo: {
                type: "string",
                description:
                  "Tipo de evento (VentaFacturada, CobroRegistrado, etc.)",
              },
              cantidad: {
                type: "number",
                description: "Cantidad de asientos generados",
              },
            },
          },
        },
        message: { type: "string" },
      },
    },
  })
  async obtenerEstadisticasAsientosPorTipo(
    @CurrentTenant() tenantId: string,
  ): Promise<{
    success: boolean;
    data: { tipo: string; cantidad: number }[];
    message: string;
  }> {
    const estadisticas =
      await this.asientosService.obtenerEstadisticasAsientosPorTipo(tenantId);

    return {
      success: true,
      data: estadisticas,
      message: `Estadísticas de ${estadisticas.length} tipo(s) de asientos obtenidas`,
    };
  }

  @Get("asientos/:id")
  @RequirePermission("contabilidad.asientos.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary: "Obtener un asiento contable específico por ID con sus detalles",
  })
  @ApiResponse({
    status: 200,
    description: "Asiento contable obtenido exitosamente",
    type: AsientoResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Asiento no encontrado",
  })
  async obtenerAsientoPorId(
    @CurrentTenant() tenantId: string,
    @Param("id") asientoId: string,
  ): Promise<{ success: boolean; data: AsientoResponseDto; message: string }> {
    try {
      console.log(
        `📒 [Contabilidad] Obteniendo asiento ${asientoId} para tenant ${tenantId}`,
      );

      const asiento = await this.asientosService.obtenerAsientoPorId(
        tenantId,
        asientoId,
      );

      return {
        success: true,
        data: asiento,
        message: "Asiento contable obtenido exitosamente",
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error obteniendo asiento:", error);
      throw error;
    }
  }

  @Put("asientos/:id")
  @RequirePermission("contabilidad.asientos.actualizar")
  @ApiOperation({
    summary: "Actualizar un asiento en BORRADOR",
    description:
      "Reemplaza el contenido del asiento. Solo aplica a asientos en BORRADOR: " +
      "un asiento CONFIRMADO es inmutable y se corrige mediante reversión.",
  })
  @ApiResponse({ status: 200, type: AsientoResponseDto })
  @ApiResponse({
    status: 400,
    description:
      "El asiento no está en BORRADOR, no cuadra, o el período está cerrado",
  })
  async actualizarAsiento(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") asientoId: string,
    @Body() updateDto: UpdateAsientoManualDto,
  ): Promise<{ success: boolean; data: AsientoResponseDto; message: string }> {
    const asiento = await this.asientosService.actualizarAsientoBorrador(
      tenantId,
      userId,
      asientoId,
      updateDto,
    );

    return {
      success: true,
      data: asiento,
      message: `Asiento ${asiento.numero_asiento ?? asiento.id} actualizado`,
    };
  }

  @Delete("asientos/:id")
  @RequirePermission("contabilidad.asientos.eliminar")
  @ApiOperation({
    summary: "Eliminar un asiento en BORRADOR",
    description:
      "Solo elimina borradores. Un asiento que ya está en el libro nunca se borra.",
  })
  @ApiResponse({ status: 200, description: "Asiento borrador eliminado" })
  @ApiResponse({ status: 400, description: "El asiento no está en BORRADOR" })
  async eliminarAsiento(
    @CurrentTenant() tenantId: string,
    @Param("id") asientoId: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.asientosService.eliminarAsientoBorrador(tenantId, asientoId);

    return {
      success: true,
      message: "Asiento borrador eliminado",
    };
  }

  @Post("asientos/:id/confirmar")
  @RequirePermission("contabilidad.asientos.confirmar")
  @ApiOperation({
    summary: "Confirmar un asiento en BORRADOR",
    description:
      "Publica el asiento en los libros y estados financieros. A partir de aquí es inmutable.",
  })
  @ApiResponse({ status: 200, type: AsientoResponseDto })
  @ApiResponse({
    status: 400,
    description:
      "El asiento no está en BORRADOR, no cuadra, o el período está cerrado",
  })
  async confirmarAsiento(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") asientoId: string,
  ): Promise<{ success: boolean; data: AsientoResponseDto; message: string }> {
    const asiento = await this.asientosService.confirmarAsiento(
      tenantId,
      userId,
      asientoId,
    );

    return {
      success: true,
      data: asiento,
      message: `Asiento ${asiento.numero_asiento ?? asiento.id} confirmado`,
    };
  }

  @Post("asientos/:id/anular")
  @RequirePermission("contabilidad.asientos.anular")
  @ApiOperation({
    summary: "Anular un asiento en BORRADOR",
    description:
      "Descarta un borrador conservando el rastro y el motivo. Para un asiento " +
      "confirmado la operación correcta es la reversión, no la anulación.",
  })
  @ApiResponse({ status: 200, type: AsientoResponseDto })
  @ApiResponse({ status: 400, description: "El asiento no está en BORRADOR" })
  async anularAsiento(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") asientoId: string,
    @Body() anularDto: AnularAsientoDto,
  ): Promise<{ success: boolean; data: AsientoResponseDto; message: string }> {
    const asiento = await this.asientosService.anularAsientoBorrador(
      tenantId,
      userId,
      asientoId,
      anularDto.motivo,
    );

    return {
      success: true,
      data: asiento,
      message: `Asiento ${asiento.numero_asiento ?? asiento.id} anulado`,
    };
  }

  @Post("asientos/:id/reversar")
  @RequirePermission("contabilidad.asientos.reversar")
  @ApiOperation({
    summary: "Reversar un asiento CONFIRMADO",
    description:
      "Crea el contra-asiento con debe y haber invertidos, enlazado al original. " +
      "El asiento original permanece intacto en el libro.",
  })
  @ApiResponse({
    status: 201,
    description: "Asiento de reversión creado",
    type: AsientoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      "El asiento no está CONFIRMADO, ya fue reversado, o el período de la fecha de reversión está cerrado",
  })
  async reversarAsiento(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") asientoId: string,
    @Body() reversarDto: ReversarAsientoDto,
  ): Promise<{ success: boolean; data: AsientoResponseDto; message: string }> {
    const reversion = await this.asientosService.reversarAsiento(
      tenantId,
      userId,
      asientoId,
      reversarDto,
    );

    return {
      success: true,
      data: reversion,
      message: `Asiento de reversión ${reversion.numero_asiento ?? reversion.id} creado`,
    };
  }
}
