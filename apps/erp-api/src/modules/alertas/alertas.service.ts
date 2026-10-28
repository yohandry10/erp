import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { SupabaseService } from "../../shared/supabase/supabase.service";
import { ConsultaAlertasDto, ReglaAlertaDto, TipoAlerta } from "./alertas.dto";

const errores: Record<string, string> = {
  ALERTS_RECIPIENT_INVALID: "Los destinatarios deben ser usuarios activos de esta empresa (máximo 50).",
  ALERTS_RECIPIENT_REQUIRED: "Una regla activa necesita destinatarios o incluir al responsable del contrato.",
  ALERTS_ESCALATION_INCOMPLETE: "Para escalar indique los días y a quién escalar; sin escalamiento deje ambos vacíos.",
  ALERTS_VERSION_CONFLICT: "La regla cambió. Actualice antes de guardar.",
  ALERTS_IDEMPOTENCY_CONFLICT: "La referencia de operación ya se usó con otros datos. Actualice y vuelva a intentarlo.",
  ALERTS_NOT_FOUND: "La alerta no existe o no está dirigida a usted.",
  ALERTS_INPUT_INVALID: "Revise los datos de la regla.",
  ALERTS_QUERY_INVALID: "Revise los filtros de la consulta.",
};

/** Alertas configurables de entregas, lotes y cobranza (577). */
@Injectable()
export class AlertasService {
  private readonly logger = new Logger(AlertasService.name);
  constructor(private readonly supabase: SupabaseService) {}

  async consultar(tenantId: string, actorId: string, accion: "MIAS" | "TODAS" | "REGLAS", query: ConsultaAlertasDto = {}) {
    this.validarIdentidad(tenantId, actorId);
    const { data, error } = await this.supabase.getClient().rpc("consultar_alertas_577", {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_accion: accion,
      p_estado: query.estado ?? "ABIERTA",
      p_pagina: query.pagina ?? 1,
      p_limite: query.limite ?? 50,
    });
    if (error) alertaFailure(error);
    if (!data || typeof data !== "object") throw new ServiceUnavailableException("No se pudo consultar las alertas. Reintente.");
    return { success: true, data };
  }

  async configurar(tenantId: string, actorId: string, tipo: TipoAlerta, dto: ReglaAlertaDto, key?: string) {
    this.validarIdentidad(tenantId, actorId);
    const idempotencyKey = key?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 170)
      throw new BadRequestException("Se requiere Idempotency-Key de 8 a 170 caracteres.");
    const { data, error } = await this.supabase.getClient().rpc("configurar_regla_alerta_577", {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_payload: { ...dto, tipo },
      p_idempotency_key: idempotencyKey,
    });
    if (error) alertaFailure(error);
    if (!data?.id) throw new ServiceUnavailableException("No se pudo confirmar la regla. Reintente con los mismos datos.");
    return { success: true, data };
  }

  async reconocer(tenantId: string, actorId: string, alertaId: string) {
    this.validarIdentidad(tenantId, actorId);
    const { data, error } = await this.supabase.getClient().rpc("reconocer_alerta_577", {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_alerta_id: alertaId,
    });
    if (error) alertaFailure(error);
    return { success: true, data };
  }

  /** Evaluación bajo demanda de la empresa; idempotente con la tarea horaria. */
  async evaluar(tenantId: string) {
    const { data, error } = await this.supabase.getClient().rpc("evaluar_alertas_suministro_577", {
      p_tenant_id: tenantId,
      p_fecha: null,
    });
    if (error) alertaFailure(error);
    return { success: true, data };
  }

  // Cada hora: sólo empresas con reglas activas. La evaluación serializa por
  // empresa y no duplica alertas, avisos ni correos al repetirse.
  @Cron(CronExpression.EVERY_HOUR)
  async evaluarTodas() {
    if (process.env.ALERTAS_SUMINISTRO_CRON === "off") return;
    const { data, error } = await this.supabase.getClient().rpc("listar_tenants_alertas_577");
    if (error) {
      this.logger.error(`No se pudo listar empresas con alertas: ${error.message}`);
      return;
    }
    for (const tenantId of (data as string[] | null) ?? []) {
      try {
        await this.evaluar(tenantId);
      } catch (err) {
        this.logger.error(`Evaluación de alertas fallida para ${tenantId}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  private validarIdentidad(tenantId: string, actorId: string) {
    if (!tenantId || !actorId) throw new ForbiddenException("No se pudo identificar la empresa y el usuario.");
  }
}

export function alertaFailure(error: { code?: string; message?: string }): never {
  const mensaje = errores[(error.message || "").split(":")[0].trim()];
  if (error.code === "42501") throw new ForbiddenException("No tiene permiso para esta operación.");
  if (error.code === "P0002") throw new NotFoundException(mensaje ?? "No se encontró el registro.");
  if (error.code === "23505") throw new ConflictException(mensaje ?? "La operación entra en conflicto con otra.");
  if (["23514", "22023", "22P02", "23503"].includes(error.code || ""))
    throw new BadRequestException(mensaje ?? "Revise los datos de la alerta.");
  throw new ServiceUnavailableException("El servicio de alertas no está disponible. Reintente.");
}
