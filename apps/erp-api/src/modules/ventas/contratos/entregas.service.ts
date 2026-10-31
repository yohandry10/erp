import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { SupabaseService } from "../../../shared/supabase/supabase.service";
import { suministroFailure } from "./contratos.service";
import { AnularRecepcionDto, BaseFacturacionDto, RegistrarRecepcionDto } from "./entregas.dto";

/** Recepción y conformidad del cliente sobre las entregas contractuales (575). */
@Injectable()
export class EntregasService {
  constructor(private readonly supabase: SupabaseService) {}

  async ejecucion(tenantId: string, actorId: string, contratoId: string) {
    this.validarIdentidad(tenantId, actorId);
    const { data, error } = await this.supabase
      .getClient()
      .rpc("consultar_suministro_ejecucion_575", {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_contrato_id: contratoId,
      });
    if (error) suministroFailure(error);
    if (!data || typeof data !== "object")
      throw new ServiceUnavailableException(
        "No se pudo consultar la ejecución del contrato. Reintente.",
      );
    return { success: true, data };
  }

  async estadoCuenta(tenantId: string, actorId: string, contratoId: string) {
    this.validarIdentidad(tenantId, actorId);
    const { data, error } = await this.supabase
      .getClient()
      .rpc("consultar_suministro_estado_cuenta_576", {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_contrato_id: contratoId,
      });
    if (error) suministroFailure(error);
    if (!data || typeof data !== "object" || !Array.isArray(data.documentos))
      throw new ServiceUnavailableException(
        "No se pudo consultar el estado de cuenta del contrato. Reintente.",
      );
    return { success: true, data };
  }

  async configurarFacturacion(
    tenantId: string,
    actorId: string,
    contratoId: string,
    dto: BaseFacturacionDto,
    key?: string,
  ) {
    this.validarIdentidad(tenantId, actorId);
    const idempotencyKey = this.clave(key);
    const { data, error } = await this.supabase
      .getClient()
      .rpc("configurar_facturacion_suministro_576", {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_contrato_id: contratoId,
        p_payload: dto,
        p_idempotency_key: idempotencyKey,
      });
    if (error) suministroFailure(error);
    if (!data?.id || !data?.contrato_id)
      throw new ServiceUnavailableException(
        "No se pudo confirmar la base de facturación. Reintente con los mismos datos.",
      );
    return { success: true, data };
  }

  registrar(
    tenantId: string,
    actorId: string,
    contratoId: string,
    dto: RegistrarRecepcionDto,
    key?: string,
  ) {
    for (const linea of dto.lineas) {
      if (
        Number((linea.cantidad_aceptada + linea.cantidad_rechazada).toFixed(4)) !==
        Number(linea.cantidad_recibida.toFixed(4))
      )
        throw new BadRequestException(
          "En cada línea, lo aceptado más lo rechazado debe ser igual a lo recibido.",
        );
    }
    return this.operar(tenantId, actorId, contratoId, "REGISTRAR_RECEPCION", dto, key);
  }

  anular(
    tenantId: string,
    actorId: string,
    contratoId: string,
    recepcionId: string,
    dto: AnularRecepcionDto,
    key?: string,
  ) {
    return this.operar(tenantId, actorId, contratoId, "ANULAR_RECEPCION", { ...dto, recepcion_id: recepcionId }, key);
  }

  private async operar(
    tenantId: string,
    actorId: string,
    contratoId: string,
    accion: "REGISTRAR_RECEPCION" | "ANULAR_RECEPCION",
    payload: object,
    key?: string,
  ) {
    this.validarIdentidad(tenantId, actorId);
    const idempotencyKey = this.clave(key);
    const { data, error } = await this.supabase
      .getClient()
      .rpc("operar_suministro_recepciones_575", {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_contrato_id: contratoId,
        p_accion: accion,
        p_payload: payload,
        p_idempotency_key: idempotencyKey,
      });
    if (error) suministroFailure(error);
    if (!data?.id || !data?.contrato_id)
      throw new ServiceUnavailableException(
        "No se pudo confirmar la recepción. Reintente con los mismos datos.",
      );
    return { success: true, data };
  }

  private clave(key?: string) {
    const idempotencyKey = key?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 180)
      throw new BadRequestException("Se requiere Idempotency-Key de 8 a 180 caracteres.");
    return idempotencyKey;
  }

  private validarIdentidad(tenantId: string, actorId: string) {
    if (!tenantId || !actorId)
      throw new ForbiddenException("No se pudo identificar la empresa y el usuario.");
  }
}
