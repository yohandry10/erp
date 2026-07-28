import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

/**
 * ReportesService
 * Servicio para generar reportes y estadísticas de ventas
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
 */
@Injectable()
export class ReportesService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Reporte de ventas por cliente
   * Requirements: 16.1
   */
  async getVentasPorCliente(
    tenantId: string,
    fechaDesde?: string,
    fechaHasta?: string,
    clienteFiltro?: string,
    estadoFiltro?: string,
  ) {
    const client = this.supabase.getClient();

    let query = client
      .from('pedidos_venta')
      .select(`
        id,
        cliente_id,
        fecha,
        estado,
        total,
        clientes!pedidos_venta_cliente_id_fkey!inner (
          id,
          razon_social,
          documento_numero:codigo
        )
      `)
      .eq('tenant_id', tenantId);

    if (fechaDesde) {
      query = query.gte('fecha', fechaDesde);
    }
    if (fechaHasta) {
      query = query.lte('fecha', fechaHasta);
    }
    if (estadoFiltro) {
      query = query.eq('estado', estadoFiltro);
    }
    if (clienteFiltro) {
      query = query.ilike('clientes.razon_social', `%${clienteFiltro}%`);
    }

    const { data: pedidos, error } = await query;

    if (error) throw error;

    // Agrupar por cliente
    const grouped = pedidos.reduce((acc, pedido) => {
      const clienteId = pedido.cliente_id;
      if (!acc[clienteId]) {
        acc[clienteId] = {
          cliente_id: clienteId,
          cliente_nombre: (pedido.clientes as any).razon_social,
          cliente_documento: (pedido.clientes as any).documento_numero,
          periodo: `${fechaDesde || 'Inicio'} - ${fechaHasta || 'Hoy'}`,
          moneda: 'PEN',
          estado: estadoFiltro || 'Todos',
          total: 0,
          cantidad_pedidos: 0,
          cantidad_facturas: 0,
        };
      }

      acc[clienteId].total += Number(pedido.total);
      acc[clienteId].cantidad_pedidos += 1;
      if (pedido.estado === 'FACTURADO' || pedido.estado === 'COMPLETADO' || pedido.estado === 'COMPLETADO_CON_GRE') {
        acc[clienteId].cantidad_facturas += 1;
      }

      return acc;
    }, {});

    return Object.values(grouped);
  }

  /**
   * Reporte de cotizaciones pendientes
   * Requirements: 16.2
   */
  async getCotizacionesPendientes(
    tenantId: string,
    fechaDesde?: string,
    fechaHasta?: string,
    clienteFiltro?: string,
  ) {
    const client = this.supabase.getClient();

    let query = client
      .from('cotizaciones')
      .select(`
        id,
        numero,
        fecha,
        fecha_vencimiento,
        estado,
        total,
        clientes!cotizaciones_cliente_id_fkey!inner (
          razon_social,
          documento_numero:codigo
        )
      `)
      .eq('tenant_id', tenantId)
      .in('estado', ['BORRADOR', 'ENVIADA']);

    if (fechaDesde) {
      query = query.gte('fecha', fechaDesde);
    }
    if (fechaHasta) {
      query = query.lte('fecha', fechaHasta);
    }
    if (clienteFiltro) {
      query = query.ilike('clientes.razon_social', `%${clienteFiltro}%`);
    }

    const { data: cotizaciones, error } = await query;

    if (error) throw error;

    // Calcular días de vigencia
    const hoy = new Date();
    return cotizaciones.map((cot) => {
      const fechaVenc = cot.fecha_vencimiento ? new Date(cot.fecha_vencimiento) : null;
      const diasVigencia = fechaVenc
        ? Math.ceil((fechaVenc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      return {
        id: cot.id,
        numero: cot.numero,
        cliente_nombre: (cot.clientes as any).razon_social,
        cliente_documento: (cot.clientes as any).documento_numero,
        fecha: cot.fecha,
        fecha_vencimiento: cot.fecha_vencimiento,
        estado: cot.estado,
        total: Number(cot.total),
        dias_vigencia: diasVigencia,
        probabilidad: null, // TODO: Implementar lógica de probabilidad si se requiere
      };
    });
  }

  /**
   * Dashboard de pedidos por estado
   * Requirements: 16.3
   */
  async getPedidosPorEstado(
    tenantId: string,
    fechaDesde?: string,
    fechaHasta?: string,
    clienteFiltro?: string,
  ) {
    const client = this.supabase.getClient();

    let query = client
      .from('pedidos_venta')
      .select('estado, total')
      .eq('tenant_id', tenantId);

    if (fechaDesde) {
      query = query.gte('fecha', fechaDesde);
    }
    if (fechaHasta) {
      query = query.lte('fecha', fechaHasta);
    }

    const { data: pedidos, error } = await query;

    if (error) throw error;

    // Agrupar por estado
    const grouped = pedidos.reduce((acc, pedido) => {
      const estado = pedido.estado;
      if (!acc[estado]) {
        acc[estado] = {
          estado,
          cantidad: 0,
          total: 0,
        };
      }

      acc[estado].cantidad += 1;
      acc[estado].total += Number(pedido.total);

      return acc;
    }, {});

    const totalPedidos = pedidos.length;
    const result = Object.values(grouped).map((item: any) => ({
      ...item,
      porcentaje: totalPedidos > 0 ? (item.cantidad / totalPedidos) * 100 : 0,
    }));

    return result;
  }

  /**
   * Reporte de productos más vendidos
   * Requirements: 16.4
   */
  async getProductosMasVendidos(
    tenantId: string,
    fechaDesde?: string,
    fechaHasta?: string,
    clienteFiltro?: string,
  ) {
    const client = this.supabase.getClient();

    let query = client
      .from('pedidos_venta_detalle')
      .select(`
        producto_id,
        descripcion,
        cantidad,
        precio_unitario,
        subtotal,
        pedidos_venta!pedidos_venta_detalle_pedido_id_fkey!inner (
          tenant_id,
          fecha,
          estado
        )
      `)
      .eq('pedidos_venta.tenant_id', tenantId)
      .in('pedidos_venta.estado', ['FACTURADO', 'COMPLETADO', 'COMPLETADO_CON_GRE']);

    if (fechaDesde) {
      query = query.gte('pedidos_venta.fecha', fechaDesde);
    }
    if (fechaHasta) {
      query = query.lte('pedidos_venta.fecha', fechaHasta);
    }

    const { data: detalles, error } = await query;

    if (error) throw error;

    // Agrupar por producto
    const grouped = detalles.reduce((acc, detalle) => {
      const productoId = detalle.producto_id;
      if (!acc[productoId]) {
        acc[productoId] = {
          producto_id: productoId,
          producto_nombre: detalle.descripcion,
          producto_codigo: productoId.substring(0, 8), // Simplificado
          unidades_vendidas: 0,
          importe_total: 0,
          cantidad_pedidos: 0,
          suma_precios: 0,
          count_precios: 0,
        };
      }

      acc[productoId].unidades_vendidas += Number(detalle.cantidad);
      acc[productoId].importe_total += Number(detalle.subtotal);
      acc[productoId].cantidad_pedidos += 1;
      acc[productoId].suma_precios += Number(detalle.precio_unitario);
      acc[productoId].count_precios += 1;

      return acc;
    }, {});

    return Object.values(grouped).map((item: any) => ({
      producto_id: item.producto_id,
      producto_nombre: item.producto_nombre,
      producto_codigo: item.producto_codigo,
      unidades_vendidas: item.unidades_vendidas,
      importe_total: item.importe_total,
      cantidad_pedidos: item.cantidad_pedidos,
      precio_promedio: item.suma_precios / item.count_precios,
    }));
  }

  /**
   * Reporte de top clientes por facturación
   * Requirements: 16.5
   */
  async getTopClientes(
    tenantId: string,
    fechaDesde?: string,
    fechaHasta?: string,
    limit: number = 10,
  ) {
    const client = this.supabase.getClient();

    let query = client
      .from('pedidos_venta')
      .select(`
        cliente_id,
        total,
        estado,
        clientes!pedidos_venta_cliente_id_fkey!inner (
          razon_social,
          documento_numero:codigo
        )
      `)
      .eq('tenant_id', tenantId)
      .in('estado', ['FACTURADO', 'COMPLETADO', 'COMPLETADO_CON_GRE']);

    if (fechaDesde) {
      query = query.gte('fecha', fechaDesde);
    }
    if (fechaHasta) {
      query = query.lte('fecha', fechaHasta);
    }

    const { data: pedidos, error } = await query;

    if (error) throw error;

    // Agrupar por cliente
    const grouped = pedidos.reduce((acc, pedido) => {
      const clienteId = pedido.cliente_id;
      if (!acc[clienteId]) {
        acc[clienteId] = {
          cliente_id: clienteId,
          cliente_nombre: (pedido.clientes as any).razon_social,
          cliente_documento: (pedido.clientes as any).documento_numero,
          total_facturacion: 0,
          cantidad_pedidos: 0,
          cantidad_facturas: 0,
        };
      }

      acc[clienteId].total_facturacion += Number(pedido.total);
      acc[clienteId].cantidad_pedidos += 1;
      acc[clienteId].cantidad_facturas += 1;

      return acc;
    }, {});

    const totalFacturacion = Object.values(grouped).reduce(
      (sum: number, item: any) => sum + Number(item.total_facturacion),
      0,
    );

    const result = Object.values(grouped)
      .map((item: any) => ({
        ...item,
        ticket_promedio: Number(item.total_facturacion) / item.cantidad_pedidos,
        porcentaje_total: Number(totalFacturacion) > 0 ? (Number(item.total_facturacion) / Number(totalFacturacion)) * 100 : 0,
      }))
      .sort((a: any, b: any) => Number(b.total_facturacion) - Number(a.total_facturacion))
      .slice(0, limit);

    return result;
  }

  /**
   * Métrica de lead time comercial
   * Requirements: 16.6
   */
  async getLeadTime(
    tenantId: string,
    fechaDesde?: string,
    fechaHasta?: string,
  ) {
    const client = this.supabase.getClient();

    // Obtener pedidos con cotización asociada y facturados
    let query = client
      .from('pedidos_venta')
      .select(`
        id,
        fecha,
        cotizacion_id,
        cotizaciones!pedidos_venta_cotizacion_id_fkey!inner (
          fecha
        )
      `)
      .eq('tenant_id', tenantId)
      .in('estado', ['FACTURADO', 'COMPLETADO', 'COMPLETADO_CON_GRE'])
      .not('cotizacion_id', 'is', null);

    if (fechaDesde) {
      query = query.gte('fecha', fechaDesde);
    }
    if (fechaHasta) {
      query = query.lte('fecha', fechaHasta);
    }

    const { data: pedidos, error } = await query;

    if (error) throw error;

    if (pedidos.length === 0) {
      return {
        promedio_dias: 0,
        mediana_dias: 0,
        minimo_dias: 0,
        maximo_dias: 0,
        total_conversiones: 0,
        por_rango: [],
        tendencia: [],
      };
    }

    // Calcular días entre cotización y factura
    const leadTimes = pedidos.map((pedido) => {
      const fechaCot = new Date((pedido.cotizaciones as any).fecha);
      const fechaPed = new Date(pedido.fecha);
      const dias = Math.ceil((fechaPed.getTime() - fechaCot.getTime()) / (1000 * 60 * 60 * 24));
      return { dias, fecha: pedido.fecha };
    });

    // Estadísticas
    const dias = leadTimes.map((lt) => lt.dias).sort((a, b) => a - b);
    const promedio = dias.reduce((sum, d) => sum + d, 0) / dias.length;
    const mediana = dias[Math.floor(dias.length / 2)];
    const minimo = Math.min(...dias);
    const maximo = Math.max(...dias);

    // Distribución por rangos
    const rangos = [
      { rango: '0-3 días', min: 0, max: 3 },
      { rango: '4-7 días', min: 4, max: 7 },
      { rango: '8-15 días', min: 8, max: 15 },
      { rango: '16-30 días', min: 16, max: 30 },
      { rango: 'Más de 30 días', min: 31, max: 9999 },
    ];

    const porRango = rangos.map((rango) => {
      const cantidad = dias.filter((d) => d >= rango.min && d <= rango.max).length;
      return {
        rango: rango.rango,
        cantidad,
        porcentaje: (cantidad / dias.length) * 100,
      };
    });

    // Tendencia temporal (simplificada por mes)
    const tendencia = [];
    // TODO: Implementar agrupación por mes si se requiere más detalle

    return {
      promedio_dias: promedio,
      mediana_dias: mediana,
      minimo_dias: minimo,
      maximo_dias: maximo,
      total_conversiones: pedidos.length,
      por_rango: porRango,
      tendencia,
    };
  }

  /**
   * Pipeline comercial completo (cotizaciones → pedidos → facturas)
   * Requirements: 16.7 (extendido)
   */
  async getPipelineVentas(
    tenantId: string,
    fechaDesde?: string,
    fechaHasta?: string,
  ) {
    const client = this.supabase.getClient();

    const aplicarFiltroFechas = (query: any, campo: string) => {
      let q = query;
      if (fechaDesde) {
        q = q.gte(campo, fechaDesde);
      }
      if (fechaHasta) {
        q = q.lte(campo, fechaHasta);
      }
      return q;
    };

    const cotizacionesQuery = aplicarFiltroFechas(
      client
        .from('cotizaciones')
        .select('id,total,estado,fecha', { count: 'exact' })
        .eq('tenant_id', tenantId),
      'fecha',
    );

    const pedidosQuery = aplicarFiltroFechas(
      client
        .from('pedidos_venta')
        .select('id,total,estado,fecha', { count: 'exact' })
        .eq('tenant_id', tenantId),
      'fecha',
    );

    const facturasQuery = aplicarFiltroFechas(
      client
        .from('documentos')
        .select('id,total,estado,fecha_emision,tipo_documento,serie,numero', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .in('tipo_documento', ['FACTURA', 'BOLETA']),
      'fecha_emision',
    );

    const [
      { data: cotizaciones, count: totalCotizaciones, error: cotizacionesError },
      { data: pedidos, count: totalPedidos, error: pedidosError },
      { data: facturas, count: totalFacturas, error: facturasError },
    ] = await Promise.all([cotizacionesQuery, pedidosQuery, facturasQuery]);

    if (cotizacionesError) throw cotizacionesError;
    if (pedidosError) throw pedidosError;
    if (facturasError) throw facturasError;

    const sumar = (items: any[] | null | undefined, field: string) =>
      (items || []).reduce((acc, item) => acc + Number(item?.[field] ?? 0), 0);

    const pipeline = {
      cotizaciones: {
        cantidad: totalCotizaciones ?? 0,
        valor: sumar(cotizaciones, 'total'),
        estados: this.contarPorEstado(cotizaciones, 'estado'),
      },
      pedidos: {
        cantidad: totalPedidos ?? 0,
        valor: sumar(pedidos, 'total'),
        estados: this.contarPorEstado(pedidos, 'estado'),
      },
      facturas: {
        cantidad: totalFacturas ?? 0,
        valor: sumar(facturas, 'total'),
        estados: this.contarPorEstado(facturas, 'estado'),
      },
    };

    const conversiones = {
      cotizaciones_a_pedidos:
        pipeline.cotizaciones.cantidad > 0
          ? this.round2((pipeline.pedidos.cantidad / pipeline.cotizaciones.cantidad) * 100)
          : 0,
      pedidos_a_facturas:
        pipeline.pedidos.cantidad > 0
          ? this.round2((pipeline.facturas.cantidad / pipeline.pedidos.cantidad) * 100)
          : 0,
      total:
        pipeline.cotizaciones.cantidad > 0
          ? this.round2((pipeline.facturas.cantidad / pipeline.cotizaciones.cantidad) * 100)
          : 0,
    };

    const tendencia = this.agruparPorPeriodo({
      cotizaciones: cotizaciones || [],
      pedidos: pedidos || [],
      facturas: facturas || [],
    });

    return {
      pipeline,
      conversiones,
      tendencia,
      periodo: {
        desde: fechaDesde ?? null,
        hasta: fechaHasta ?? null,
      },
    };
  }

  /**
   * Fill-rate y OTIF (On-Time In Full) del flujo logístico
   * Requirements: 16.7 extendido
   */
  async getFillRateOtif(
    tenantId: string,
    fechaDesde?: string,
    fechaHasta?: string,
  ) {
    const client = this.supabase.getClient();
    const dashboardConfig = await this.obtenerConfigDashboards(tenantId);
    const SLA_DIAS = 5;

    if (!dashboardConfig.habilitar_dashboards_otif) {
      return {
        habilitado: false,
        resumen: {
          pedidosAnalizados: 0,
          pedidosEntregados: 0,
          totalSolicitado: 0,
          totalEntregado: 0,
          fillRate: 0,
          otif: 0,
          pedidosConBackorder: 0,
          unidadesPendientesBackorder: 0,
        },
        incidencias: {
          pedidosSinEntrega: 0,
          pedidosFueraSla: 0,
        },
        detalle: [],
        backorders: {
          pedidosConPendiente: 0,
          unidadesPendientes: 0,
          topPrioritarios: [],
        },
        objetivoOtif: dashboardConfig.objetivo_otif,
        frecuenciaActualizacion: dashboardConfig.frecuencia_actualizacion_dashboards,
      };
    }

    const pedidosQuery = client
      .from('pedidos_venta')
      .select('id, numero, fecha, estado, tracking_estado, tracking_actualizado_en', { count: 'exact' })
      .eq('tenant_id', tenantId);

    const pedidosFiltrados = fechaDesde ? pedidosQuery.gte('fecha', fechaDesde) : pedidosQuery;
    const pedidosResult = fechaHasta ? pedidosFiltrados.lte('fecha', fechaHasta) : pedidosFiltrados;

    const { data: pedidos, error: pedidosError } = await pedidosResult;
    if (pedidosError) throw pedidosError;

    const pedidoIds = (pedidos || []).map((pedido) => pedido.id);
    if (pedidoIds.length === 0) {
      return {
        habilitado: true,
        resumen: {
          pedidosAnalizados: 0,
          pedidosEntregados: 0,
          totalSolicitado: 0,
          totalEntregado: 0,
          fillRate: 0,
          otif: 0,
          pedidosConBackorder: 0,
          unidadesPendientesBackorder: 0,
        },
        incidencias: {
          pedidosSinEntrega: 0,
          pedidosFueraSla: 0,
        },
        detalle: [],
        backorders: {
          pedidosConPendiente: 0,
          unidadesPendientes: 0,
          topPrioritarios: [],
        },
        objetivoOtif: dashboardConfig.objetivo_otif,
        frecuenciaActualizacion: dashboardConfig.frecuencia_actualizacion_dashboards,
      };
    }

    const [detallePedidoResult, movimientosResult, backordersResult] = await Promise.all([
      client
        .from('pedidos_venta_detalle')
        .select('pedido_id, cantidad')
        .in('pedido_id', pedidoIds),
      client
        .from('movimientos_inventario')
        .select('referencia_id, cantidad, created_at')
        .eq('tenant_id', tenantId)
        .eq('referencia_tipo', 'PEDIDO')
        .eq('tipo', 'SALIDA')
        .in('referencia_id', pedidoIds),
      client
        .from('pedido_backorders')
        .select('pedido_id, detalle_id, cantidad_pendiente, prioridad, proxima_fecha_compromiso, estado')
        .eq('tenant_id', tenantId)
        .in('pedido_id', pedidoIds),
    ]);

    if (detallePedidoResult.error) throw detallePedidoResult.error;
    if (movimientosResult.error) throw movimientosResult.error;
    if (backordersResult.error) throw backordersResult.error;

    const solicitadoPorPedido = this.agruparCantidadPorId(
      detallePedidoResult.data || [],
      'pedido_id',
      'cantidad',
    );

    const entregadoPorPedido = this.agruparCantidadPorId(
      movimientosResult.data || [],
      'referencia_id',
      'cantidad',
    );

    const backordersRaw = backordersResult.data || [];
    const backordersPorPedido = new Map<string, Array<{
      detalle_id: string;
      cantidad_pendiente: number;
      prioridad: number;
      proxima_fecha_compromiso: string | null;
      estado: string;
    }>>();

    let unidadesBackorder = 0;

    backordersRaw.forEach((item) => {
      const pendiente = Number(item.cantidad_pendiente ?? 0);
      unidadesBackorder += pendiente;

      const payload = {
        detalle_id: item.detalle_id,
        cantidad_pendiente: pendiente,
        prioridad: item.prioridad ?? 3,
        proxima_fecha_compromiso: item.proxima_fecha_compromiso ?? null,
        estado: item.estado,
      };

      const lista = backordersPorPedido.get(item.pedido_id) ?? [];
      lista.push(payload);
      backordersPorPedido.set(item.pedido_id, lista);
    });

    const backordersDetalleGlobal: Array<{
      pedido_id: string;
      pedido_numero: string;
      detalle_id: string;
      cantidad_pendiente: number;
      prioridad: number;
      proxima_fecha_compromiso: string | null;
      estado: string;
    }> = [];

    let totalSolicitado = 0;
    let totalEntregado = 0;
    let pedidosEntregados = 0;
    let pedidosFueraSla = 0;

    const ordenarPendientes = (a: { prioridad: number; proxima_fecha_compromiso: string | null }, b: { prioridad: number; proxima_fecha_compromiso: string | null }) => {
      if (a.prioridad !== b.prioridad) {
        return a.prioridad - b.prioridad;
      }
      if (a.proxima_fecha_compromiso && b.proxima_fecha_compromiso) {
        return a.proxima_fecha_compromiso.localeCompare(b.proxima_fecha_compromiso);
      }
      if (a.proxima_fecha_compromiso) return -1;
      if (b.proxima_fecha_compromiso) return 1;
      return 0;
    };

    const detalle = (pedidos || []).map((pedido) => {
      const solicitado = solicitadoPorPedido.get(pedido.id) ?? 0;
      const entregado = entregadoPorPedido.get(pedido.id) ?? 0;
      const fillRate = solicitado > 0 ? entregado / solicitado : 0;

      totalSolicitado += solicitado;
      totalEntregado += entregado;
      if (entregado > 0) {
        pedidosEntregados += 1;
      }

      let diasHastaEntrega: number | null = null;
      let dentroDeSla: boolean | null = null;

      if (pedido.tracking_estado === 'ENTREGADO' && pedido.tracking_actualizado_en) {
        const fechaPedido = new Date(pedido.fecha);
        const fechaEntrega = new Date(pedido.tracking_actualizado_en);
        diasHastaEntrega = Math.max(
          Math.floor((fechaEntrega.getTime() - fechaPedido.getTime()) / (1000 * 60 * 60 * 24)),
          0,
        );
        dentroDeSla = diasHastaEntrega <= SLA_DIAS;
      }

      if (dentroDeSla === false) {
        pedidosFueraSla += 1;
      }

      const pendientesPedidoBase = backordersPorPedido.get(pedido.id) ?? [];
      const pendientesPedido = pendientesPedidoBase
        .map((item) => ({
          pedido_id: pedido.id,
          pedido_numero: pedido.numero,
          detalle_id: item.detalle_id,
          cantidad_pendiente: item.cantidad_pendiente,
          prioridad: item.prioridad,
          proxima_fecha_compromiso: item.proxima_fecha_compromiso,
          estado: item.estado,
        }))
        .sort(ordenarPendientes);

      pendientesPedido.forEach((entry) => backordersDetalleGlobal.push(entry));

      const pendienteTotalPedido = pendientesPedido.reduce(
        (acc, current) => acc + current.cantidad_pendiente,
        0,
      );

      const proximosCompromisos = pendientesPedido.slice(0, 3);

      return {
        pedido_id: pedido.id,
        numero: pedido.numero,
        estado: pedido.estado,
        solicitado,
        entregado,
        fillRate: this.round2(fillRate * 100),
        tracking_estado: pedido.tracking_estado ?? null,
        diasHastaEntrega,
        dentroDeSla,
        pendiente_backorder_total: this.round2(pendienteTotalPedido),
        pendientes_backorder: proximosCompromisos,
      };
    });

    const fillRateGlobal = totalSolicitado > 0 ? totalEntregado / totalSolicitado : 0;
    const otif =
      pedidosEntregados > 0 ? (pedidosEntregados - pedidosFueraSla) / pedidosEntregados : 0;

    const pedidosSinEntrega = (detalles: any[]) =>
      detalles.filter((item) => item.entregado === 0).length;

    const pedidosConBackorder = backordersPorPedido.size;

    const topBackorders = backordersDetalleGlobal
      .sort((a, b) => {
        const prioridadDiff = a.prioridad - b.prioridad;
        if (prioridadDiff !== 0) return prioridadDiff;
        if (a.proxima_fecha_compromiso && b.proxima_fecha_compromiso) {
          return a.proxima_fecha_compromiso.localeCompare(b.proxima_fecha_compromiso);
        }
        if (a.proxima_fecha_compromiso) return -1;
        if (b.proxima_fecha_compromiso) return 1;
        return 0;
      })
      .slice(0, 15);

    return {
      habilitado: true,
      resumen: {
        pedidosAnalizados: pedidos?.length ?? 0,
        pedidosEntregados,
        totalSolicitado: this.round2(totalSolicitado),
        totalEntregado: this.round2(totalEntregado),
        fillRate: this.round2(fillRateGlobal * 100),
        otif: this.round2(otif * 100),
        pedidosConBackorder,
        unidadesPendientesBackorder: this.round2(unidadesBackorder),
      },
      incidencias: {
        pedidosSinEntrega: pedidosSinEntrega(detalle),
        pedidosFueraSla,
      },
      detalle: detalle
        .sort((a, b) => a.fillRate - b.fillRate)
        .slice(0, 25),
      backorders: {
        pedidosConPendiente: pedidosConBackorder,
        unidadesPendientes: this.round2(unidadesBackorder),
        topPrioritarios: topBackorders,
      },
      objetivoOtif: dashboardConfig.objetivo_otif,
      frecuenciaActualizacion: dashboardConfig.frecuencia_actualizacion_dashboards,
    };
  }

  /**
   * Aging de cuentas por cobrar
   * Requirements: 16.7 extendido
   */
  async getAgingCxc(
    tenantId: string,
    fechaDesde?: string,
    fechaHasta?: string,
  ) {
    const client = this.supabase.getClient();

    let query = client
      .from('cuentas_por_cobrar')
      .select(
        `
        id,
        cliente_id,
        serie,
        numero,
        fecha_emision,
        fecha_vencimiento,
        estado,
        monto_pendiente,
        clientes!cuentas_por_cobrar_cliente_id_fkey!inner(razon_social, documento_numero:codigo)
      `,
      )
      .eq('tenant_id', tenantId)
      .neq('estado', 'CANCELADO');

    if (fechaDesde) {
      query = query.gte('fecha_emision', fechaDesde);
    }
    if (fechaHasta) {
      query = query.lte('fecha_emision', fechaHasta);
    }

    const { data: cuentas, error } = await query;
    if (error) throw error;

    const hoy = new Date();
    let totalPendiente = 0;
    let totalVencido = 0;

    const bucketMap = new Map<string, { nombre: string; rango: string; monto: number }>();
    const registrarBucket = (id: string, nombre: string, rango: string) => {
      if (!bucketMap.has(id)) {
        bucketMap.set(id, { nombre, rango, monto: 0 });
      }
    };

    registrarBucket('corriente', 'Al día', '≤ 0 días');
    registrarBucket('b30', '1 - 30 días', '1 a 30 días');
    registrarBucket('b60', '31 - 60 días', '31 a 60 días');
    registrarBucket('b90', '61 - 90 días', '61 a 90 días');
    registrarBucket('b120', 'Más de 90 días', '> 90 días');

    const cuentasDetalladas = (cuentas || []).map((cuenta) => {
      const monto = Number(cuenta.monto_pendiente ?? 0);
      totalPendiente += monto;

      const fechaVenc = cuenta.fecha_vencimiento ? new Date(cuenta.fecha_vencimiento) : null;
      const diasEnMora =
        fechaVenc != null
          ? Math.floor((hoy.getTime() - fechaVenc.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

      const bucketId = this.definirBucketAging(diasEnMora);
      const bucket = bucketMap.get(bucketId);
      if (bucket) {
        bucket.monto += monto;
      }

      if (diasEnMora > 0) {
        totalVencido += monto;
      }

      return {
        id: cuenta.id,
        cliente: (cuenta.clientes as any)?.razon_social ?? 'Cliente sin razón social',
        documento: [cuenta.serie, cuenta.numero].filter(Boolean).join('-') || cuenta.id,
        monto: this.round2(monto),
        diasMora: diasEnMora > 0 ? diasEnMora : 0,
        estado: cuenta.estado,
        cliente_documento: (cuenta.clientes as any)?.documento_numero ?? null,
      };
    });

    const buckets = Array.from(bucketMap.values()).map((bucket) => ({
      ...bucket,
      monto: this.round2(bucket.monto),
      porcentaje:
        totalPendiente > 0 ? this.round2((bucket.monto / totalPendiente) * 100) : 0,
    }));

    const resumen = {
      totalPendiente: this.round2(totalPendiente),
      totalVencido: this.round2(totalVencido),
      porcentajeVencido:
        totalPendiente > 0 ? this.round2((totalVencido / totalPendiente) * 100) : 0,
      cuentasAnalizadas: cuentas?.length ?? 0,
    };

    const cuentasCriticas = cuentasDetalladas
      .filter((cuenta) => cuenta.diasMora > 0)
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 15);

    const saldoPorCliente = this.agruparMontosPorClave(
      cuentasDetalladas,
      (cuenta) => cuenta.cliente,
      (cuenta) => cuenta.monto,
    );

    return {
      resumen,
      buckets,
      cuentasCriticas,
      saldoPorCliente: saldoPorCliente
        .map((item) => ({
          cliente: item.clave,
          monto: this.round2(item.monto),
          porcentaje:
            totalPendiente > 0 ? this.round2((item.monto / totalPendiente) * 100) : 0,
        }))
        .slice(0, 15),
    };
  }

  /**
   * KPIs SUNAT (rechazos / observados)
   * Requirements: 16.7 extendido
   */
  async getSunatMetricas(
    tenantId: string,
    fechaDesde?: string,
    fechaHasta?: string,
  ) {
    const client = this.supabase.getClient();
    const dashboardConfig = await this.obtenerConfigDashboards(tenantId);

    if (!dashboardConfig.habilitar_dashboards_sunat) {
      return {
        habilitado: false,
        total: 0,
        aceptados: 0,
        observados: 0,
        rechazados: 0,
        pendientes: 0,
        tasaRechazo: 0,
        tasaObservacion: 0,
        incidencias: [],
        tendencia: [],
        frecuenciaActualizacion: dashboardConfig.frecuencia_actualizacion_dashboards,
      };
    }

    let kpiQuery = client
      .from('v_kpis_sunat_multitenant')
      .select('periodo, aceptados, observados, rechazados, pendientes, total')
      .eq('tenant_id', tenantId)
      .order('periodo', { ascending: true });

    if (fechaDesde) {
      kpiQuery = kpiQuery.gte('periodo', fechaDesde);
    }
    if (fechaHasta) {
      kpiQuery = kpiQuery.lte('periodo', fechaHasta);
    }

    const { data: kpis, error: kpiError } = await kpiQuery;
    if (kpiError) {
      throw kpiError;
    }

    let total = 0;
    let aceptados = 0;
    let observados = 0;
    let rechazados = 0;
    let pendientes = 0;

    (kpis || []).forEach((row) => {
      total += Number(row.total ?? 0);
      aceptados += Number(row.aceptados ?? 0);
      observados += Number(row.observados ?? 0);
      rechazados += Number(row.rechazados ?? 0);
      pendientes += Number(row.pendientes ?? 0);
    });

    const tendencia = (kpis || []).map((row) => ({
      periodo: row.periodo,
      aceptados: Number(row.aceptados ?? 0),
      observados: Number(row.observados ?? 0),
      rechazados: Number(row.rechazados ?? 0),
      pendientes: Number(row.pendientes ?? 0),
      total: Number(row.total ?? 0),
    }));

    let documentosQuery = client
      .from('documentos')
      .select('id, serie, numero, estado, fecha_emision, error_sunat, tipo_documento')
      .eq('tenant_id', tenantId)
      .in('tipo_documento', ['FACTURA', 'BOLETA', 'NOTA_CREDITO']);

    if (fechaDesde) {
      documentosQuery = documentosQuery.gte('fecha_emision', fechaDesde);
    }
    if (fechaHasta) {
      documentosQuery = documentosQuery.lte('fecha_emision', fechaHasta);
    }

    const { data: documentos, error: docError } = await documentosQuery;
    if (docError) {
      throw docError;
    }

    const incidencias = (documentos || [])
      .filter((doc) => doc.estado === 'RECHAZADO' || doc.estado === 'OBSERVADO')
      .sort((a, b) => {
        const fechaA = a.fecha_emision ? new Date(a.fecha_emision).getTime() : 0;
        const fechaB = b.fecha_emision ? new Date(b.fecha_emision).getTime() : 0;
        return fechaB - fechaA;
      })
      .slice(0, 20)
      .map((doc) => ({
        id: doc.id,
        documento: [doc.serie, doc.numero].filter(Boolean).join('-') || doc.id,
        estado: doc.estado,
        fecha: doc.fecha_emision,
        error: doc.error_sunat ?? null,
        tipo_documento: doc.tipo_documento,
      }));

    const tasa = (cantidad: number) => (total > 0 ? this.round2((cantidad / total) * 100) : 0);

    return {
      habilitado: true,
      total,
      aceptados,
      observados,
      rechazados,
      pendientes,
      tasaRechazo: tasa(rechazados),
      tasaObservacion: tasa(observados),
      incidencias,
      tendencia,
      frecuenciaActualizacion: dashboardConfig.frecuencia_actualizacion_dashboards,
    };
  }

  private async obtenerConfigDashboards(tenantId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('empresa_config')
      .select(
        'habilitar_dashboards_otif, objetivo_otif, habilitar_dashboards_sunat, frecuencia_actualizacion_dashboards',
      )
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error || !data) {
      return {
        habilitar_dashboards_otif: true,
        objetivo_otif: 95,
        habilitar_dashboards_sunat: true,
        frecuencia_actualizacion_dashboards: 60,
      };
    }

    return {
      habilitar_dashboards_otif: data.habilitar_dashboards_otif ?? true,
      objetivo_otif: data.objetivo_otif ?? 95,
      habilitar_dashboards_sunat: data.habilitar_dashboards_sunat ?? true,
      frecuencia_actualizacion_dashboards: data.frecuencia_actualizacion_dashboards ?? 60,
    };
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private contarPorEstado(data: any[] | null | undefined, field: string): Record<string, number> {
    const resultado: Record<string, number> = {};
    (data || []).forEach((item) => {
      const estado = item?.[field] ?? 'DESCONOCIDO';
      resultado[estado] = (resultado[estado] ?? 0) + 1;
    });
    return resultado;
  }

  private agruparPorPeriodo(data: {
    cotizaciones: any[];
    pedidos: any[];
    facturas: any[];
  }) {
    const map = new Map<
      string,
      {
        periodo: string;
        cotizaciones: number;
        pedidos: number;
        facturas: number;
      }
    >();

    const registrar = (
      items: any[],
      campoFecha: string,
      campoIncremento: 'cotizaciones' | 'pedidos' | 'facturas',
    ) => {
      (items || []).forEach((item) => {
        const fechaBase = item?.[campoFecha] ? new Date(item[campoFecha]) : new Date();
        const key = `${fechaBase.getFullYear()}-${String(fechaBase.getMonth() + 1).padStart(
          2,
          '0',
        )}`;
        if (!map.has(key)) {
          map.set(key, {
            periodo: key,
            cotizaciones: 0,
            pedidos: 0,
            facturas: 0,
          });
        }
        const registro = map.get(key);
        if (registro) {
          registro[campoIncremento] += 1;
        }
      });
    };

    registrar(data.cotizaciones || [], 'fecha', 'cotizaciones');
    registrar(data.pedidos || [], 'fecha', 'pedidos');
    registrar(data.facturas || [], 'fecha_emision', 'facturas');

    return Array.from(map.values()).sort((a, b) => (a.periodo < b.periodo ? -1 : 1));
  }

  private agruparCantidadPorId(
    items: any[],
    campoId: string,
    campoCantidad: string,
  ): Map<string, number> {
    const map = new Map<string, number>();
    (items || []).forEach((item) => {
      const id = item?.[campoId];
      if (!id) return;
      const valor = Number(item?.[campoCantidad] ?? 0);
      map.set(id, (map.get(id) ?? 0) + valor);
    });
    return map;
  }

  private definirBucketAging(diasMora: number): string {
    if (diasMora <= 0) return 'corriente';
    if (diasMora <= 30) return 'b30';
    if (diasMora <= 60) return 'b60';
    if (diasMora <= 90) return 'b90';
    return 'b120';
  }

  private agruparMontosPorClave<T>(
    items: T[],
    getClave: (item: T) => string,
    getMonto: (item: T) => number,
  ): Array<{ clave: string; monto: number }> {
    const acumulado = new Map<string, number>();
    items.forEach((item) => {
      const clave = getClave(item);
      const monto = getMonto(item);
      acumulado.set(clave, (acumulado.get(clave) ?? 0) + monto);
    });

    return Array.from(acumulado.entries())
      .map(([clave, monto]) => ({ clave, monto }))
      .sort((a, b) => b.monto - a.monto);
  }

  private agruparSunatPorPeriodo(documentos: any[]) {
    const mapa = new Map<
      string,
      {
        periodo: string;
        aceptados: number;
        rechazados: number;
        observados: number;
        pendientes: number;
      }
    >();

    (documentos || []).forEach((doc) => {
      const fecha = doc.fecha_emision ? new Date(doc.fecha_emision) : new Date();
      const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      if (!mapa.has(key)) {
        mapa.set(key, {
          periodo: key,
          aceptados: 0,
          rechazados: 0,
          observados: 0,
          pendientes: 0,
        });
      }

      const registro = mapa.get(key);
      if (!registro) return;

      switch (doc.estado) {
        case 'ACEPTADO':
          registro.aceptados += 1;
          break;
        case 'RECHAZADO':
          registro.rechazados += 1;
          break;
        case 'OBSERVADO':
          registro.observados += 1;
          break;
        default:
          registro.pendientes += 1;
          break;
      }
    });

    return Array.from(mapa.values()).sort((a, b) => (a.periodo < b.periodo ? -1 : 1));
  }
}
