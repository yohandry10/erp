import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from "class-validator";
import { CurrentTenant, CurrentUser } from "../../../common";
import { RequirePermission } from "../../../common/decorators/require-permission.decorator";
import { PermissionGuard } from "../../../common/guards/permission.guard";
import { AccountingBooksService } from "../../../shared/integration/accounting-books.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { EstadosFinancierosService } from "../services/estados-financieros.service";
import { PleExportService } from "../services/ple-export.service";

class CreateConsignacionDto {
  @IsOptional()
  @IsString()
  numero?: string;

  @IsOptional()
  @IsDateString()
  fecha_registro?: string;

  @IsOptional()
  @IsDateString()
  fecha_entrega?: string;

  @IsOptional()
  @IsUUID()
  producto_id?: string;

  @IsString()
  consignatario_nombre: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  cantidad: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valor_unitario: number;

  @IsOptional()
  @Matches(/^[A-Za-z]{3}$/)
  moneda?: string;
}

class UpdateEstadoConsignacionDto {
  @IsString()
  @IsIn(["PENDIENTE", "VENDIDA", "DEVUELTA", "ANULADA", "CERRADA"])
  estado: string;
}

@ApiTags("contabilidad")
@Controller("contabilidad")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContabilidadLibrosController {
  constructor(
    private readonly accountingService: AccountingBooksService,
    private readonly estadosFinancierosService: EstadosFinancierosService,
    private readonly pleExportService: PleExportService,
  ) {}

  @Get("libro-mayor/:cuentaCodigo")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener libro mayor de una cuenta específica" })
  @ApiResponse({
    status: 200,
    description: "Libro mayor obtenido exitosamente",
  })
  async getLibroMayor(
    @Param("cuentaCodigo") cuentaCodigo: string,
    @Query() filtros: any,
  ) {
    try {
      console.log(
        `📊 Generando Libro Mayor para cuenta: ${cuentaCodigo}`,
        filtros,
      );

      const libroMayor = await this.accountingService.getLibroMayorPorCuenta(
        cuentaCodigo,
        filtros,
      );

      return {
        success: true,
        data: libroMayor,
      };
    } catch (error) {
      console.error("❌ Error generando Libro Mayor:", error);
      return {
        success: false,
        message: "Error generando Libro Mayor",
        data: null,
      };
    }
  }

  @Get("libro-mayor-completo")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary: "Obtener libro mayor de todas las cuentas con movimientos",
  })
  @ApiResponse({
    status: 200,
    description: "Libro mayor completo obtenido exitosamente",
  })
  async getLibroMayorCompleto(@Query() filtros: any) {
    try {
      console.log("📊 Generando Libro Mayor Completo...", filtros);

      const libroMayorCompleto =
        await this.accountingService.getLibroMayorCompleto(filtros);

      return {
        success: true,
        data: libroMayorCompleto,
      };
    } catch (error) {
      console.error("❌ Error generando Libro Mayor Completo:", error);
      return {
        success: false,
        message: "Error generando Libro Mayor Completo",
        data: [],
      };
    }
  }

  @Get("balance-comprobacion")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary:
      "Obtener Balance de Comprobación (legacy endpoint - usar /estados/balance-comprobacion)",
  })
  @ApiResponse({
    status: 200,
    description: "Balance de Comprobación obtenido exitosamente",
  })
  async getBalanceComprobacion(
    @CurrentTenant() tenantId: string,
    @Query("anio") anio?: string,
    @Query("mes") mes?: string,
    @Query() filtros?: any,
  ) {
    try {
      console.log("⚖️ Generando Balance de Comprobación...", {
        anio,
        mes,
        filtros,
      });

      // Si se proporcionan anio y mes, usar el nuevo servicio
      if (anio && mes) {
        const anioNum = parseInt(anio, 10);
        const mesNum = parseInt(mes, 10);

        // Validar rangos
        if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
          return {
            success: false,
            data: null,
            message:
              "Parámetros inválidos: anio debe ser un número y mes debe estar entre 1 y 12",
          };
        }

        console.log(
          `⚖️ [Contabilidad] Usando nuevo servicio para ${anioNum}-${mesNum}`,
        );

        const balance =
          await this.estadosFinancierosService.getBalanceComprobacion(
            tenantId,
            anioNum,
            mesNum,
          );

        // Calcular totales
        const totalDebe = balance.reduce((sum, item) => sum + item.debe, 0);
        const totalHaber = balance.reduce((sum, item) => sum + item.haber, 0);
        const diferencia = totalDebe - totalHaber;

        return {
          success: true,
          data: {
            periodo: {
              anio: anioNum,
              mes: mesNum,
              descripcion: `${anioNum}-${String(mesNum).padStart(2, "0")}`,
            },
            cuentas: balance,
            totales: {
              debe: totalDebe,
              haber: totalHaber,
              diferencia: diferencia,
              cuadrado: Math.abs(diferencia) < 0.01,
            },
            resumen: {
              total_cuentas: balance.length,
              cuentas_con_saldo: balance.filter(
                (c) => Math.abs(c.saldo_final) > 0.01,
              ).length,
            },
          },
        };
      }

      // Fallback al servicio antiguo si no se proporcionan anio y mes
      const balanceComprobacion =
        await this.accountingService.getBalanceComprobacion(filtros);

      return {
        success: true,
        data: balanceComprobacion,
      };
    } catch (error) {
      console.error("❌ Error generando Balance de Comprobación:", error);
      return {
        success: false,
        message: "Error generando Balance de Comprobación",
        data: null,
      };
    }
  }

  @Get("kardex-valorizado")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener Kardex Valorizado de Inventarios" })
  @ApiResponse({
    status: 200,
    description: "Kardex Valorizado obtenido exitosamente",
  })
  async getKardexValorizado(@Query() filtros: any) {
    try {
      console.log("📦 Generando Kardex Valorizado...", filtros);

      const kardexValorizado =
        await this.accountingService.getKardexValorizado(filtros);

      return {
        success: true,
        data: kardexValorizado,
      };
    } catch (error) {
      console.error("❌ Error generando Kardex Valorizado:", error);
      return {
        success: false,
        message: "Error generando Kardex Valorizado",
        data: null,
      };
    }
  }

  // =============================================
  // 📋 LIBROS DE MEDIA PRIORIDAD
  // =============================================

  @Get("libro-caja-bancos")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener Libro de Caja y Bancos" })
  @ApiResponse({
    status: 200,
    description: "Libro de Caja y Bancos obtenido exitosamente",
  })
  async getLibroCajaBancos(@Query() filtros: any) {
    try {
      console.log("💰 Generando Libro de Caja y Bancos...", filtros);

      const libroCajaBancos =
        await this.accountingService.getLibroCajaBancos(filtros);

      return {
        success: true,
        data: libroCajaBancos,
      };
    } catch (error) {
      console.error("❌ Error generando Libro de Caja y Bancos:", error);
      return {
        success: false,
        message: "Error generando Libro de Caja y Bancos",
        data: null,
      };
    }
  }

  @Get("registro-activos-fijos")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener Registro de Activos Fijos" })
  @ApiResponse({
    status: 200,
    description: "Registro de Activos Fijos obtenido exitosamente",
  })
  async getRegistroActivosFijos(@Query() filtros: any) {
    try {
      console.log("🏦 Generando Registro de Activos Fijos...", filtros);

      const registroActivosFijos =
        await this.accountingService.getRegistroActivosFijos(filtros);

      return {
        success: true,
        data: registroActivosFijos,
      };
    } catch (error) {
      console.error("❌ Error generando Registro de Activos Fijos:", error);
      return {
        success: false,
        message: "Error generando Registro de Activos Fijos",
        data: null,
      };
    }
  }

  @Get("libro-planillas")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener Libro de Planillas Oficial" })
  @ApiResponse({
    status: 200,
    description: "Libro de Planillas obtenido exitosamente",
  })
  async getLibroPlanillas(@Query() filtros: any) {
    try {
      console.log("👥 Generando Libro de Planillas...", filtros);

      const libroPlanillas =
        await this.accountingService.getLibroPlanillas(filtros);

      return {
        success: true,
        data: libroPlanillas,
      };
    } catch (error) {
      console.error("❌ Error generando Libro de Planillas:", error);
      return {
        success: false,
        message: "Error generando Libro de Planillas",
        data: null,
      };
    }
  }

  // =============================================
  // 📱 LIBROS DE BAJA PRIORIDAD (ELECTRÓNICOS SUNAT)
  // =============================================

  @Get("libro-inventarios-balances")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener Libro de Inventarios y Balances" })
  @ApiResponse({
    status: 200,
    description: "Libro de Inventarios y Balances obtenido exitosamente",
  })
  async getLibroInventariosBalances(@Query() filtros: any) {
    try {
      console.log("📦 Generando Libro de Inventarios y Balances...", filtros);

      const libroInventariosBalances =
        await this.accountingService.getLibroInventariosBalances(filtros);

      return {
        success: true,
        data: libroInventariosBalances,
      };
    } catch (error) {
      console.error(
        "❌ Error generando Libro de Inventarios y Balances:",
        error,
      );
      return {
        success: false,
        message: "Error generando Libro de Inventarios y Balances",
        data: null,
      };
    }
  }

  @Get("registro-costos")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener Registro de Costos" })
  @ApiResponse({
    status: 200,
    description: "Registro de Costos obtenido exitosamente",
  })
  async getRegistroCostos(@Query() filtros: any) {
    try {
      console.log("🏭 Generando Registro de Costos...", filtros);

      const registroCostos =
        await this.accountingService.getRegistroCostos(filtros);

      return {
        success: true,
        data: registroCostos,
      };
    } catch (error) {
      console.error("❌ Error generando Registro de Costos:", error);
      return {
        success: false,
        message: "Error generando Registro de Costos",
        data: null,
      };
    }
  }

  @Get("libros-electronicos-sunat")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener Libros Electrónicos SUNAT" })
  @ApiResponse({
    status: 200,
    description: "Libros Electrónicos SUNAT obtenidos exitosamente",
  })
  async getLibrosElectronicosSunat(@Query() filtros: any) {
    try {
      console.log("📱 Generando Libros Electrónicos SUNAT...", filtros);

      const librosElectronicos =
        await this.accountingService.getLibrosElectronicosSunat(filtros);

      return {
        success: true,
        data: librosElectronicos,
      };
    } catch (error) {
      console.error("❌ Error generando Libros Electrónicos SUNAT:", error);
      return {
        success: false,
        message: "Error generando Libros Electrónicos SUNAT",
        data: null,
      };
    }
  }

  @Get("libro-diario")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary: "Obtener Libro Diario (Registro cronológico de asientos)",
  })
  @ApiResponse({
    status: 200,
    description: "Libro Diario obtenido exitosamente",
  })
  async getLibroDiario(
    @CurrentTenant() tenantId: string,
    @Query() filtros: any,
  ) {
    try {
      console.log("📖 Generando Libro Diario...", filtros);

      // HARDENING: forzamos uso del tenant actual para toda consulta.
      const filtrosConTenant = { ...filtros, tenant_id: tenantId };

      // Obtener solo la fuente contable canónica; RRHH ya debe integrarse en asientos_contables.
      const asientos =
        await this.accountingService.getAsientosContables(filtrosConTenant);

      // Formatear para Libro Diario (cronológico)
      const libroDiario = asientos.map((asiento) => ({
        numeroAsiento: asiento.numero_asiento,
        fecha: asiento.fecha,
        concepto: asiento.concepto,
        referencia: asiento.referencia,
        detalles: (asiento.detalle_asientos || []).map((detalle: any) => ({
          cuentaId: detalle.cuenta_id,
          cuentaCodigo:
            detalle.plan_cuentas?.codigo ??
            detalle.cuenta_codigo ??
            detalle.cuenta_id,
          cuentaNombre:
            detalle.plan_cuentas?.nombre ??
            detalle.cuenta_nombre ??
            detalle.cuenta_id,
          descripcion: detalle.concepto || "Movimiento contable",
          debe: parseFloat(detalle.debe || 0),
          haber: parseFloat(detalle.haber || 0),
        })),
        totalDebe: parseFloat(asiento.total_debe || 0),
        totalHaber: parseFloat(asiento.total_haber || 0),
        estado: asiento.estado,
      }));

      // Ordenar por fecha descendente
      libroDiario.sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      );

      return {
        success: true,
        data: {
          periodo:
            filtros.fechaDesde && filtros.fechaHasta
              ? `${filtros.fechaDesde} al ${filtros.fechaHasta}`
              : "Todos los registros",
          totalAsientos: libroDiario.length,
          totalDebe: libroDiario.reduce((sum, a) => sum + a.totalDebe, 0),
          totalHaber: libroDiario.reduce((sum, a) => sum + a.totalHaber, 0),
          asientos: libroDiario,
          fuentes: {
            contabilidad: asientos.length,
            rrhh: 0,
          },
        },
      };
    } catch (error) {
      console.error("❌ Error generando Libro Diario:", error);
      return {
        success: false,
        message: "Error generando Libro Diario",
        data: null,
      };
    }
  }

  @Get("registro-ventas")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({
    summary: "Obtener Registro de Ventas (Libro de Ventas e Ingresos)",
  })
  @ApiResponse({
    status: 200,
    description: "Registro de Ventas obtenido exitosamente",
  })
  async getRegistroVentas(@Query() filtros: any) {
    try {
      console.log("📝 Generando Registro de Ventas...", filtros);

      const registroVentas =
        await this.accountingService.getRegistroVentas(filtros);

      return {
        success: true,
        data: registroVentas,
      };
    } catch (error) {
      console.error("❌ Error generando Registro de Ventas:", error);
      return {
        success: false,
        message: "Error generando Registro de Ventas",
        data: null,
      };
    }
  }

  @Get("registro-compras")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener Registro de Compras" })
  @ApiResponse({
    status: 200,
    description: "Registro de Compras obtenido exitosamente",
  })
  async getRegistroCompras(@Query() filtros: any) {
    try {
      console.log("🛒 Generando Registro de Compras...", filtros);

      const registroCompras =
        await this.accountingService.getRegistroCompras(filtros);

      return {
        success: true,
        data: registroCompras,
      };
    } catch (error) {
      console.error("❌ Error generando Registro de Compras:", error);
      return {
        success: false,
        message: "Error generando Registro de Compras",
        data: null,
      };
    }
  }

  @Get("registro-consignaciones")
  @RequirePermission("contabilidad.reportes.read") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Obtener Registro de Consignaciones" })
  @ApiResponse({
    status: 200,
    description: "Registro de Consignaciones obtenido exitosamente",
  })
  async getRegistroConsignaciones(
    @Query("fechaDesde") fechaDesde?: string,
    @Query("fechaHasta") fechaHasta?: string,
    @Query("estado") estado?: string,
  ) {
    try {
      console.log(
        "📋 [ContabilidadController] Obteniendo registro de consignaciones...",
      );

      const filtros = {
        fechaDesde,
        fechaHasta,
        estado,
      };

      const consignaciones =
        await this.accountingService.getRegistroConsignaciones(filtros);

      return {
        success: true,
        data: consignaciones,
        message: "Registro de consignaciones obtenido exitosamente",
      };
    } catch (error) {
      console.error(
        "❌ [ContabilidadController] Error obteniendo registro de consignaciones:",
        error,
      );
      throw error;
    }
  }

  @Post("registro-consignaciones")
  @RequirePermission("contabilidad.consignaciones.crear") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Crear nueva consignación" })
  @ApiResponse({ status: 201, description: "Consignación creada exitosamente" })
  async createConsignacion(
    @Body() consignacionData:CreateConsignacionDto,
    @CurrentUser("id") userId:string,
    @Headers('idempotency-key') idempotencyKey?:string,
  ) {
    try {
      console.log("📋 [ContabilidadController] Creando nueva consignación...");

      const consignacion =
        await this.accountingService.createConsignacion(consignacionData,userId,idempotencyKey);

      return {
        success: true,
        data: consignacion,
        message: "Consignación creada exitosamente",
      };
    } catch (error) {
      console.error(
        "❌ [ContabilidadController] Error creando consignación:",
        error,
      );
      throw error;
    }
  }

  @Post("registro-consignaciones/:id/estado")
  @RequirePermission("contabilidad.consignaciones.actualizar") // HARDENING: permisos granulares.
  @ApiOperation({ summary: "Actualizar estado de consignación" })
  @ApiResponse({
    status: 200,
    description: "Estado de consignación actualizado exitosamente",
  })
  async updateEstadoConsignacion(
    @Param("id") id: string,
    @Body() body: UpdateEstadoConsignacionDto,
    @CurrentUser("id") userId:string,
    @Headers('idempotency-key') idempotencyKey?:string,
  ) {
    try {
      console.log(
        "📋 [ContabilidadController] Actualizando estado de consignación...",
      );

      const consignacion =
        await this.accountingService.updateEstadoConsignacion(id,body.estado,userId,idempotencyKey);

      return {
        success: true,
        data: consignacion,
        message: "Estado de consignación actualizado exitosamente",
      };
    } catch (error) {
      console.error(
        "❌ [ContabilidadController] Error actualizando estado:",
        error,
      );
      throw error;
    }
  }

  // =============================================
  // 🔄 GESTIÓN DE EVENTOS FALLIDOS
  // =============================================

  // =============================================
  // 📒 GESTIÓN DE ASIENTOS CONTABLES
  // =============================================

  // =============================================
  // 📤 EXPORTACIÓN PLE (SUNAT)
  // =============================================

  /**
   * El servicio de exportación existía sin ninguna ruta que lo alcanzara: los
   * libros electrónicos no se podían descargar desde ningún sitio.
   */
  @Get("ple/:libro")
  @RequirePermission("contabilidad.reportes.read")
  @ApiOperation({ summary: "Exportar un libro electrónico PLE del período" })
  @ApiResponse({ status: 200, description: "Archivo PLE generado" })
  async exportarPle(
    @Param("libro") libro: string,
    @Query("anio") anio: string,
    @Query("mes") mes: string,
  ) {
    const anioNum = Number(anio);
    const mesNum = Number(mes);

    try {
      const exportadores: Record<
        string,
        () => Promise<{ filename: string; content: string }>
      > = {
        "registro-ventas": () =>
          this.pleExportService.exportarRegistroVentas(anioNum, mesNum),
        "registro-compras": () =>
          this.pleExportService.exportarRegistroCompras(anioNum, mesNum),
        "libro-diario": () =>
          this.pleExportService.exportarLibroDiario(anioNum, mesNum),
        "libro-mayor": () =>
          this.pleExportService.exportarLibroMayor(anioNum, mesNum),
        "balance-comprobacion": () =>
          this.pleExportService.exportarBalanceComprobacion(anioNum, mesNum),
      };

      if (libro === "todos") {
        const { archivos, fallidos } =
          await this.pleExportService.exportarTodosPLE(anioNum, mesNum);
        return {
          success: true,
          data: archivos,
          // Se devuelve lo que si se genero, pero sin ocultar lo que no: dar
          // cuatro libros por cinco en silencio seria peor que no dar ninguno.
          message: fallidos.length
            ? `No se pudieron generar: ${fallidos.join(" | ")}`
            : undefined,
        };
      }

      const exportador = exportadores[libro];
      if (!exportador) {
        return {
          success: false,
          message: `Libro PLE no reconocido: ${libro}`,
          data: null,
        };
      }

      return { success: true, data: [await exportador()] };
    } catch (error: any) {
      // El mensaje importa: "RUC de empresa requerido" le dice al contador qué
      // le falta configurar, y un texto genérico se lo escondería.
      return {
        success: false,
        message: error?.message || "Error generando el archivo PLE",
        data: null,
      };
    }
  }
}
