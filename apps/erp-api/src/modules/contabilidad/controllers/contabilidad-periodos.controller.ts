import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  BadRequestException,
  Headers,
  Query,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { SupabaseService } from "../../../shared/supabase/supabase.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CurrentTenant, CurrentUser, SuperAdminGuard } from "../../../common";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { RequirePermission } from "../../../common/decorators/require-permission.decorator";
import { CreatePeriodoDto, PeriodoResponseDto } from "@erp-suite/dtos";
import { PeriodosService } from "../services/periodos.service";

import { PeriodoContableDto } from '../dto/periodo-contable.dto';

@ApiTags("contabilidad")
@Controller("contabilidad")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContabilidadPeriodosController {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly periodosService: PeriodosService,
  ) {}

  @Post("periodos")
  @RequirePermission("contabilidad.periodos.crear") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Crear nuevo período contable" })
  @ApiResponse({
    status: 201,
    description: "Período contable creado exitosamente",
    type: PeriodoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Datos inválidos o período ya existe",
  })
  async crearPeriodo(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId:string,
    @Body() createPeriodoDto: CreatePeriodoDto,
    @Headers('idempotency-key') idempotencyKey?:string,
  ): Promise<{ success: boolean; data: PeriodoResponseDto; message: string }> {
    try {
      console.log(
        `📅 [Contabilidad] Creando período ${createPeriodoDto.anio}-${createPeriodoDto.mes} para tenant ${tenantId}`,
      );

      const periodo = await this.periodosService.crearPeriodo(
        tenantId,
        createPeriodoDto.anio,
        createPeriodoDto.mes,
        userId,
        idempotencyKey,
      );

      return {
        success: true,
        data: periodo as PeriodoResponseDto,
        message: `Período ${createPeriodoDto.anio}-${String(createPeriodoDto.mes).padStart(2, "0")} creado exitosamente`,
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error creando período:", error);
      throw error;
    }
  }

  @Get("periodos")
  @RequirePermission("contabilidad.periodos.read") // HARDENING: lectura de periodos.
  @ApiOperation({ summary: "Obtener todos los períodos contables del tenant" })
  @ApiResponse({
    status: 200,
    description: "Períodos contables obtenidos exitosamente",
    type: [PeriodoResponseDto],
  })
  async obtenerPeriodos(
    @CurrentTenant() tenantId: string,
  ): Promise<{ success: boolean; data: PeriodoResponseDto[] }> {
    try {
      console.log(
        `📅 [Contabilidad] Obteniendo períodos para tenant ${tenantId}`,
      );

      const periodos = await this.periodosService.obtenerPeriodos(tenantId);

      return {
        success: true,
        data: periodos as PeriodoResponseDto[],
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error obteniendo períodos:", error);
      throw error;
    }
  }

  @Get("periodos/:id")
  @RequirePermission("contabilidad.periodos.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener un período contable específico por ID" })
  @ApiResponse({
    status: 200,
    description: "Período contable obtenido exitosamente",
    type: PeriodoResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Período no encontrado",
  })
  async obtenerPeriodoPorId(
    @CurrentTenant() tenantId: string,
    @Param("id") periodoId: string,
  ): Promise<{ success: boolean; data: PeriodoResponseDto | null }> {
    try {
      console.log(
        `📅 [Contabilidad] Obteniendo período ${periodoId} para tenant ${tenantId}`,
      );

      // Get the period by ID and verify it belongs to the tenant
      const { data, error } = await this.supabaseService
        .getClient()
        .from("periodos_contables")
        .select("*")
        .eq("id", periodoId)
        .eq("tenant_id", tenantId)
        .single();

      if (error || !data) {
        return {
          success: false,
          data: null,
        };
      }

      return {
        success: true,
        data: data as PeriodoResponseDto,
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error obteniendo período:", error);
      throw error;
    }
  }

  @Get("periodos/:id/validar-cierre")
  @RequirePermission("contabilidad.periodos.validar") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Validar si un período puede ser cerrado" })
  @ApiResponse({
    status: 200,
    description: "Validaciones del período",
  })
  @ApiResponse({
    status: 404,
    description: "Período no encontrado",
  })
  async validarCierrePeriodo(
    @CurrentTenant() tenantId: string,
    @Param("id") periodoId: string,
  ): Promise<{
    asientos: { valido: boolean; asientosDescuadrados: any[] };
    eventos: { valido: boolean; eventosPendientes: number };
  }> {
    try {
      console.log(
        `🔍 [Contabilidad] Validando cierre de período ${periodoId} para tenant ${tenantId}`,
      );

      // Get the period by ID to extract anio and mes
      const { data: periodoData, error: periodoError } =
        await this.supabaseService
          .getClient()
          .from("periodos_contables")
          .select("*")
          .eq("id", periodoId)
          .eq("tenant_id", tenantId)
          .single();

      if (periodoError || !periodoData) {
        throw new Error("Período no encontrado");
      }

      // Validate asientos
      const validacionAsientos =
        await this.periodosService.validarAsientosCuadran(
          tenantId,
          periodoData.anio,
          periodoData.mes,
        );

      // Validate eventos
      const validacionEventos =
        await this.periodosService.validarEventosPendientes(
          tenantId,
          periodoData.anio,
          periodoData.mes,
        );

      return {
        asientos: validacionAsientos,
        eventos: validacionEventos,
      };
    } catch (error) {
      console.error(
        "❌ [Contabilidad] Error validando cierre de período:",
        error,
      );
      throw error;
    }
  }

  @Post("periodos/:id/cerrar")
  @RequirePermission("contabilidad.periodos.cerrar") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Cerrar un período contable" })
  @ApiResponse({
    status: 200,
    description: "Período contable cerrado exitosamente",
    type: PeriodoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      "No se puede cerrar el período (asientos descuadrados o eventos pendientes)",
  })
  @ApiResponse({
    status: 404,
    description: "Período no encontrado",
  })
  async cerrarPeriodo(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") periodoId: string,
  ): Promise<{ success: boolean; data: PeriodoResponseDto; message: string }> {
    try {
      console.log(
        `🔒 [Contabilidad] Cerrando período ${periodoId} para tenant ${tenantId} por usuario ${userId}`,
      );

      // Get the period by ID to extract anio and mes
      const { data: periodoData, error: periodoError } =
        await this.supabaseService
          .getClient()
          .from("periodos_contables")
          .select("*")
          .eq("id", periodoId)
          .eq("tenant_id", tenantId)
          .single();

      if (periodoError || !periodoData) {
        throw new Error("Período no encontrado");
      }

      // Call the service method with validations
      const periodoCerrado = await this.periodosService.cerrarPeriodo(
        tenantId,
        periodoData.anio,
        periodoData.mes,
        userId,
      );

      return {
        success: true,
        data: periodoCerrado as PeriodoResponseDto,
        message: `Período ${periodoData.anio}-${String(periodoData.mes).padStart(2, "0")} cerrado exitosamente`,
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error cerrando período:", error);
      throw error;
    }
  }

  @Post("periodos/:periodo/provision-cobranza-dudosa")
  @RequirePermission("contabilidad.asientos.crear")
  @ApiOperation({
    summary: "Estimacion de cuentas de cobranza dudosa del periodo",
    description:
      "Genera el asiento Dr 68 / Cr 19 por la deuda vencida sin cobrar y deja el " +
      "detalle documento a documento que exige el Libro de Inventarios y Balances. " +
      "Ejecutarlo dos veces no duplica: lo ya provisionado no vuelve a entrar.",
  })
  async provisionarCobranzaDudosa(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") usuarioId: string,
    @Param("periodo") periodo: string,
    @Query("dias_vencido") diasVencido?: string,
  ) {
    const dias = Number(diasVencido ?? 360);
    if (!Number.isFinite(dias) || dias < 1) {
      throw new BadRequestException("dias_vencido debe ser un entero positivo");
    }

    const data = await this.periodosService.provisionarCobranzaDudosa(
      tenantId,
      periodo,
      usuarioId,
      Math.trunc(dias),
    );
    return { success: true, data };
  }

  @Post("periodos/:id/reabrir")
  @RequirePermission("contabilidad.periodos.reabrir") // HARDENING: permisos granulares.
  @UseGuards(SuperAdminGuard)
  @ApiOperation({
    summary: "Reabrir un período contable cerrado (solo superadmin)",
  })
  @ApiResponse({
    status: 200,
    description: "Período contable reabierto exitosamente",
    type: PeriodoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "El período ya está abierto o no existe",
  })
  @ApiResponse({
    status: 403,
    description:
      "Acceso denegado: se requieren privilegios de super-administrador",
  })
  @ApiResponse({
    status: 404,
    description: "Período no encontrado",
  })
  async reabrirPeriodo(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") periodoId: string,
  ): Promise<{ success: boolean; data: PeriodoResponseDto; message: string }> {
    try {
      console.log(
        `🔓 [Contabilidad] Reabriendo período ${periodoId} para tenant ${tenantId}`,
      );

      // Get the period by ID to extract anio and mes
      const { data: periodoData, error: periodoError } =
        await this.supabaseService
          .getClient()
          .from("periodos_contables")
          .select("*")
          .eq("id", periodoId)
          .eq("tenant_id", tenantId)
          .single();

      if (periodoError || !periodoData) {
        throw new Error("Período no encontrado");
      }

      // Call the service method to reopen
      const periodoReabierto = await this.periodosService.reabrirPeriodo(
        tenantId,
        periodoData.anio,
        periodoData.mes,
        userId,
      );

      return {
        success: true,
        data: periodoReabierto as PeriodoResponseDto,
        message: `Período ${periodoData.anio}-${String(periodoData.mes).padStart(2, "0")} reabierto exitosamente`,
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error reabriendo período:", error);
      throw error;
    }
  }

  @Post("periodos/:id/bloquear")
  @RequirePermission("contabilidad.periodos.bloquear") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Bloquear un período contable" })
  @ApiResponse({
    status: 200,
    description: "Período contable bloqueado exitosamente",
    type: PeriodoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "El período no existe",
  })
  @ApiResponse({
    status: 404,
    description: "Período no encontrado",
  })
  async bloquearPeriodo(
    @CurrentTenant() tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") periodoId: string,
  ): Promise<{ success: boolean; data: PeriodoResponseDto; message: string }> {
    try {
      console.log(
        `🚫 [Contabilidad] Bloqueando período ${periodoId} para tenant ${tenantId}`,
      );

      // Get the period by ID to extract anio and mes
      const { data: periodoData, error: periodoError } =
        await this.supabaseService
          .getClient()
          .from("periodos_contables")
          .select("*")
          .eq("id", periodoId)
          .eq("tenant_id", tenantId)
          .single();

      if (periodoError || !periodoData) {
        throw new Error("Período no encontrado");
      }

      // Call the service method to block
      const periodoBloqueado = await this.periodosService.bloquearPeriodo(
        tenantId,
        periodoData.anio,
        periodoData.mes,
        userId,
      );

      return {
        success: true,
        data: periodoBloqueado as PeriodoResponseDto,
        message: `Período ${periodoData.anio}-${String(periodoData.mes).padStart(2, "0")} bloqueado exitosamente`,
      };
    } catch (error) {
      console.error("❌ [Contabilidad] Error bloqueando período:", error);
      throw error;
    }
  }

  @Post("cierre-contable")
  @RequirePermission("contabilidad.cierre.ejecutar") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Realizar cierre contable del período" })
  @ApiResponse({
    status: 200,
    description: "Cierre contable realizado exitosamente",
  })
  async realizarCierreContable(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() cierreData: PeriodoContableDto,
  ) {
    const anio = Number(cierreData?.anio);
    const mes = Number(cierreData?.mes);

    if (!anio || !mes || mes < 1 || mes > 12) {
      throw new BadRequestException(
        "Debe enviar anio y mes (1-12) para cerrar el período",
      );
    }

    const cerrado = await this.periodosService.cerrarPeriodo(
      tenantId,
      anio,
      mes,
      user?.id,
    );

    return {
      success: true,
      data: cerrado,
      message: `Período ${cerrado.anio}-${String(cerrado.mes).padStart(2, "0")} cerrado`,
    };
  }
}
