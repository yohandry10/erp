import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { InventoryIntegrationService } from '../shared/integration/inventory-integration.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@ApiTags('analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class AnalyticsController {
  
  constructor(
    private readonly supabase: SupabaseService,
    private readonly inventoryService: InventoryIntegrationService
  ) {}
  
  @Get('ventas-tiempo')
  @RequirePermission('analytics.ventas.read') // HARDENING: acceso al análisis de ventas requiere permiso.
  @ApiOperation({ summary: 'Gráfico de ventas en el tiempo' })
  @ApiResponse({ status: 200, description: 'Datos de ventas en el tiempo obtenidos exitosamente' })
  async getVentasTiempo(@CurrentTenant() tenantId: string, @Query() filtros: any) {
    try {
      console.log(`📊 [Analytics] [Tenant: ${tenantId}] Analizando ventas por tiempo`);

      const { fechaInicio, fechaFin } = this.resolveDateRange(filtros);

      const ventas = await this.obtenerVentasEmitidas(tenantId, {
        gte: fechaInicio.toISOString(),
        lte: fechaFin.toISOString(),
      });

      console.log(`📊 Se encontraron ${ventas?.length || 0} ventas en el período`);

      // Procesar datos para el gráfico
      const ventasPorDia = ventas ? this.procesarVentasDiarias(ventas) : [];
      const labels = ventasPorDia.map(v => v.fecha);
      const data = ventasPorDia.map(v => v.total);

      // Calcular totales
      const ventasActuales = ventas?.reduce((sum, v) => sum + Number(v.total || 0), 0) || 0;
      const ventasAnterior = await this.calcularVentasPeriodoAnterior(tenantId, fechaInicio, fechaFin);
      const crecimiento = ventasAnterior > 0 ? 
        ((ventasActuales - ventasAnterior) / ventasAnterior * 100).toFixed(1) + '%' : 
        'SIN DATOS';

      return {
        success: true,
        data: {
          labels,
          datasets: [
            {
              label: 'Ventas Diarias',
              data,
              backgroundColor: '#3b82f6',
              borderColor: '#1d4ed8',
              fill: false
            }
          ],
          totales: {
            ventasActuales,
            ventasAnterior,
            crecimiento
          }
        }
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('❌ Error analizando ventas por tiempo:', error);
      return {
        success: false,
        message: error.message,
        data: {
          labels: [],
          datasets: [],
          totales: { ventasActuales: 0, ventasAnterior: 0, crecimiento: 'ERROR' }
        }
      };
    }
  }

  private procesarVentasDiarias(ventas: any[]): { fecha: string, total: number }[] {
    const ventasPorDia = new Map<string, number>();
    
    ventas.forEach(venta => {
      const fecha = new Date(venta.fecha).toLocaleDateString('es-PE', { 
        day: '2-digit', 
        month: '2-digit' 
      });
      const total = parseFloat(venta.total || 0);
      
      ventasPorDia.set(fecha, (ventasPorDia.get(fecha) || 0) + total);
    });

    return Array.from(ventasPorDia.entries()).map(([fecha, total]) => ({
      fecha,
      total
    }));
  }

  private resolveDateRange(filtros: any): { fechaInicio: Date; fechaFin: Date } {
    const fechaDesde = filtros?.fecha_desde ?? filtros?.fechaDesde;
    const fechaHasta = filtros?.fecha_hasta ?? filtros?.fechaHasta;
    const periodo = filtros?.periodo ?? 'mensual';
    const allowedPeriodos = new Set(['semanal', 'mensual', 'trimestral', 'anual']);

    if ((fechaDesde && !fechaHasta) || (!fechaDesde && fechaHasta)) {
      throw new BadRequestException('Debe enviar fecha_desde y fecha_hasta juntas');
    }

    if (fechaDesde && fechaHasta) {
      const inicio = this.parseDateParam(fechaDesde, 'fecha_desde');
      const fin = this.parseDateParam(fechaHasta, 'fecha_hasta');
      fin.setUTCHours(23, 59, 59, 999);
      if (inicio.getTime() > fin.getTime()) {
        throw new BadRequestException('fecha_desde no puede ser mayor que fecha_hasta');
      }
      return { fechaInicio: inicio, fechaFin: fin };
    }

    if (!allowedPeriodos.has(periodo)) {
      throw new BadRequestException('Periodo invalido. Use semanal, mensual, trimestral o anual');
    }

    const fechaFin = new Date();
    const fechaInicio = new Date(fechaFin);
    const daysByPeriodo: Record<string, number> = {
      semanal: 7,
      mensual: 30,
      trimestral: 90,
      anual: 365,
    };
    fechaInicio.setDate(fechaInicio.getDate() - daysByPeriodo[periodo]);
    return { fechaInicio, fechaFin };
  }

  private parseDateParam(value: string, fieldName: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${fieldName} debe tener formato YYYY-MM-DD`);
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} debe ser una fecha valida`);
    }
    return parsed;
  }

  /**
   * Fuente unificada de ventas para analytics: comprobantes de venta EMITIDOS
   * (tabla `documentos`), que incluye tanto las facturas del flujo de ventas como
   * las boletas del POS. La tabla legacy `ventas` no la puebla ningún flujo (los
   * flujos reales escriben en pedidos_venta / ventas_pos → documentos), por eso
   * los KPIs quedaban en 0. Se excluyen comprobantes anulados/cancelados.
   */
  /**
   * Costo de ventas del periodo: por cada ítem vendido, su cantidad por el costo
   * del producto. Es lo que faltaba para que el margen fuera margen y no ingreso
   * bruto disfrazado.
   *
   * Se toma el costo actual del producto porque el detalle del documento no
   * guarda el costo histórico. Es una aproximación, no un costeo por capas, y por
   * eso el indicador se presenta como margen y no como resultado contable.
   */
  private async calcularCostoDeVentas(tenantId: string, desdeIso: string): Promise<number> {
    const client = this.supabase.getClient();

    const { data: documentos } = await client
      .from('documentos')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('tipo_documento', ['FACTURA', 'BOLETA'])
      .not('estado', 'in', '("ANULADO","ANULADA","CANCELADO","CANCELADA")')
      .gte('fecha_emision', desdeIso);

    const ids = (documentos || []).map((d: any) => d.id).filter(Boolean);
    if (ids.length === 0) return 0;

    const { data: detalles } = await client
      .from('documento_detalles')
      .select('producto_id, cantidad')
      .eq('tenant_id', tenantId)
      .in('documento_id', ids);

    const productoIds = [...new Set((detalles || []).map((d: any) => d.producto_id).filter(Boolean))];
    if (productoIds.length === 0) return 0;

    const { data: productos } = await client
      .from('productos')
      .select('id, costo, precio_compra')
      .eq('tenant_id', tenantId)
      .in('id', productoIds);

    const costoPorProducto = new Map<string, number>(
      (productos || []).map((p: any) => [String(p.id), Number(p.costo || p.precio_compra || 0)]),
    );

    return (detalles || []).reduce((total: number, d: any) => {
      const costo = costoPorProducto.get(String(d.producto_id)) ?? 0;
      return total + Number(d.cantidad || 0) * costo;
    }, 0);
  }

  private async obtenerVentasEmitidas(
    tenantId: string,
    opts: { gte: string; lte?: string; lt?: string },
  ): Promise<Array<{ fecha: string; total: number }>> {
    let query = this.supabase.getClient()
      .from('documentos')
      .select('fecha_emision, total')
      .eq('tenant_id', tenantId) // ✅ Filtro de tenant
      .in('tipo_documento', ['FACTURA', 'BOLETA'])
      .not('estado', 'in', '("ANULADO","ANULADA","CANCELADO","CANCELADA")')
      .gte('fecha_emision', opts.gte);

    if (opts.lt) query = query.lt('fecha_emision', opts.lt);
    if (opts.lte) query = query.lte('fecha_emision', opts.lte);

    const { data, error } = await query.order('fecha_emision');
    if (error) {
      throw new Error(`Error consultando ventas: ${error.message}`);
    }
    return (data ?? []).map((d: any) => ({
      fecha: d.fecha_emision,
      total: Number(d.total ?? 0),
    }));
  }

  private async calcularVentasPeriodoAnterior(tenantId: string, fechaInicio: Date, fechaFin: Date): Promise<number> {
    // ✅ MULTI-TENANT: Filtrar por tenant
    try {
      const durationMs = fechaFin.getTime() - fechaInicio.getTime();
      const inicioAnterior = new Date(fechaInicio.getTime() - durationMs - 1);
      const finAnterior = new Date(fechaInicio.getTime() - 1);

      const ventas = await this.obtenerVentasEmitidas(tenantId, {
        gte: inicioAnterior.toISOString(),
        lte: finAnterior.toISOString(),
      });

      return ventas?.reduce((sum, venta) => sum + parseFloat(String(venta.total || 0)), 0) || 0;
    } catch (error) {
      console.error('❌ Error calculando ventas mes anterior:', error);
      return 0;
    }
  }

  @Get('deudas-clientes')
  @RequirePermission('analytics.cobranza.read') // HARDENING: reporte de cuentas por cobrar protegido.
  @ApiOperation({ summary: 'Gráfico de deudas de clientes' })
  @ApiResponse({ status: 200, description: 'Datos de deudas de clientes obtenidos exitosamente' })
  async getDeudasClientes(@CurrentTenant() tenantId: string, @Query() filtros: any) {
    try {
      console.log(`📊 [Analytics] [Tenant: ${tenantId}] Analizando deudas de clientes`);
      const { data: cuentasPorCobrar, error } = await this.supabase.getClient()
        .from('cuentas_por_cobrar')
        .select('id, cliente_id, saldo, monto_pendiente, monto_total, fecha_vencimiento, numero')
        .eq('tenant_id', tenantId) // ✅ Filtro de tenant
        .order('fecha_vencimiento', { ascending: true });

      if (error) throw error;

      const ahora = new Date();
      // El tramo «Por vencer» faltaba, y su ausencia producía la contradicción que
      // se ve en pantalla: el total por cobrar muestra saldo mientras el gráfico
      // sale entero en cero y el panel dice «sin saldos pendientes». Una cartera
      // sana, con todo al día, quedaba representada como si no existiera.
      const edadSaldos = {
        'Por vencer': 0,
        '0-30 días': 0,
        '31-60 días': 0,
        '61-90 días': 0,
        '90+ días': 0
      };

      const topDeudores = [];
      let totalPorCobrar = 0;
      let totalVencido = 0;

      cuentasPorCobrar?.forEach(cuenta => {
        const diasVencido = Math.floor((ahora.getTime() - new Date(cuenta.fecha_vencimiento).getTime()) / (1000 * 60 * 60 * 24));
        const monto = parseFloat(cuenta.saldo ?? cuenta.monto_pendiente ?? cuenta.monto_total ?? 0);
        
        totalPorCobrar += monto;
        
        if (diasVencido > 0) {
          totalVencido += monto;

          if (diasVencido <= 30) edadSaldos['0-30 días'] += monto;
          else if (diasVencido <= 60) edadSaldos['31-60 días'] += monto;
          else if (diasVencido <= 90) edadSaldos['61-90 días'] += monto;
          else edadSaldos['90+ días'] += monto;
        } else {
          // Vigente: aún no vence. Suma a la cartera pero no a lo vencido.
          edadSaldos['Por vencer'] += monto;
        }

        topDeudores.push({
          cliente: cuenta.numero || cuenta.cliente_id || 'Cliente sin nombre',
          ruc: 'Sin RUC',
          monto: monto,
          diasVencido: Math.max(0, diasVencido)
        });
      });

      return {
        success: true,
        data: {
          graficoEdadSaldos: {
            labels: Object.keys(edadSaldos),
            data: Object.values(edadSaldos),
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#7c2d12']
          },
          topDeudores: topDeudores.slice(0, 10),
          alertasCobranza: this.generarAlertasCobranza(cuentasPorCobrar),
          totales: {
            totalPorCobrar,
            vencido: totalVencido,
            porcentajeVencido: totalPorCobrar > 0 ? Number((totalVencido / totalPorCobrar * 100).toFixed(1)) : 0
          }
        }
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  @Get('deudas-proveedores')
  @RequirePermission('analytics.cobranza.read')
  @ApiOperation({ summary: 'Gráfico de deudas a proveedores' })
  @ApiResponse({ status: 200, description: 'Datos de deudas a proveedores obtenidos exitosamente' })
  async getDeudasProveedores(@CurrentTenant() tenantId: string, @Query() filtros: any) {
    try {
      const { data: cuentasPorPagar, error } = await this.supabase.getClient()
        .from('cuentas_por_pagar')
        .select('saldo, total, fecha_vencimiento, proveedor_id')
        .eq('tenant_id', tenantId)
        .order('fecha_vencimiento', { ascending: true });

      if (error) throw error;

      const ahora = new Date();
      const edadSaldos = {
        '0-30 días': 0,
        '31-60 días': 0,
        '61-90 días': 0,
        '90+ días': 0,
      };

      let totalPorPagar = 0;
      let totalVencido = 0;

      cuentasPorPagar?.forEach((cuenta) => {
        const monto = Number.parseFloat(cuenta.saldo ?? cuenta.total ?? 0);
        const diasVencido = Math.floor(
          (ahora.getTime() - new Date(cuenta.fecha_vencimiento).getTime()) / (1000 * 60 * 60 * 24),
        );

        totalPorPagar += monto;
        if (diasVencido <= 0) return;

        totalVencido += monto;
        if (diasVencido <= 30) edadSaldos['0-30 días'] += monto;
        else if (diasVencido <= 60) edadSaldos['31-60 días'] += monto;
        else if (diasVencido <= 90) edadSaldos['61-90 días'] += monto;
        else edadSaldos['90+ días'] += monto;
      });

      return {
        success: true,
        data: {
          graficoEdadSaldos: {
            labels: Object.keys(edadSaldos),
            data: Object.values(edadSaldos),
            backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#7c2d12'],
          },
          totales: {
            totalPorPagar,
            vencido: totalVencido,
            porcentajeVencido: totalPorPagar > 0 ? totalVencido / totalPorPagar * 100 : 0,
          },
        },
      };
    } catch (error) {
      console.error('❌ Error analizando deudas a proveedores:', error);
      return {
        success: true,
        data: this.getEmptyDebtAnalytics('totalPorPagar'),
      };
    }
  }

  @Get('ventas-categoria')
  @RequirePermission('analytics.ventas.read')
  @ApiOperation({ summary: 'Gráfico de ventas por categoría' })
  @ApiResponse({ status: 200, description: 'Datos de ventas por categoría obtenidos exitosamente' })
  async getVentasCategoria(@CurrentTenant() tenantId: string) {
    try {
      // Ventas reales por categoría: montos de líneas de comprobantes emitidos.
      // (Antes contaba productos del catálogo, lo que mostraba "S/ 5" con 5 productos.)
      const client = this.supabase.getClient();

      const { data: documentos, error: docsError } = await client
        .from('documentos')
        .select('id')
        .eq('tenant_id', tenantId)
        .neq('estado', 'ANULADO');
      if (docsError) throw docsError;

      const categorias = new Map<string, number>();
      const documentoIds = (documentos || []).map((d: any) => d.id);

      if (documentoIds.length > 0) {
        const { data: detalles, error: detError } = await client
          .from('documento_detalles')
          .select('producto_id, total_item, valor_venta')
          .eq('tenant_id', tenantId)
          .in('documento_id', documentoIds);
        if (detError) throw detError;

        const productoIds = [...new Set((detalles || []).map((d: any) => d.producto_id).filter(Boolean))];
        const categoriaPorProducto = new Map<string, string>();
        if (productoIds.length > 0) {
          const { data: productos, error: prodError } = await client
            .from('productos')
            .select('id, categoria')
            .eq('tenant_id', tenantId)
            .in('id', productoIds);
          if (prodError) throw prodError;
          (productos || []).forEach((p: any) => categoriaPorProducto.set(p.id, p.categoria || 'Sin categoría'));
        }

        (detalles || []).forEach((detalle: any) => {
          const categoria = categoriaPorProducto.get(detalle.producto_id) || 'Sin categoría';
          const monto = Number(detalle.total_item ?? detalle.valor_venta ?? 0);
          categorias.set(categoria, (categorias.get(categoria) || 0) + monto);
        });
      }

      return {
        success: true,
        data: {
          graficoPie: {
            labels: Array.from(categorias.keys()),
            data: Array.from(categorias.values()),
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],
          },
        },
      };
    } catch (error) {
      console.error('❌ Error analizando ventas por categoría:', error);
      return {
        success: true,
        data: {
          graficoPie: {
            labels: [],
            data: [],
            backgroundColor: [],
          },
        },
      };
    }
  }

  @Get('kpis-visuales')
  @RequirePermission('analytics.finanzas.read')
  @ApiOperation({ summary: 'KPIs visuales de analytics financiero' })
  @ApiResponse({ status: 200, description: 'KPIs visuales obtenidos exitosamente' })
  async getKpisVisuales(@CurrentTenant() tenantId: string) {
    try {
      const desde = new Date();
      desde.setMonth(desde.getMonth() - 1);

      const client = this.supabase.getClient();
      const [ventasRows, gastosResult, cxcResult, cxpResult, bancosResult, inventarioResult] =
        await Promise.all([
          this.obtenerVentasEmitidas(tenantId, { gte: desde.toISOString() }),
          client.from('gastos').select('monto').eq('tenant_id', tenantId).gte('fecha', desde.toISOString()),
          client.from('cuentas_por_cobrar').select('saldo, monto').eq('tenant_id', tenantId),
          client.from('cuentas_por_pagar').select('saldo, total').eq('tenant_id', tenantId),
          client.from('cuentas_bancarias').select('saldo_actual').eq('tenant_id', tenantId).eq('activo', true),
          client.from('productos').select('stock_actual, costo, precio_compra').eq('tenant_id', tenantId).eq('activo', true),
        ]);

      const ventas = ventasRows.reduce((sum, row) => sum + Number(row.total || 0), 0) || 0;
      const gastos = gastosResult.data?.reduce((sum, row) => sum + Number.parseFloat(row.monto || 0), 0) || 0;
      const porCobrar = cxcResult.data?.reduce((sum, row) => sum + Number.parseFloat(row.saldo ?? row.monto ?? 0), 0) || 0;
      const porPagar = cxpResult.data?.reduce((sum, row) => sum + Number.parseFloat(row.saldo ?? row.total ?? 0), 0) || 0;
      const bancos = bancosResult.data?.reduce((sum: number, row: any) => sum + Number(row.saldo_actual || 0), 0) || 0;
      const inventario = inventarioResult.data?.reduce(
        (sum: number, row: any) =>
          sum + Number(row.stock_actual || 0) * Number(row.costo || row.precio_compra || 0),
        0,
      ) || 0;

      const costoVentas = await this.calcularCostoDeVentas(tenantId, desde.toISOString());

      // Razón corriente: activo corriente entre pasivo corriente. Antes se
      // calculaba como (ventas del mes + CxC) / CxP, que no es un ratio de
      // liquidez —las ventas no son un activo, y las que fueron a crédito ya
      // están contadas dentro de CxC, así que se sumaban dos veces—.
      const activoCorriente = bancos + porCobrar + inventario;
      const liquidez = porPagar > 0 ? activoCorriente / porPagar : activoCorriente > 0 ? 999 : 0;

      // Margen neto: descuenta el costo de ventas además de los gastos. Omitirlo
      // hacía que el indicador marcara cerca de 100 % y lo diera por OK, porque
      // trataba todo el ingreso como utilidad.
      const rentabilidad = ventas > 0 ? ((ventas - costoVentas - gastos) / ventas) * 100 : 0;

      return {
        success: true,
        data: {
          liquidez: { valor: Number(liquidez.toFixed(1)), objetivo: 1.5, estado: liquidez >= 1.5 ? 'OK' : 'REVISAR' },
          rentabilidad: { valor: Number(rentabilidad.toFixed(1)), objetivo: 15, estado: rentabilidad >= 15 ? 'OK' : 'REVISAR' },
          crecimiento: { valor: 0, objetivo: 10, estado: 'SIN DATOS' },
          eficiencia: { rotacionInventario: 0, cicloEfectivo: 0 },
        },
      };
    } catch (error) {
      console.error('❌ Error calculando KPIs visuales:', error);
      return {
        success: true,
        data: {
          liquidez: { valor: 0, objetivo: 1.5, estado: 'SIN DATOS' },
          rentabilidad: { valor: 0, objetivo: 15, estado: 'SIN DATOS' },
          crecimiento: { valor: 0, objetivo: 10, estado: 'SIN DATOS' },
          eficiencia: { rotacionInventario: 0, cicloEfectivo: 0 },
        },
      };
    }
  }

  private getEmptyDebtAnalytics(totalKey: 'totalPorPagar' | 'totalPorCobrar') {
    return {
      graficoEdadSaldos: {
        labels: ['0-30 días', '31-60 días', '61-90 días', '90+ días'],
        data: [0, 0, 0, 0],
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#7c2d12'],
      },
      totales: {
        [totalKey]: 0,
        vencido: 0,
        porcentajeVencido: 0,
      },
    };
  }

  @Get('rentabilidad-productos')
  @RequirePermission('analytics.rentabilidad.read') // HARDENING: análisis sensible de rentabilidad.
  @ApiOperation({ summary: 'Análisis de rentabilidad por productos' })
  @ApiResponse({ status: 200, description: 'Análisis de rentabilidad obtenido exitosamente' })
  async getRentabilidadProductos(@CurrentTenant() tenantId: string, @Query() filtros: any) {
    try {
      console.log(`📊 [Analytics] [Tenant: ${tenantId}] Analizando rentabilidad por productos`);

      // Obtener productos con sus ventas y compras
      const { data: productos, error: productosError } = await this.supabase.getClient()
        .from('productos')
        .select('id, codigo, nombre, precio, costo')
        .eq('tenant_id', tenantId); // ✅ Filtro de tenant

      if (productosError) {
        console.error('❌ Error obteniendo productos:', productosError);
        throw new Error(`Error consultando productos: ${productosError.message}`);
      }

      console.log(`📦 Se encontraron ${productos?.length || 0} productos`);

      // Obtener detalles de ventas
      const { data: ventasDetalles, error: ventasError } = await this.supabase.getClient()
        .from('venta_detalles')
        .select('producto_id, cantidad, precio_unitario')
        .eq('tenant_id', tenantId); // ✅ Filtro de tenant

      if (ventasError) {
        console.error('⚠️ Error obteniendo ventas:', ventasError);
      }

      // Obtener detalles de compras
      const { data: comprasDetalles, error: comprasError } = await this.supabase.getClient()
        .from('orden_compra_detalles')
        .select('producto_id, cantidad, precio_unitario')
        .eq('tenant_id', tenantId); // ✅ Filtro de tenant

      if (comprasError) {
        console.error('⚠️ Error obteniendo compras:', comprasError);
      }

      const productosRentabilidad = productos?.map(producto => {
        const ventasProducto = ventasDetalles?.filter(v => v.producto_id === producto.id) || [];
        const comprasProducto = comprasDetalles?.filter(c => c.producto_id === producto.id) || [];
        
        const costoPromedio = this.calcularCostoPromedio(comprasProducto) || parseFloat(producto.costo || 0);
        const precioVentaPromedio = this.calcularPrecioVentaPromedio(ventasProducto) || parseFloat(producto.precio || 0);
        const margenBruto = precioVentaPromedio - costoPromedio;
        const margenPorcentaje = precioVentaPromedio > 0 ? (margenBruto / precioVentaPromedio * 100) : 0;
        const volumen = this.calcularVolumenVentas(ventasProducto);
        
        return {
          producto: producto.nombre,
          codigo: producto.codigo,
          margenPorcentaje: parseFloat(margenPorcentaje.toFixed(2)),
          volumen: volumen,
          rentabilidadTotal: parseFloat((margenBruto * volumen).toFixed(2)),
          costoPromedio: parseFloat(costoPromedio.toFixed(2)),
          precioVentaPromedio: parseFloat(precioVentaPromedio.toFixed(2))
        };
      }) || [];

      const recomendaciones = this.generarRecomendacionesRentabilidad(productosRentabilidad);

      console.log(`✅ Análisis de rentabilidad completado: ${productosRentabilidad.length} productos analizados`);

      return {
        success: true,
        data: {
          graficoBarras: {
            labels: productosRentabilidad.map(p => p.producto),
            datasets: [{
              label: 'Margen Bruto (%)',
              data: productosRentabilidad.map(p => p.margenPorcentaje),
              backgroundColor: '#3b82f6'
            }]
          },
          graficoScatter: {
            datasets: [{
              label: 'Productos',
              data: productosRentabilidad.map(p => ({
                x: p.volumen,
                y: p.margenPorcentaje,
                producto: p.producto
              })),
              backgroundColor: '#10b981'
            }]
          },
          tablaDetalle: productosRentabilidad,
          recomendaciones
        }
      };
    } catch (error) {
      console.error('❌ Error analizando rentabilidad:', error);
      return { 
        success: false, 
        message: error.message,
        data: {
          graficoBarras: { labels: [], datasets: [] },
          graficoScatter: { datasets: [] },
          tablaDetalle: [],
          recomendaciones: ['Error al calcular rentabilidad. Verifique que existan productos y ventas.']
        }
      };
    }
  }

  @Get('punto-equilibrio')
  @RequirePermission('analytics.finanzas.read') // HARDENING: cálculo financiero restringido.
  @ApiOperation({ summary: 'Cálculo del punto de equilibrio' })
  @ApiResponse({ status: 200, description: 'Análisis de punto de equilibrio obtenido exitosamente' })
  async getPuntoEquilibrio(@CurrentTenant() tenantId: string, @Query() filtros: any) {
    try {
      console.log(`📊 [Analytics] [Tenant: ${tenantId}] Calculando punto de equilibrio`);

      // Obtener productos
      const { data: productos, error: productosError } = await this.supabase.getClient()
        .from('productos')
        .select('id, codigo, nombre, precio, costo')
        .eq('tenant_id', tenantId); // ✅ Filtro de tenant

      if (productosError) {
        console.error('❌ Error obteniendo productos:', productosError);
        throw new Error(`Error consultando productos: ${productosError.message}`);
      }

      // Obtener detalles de ventas
      const { data: ventasDetalles } = await this.supabase.getClient()
        .from('venta_detalles')
        .select('producto_id, cantidad, precio_unitario')
        .eq('tenant_id', tenantId); // ✅ Filtro de tenant

      // Obtener detalles de compras
      const { data: comprasDetalles } = await this.supabase.getClient()
        .from('orden_compra_detalles')
        .select('producto_id, cantidad, precio_unitario')
        .eq('tenant_id', tenantId); // ✅ Filtro de tenant

      // Calcular costos fijos estimados (gastos operativos del último mes)
      // Como no existe la tabla costos_fijos, vamos a estimarlos desde gastos
      const { data: gastos } = await this.supabase.getClient()
        .from('gastos')
        .select('monto')
        .eq('tenant_id', tenantId) // ✅ Filtro de tenant
        .gte('fecha', new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString());

      const totalCostosFijos = gastos?.reduce((sum, gasto) => sum + parseFloat(gasto.monto || 0), 0) || 10000; // Default 10,000 si no hay datos
      
      console.log(`💰 Costos fijos estimados: S/ ${totalCostosFijos.toFixed(2)}`);

      const analisisPorProducto = productos?.map(producto => {
        const ventasProducto = ventasDetalles?.filter(v => v.producto_id === producto.id) || [];
        const comprasProducto = comprasDetalles?.filter(c => c.producto_id === producto.id) || [];
        
        const costoVariable = this.calcularCostoPromedio(comprasProducto) || parseFloat(producto.costo || 0);
        const precioVenta = this.calcularPrecioVentaPromedio(ventasProducto) || parseFloat(producto.precio || 0);
        const margenContribucion = precioVenta - costoVariable;
        const puntoEquilibrioUnidades = margenContribucion > 0 ? totalCostosFijos / margenContribucion : 0;
        
        return {
          producto: producto.nombre,
          codigo: producto.codigo,
          precioVenta: parseFloat(precioVenta.toFixed(2)),
          costoVariable: parseFloat(costoVariable.toFixed(2)),
          margenContribucion: parseFloat(margenContribucion.toFixed(2)),
          puntoEquilibrioUnidades: Math.ceil(puntoEquilibrioUnidades),
          puntoEquilibrioSoles: Math.ceil(puntoEquilibrioUnidades * precioVenta)
        };
      }) || [];

      console.log(`✅ Punto de equilibrio calculado: ${analisisPorProducto.length} productos analizados`);

      return {
        success: true,
        data: {
          totalCostosFijos,
          analisisPorProducto,
          resumen: {
            productosRentables: analisisPorProducto.filter(p => p.margenContribucion > 0).length,
            productosNoRentables: analisisPorProducto.filter(p => p.margenContribucion <= 0).length,
            recomendacion: this.generarRecomendacionPuntoEquilibrio(analisisPorProducto, totalCostosFijos)
          }
        }
      };
    } catch (error) {
      console.error('❌ Error calculando punto de equilibrio:', error);
      return { 
        success: false, 
        message: error.message,
        data: {
          totalCostosFijos: 0,
          analisisPorProducto: [],
          resumen: {
            productosRentables: 0,
            productosNoRentables: 0,
            recomendacion: 'Error al calcular punto de equilibrio. Verifique que existan productos y datos de costos.'
          }
        }
      };
    }
  }

  @Get('escenarios-financieros')
  @RequirePermission('analytics.finanzas.read') // HARDENING: simulaciones financieras restringidas.
  @ApiOperation({ summary: 'Simulaciones de escenarios financieros' })
  @ApiResponse({ status: 200, description: 'Escenarios financieros simulados exitosamente' })
  async getEscenariosFinancieros(@CurrentTenant() tenantId: string, @Query('escenario') escenario: string = 'base', @Query() filtros: any) {
    try {
      console.log(`📊 [Analytics] [Tenant: ${tenantId}] Simulando escenarios financieros`);
      const ventasActuales = await this.obtenerVentasUltimos12Meses(tenantId);
      const costosActuales = await this.obtenerCostosUltimos12Meses(tenantId);
      
      const escenarios = this.simularEscenarios(ventasActuales, costosActuales, escenario);
      
      return {
        success: true,
        data: {
          escenarioActual: escenario,
          proyecciones: escenarios,
          analisisSensibilidad: this.generarAnalisisSensibilidad(ventasActuales, costosActuales),
          recomendaciones: this.generarRecomendacionesEscenarios(escenarios)
        }
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Métodos auxiliares privados para cálculos financieros
  private calcularCostoPromedio(compras: any[]): number {
    if (!compras || compras.length === 0) return 0;
    const totalCosto = compras.reduce((sum, compra) => sum + (parseFloat(compra.precio_unitario || 0) * parseInt(compra.cantidad || 0)), 0);
    const totalCantidad = compras.reduce((sum, compra) => sum + parseInt(compra.cantidad || 0), 0);
    return totalCantidad > 0 ? totalCosto / totalCantidad : 0;
  }

  private calcularPrecioVentaPromedio(ventas: any[]): number {
    if (!ventas || ventas.length === 0) return 0;
    const totalIngresos = ventas.reduce((sum, venta) => sum + (parseFloat(venta.precio_unitario || 0) * parseInt(venta.cantidad || 0)), 0);
    const totalCantidad = ventas.reduce((sum, venta) => sum + parseInt(venta.cantidad || 0), 0);
    return totalCantidad > 0 ? totalIngresos / totalCantidad : 0;
  }

  private calcularVolumenVentas(ventas: any[]): number {
    return ventas ? ventas.reduce((sum, venta) => sum + parseInt(venta.cantidad || 0), 0) : 0;
  }

  private generarRecomendacionesRentabilidad(productos: any[]): string[] {
    const recomendaciones = [];
    const productosBajoMargen = productos.filter(p => p.margenPorcentaje < 10);
    
    if (productosBajoMargen.length > 0) {
      recomendaciones.push(`Considerar aumentar precios de ${productosBajoMargen.length} productos con márgenes bajos`);
    }
    
    const productosAltoVolumenBajoMargen = productos.filter(p => p.volumen > 100 && p.margenPorcentaje < 15);
    if (productosAltoVolumenBajoMargen.length > 0) {
      recomendaciones.push(`Optimizar costos de productos de alto volumen`);
    }
    
    return recomendaciones;
  }

  private generarAlertasCobranza(cuentas: any[]): any[] {
    const ahora = new Date();
    return cuentas?.filter(cuenta => {
      const diasVencido = Math.floor((ahora.getTime() - new Date(cuenta.fecha_vencimiento).getTime()) / (1000 * 60 * 60 * 24));
      return diasVencido > 30;
    }).map(cuenta => ({
      tipo: 'VENCIDO',
      mensaje: `Cliente ${cuenta.numero || cuenta.cliente_id || 'sin nombre'} tiene ${Math.floor((ahora.getTime() - new Date(cuenta.fecha_vencimiento).getTime()) / (1000 * 60 * 60 * 24))} días de atraso`,
      monto: parseFloat(cuenta.saldo ?? cuenta.monto_pendiente ?? cuenta.monto_total ?? 0),
      fechaVencimiento: cuenta.fecha_vencimiento
    })) || [];
  }

  private async obtenerVentasUltimos12Meses(tenantId: string): Promise<number[]> {
    // ✅ MULTI-TENANT: Filtrar por tenant
    const ventas = [];
    for (let i = 11; i >= 0; i--) {
      const fechaInicio = new Date();
      fechaInicio.setMonth(fechaInicio.getMonth() - i);
      fechaInicio.setDate(1);
      
      const fechaFin = new Date(fechaInicio);
      fechaFin.setMonth(fechaFin.getMonth() + 1);
      
      const data = await this.obtenerVentasEmitidas(tenantId, {
        gte: fechaInicio.toISOString(),
        lt: fechaFin.toISOString(),
      });

      ventas.push(data.reduce((sum, v) => sum + parseFloat(String(v.total || 0)), 0) || 0);
    }
    return ventas;
  }

  private async obtenerCostosUltimos12Meses(tenantId: string): Promise<number[]> {
    // ✅ MULTI-TENANT: Filtrar por tenant
    const costos = [];
    for (let i = 11; i >= 0; i--) {
      const fechaInicio = new Date();
      fechaInicio.setMonth(fechaInicio.getMonth() - i);
      fechaInicio.setDate(1);
      
      const fechaFin = new Date(fechaInicio);
      fechaFin.setMonth(fechaFin.getMonth() + 1);
      
      const { data } = await this.supabase.getClient()
        .from('gastos')
        .select('monto')
        .eq('tenant_id', tenantId) // ✅ Filtro de tenant
        .gte('fecha', fechaInicio.toISOString())
        .lt('fecha', fechaFin.toISOString());
      
      costos.push(data?.reduce((sum, g) => sum + parseFloat(g.monto || 0), 0) || 0);
    }
    return costos;
  }

  private simularEscenarios(ventas: number[], costos: number[], escenario: string): any {
    const factorCrecimiento = escenario === 'optimista' ? 1.2 : escenario === 'pesimista' ? 0.8 : 1.0;
    const ventasProyectadas = ventas.map(v => v * factorCrecimiento);
    
    return {
      ventasProyectadas,
      costosProyectados: costos.map(c => c * 0.95), // Asumiendo 5% de reducción de costos
      utilidadProyectada: ventasProyectadas.map((v, i) => v - costos[i]),
      roi: ventasProyectadas.reduce((a, b) => a + b, 0) / costos.reduce((a, b) => a + b, 0)
    };
  }

  private generarAnalisisSensibilidad(ventas: number[], costos: number[]): any {
    return {
      impacto5Porciento: ventas.map(v => v * 0.05),
      impacto10Porciento: ventas.map(v => v * 0.10),
      umbralRiesgo: Math.min(...ventas) * 0.9
    };
  }

  private generarRecomendacionesEscenarios(escenarios: any): string[] {
    return [
      'Monitorear costos variables mensualmente',
      'Establecer límites de gasto por categoría',
      'Considerar diversificación de ingresos'
    ];
  }

  private generarRecomendacionPuntoEquilibrio(productos: any[], costosFijos: number): string {
    if (costosFijos > 10000) {
      return 'Considerar reducción de costos fijos o aumento de precios';
    }
    return 'El punto de equilibrio está dentro de rangos aceptables';
  }
}
