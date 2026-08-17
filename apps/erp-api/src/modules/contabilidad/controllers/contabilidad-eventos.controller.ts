import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CurrentTenant, CurrentUser } from "../../../common";
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
  async getEstadisticasEventos(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") actorId: string,
  ) {
    const stats = await this.outboxEventsService.obtenerEstadisticasEventos(
      tenantId,
      actorId,
    );

    return {
      success: true,
      data: stats,
      message: `Estadísticas: ${stats.pending} pendientes, ${stats.processed_today} procesados hoy, ${stats.failed} fallidos`,
    };
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
    @CurrentUser("id") actorId: string,
    @Query("limit") limit?: number,
  ) {
    const eventos = await this.outboxEventsService.leerEventosFallidos(
      tenantId,
      actorId,
      limit || 100,
    );

    return {
      success: true,
      data: eventos,
      message: `${eventos.length} evento(s) fallido(s) encontrado(s)`,
    };
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
    @CurrentUser("id") actorId: string,
    @Query("limit") limit?: number,
  ) {
    const eventos = await this.outboxEventsService.leerEventosDeadLetter(
      tenantId,
      actorId,
      limit || 100,
    );

    return {
      success: true,
      data: eventos,
      message: `${eventos.length} evento(s) dead letter encontrado(s)`,
    };
  }

  @Post("eventos/:eventId/reintentar")
  @RequirePermission("contabilidad.eventos.reintentar") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Reintentar un evento fallido" })
  @ApiResponse({ status: 200, description: "Evento reiniciado exitosamente" })
  async reintentarEvento(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") actorId: string,
    @Param("eventId") eventId: string,
  ) {
    const reiniciado =
      await this.asientosGeneratorService.reiniciarEventoFallido(
        tenantId,
        actorId,
        eventId,
      );
    if (!reiniciado) {
      throw new NotFoundException(
        "El evento no existe en este tenant o ya no es reintentable",
      );
    }

    return {
      success: true,
      data: { eventId, reiniciado: true },
      message: "Evento reiniciado para reprocesamiento",
    };
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
  async getEstadisticasEventosFallidos(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") actorId: string,
  ) {
    const stats =
      await this.asientosGeneratorService.obtenerEstadisticasEventosFallidos(
        tenantId,
        actorId,
      );

    return {
      success: true,
      data: stats,
      message: "Estadísticas de eventos fallidos obtenidas exitosamente",
    };
  }
}
