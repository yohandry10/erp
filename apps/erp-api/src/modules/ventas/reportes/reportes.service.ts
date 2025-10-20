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
        clientes!inner (
          id,
          razon_social,
          documento_numero
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
          cliente_nombre: pedido.clientes.razon_social,
          cliente_documento: pedido.clientes.documento_numero,
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
        clientes!inner (
          razon_social,
          documento_numero
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
        cliente_nombre: cot.clientes.razon_social,
        cliente_documento: cot.clientes.documento_numero,
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
        pedidos_venta!inner (
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
        clientes!inner (
          razon_social,
          documento_numero
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
          cliente_nombre: pedido.clientes.razon_social,
          cliente_documento: pedido.clientes.documento_numero,
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
        porcentaje_total: totalFacturacion > 0 ? (Number(item.total_facturacion) / totalFacturacion) * 100 : 0,
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
        cotizaciones!inner (
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
      const fechaCot = new Date(pedido.cotizaciones.fecha);
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
}
