import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentTenant } from "../../../common/decorators/current-tenant.decorator";
import { RequirePermission } from "../../../common/decorators/require-permission.decorator";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { SupabaseService } from "../../../shared/supabase/supabase.service";
import { CurrentUser } from "../../auth/current-user.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { suministroFailure } from "./contratos.service";
import {
  AnularReglaPenalidadDto,
  CalcularPenalidadesDto,
  ExcepcionPenalidadDto,
  ReglaPenalidadDto,
  RevisarPenalidadDto,
} from "./penalidades.dto";

type AccionPenalidad = "GUARDAR_REGLA" | "ANULAR_REGLA" | "REGISTRAR_EXCEPCION" | "CALCULAR" | "REVISAR_CALCULO";

/** Penalidades contractuales (578): cálculo informativo y revisión separada. */
@Injectable()
export class PenalidadesService {
  constructor(private readonly supabase: SupabaseService) {}

  async consultar(tenantId: string, actorId: string, contratoId: string) {
    if (!tenantId || !actorId) throw new ForbiddenException("No se pudo identificar la empresa y el usuario.");
    const { data, error } = await this.supabase.getClient().rpc("consultar_penalidades_578", {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_contrato_id: contratoId,
    });
    if (error) suministroFailure(error);
    if (!data || !Array.isArray(data.calculos))
      throw new ServiceUnavailableException("No se pudo consultar las penalidades. Reintente.");
    return { success: true, data };
  }

  async operar(tenantId: string, actorId: string, contratoId: string, accion: AccionPenalidad, payload: object, key?: string) {
    if (!tenantId || !actorId) throw new ForbiddenException("No se pudo identificar la empresa y el usuario.");
    const idempotencyKey = key?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 180)
      throw new BadRequestException("Se requiere Idempotency-Key de 8 a 180 caracteres.");
    const { data, error } = await this.supabase.getClient().rpc("operar_penalidades_578", {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_contrato_id: contratoId,
      p_accion: accion,
      p_payload: payload,
      p_idempotency_key: idempotencyKey,
    });
    if (error) suministroFailure(error);
    if (!data?.id || !data?.contrato_id)
      throw new ServiceUnavailableException("No se pudo confirmar la operación. Reintente con los mismos datos.");
    return { success: true, data };
  }
}

@ApiTags("Ventas - Penalidades contractuales")
@ApiBearerAuth()
@Controller("ventas/contratos")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PenalidadesController {
  constructor(private readonly service: PenalidadesService) {}

  @Get(":id/penalidades")
  @RequirePermission("ventas.penalidades.ver")
  consultar(@CurrentTenant() t: string, @CurrentUser("id") a: string, @Param("id", new ParseUUIDPipe({ version: "4" })) c: string) {
    return this.service.consultar(t, a, c);
  }

  @Post(":id/penalidades/reglas")
  @RequirePermission("ventas.penalidades.gestionar")
  guardarRegla(
    @CurrentTenant() t: string, @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
    @Body() dto: ReglaPenalidadDto, @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(t, a, c, "GUARDAR_REGLA", dto, key);
  }

  @Post(":id/penalidades/reglas/:grupoId/anular")
  @RequirePermission("ventas.penalidades.gestionar")
  anularRegla(
    @CurrentTenant() t: string, @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
    @Param("grupoId", new ParseUUIDPipe({ version: "4" })) g: string,
    @Body() dto: AnularReglaPenalidadDto, @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(t, a, c, "ANULAR_REGLA", { ...dto, grupo_id: g }, key);
  }

  @Post(":id/penalidades/excepciones")
  @RequirePermission("ventas.penalidades.gestionar")
  excepcion(
    @CurrentTenant() t: string, @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
    @Body() dto: ExcepcionPenalidadDto, @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(t, a, c, "REGISTRAR_EXCEPCION", dto, key);
  }

  @Post(":id/penalidades/calcular")
  @RequirePermission("ventas.penalidades.gestionar")
  calcular(
    @CurrentTenant() t: string, @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
    @Body() dto: CalcularPenalidadesDto, @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(t, a, c, "CALCULAR", dto, key);
  }

  @Post(":id/penalidades/calculos/:calculoId/revisar")
  @RequirePermission("ventas.penalidades.aprobar")
  revisar(
    @CurrentTenant() t: string, @CurrentUser("id") a: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) c: string,
    @Param("calculoId", new ParseUUIDPipe({ version: "4" })) k: string,
    @Body() dto: RevisarPenalidadDto, @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(t, a, c, "REVISAR_CALCULO", { ...dto, calculo_id: k }, key);
  }
}
