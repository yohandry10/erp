import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { EventBusService } from '../shared/events/event-bus.service';
import { FinancialIntegrationService } from '../shared/integration/financial-integration.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

import { AnalisisCreditoDto } from './finanzas/dto/analisis-credito.dto';

@ApiTags('finanzas')
@Controller('finanzas')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('finanzas.read')
export class FinanzasController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly financialService: FinancialIntegrationService
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard financiero completo con datos históricos' })
  @ApiResponse({ status: 200, description: 'Dashboard con tendencias históricas' })
  async getDashboardFinancieroCompleto() {
    try {
      const [kpis, datosHistoricos] = await Promise.all([
        this.financialService.getKPIsFinancieros(),
        this.financialService.getDatosHistoricosCompleto()
      ]);

      return {
        success: true,
        data: {
          indicadoresActuales: kpis,
          tendencias: {
            ventasMensuales: datosHistoricos.ventasMensuales,
            gastosMensuales: datosHistoricos.gastosMensuales,
            utilidadMensual: datosHistoricos.utilidadMensual
          },
          comparativas: {
            crecimientoAnual: this.calcularCrecimientoAnual(datosHistoricos.ventasMensuales),
            margenPromedio: this.calcularMargenPromedio(datosHistoricos.utilidadMensual)
          }
        }
      };
    } catch (error) {
      return { success: false, message: 'Error obteniendo dashboard completo' };
    }
  }

  @Get('flujo-efectivo/proyectado')
  @ApiOperation({ summary: 'Flujo de efectivo proyectado con escenarios' })
  @ApiResponse({ status: 200, description: 'Proyección de flujo de efectivo' })
  async getFlujoProyectado(@Query('meses') meses?: number) {
    return this.financialService.getFlujoProyectado(meses || 12);
  }

  @Post('analisis-credito')
  @RequirePermission('finanzas.write')
  @ApiOperation({ summary: 'Análisis de crédito basado en datos reales' })
  @ApiResponse({ status: 200, description: 'Análisis crediticio completo' })
  async getAnalisisCredito(@Body() solicitudData: AnalisisCreditoDto) {
    return this.financialService.getAnalisisCredito(solicitudData);
  }

  @Get('historico/ventas')
  @ApiOperation({ summary: 'Datos históricos de ventas mensuales' })
  async getHistoricoVentas() {
    const datos = await this.financialService.getDatosHistoricosCompleto();
    return { success: true, data: datos.ventasMensuales };
  }

  @Get('historico/gastos')
  @ApiOperation({ summary: 'Datos históricos de gastos mensuales' })
  async getHistoricoGastos() {
    const datos = await this.financialService.getDatosHistoricosCompleto();
    return { success: true, data: datos.gastosMensuales };
  }

  @Get('historico/utilidad')
  @ApiOperation({ summary: 'Datos históricos de utilidad mensual' })
  async getHistoricoUtilidad() {
    const datos = await this.financialService.getDatosHistoricosCompleto();
    return { success: true, data: datos.utilidadMensual };
  }

  // ... resto de endpoints existentes ...

  private calcularCrecimientoAnual(ventas: any[]): number {
    if (ventas.length < 12) return 0;
    const ventasActuales = ventas.slice(-12).reduce((sum, v) => sum + v.ventas, 0);
    const ventasAnteriores = ventas.slice(-24, -12).reduce((sum, v) => sum + v.ventas, 0);
    return ventasAnteriores > 0 ? ((ventasActuales - ventasAnteriores) / ventasAnteriores) * 100 : 0;
  }

  private calcularMargenPromedio(utilidad: any[]): number {
    if (utilidad.length === 0) return 0;
    return utilidad.reduce((sum, u) => sum + u.margen, 0) / utilidad.length;
  }
}
