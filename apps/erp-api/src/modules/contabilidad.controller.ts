import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
// Remover import viejo:
// import { AccountingIntegrationService } from '../shared/integration/accounting-integration.service';

// Agregar imports nuevos:
import { AccountingEntriesService } from '../shared/integration/accounting-entries.service';
import { AccountingBooksService } from '../shared/integration/accounting-books.service';
import { AccountingReportsService } from '../shared/integration/accounting-reports.service';
import { SupabaseService } from '../shared/supabase/supabase.service';

@ApiTags('contabilidad')
@Controller('contabilidad')
export class ContabilidadController {

  constructor(
    private readonly accountingService: AccountingBooksService,
    private readonly supabaseService: SupabaseService
  ) {
    console.log('📚 [ContabilidadController] Inicializado con AccountingBooksService');
  }
  
  @Get('estado-resultados')
  @ApiOperation({ summary: 'Obtener Estado de Resultados (P&L)' })
  @ApiResponse({ status: 200, description: 'Estado de Resultados obtenido exitosamente' })
  getEstadoResultados(@Query() periodo: any) {
    // TODO: Implement real P&L statement
    return {
      success: true,
      data: {
        ingresos: {
          ventasNetas: 0,
          otrosIngresos: 0,
          totalIngresos: 0
        },
        costos: {
          costoVentas: 0,
          utilidadBruta: 0
        },
        gastos: {
          gastosOperativos: 0,
          gastosAdministrativos: 0,
          gastosVentas: 0,
          gastosFinancieros: 0,
          totalGastos: 0
        },
        resultado: {
          utilidadOperativa: 0,
          utilidadAntesImpuestos: 0,
          impuestos: 0,
          utilidadNeta: 0
        }
      }
    };
  }

  @Get('balance-general')
  @ApiOperation({ summary: 'Obtener Balance General' })
  @ApiResponse({ status: 200, description: 'Balance General obtenido exitosamente' })
  getBalanceGeneral() {
    // TODO: Implement real balance sheet
    return {
      success: true,
      data: {
        activos: {
          corrientes: {
            efectivo: 0,
            cuentasPorCobrar: 0,
            inventarios: 0,
            otrosActivos: 0,
            totalCorrientes: 0
          },
          fijos: {
            equipos: 0,
            muebles: 0,
            depreciacion: 0,
            totalFijos: 0
          },
          totalActivos: 0
        },
        pasivos: {
          corrientes: {
            cuentasPorPagar: 0,
            prestamosCortoplazo: 0,
            otrosPasivos: 0,
            totalCorrientes: 0
          },
          largoplazo: {
            prestamosLargoplazo: 0,
            totalLargoplazo: 0
          },
          totalPasivos: 0
        },
        patrimonio: {
          capital: 0,
          utilidadesRetenidas: 0,
          totalPatrimonio: 0
        }
      }
    };
  }

  @Get('flujo-efectivo')
  @ApiOperation({ summary: 'Obtener Estado de Flujo de Efectivo' })
  @ApiResponse({ status: 200, description: 'Flujo de Efectivo obtenido exitosamente' })
  getFlujoEfectivo(@Query() periodo: any) {
    // TODO: Implement real cash flow statement
    return {
      success: true,
      data: {
        operacion: {
          utilidadNeta: 0,
          depreciacion: 0,
          cambiosCapitalTrabajo: 0,
          flujoOperacion: 0
        },
        inversion: {
          compraActivos: 0,
          ventaActivos: 0,
          flujoInversion: 0
        },
        financiamiento: {
          prestamosRecibidos: 0,
          pagosPrestamos: 0,
          aportesSocios: 0,
          dividendos: 0,
          flujoFinanciamiento: 0
        },
        resumen: {
          flujoNetoEfectivo: 0,
          efectivoInicial: 0,
          efectivoFinal: 0
        }
      }
    };
  }

  @Get('plan-cuentas')
  @ApiOperation({ summary: 'Obtener Plan de Cuentas' })
  @ApiResponse({ status: 200, description: 'Plan de Cuentas obtenido exitosamente' })
  async getPlanCuentas() {
    try {
      console.log('📚 Obteniendo plan de cuentas...');
      const planCuentas = await this.accountingService.getPlanCuentas();
      
      return {
        success: true,
        data: planCuentas
      };
    } catch (error) {
      console.error('❌ Error obteniendo plan de cuentas:', error);
      return {
        success: false,
        message: 'Error obteniendo plan de cuentas',
        data: []
      };
    }
  }

  @Get('ratios-financieros')
  @ApiOperation({ summary: 'Obtener Ratios Financieros' })
  @ApiResponse({ status: 200, description: 'Ratios Financieros obtenidos exitosamente' })
  getRatiosFinancieros() {
    // TODO: Implement real financial ratios calculation
    return {
      success: true,
      data: {
        liquidez: {
          ratioLiquidez: 0,
          pruebaAcida: 0,
          capitalTrabajo: 0
        },
        rentabilidad: {
          margenBruto: 0,
          margenOperativo: 0,
          margenNeto: 0,
          roa: 0,
          roe: 0
        },
        endeudamiento: {
          ratioDeuda: 0,
          ratioCobertura: 0,
          apalancamiento: 0
        },
        eficiencia: {
          rotacionActivos: 0,
          rotacionInventario: 0,
          rotacionCuentasCobrar: 0
        }
      }
    };
  }

  @Post('asiento-contable')
  @ApiOperation({ summary: 'Crear nuevo asiento contable' })
  @ApiResponse({ status: 200, description: 'Asiento contable creado exitosamente' })
  crearAsientoContable(@Body() asientoData: any) {
    // TODO: Implement real accounting entry creation
    return {
      success: true,
      data: {
        id: Date.now().toString(),
        numeroAsiento: `A-${Date.now()}`,
        fecha: new Date().toISOString(),
        concepto: asientoData.concepto || '',
        totalDebe: asientoData.totalDebe || 0,
        totalHaber: asientoData.totalHaber || 0,
        estado: 'BORRADOR'
      },
      message: 'Asiento contable creado exitosamente'
    };
  }

  @Get('asientos-contables')
  @ApiOperation({ summary: 'Obtener listado de asientos contables' })
  @ApiResponse({ status: 200, description: 'Asientos contables obtenidos exitosamente' })
  async getAsientosContables(@Query() filtros: any) {
    try {
      console.log('📚 Obteniendo asientos contables...', filtros);
      const asientos = await this.accountingService.getAsientosContables(filtros);
      
      return {
        success: true,
        data: asientos
      };
    } catch (error) {
      console.error('❌ Error obteniendo asientos contables:', error);
      return {
        success: false,
        message: 'Error obteniendo asientos contables',
        data: []
      };
    }
  }

  @Get('libro-mayor/:cuentaCodigo')
  @ApiOperation({ summary: 'Obtener libro mayor de una cuenta específica' })
  @ApiResponse({ status: 200, description: 'Libro mayor obtenido exitosamente' })
  async getLibroMayor(@Param('cuentaCodigo') cuentaCodigo: string, @Query() filtros: any) {
    try {
      console.log(`📊 Generando Libro Mayor para cuenta: ${cuentaCodigo}`, filtros);
      
      const libroMayor = await this.accountingService.getLibroMayorPorCuenta(cuentaCodigo, filtros);
      
      return {
        success: true,
        data: libroMayor
      };
    } catch (error) {
      console.error('❌ Error generando Libro Mayor:', error);
      return {
        success: false,
        message: 'Error generando Libro Mayor',
        data: null
      };
    }
  }

  @Get('libro-mayor-completo')
  @ApiOperation({ summary: 'Obtener libro mayor de todas las cuentas con movimientos' })
  @ApiResponse({ status: 200, description: 'Libro mayor completo obtenido exitosamente' })
  async getLibroMayorCompleto(@Query() filtros: any) {
    try {
      console.log('📊 Generando Libro Mayor Completo...', filtros);
      
      const libroMayorCompleto = await this.accountingService.getLibroMayorCompleto(filtros);
      
      return {
        success: true,
        data: libroMayorCompleto
      };
    } catch (error) {
      console.error('❌ Error generando Libro Mayor Completo:', error);
      return {
        success: false,
        message: 'Error generando Libro Mayor Completo',
        data: []
      };
    }
  }

  @Get('balance-comprobacion')
  @ApiOperation({ summary: 'Obtener Balance de Comprobación' })
  @ApiResponse({ status: 200, description: 'Balance de Comprobación obtenido exitosamente' })
  async getBalanceComprobacion(@Query() filtros: any) {
    try {
      console.log('⚖️ Generando Balance de Comprobación...', filtros);
      
      const balanceComprobacion = await this.accountingService.getBalanceComprobacion(filtros);
      
      return {
        success: true,
        data: balanceComprobacion
      };
    } catch (error) {
      console.error('❌ Error generando Balance de Comprobación:', error);
      return {
        success: false,
        message: 'Error generando Balance de Comprobación',
        data: null
      };
    }
  }

  @Get('kardex-valorizado')
  @ApiOperation({ summary: 'Obtener Kardex Valorizado de Inventarios' })
  @ApiResponse({ status: 200, description: 'Kardex Valorizado obtenido exitosamente' })
  async getKardexValorizado(@Query() filtros: any) {
    try {
      console.log('📦 Generando Kardex Valorizado...', filtros);
      
      const kardexValorizado = await this.accountingService.getKardexValorizado(filtros);
      
      return {
        success: true,
        data: kardexValorizado
      };
    } catch (error) {
      console.error('❌ Error generando Kardex Valorizado:', error);
      return {
        success: false,
        message: 'Error generando Kardex Valorizado',
        data: null
      };
    }
  }

  @Post('cierre-contable')
  @ApiOperation({ summary: 'Realizar cierre contable del período' })
  @ApiResponse({ status: 200, description: 'Cierre contable realizado exitosamente' })
  realizarCierreContable(@Body() cierreData: any) {
    // TODO: Implement real accounting period closing
    return {
      success: true,
      data: {
        periodo: cierreData.periodo || '',
        fechaCierre: new Date().toISOString(),
        estado: 'CERRADO'
      },
      message: 'Cierre contable realizado exitosamente'
    };
  }

  // =============================================
  // 📋 LIBROS DE MEDIA PRIORIDAD
  // =============================================

  @Get('libro-caja-bancos')
  @ApiOperation({ summary: 'Obtener Libro de Caja y Bancos' })
  @ApiResponse({ status: 200, description: 'Libro de Caja y Bancos obtenido exitosamente' })
  async getLibroCajaBancos(@Query() filtros: any) {
    try {
      console.log('💰 Generando Libro de Caja y Bancos...', filtros);
      
      const libroCajaBancos = await this.accountingService.getLibroCajaBancos(filtros);
      
      return {
        success: true,
        data: libroCajaBancos
      };
    } catch (error) {
      console.error('❌ Error generando Libro de Caja y Bancos:', error);
      return {
        success: false,
        message: 'Error generando Libro de Caja y Bancos',
        data: null
      };
    }
  }

  @Get('registro-activos-fijos')
  @ApiOperation({ summary: 'Obtener Registro de Activos Fijos' })
  @ApiResponse({ status: 200, description: 'Registro de Activos Fijos obtenido exitosamente' })
  async getRegistroActivosFijos(@Query() filtros: any) {
    try {
      console.log('🏦 Generando Registro de Activos Fijos...', filtros);
      
      const registroActivosFijos = await this.accountingService.getRegistroActivosFijos(filtros);
      
      return {
        success: true,
        data: registroActivosFijos
      };
    } catch (error) {
      console.error('❌ Error generando Registro de Activos Fijos:', error);
      return {
        success: false,
        message: 'Error generando Registro de Activos Fijos',
        data: null
      };
    }
  }

  @Get('libro-planillas')
  @ApiOperation({ summary: 'Obtener Libro de Planillas Oficial' })
  @ApiResponse({ status: 200, description: 'Libro de Planillas obtenido exitosamente' })
  async getLibroPlanillas(@Query() filtros: any) {
    try {
      console.log('👥 Generando Libro de Planillas...', filtros);
      
      const libroPlanillas = await this.accountingService.getLibroPlanillas(filtros);
      
      return {
        success: true,
        data: libroPlanillas
      };
    } catch (error) {
      console.error('❌ Error generando Libro de Planillas:', error);
      return {
        success: false,
        message: 'Error generando Libro de Planillas',
        data: null
      };
    }
  }

  // =============================================
  // 📱 LIBROS DE BAJA PRIORIDAD (ELECTRÓNICOS SUNAT)
  // =============================================

  @Get('libro-inventarios-balances')
  @ApiOperation({ summary: 'Obtener Libro de Inventarios y Balances' })
  @ApiResponse({ status: 200, description: 'Libro de Inventarios y Balances obtenido exitosamente' })
  async getLibroInventariosBalances(@Query() filtros: any) {
    try {
      console.log('📦 Generando Libro de Inventarios y Balances...', filtros);
      
      const libroInventariosBalances = await this.accountingService.getLibroInventariosBalances(filtros);
      
      return {
        success: true,
        data: libroInventariosBalances
      };
    } catch (error) {
      console.error('❌ Error generando Libro de Inventarios y Balances:', error);
      return {
        success: false,
        message: 'Error generando Libro de Inventarios y Balances',
        data: null
      };
    }
  }

  @Get('registro-costos')
  @ApiOperation({ summary: 'Obtener Registro de Costos' })
  @ApiResponse({ status: 200, description: 'Registro de Costos obtenido exitosamente' })
  async getRegistroCostos(@Query() filtros: any) {
    try {
      console.log('🏭 Generando Registro de Costos...', filtros);
      
      const registroCostos = await this.accountingService.getRegistroCostos(filtros);
      
      return {
        success: true,
        data: registroCostos
      };
    } catch (error) {
      console.error('❌ Error generando Registro de Costos:', error);
      return {
        success: false,
        message: 'Error generando Registro de Costos',
        data: null
      };
    }
  }

  @Get('libros-electronicos-sunat')
  @ApiOperation({ summary: 'Obtener Libros Electrónicos SUNAT' })
  @ApiResponse({ status: 200, description: 'Libros Electrónicos SUNAT obtenidos exitosamente' })
  async getLibrosElectronicosSunat(@Query() filtros: any) {
    try {
      console.log('📱 Generando Libros Electrónicos SUNAT...', filtros);
      
      const librosElectronicos = await this.accountingService.getLibrosElectronicosSunat(filtros);
      
      return {
        success: true,
        data: librosElectronicos
      };
    } catch (error) {
      console.error('❌ Error generando Libros Electrónicos SUNAT:', error);
      return {
        success: false,
        message: 'Error generando Libros Electrónicos SUNAT',
        data: null
      };
    }
  }

  @Get('libro-diario')
  @ApiOperation({ summary: 'Obtener Libro Diario (Registro cronológico de asientos)' })
  @ApiResponse({ status: 200, description: 'Libro Diario obtenido exitosamente' })
  async getLibroDiario(@Query() filtros: any) {
    try {
      console.log('📖 Generando Libro Diario...', filtros);
      
      // 1. Obtener asientos contables principales
      const asientos = await this.accountingService.getAsientosContables(filtros);
      
      // 2. 🎯 OBTENER ASIENTOS DE RRHH desde tabla temporal
      let asientosRrhh = [];
      try {
        const { data: rrhhAsientos, error: rrhhError } = await this.supabaseService.getClient()
          .from('asientos_contables_rrhh')
          .select('*')
          .order('fecha', { ascending: false });
          
        if (!rrhhError && rrhhAsientos) {
          // Formatear asientos de RRHH para incluir en el libro diario
          asientosRrhh = rrhhAsientos.map(asiento => ({
            numero_asiento: `RRHH-${asiento.planilla_id?.substring(0, 8)}-${asiento.cuenta}`,
            fecha: asiento.fecha,
            concepto: asiento.descripcion,
            referencia: `RRHH-${asiento.planilla_id}`,
            total_debe: asiento.debe || 0,
            total_haber: asiento.haber || 0,
            estado: 'RRHH',
            detalle_asientos: [{
              cuenta_id: asiento.cuenta,
              debe: asiento.debe || 0,
              haber: asiento.haber || 0,
              concepto: asiento.descripcion
            }]
          }));
          
          console.log(`📊 [Contabilidad] Encontrados ${asientosRrhh.length} asientos de RRHH`);
        }
      } catch (rrhhError) {
        console.warn('⚠️ Error obteniendo asientos RRHH:', rrhhError);
      }
      
      // 3. Combinar todos los asientos
      const todosLosAsientos = [...asientos, ...asientosRrhh];
      
      // Formatear para Libro Diario (cronológico)
      const libroDiario = todosLosAsientos.map(asiento => ({
        numeroAsiento: asiento.numero_asiento,
        fecha: asiento.fecha,
        concepto: asiento.concepto,
        referencia: asiento.referencia,
        detalles: (asiento.detalle_asientos || []).map(detalle => ({
          cuentaId: detalle.cuenta_id,
          cuentaCodigo: detalle.cuenta_id, // Usar el ID como código temporalmente
          cuentaNombre: detalle.cuenta_id, // Usar el ID como nombre temporalmente
          descripcion: detalle.concepto || 'Movimiento contable',
          debe: parseFloat(detalle.debe || 0),
          haber: parseFloat(detalle.haber || 0)
        })),
        totalDebe: parseFloat(asiento.total_debe || 0),
        totalHaber: parseFloat(asiento.total_haber || 0),
        estado: asiento.estado
      }));

      // Ordenar por fecha descendente
      libroDiario.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

      return {
        success: true,
        data: {
          periodo: filtros.fechaDesde && filtros.fechaHasta 
            ? `${filtros.fechaDesde} al ${filtros.fechaHasta}`
            : 'Todos los registros',
          totalAsientos: libroDiario.length,
          totalDebe: libroDiario.reduce((sum, a) => sum + a.totalDebe, 0),
          totalHaber: libroDiario.reduce((sum, a) => sum + a.totalHaber, 0),
          asientos: libroDiario,
          fuentes: {
            contabilidad: asientos.length,
            rrhh: asientosRrhh.length
          }
        }
      };
    } catch (error) {
      console.error('❌ Error generando Libro Diario:', error);
      return {
        success: false,
        message: 'Error generando Libro Diario',
        data: null
      };
    }
  }

  @Get('registro-ventas')
  @ApiOperation({ summary: 'Obtener Registro de Ventas (Libro de Ventas e Ingresos)' })
  @ApiResponse({ status: 200, description: 'Registro de Ventas obtenido exitosamente' })
  async getRegistroVentas(@Query() filtros: any) {
    try {
      console.log('📝 Generando Registro de Ventas...', filtros);
      
      const registroVentas = await this.accountingService.getRegistroVentas(filtros);
      
      return {
        success: true,
        data: registroVentas
      };
    } catch (error) {
      console.error('❌ Error generando Registro de Ventas:', error);
      return {
        success: false,
        message: 'Error generando Registro de Ventas',
        data: null
      };
    }
  }

  @Get('registro-compras')
  @ApiOperation({ summary: 'Obtener Registro de Compras' })
  @ApiResponse({ status: 200, description: 'Registro de Compras obtenido exitosamente' })
  async getRegistroCompras(@Query() filtros: any) {
    try {
      console.log('🛒 Generando Registro de Compras...', filtros);
      
      const registroCompras = await this.accountingService.getRegistroCompras(filtros);
      
      return {
        success: true,
        data: registroCompras
      };
    } catch (error) {
      console.error('❌ Error generando Registro de Compras:', error);
      return {
        success: false,
        message: 'Error generando Registro de Compras',
        data: null
      };
    }
  }

  @Get('registro-consignaciones')
  @ApiOperation({ summary: 'Obtener Registro de Consignaciones' })
  @ApiResponse({ status: 200, description: 'Registro de Consignaciones obtenido exitosamente' })
  async getRegistroConsignaciones(
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
    @Query('estado') estado?: string
  ) {
    try {
      console.log('📋 [ContabilidadController] Obteniendo registro de consignaciones...');
      
      const filtros = {
        fechaDesde,
        fechaHasta,
        estado
      };
      
      const consignaciones = await this.accountingService.getRegistroConsignaciones(filtros);
      
      return {
        success: true,
        data: consignaciones,
        message: 'Registro de consignaciones obtenido exitosamente'
      };
    } catch (error) {
      console.error('❌ [ContabilidadController] Error obteniendo registro de consignaciones:', error);
      throw error;
    }
  }

  @Post('registro-consignaciones')
  @ApiOperation({ summary: 'Crear nueva consignación' })
  @ApiResponse({ status: 201, description: 'Consignación creada exitosamente' })
  async createConsignacion(@Body() consignacionData: any) {
    try {
      console.log('📋 [ContabilidadController] Creando nueva consignación...');
      
      const consignacion = await this.accountingService.createConsignacion(consignacionData);
      
      return {
        success: true,
        data: consignacion,
        message: 'Consignación creada exitosamente'
      };
    } catch (error) {
      console.error('❌ [ContabilidadController] Error creando consignación:', error);
      throw error;
    }
  }

  @Post('registro-consignaciones/:id/estado')
  @ApiOperation({ summary: 'Actualizar estado de consignación' })
  @ApiResponse({ status: 200, description: 'Estado de consignación actualizado exitosamente' })
  async updateEstadoConsignacion(
    @Param('id') id: string,
    @Body('estado') nuevoEstado: string
  ) {
    try {
      console.log('📋 [ContabilidadController] Actualizando estado de consignación...');
      
      const consignacion = await this.accountingService.updateEstadoConsignacion(id, nuevoEstado);
      
      return {
        success: true,
        data: consignacion,
        message: 'Estado de consignación actualizado exitosamente'
      };
    } catch (error) {
      console.error('❌ [ContabilidadController] Error actualizando estado:', error);
      throw error;
    }
  }
}