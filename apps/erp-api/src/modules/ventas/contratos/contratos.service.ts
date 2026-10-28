import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { SupabaseService } from "../../../shared/supabase/supabase.service";
import { ConsultaContratosDto } from "./contratos.dto";

type AccionContrato =
  | "CREAR_CONTRATO"
  | "EDITAR_BORRADOR"
  | "ACTIVAR"
  | "ANULAR_BORRADOR"
  | "CREAR_OC"
  | "ADENDAR"
  | "MODIFICAR_OC"
  | "ANULAR_OC"
  | "PROGRAMAR"
  | "REPROGRAMAR"
  | "ANULAR_ENTREGA";
type ConsultaContrato =
  | "LISTAR"
  | "DETALLE"
  | "CLIENTES"
  | "PRODUCTOS"
  | "RESPONSABLES";
const errores: Record<string, string> = {
  PENALTY_INPUT_INVALID: "Revise la acción y los datos de la penalidad.",
  PENALTY_RULE_INVALID:
    "Revise la regla: cada método exige sus parámetros (factor y plazo, tasa o importe) y el tope necesita su base.",
  PENALTY_VERSION_CONFLICT: "La regla o el cálculo cambió. Actualice antes de continuar.",
  PENALTY_CUTOFF_IN_FUTURE: "La fecha de corte no puede ser futura.",
  PENALTY_EXCEPTION_INVALID: "Indique la entrega, de 1 a 3650 días excluidos y el motivo.",
  PENALTY_REVIEW_INVALID:
    "Un cálculo aprobado o descartado ya no admite revisiones; indique un comentario de 5 a 2000 caracteres.",
  PENALTY_SEGREGATION_REQUIRED: "Quien registró el cálculo no puede aprobarlo.",
  PENALTY_APPROVED_AMOUNT_INVALID: "El monto aprobado no puede superar el estimado del cálculo.",
  PENALTY_CALCULATION_IMMUTABLE: "Los cálculos registrados no se modifican; calcule un nuevo corte.",
  SUPPLY_RECEPTION_ORDER_NOT_LINKED:
    "El pedido debe estar vinculado a este contrato para registrar su recepción.",
  SUPPLY_RECEPTION_DISPATCH_INVALID:
    "Seleccione despachos vigentes del pedido vinculados a una programación del contrato.",
  SUPPLY_RECEPTION_EXCEEDS_DISPATCH:
    "Lo recibido supera lo despachado de ese lote o despacho, considerando las recepciones ya registradas.",
  SUPPLY_RECEPTION_QUANTITY_INVALID:
    "En cada línea, lo aceptado más lo rechazado debe ser igual a lo recibido, con hasta 4 decimales.",
  SUPPLY_RECEPTION_REJECTION_REASON:
    "Indique el motivo del rechazo (5 a 1000 caracteres) sólo en las líneas con cantidad rechazada.",
  SUPPLY_RECEPTION_DATE_INVALID:
    "La fecha de recepción no puede ser futura ni anterior al despacho.",
  SUPPLY_RECEPTION_RECEIVER_REQUIRED:
    "Indique el nombre de quien recibió (3 a 160 caracteres).",
  SUPPLY_RECEPTION_LINE_REPEATED:
    "No repita el mismo despacho y lote en la recepción.",
  SUPPLY_RECEPTION_REJECTION_REPLACED:
    "El rechazo de esta recepción ya fue repuesto con otro pedido. Desvincule la reposición antes de anularla.",
  SUPPLY_DELIVERY_ACCEPTED_BY_CUSTOMER:
    "El cliente aceptó parte de esta entrega: su retorno se gestiona como devolución, no cancelando el pedido.",
  SUPPLY_ORDER_MISMATCH:
    "El pedido debe coincidir en cliente, moneda, productos y precios de la OC, y no tener ejecución previa.",
  SUPPLY_ORDER_EXCEEDS_SCHEDULE:
    "La cantidad del pedido supera el saldo de la programación sin vincular.",
  SUPPLY_ORDER_MAPPING_INCOMPLETE:
    "Asigne todas las líneas del pedido a una programación del contrato.",
  SUPPLY_LINKED_ORDER_IMMUTABLE:
    "El pedido está vinculado a un contrato. Desvincúlelo mientras esté pendiente antes de modificar sus líneas.",
  SUPPLY_SCHEDULE_HAS_ORDERS:
    "La programación tiene pedidos vigentes. Desvincule los pedidos pendientes o gestione su cancelación operativa antes de cambiarla.",
  SUPPLY_ATTACHMENT_TARGET_INVALID:
    "Seleccione un contrato, OC o adenda de este expediente.",
  SUPPLY_ATTACHMENT_NOT_STORED:
    "El archivo aún no está almacenado. Reintente la subida con la misma clave.",
  SUPPLY_REVISION_REQUIRED:
    "Indique la referencia del documento y un motivo de entre 5 y 1000 caracteres.",
  SUPPLY_REVISION_DATE_CONFLICT:
    "La nueva vigencia o emisión debe cubrir las OC y entregas programadas vigentes.",
  SUPPLY_REVISION_LINE_CONFLICT:
    "Conserve el producto de cada línea y no repita líneas en la revisión.",
  SUPPLY_REFERENCED_LINE:
    "No se puede retirar una línea con OC o entregas históricas. Conserve esa línea en la revisión.",
  SUPPLY_OC_HAS_SCHEDULES:
    "Anule primero las entregas programadas vigentes de esta OC.",
  SUPPLY_IDEMPOTENCY_CONFLICT:
    "La referencia de operación ya se usó con otros datos. Actualice y vuelva a intentarlo.",
  SUPPLY_VERSION_OR_STATE_CONFLICT:
    "El registro cambió o ya no admite esta acción. Actualice antes de continuar.",
  SUPPLY_CONTRACT_NOT_ACTIVE:
    "Active el contrato antes de registrar órdenes o programar entregas.",
  SUPPLY_OC_EXCEEDS_CONTRACT:
    "La cantidad de la OC supera el saldo disponible de la línea del contrato.",
  SUPPLY_SCHEDULE_EXCEEDS_OC:
    "La entrega supera la cantidad de la OC pendiente de programar.",
  SUPPLY_DATE_OUTSIDE_CONTRACT:
    "La fecha debe estar dentro de la vigencia y no ser anterior a la emisión de la OC.",
  SUPPLY_REASON_REQUIRED: "Indique un motivo de entre 5 y 1000 caracteres.",
  SUPPLY_QUANTITY_INVALID:
    "Revise las cantidades y precios: cantidad positiva con hasta 4 decimales y precio no negativo con hasta 6.",
  SUPPLY_PARTY_INVALID:
    "Seleccione un cliente y un responsable activos de esta empresa.",
  SUPPLY_PRODUCT_INVALID:
    "Seleccione productos activos de esta empresa con unidad de medida definida.",
  SUPPLY_LINES_REQUIRED: "El documento debe contener entre 1 y 200 líneas.",
};
@Injectable()
export class ContratosService {
  constructor(private readonly supabase: SupabaseService) {}

  async consultar(
    tenantId: string,
    actorId: string,
    accion: ConsultaContrato,
    id: string | null = null,
    query: ConsultaContratosDto = {},
  ) {
    this.validarIdentidad(tenantId, actorId);
    const { data, error } = await this.supabase
      .getClient()
      .rpc("consultar_suministro_570", {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_accion: accion,
        p_id: id,
        p_busqueda: query.busqueda || "",
        p_pagina: query.pagina ?? 1,
        p_limite: query.limite ?? 25,
      });
    if (error) suministroFailure(error);
    if (!data || typeof data !== "object")
      throw new ServiceUnavailableException(
        "No se pudo consultar el suministro. Reintente.",
      );
    return { success: true, data };
  }

  async operar(
    tenantId: string,
    actorId: string,
    accion: AccionContrato,
    id: string | null,
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
    if (
      "vigencia_desde" in payload &&
      "vigencia_hasta" in payload &&
      String(payload.vigencia_hasta) < String(payload.vigencia_desde)
    ) {
      throw new BadRequestException(
        "La vigencia final no puede ser anterior a la inicial.",
      );
    }
    const { data, error } = await this.supabase
      .getClient()
      .rpc("operar_suministro_570", {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_accion: accion,
        p_id: id,
        p_payload: payload,
        p_idempotency_key: idempotencyKey,
      });
    if (error) suministroFailure(error);
    if (!data?.id || !data?.contrato_id)
      throw new ServiceUnavailableException(
        "No se pudo confirmar la operación. Reintente con los mismos datos.",
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

export function suministroFailure(error: {
  code?: string;
  message?: string;
}): never {
  // La base puede informar detalles después del código: "CODIGO: detalle".
  const domainMessage = errores[(error.message || "").split(":")[0].trim()];
  if (error.code === "42501")
    throw new ForbiddenException(
      domainMessage || "No tiene permiso para esta operación.",
    );
  if (error.code === "P0002")
    throw new NotFoundException("No se encontró el registro en esta empresa.");
  if (error.code === "23505")
    throw new ConflictException(
      domainMessage ||
        (error.message?.includes("suministro_revision_referencia_571")
          ? "Ya se registró una revisión de este tipo con esa referencia. Consulte el historial."
          : null) ||
        "Ya existe un documento con ese número o la línea está repetida.",
    );
  if (
    [
      "23514",
      "23502",
      "23503",
      "22023",
      "22007",
      "22008",
      "22P02",
      "22003",
    ].includes(error.code || "")
  ) {
    throw new BadRequestException(
      domainMessage ||
        "Revise los datos del contrato, sus líneas y las fechas.",
    );
  }
  throw new ServiceUnavailableException(
    "El servicio de contratos no está disponible. Reintente conservando los datos.",
  );
}
