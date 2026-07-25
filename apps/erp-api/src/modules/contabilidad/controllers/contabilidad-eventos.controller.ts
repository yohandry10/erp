import { Controller, Get, Post, Query, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CurrentTenant } from "../../../common";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { RequirePermission } from "../../../common/decorators/require-permission.decorator";
import { OutboxEventsService } from "../services/outbox-events.service";
import { AsientosGeneratorService } from "../services/asientos-generator.service";

@ApiTags("contabilidad")
@Controller("contabilidad")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContabilidadEventosController {
  constructor(
    private readonly outboxEventsService: OutboxEventsService,
    private readonly asientosGeneratorService: AsientosGeneratorService,
  ) {}

  @Get("eventos/estadisticas")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary:
      "Obtener estadísticas de eventos (pendientes, procesados, fallidos, procesados hoy)",
  })
  @ApiResponse({
    status: 200,
    description: "Estadísticas de eventos obtenidas exitosamente",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: {
          type: "object",
          properties: {
            pending: {
              type: "number",
              description: "Eventos pendientes de procesar",
            },
            processed: {
              type: "number",
              description: "Total de eventos procesados",
            },
            processed_today: {
              type: "number",
              description: "Eventos procesados hoy",
            },
            failed: { type: "number", description: "Eventos fallidos" },
            dead_letter: {
              type: "number",
              description: "Eventos en dead letter (fallidos permanentemente)",
            },
            avg_processing_time_ms: {
              type: "number",
              nullable: true,
              description: "Tiempo promedio de procesamiento en milisegundos",
            },
          },
        },
        message: { type: "string" },
      },
    },
  })
  async getEstadisticasEventos(@CurrentTenant() _tenantId: string) {
    try {
      console.log(
        "📊 [ContabilidadController] Obteniendo estadísticas de eventos...",
      );

      const stats = await this.outboxEventsService.obtenerEstadisticasEventos();

      return {
        success: true,
        data: stats,
        message: `Estadísticas: ${stats.pending} pendientes, ${stats.processed_today} procesados hoy, ${stats.failed} fallidos`,
      };
    } catch (error) {
      console.error(
        "❌ [ContabilidadController] Error obteniendo estadísticas:",
        error,
      );
      return {
        success: false,
        message: "Error obteniendo estadísticas de eventos",
        data: {
          pending: 0,
          processed: 0,
          processed_today: 0,
          failed: 0,
          dead_letter: 0,
          avg_processing_time_ms: null,
        },
      };
    }
  }

  @Get("eventos/fallidos")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener lista de eventos fallidos" })
  @ApiResponse({
    status: 200,
    description: "Eventos fallidos obtenidos exitosamente",
  })
  async getEventosFallidos(
    @CurrentTenant() tenantId: string,
    @Query("limit") limit?: number,
  ) {
    try {
      console.log("🔴 [ContabilidadController] Obteniendo eventos fallidos...");

      const eventos = await this.outboxEventsService.leerEventosFallidos(
        limit || 100,
      );

      return {
        success: true,
        data: eventos,
        message: `${eventos.length} evento(s) fallido(s) encontrado(s)`,
      };
    } catch (error) {
      console.error(
        "❌ [ContabilidadController] Error obteniendo eventos fallidos:",
        error,
      );
      return {
        success: false,
        message: "Error obteniendo eventos fallidos",
        data: [],
      };
    }
  }

  @Get("eventos/dead-letter")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary:
      "Obtener lista de eventos en dead letter (fallidos permanentemente)",
  })
  @ApiResponse({
    status: 200,
    description: "Eventos dead letter obtenidos exitosamente",
  })
  async getEventosDeadLetter(
    @CurrentTenant() tenantId: string,
    @Query("limit") limit?: number,
  ) {
    try {
      console.log(
        "💀 [ContabilidadController] Obteniendo eventos dead letter...",
      );

      const eventos = await this.outboxEventsService.leerEventosDeadLetter(
        limit || 100,
      );

      return {
        success: true,
        data: eventos,
        message: `${eventos.length} evento(s) dead letter encontrado(s)`,
      };
    } catch (error) {
      console.error(
        "❌ [ContabilidadController] Error obteniendo eventos dead letter:",
        error,
      );
      return {
        success: false,
        message: "Error obteniendo eventos dead letter",
        data: [],
      };
    }
  }

  @Post("eventos/:eventId/reintentar")
  @RequirePermission("contabilidad.eventos.reintentar") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Reintentar un evento fallido" })
  @ApiResponse({ status: 200, description: "Evento reiniciado exitosamente" })
  async reintentarEvento(
    @CurrentTenant() tenantId: string,
    @Param("eventId") eventId: string,
  ) {
    try {
      console.log(
        `🔄 [ContabilidadController] Reintentando evento ${eventId}...`,
      );

      await this.asientosGeneratorService.reiniciarEventoFallido(eventId);

      return {
        success: true,
        data: { eventId, reiniciado: true },
        message: "Evento reiniciado para reprocesamiento",
      };
    } catch (error) {
      console.error(
        "❌ [ContabilidadController] Error reintentando evento:",
        error,
      );
      return {
        success: false,
        message: "Error reintentando evento",
        data: null,
      };
    }
  }

  @Get("eventos/estadisticas-fallidos")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary: "Obtener estadísticas detalladas de eventos fallidos por tipo",
  })
  @ApiResponse({
    status: 200,
    description: "Estadísticas de eventos fallidos obtenidas exitosamente",
  })
  async getEstadisticasEventosFallidos(@CurrentTenant() _tenantId: string) {
    try {
      console.log(
        "📊 [ContabilidadController] Obteniendo estadísticas de eventos fallidos...",
      );

      const stats =
        await this.asientosGeneratorService.obtenerEstadisticasEventosFallidos();

      return {
        success: true,
        data: stats,
        message: "Estadísticas de eventos fallidos obtenidas exitosamente",
      };
    } catch (error) {
      console.error(
        "❌ [ContabilidadController] Error obteniendo estadísticas de fallidos:",
        error,
      );
      return {
        success: false,
        message: "Error obteniendo estadísticas de eventos fallidos",
        data: {
          total_fallidos: 0,
          total_dead_letter: 0,
          por_tipo: {},
        },
      };
    }
  }
}
