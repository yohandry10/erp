import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { SupabaseService } from "../../../shared/supabase/supabase.service";
import { codigoErrorLote, mensajeErrorLote } from "../inventario-errors";
import { ConsultaLotesDto } from "./lotes.dto";

type ConsultaLote = "PRODUCTOS" | "POR_VENCER" | "PRODUCTO" | "MOVIMIENTOS";
type AccionLote = "CONFIGURAR_POLITICA" | "REGULARIZAR" | "REASIGNAR_RESERVA";

@Injectable()
export class LotesService {
  constructor(private readonly supabase: SupabaseService) {}

  async consultar(
    tenantId: string,
    actorId: string,
    accion: ConsultaLote,
    productoId: string | null,
    query: ConsultaLotesDto = {},
  ) {
    this.validarIdentidad(tenantId, actorId);
    const { data, error } = await this.supabase
      .getClient()
      .rpc("consultar_lotes_inventario_574", {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_accion: accion,
        p_producto_id: productoId,
        p_almacen_id: query.almacen_id ?? null,
        p_lote_id: query.lote_id ?? null,
        p_busqueda: query.busqueda || "",
        p_dias: query.dias ?? 90,
        p_pagina: query.pagina ?? 1,
        p_limite: query.limite ?? 50,
      });
    if (error) loteFailure(error, "lectura");
    if (!data || typeof data !== "object")
      throw new ServiceUnavailableException(
        "No se pudo consultar los lotes. Reintente.",
      );
    return { success: true, data };
  }

  async operar(
    tenantId: string,
    actorId: string,
    accion: AccionLote,
    productoId: string,
    payload: object,
    key?: string,
  ) {
    this.validarIdentidad(tenantId, actorId);
    const idempotencyKey = key?.trim();
    if (
      !idempotencyKey ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 180
    )
      throw new BadRequestException(
        "Se requiere Idempotency-Key de 8 a 180 caracteres.",
      );
    const { data, error } = await this.supabase
      .getClient()
      .rpc("operar_lotes_inventario_574", {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_accion: accion,
        p_payload: { ...payload, producto_id: productoId },
        p_idempotency_key: idempotencyKey,
      });
    if (error) loteFailure(error, "escritura");
    if (!data?.id)
      throw new ServiceUnavailableException(
        "No se pudo confirmar la operación de lote. Reintente con los mismos datos.",
      );
    return { success: true, data };
  }

  private validarIdentidad(tenantId: string, actorId: string) {
    if (!tenantId || !actorId)
      throw new ForbiddenException(
        "No se pudo identificar la empresa y el usuario.",
      );
  }
}

export function loteFailure(
  error: { code?: string; message?: string },
  tipo: "lectura" | "escritura",
): never {
  const mensaje = mensajeErrorLote(error.message);
  const codigo = codigoErrorLote(error.message);
  if (error.code === "42501")
    throw new ForbiddenException("No tiene permiso para esta operación.");
  if (error.code === "P0002")
    throw new NotFoundException(
      mensaje ?? "No se encontró el registro en esta empresa.",
    );
  if (error.code === "23505")
    throw new ConflictException(
      mensaje ?? "La operación entra en conflicto con otra. Actualice y reintente.",
    );
  if (
    codigo ||
    ["23514", "23502", "23503", "22023", "22007", "22008", "22P02", "22003"].includes(
      error.code || "",
    )
  ) {
    throw new BadRequestException(
      mensaje ?? "Revise los datos del lote, cantidades y fechas.",
    );
  }
  throw new ServiceUnavailableException(
    tipo === "lectura"
      ? "No se pudo consultar los lotes. Reintente."
      : "El servicio de lotes no está disponible. Reintente conservando los datos y la clave.",
  );
}
