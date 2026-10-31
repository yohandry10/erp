import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentTenant } from "../../../common/decorators/current-tenant.decorator";
import { RequirePermission } from "../../../common/decorators/require-permission.decorator";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ContratosService } from "./contratos.service";
import {
  AdendarContratoDto,
  AnularContratoDto,
  ConsultaContratosDto,
  CrearContratoDto,
  CrearOrdenClienteDto,
  EditarContratoDto,
  ModificarOrdenClienteDto,
  ProgramarEntregaDto,
  ReprogramarEntregaDto,
  RevisionSuministroDto,
  VersionContratoDto,
} from "./contratos.dto";

@ApiTags("Ventas - Contratos de suministro")
@ApiBearerAuth()
@Controller("ventas/contratos")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContratosController {
  constructor(private readonly service: ContratosService) {}
  @Get()
  @RequirePermission("ventas.contratos.ver")
  listar(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Query() query: ConsultaContratosDto,
  ) {
    return this.service.consultar(tenant, actor, "LISTAR", null, query);
  }
  @Get("catalogos/:tipo")
  @RequirePermission("ventas.contratos.ver")
  catalogos(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("tipo") tipo: string,
    @Query() query: ConsultaContratosDto,
  ) {
    const accion = {
      clientes: "CLIENTES",
      productos: "PRODUCTOS",
      responsables: "RESPONSABLES",
    } as const;
    if (!Object.prototype.hasOwnProperty.call(accion, tipo))
      throw new BadRequestException("Catálogo inválido.");
    return this.service.consultar(
      tenant,
      actor,
      accion[tipo as keyof typeof accion],
      null,
      query,
    );
  }
  @Get(":id")
  @RequirePermission("ventas.contratos.ver")
  detalle(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.service.consultar(tenant, actor, "DETALLE", id);
  }
  @Post()
  @RequirePermission("ventas.contratos.gestionar")
  crear(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Body() dto: CrearContratoDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(tenant, actor, "CREAR_CONTRATO", null, dto, key);
  }
  @Put(":id")
  @RequirePermission("ventas.contratos.gestionar")
  editar(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: EditarContratoDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(tenant, actor, "EDITAR_BORRADOR", id, dto, key);
  }
  @Post(":id/activar")
  @RequirePermission("ventas.contratos.gestionar")
  activar(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: VersionContratoDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(tenant, actor, "ACTIVAR", id, dto, key);
  }
  @Post(":id/anular")
  @RequirePermission("ventas.contratos.gestionar")
  anular(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: AnularContratoDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(tenant, actor, "ANULAR_BORRADOR", id, dto, key);
  }
  @Post(":id/ordenes-cliente")
  @RequirePermission("ventas.contratos.gestionar")
  crearOrden(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: CrearOrdenClienteDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(tenant, actor, "CREAR_OC", id, dto, key);
  }
  @Post(":id/adendas")
  @RequirePermission("ventas.contratos.gestionar")
  adendar(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: AdendarContratoDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(tenant, actor, "ADENDAR", id, dto, key);
  }
  @Post("ordenes-cliente/:id/modificar")
  @RequirePermission("ventas.contratos.gestionar")
  modificarOrden(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: ModificarOrdenClienteDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(tenant, actor, "MODIFICAR_OC", id, dto, key);
  }
  @Post("ordenes-cliente/:id/anular")
  @RequirePermission("ventas.contratos.gestionar")
  anularOrden(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: RevisionSuministroDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(tenant, actor, "ANULAR_OC", id, dto, key);
  }
  @Post(":id/entregas")
  @RequirePermission("ventas.contratos.gestionar")
  programar(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: ProgramarEntregaDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(tenant, actor, "PROGRAMAR", id, dto, key);
  }
  @Post("entregas/:id/reprogramar")
  @RequirePermission("ventas.contratos.gestionar")
  reprogramar(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: ReprogramarEntregaDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(tenant, actor, "REPROGRAMAR", id, dto, key);
  }
  @Post("entregas/:id/anular")
  @RequirePermission("ventas.contratos.gestionar")
  anularEntrega(
    @CurrentTenant() tenant: string,
    @CurrentUser("id") actor: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: AnularContratoDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.operar(tenant, actor, "ANULAR_ENTREGA", id, dto, key);
  }
}
