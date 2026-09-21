import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { paisDelTenant } from '../../../shared/utils/fecha-tenant.util';
import { fechaDeDocumentoEnPais, zonaHorariaDePais } from '../../../shared/utils/fecha-peru.util';

/**
 * ReportesService
 * Servicio para generar reportes y estadísticas de ventas
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
 */
@Injectable()
export class ReportesService {
  constructor(private readonly supabase: SupabaseService) {}

  private async allReportRows(query: any): Promise<any[]> {
    const rows: any[] = [];
    const ordered = query.order('id');
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await ordered.range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) return rows;
    }
  }

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
        moneda,
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

    const pedidos = await this.allReportRows(query);

    // Agrupar por cliente
    const grouped = pedidos.reduce((acc, pedido) => {
      const moneda = String(pedido.moneda || '').toUpperCase();
      const clienteId = `${pedido.cliente_id}:${moneda}`;
      if (!acc[clienteId]) {
        acc[clienteId] = {
          cliente_id: pedido.cliente_id,
          cliente_nombre: (pedido.clientes as any).razon_social,
          cliente_documento: (pedido.clientes as any).documento_numero,
          periodo: `${fechaDesde || 'Inicio'} - ${fechaHasta || 'Hoy'}`,
          moneda,
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
        moneda,
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

    const cotizaciones = await this.allReportRows(query);

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
        moneda: String(cot.moneda || '').toUpperCase(),
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
      .select(clienteFiltro ? 'estado,total,moneda,clientes!pedidos_venta_cliente_id_fkey!inner(razon_social)' : 'estado,total,moneda')
      .eq('tenant_id', tenantId);
    if (clienteFiltro) query = query.ilike('clientes.razon_social', `%${clienteFiltro}%`);

    if (fechaDesde) {
      query = query.gte('fecha', fechaDesde);
    }
    if (fechaHasta) {
      query = query.lte('fecha', fechaHasta);
    }

    const pedidos = await this.allReportRows(query);

    // La selección condicional sólo añade la relación utilizada por el filtro.
    const grouped = pedidos.reduce((acc, pedido) => {
      const moneda = String(pedido.moneda || '').toUpperCase();
      const estado = `${pedido.estado}:${moneda}`;
      if (!acc[estado]) {
        acc[estado] = {
          estado: pedido.estado,
          moneda,
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
        pedido_id,
        producto_id,
        descripcion,
        cantidad,
        precio_unitario,
        subtotal,
        productos!pedidos_venta_detalle_producto_id_fkey(codigo),
        pedidos_venta!pedidos_venta_detalle_pedido_id_fkey!inner (
          tenant_id,
          fecha,
          moneda,
          estado${clienteFiltro ? ', clientes!pedidos_venta_cliente_id_fkey!inner(razon_social)' : ''}
        )
      `)
      .eq('pedidos_venta.tenant_id', tenantId)
      .in('pedidos_venta.estado', ['FACTURADO', 'COMPLETADO', 'COMPLETADO_CON_GRE']);
    if (clienteFiltro) query = query.ilike('pedidos_venta.clientes.razon_social', `%${clienteFiltro}%`);

    if (fechaDesde) {
      query = query.gte('pedidos_venta.fecha', fechaDesde);
    }
    if (fechaHasta) {
      query = query.lte('pedidos_venta.fecha', fechaHasta);
    }

    const detalles = await this.allReportRows(query);

    // Agrupar por producto
    const grouped = detalles.reduce((acc, detalle) => {
      const moneda = String((detalle.pedidos_venta as any)?.moneda || '').toUpperCase();
      const productoId = `${detalle.producto_id}:${moneda}`;
      if (!acc[productoId]) {
        acc[productoId] = {
          producto_id: detalle.producto_id,
          moneda,
          producto_nombre: detalle.descripcion,
          producto_codigo: (detalle.productos as any)?.codigo || '',
          unidades_vendidas: 0,
          importe_total: 0,
          cantidad_pedidos: 0,
          pedidos: new Set<string>(),
        };
      }

      acc[productoId].unidades_vendidas += Number(detalle.cantidad);
      acc[productoId].importe_total += Number(detalle.subtotal);
      acc[productoId].pedidos.add(detalle.pedido_id);
      acc[productoId].cantidad_pedidos = acc[productoId].pedidos.size;

      return acc;
    }, {});

    return Object.values(grouped).map((item: any) => ({
      producto_id: item.producto_id,
      moneda: item.moneda,
      producto_nombre: item.producto_nombre,
      producto_codigo: item.producto_codigo,
      unidades_vendidas: item.unidades_vendidas,
      importe_total: item.importe_total,
      cantidad_pedidos: item.cantidad_pedidos,
      precio_promedio: item.unidades_vendidas > 0 ? item.importe_total / item.unidades_vendidas : 0,
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
        moneda,
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

    const pedidos = await this.allReportRows(query);

    // Agrupar por cliente
    const grouped = pedidos.reduce((acc, pedido) => {
      const moneda = String(pedido.moneda || '').toUpperCase();
      const clienteId = `${pedido.cliente_id}:${moneda}`;
      if (!acc[clienteId]) {
        acc[clienteId] = {
          cliente_id: pedido.cliente_id,
          moneda,
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

    const totales: Record<string, number> = {};
    for (const item of Object.values(grouped) as any[]) {
      totales[item.moneda] = (totales[item.moneda] || 0) + Number(item.total_facturacion);
    }

    const result = Object.values(grouped)
      .map((item: any) => ({
        ...item,
        ticket_promedio: Number(item.total_facturacion) / item.cantidad_pedidos,
        porcentaje_total: totales[item.moneda] > 0 ? (Number(item.total_facturacion) / totales[item.moneda]) * 100 : 0,
      }))
      .sort((a: any, b: any) => a.moneda.localeCompare(b.moneda) || Number(b.total_facturacion) - Number(a.total_facturacion));
    const porMoneda: Record<string, number> = {};

    return result.filter(item => (porMoneda[item.moneda] = (porMoneda[item.moneda] || 0) + 1) <= limit);
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
    for (const value of [fechaDesde, fechaHasta]) {
      const parts = value?.split('-').map(Number);
      const parsed = value ? new Date(value) : null;
      if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !parsed || !Number.isFinite(parsed.getTime()) || parsed.getUTCFullYear() !== parts![0] || parsed.getUTCMonth() + 1 !== parts![1] || parsed.getUTCDate() !== parts![2])) {
        throw new BadRequestException('El período debe contener fechas válidas YYYY-MM-DD');
      }
    }
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) throw new BadRequestException('La fecha inicial no puede superar la fecha final');
    const client = this.supabase.getClient();
    const zona = zonaHorariaDePais(await paisDelTenant(client, tenantId));

    // Obtener pedidos con cotización asociada y facturados
    const query = client
      .from('pedidos_venta')
      .select(`
        id,
        fecha,
        factura_id,
        cotizacion_id,
        cotizaciones!pedidos_venta_cotizacion_id_fkey!inner (
          fecha
        )
      `)
      .eq('tenant_id', tenantId)
      .in('estado', ['FACTURADO', 'COMPLETADO', 'COMPLETADO_CON_GRE'])
      .not('cotizacion_id', 'is', null)
      .order('id');

    const pedidos: any[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await query.range(offset, offset + 999);
      if (error) throw error;
      pedidos.push(...(data || []));
      if (!data || data.length < 1000) break;
    }

    const facturaIds = [...new Set((pedidos || []).map(pedido => pedido.factura_id).filter(Boolean))];
    let comprobantes: { id: string; fecha_emision: string }[] = [];
    for (let offset = 0; offset < facturaIds.length; offset += 100) {
      const facturasQuery = client.from('cpe').select('id,fecha_emision')
        .eq('tenant_id', tenantId).in('id', facturaIds.slice(offset, offset + 100));
      const facturas = await facturasQuery;
      if (facturas.error) throw facturas.error;
      comprobantes.push(...(facturas.data || []));
    }
    // La misma regla que el listado CPE: medianoche UTC representa fecha pura;
    // los instantes históricos con hora se convierten a la zona del tenant.
    const fechasEmision = new Map(comprobantes.map(cpe => ({ id: cpe.id, fecha: fechaDeDocumentoEnPais(cpe.fecha_emision, zona) }))
      .filter(cpe => (!fechaDesde || cpe.fecha >= fechaDesde) && (!fechaHasta || cpe.fecha <= fechaHasta))
      .map(cpe => [cpe.id, cpe.fecha]));
    // factura_id apunta al CPE canónico; la fecha del pedido no es la emisión.
    const leadTimes = (pedidos || []).filter(pedido => fechasEmision.has(pedido.factura_id)).map(pedido => {
      const fecha = fechasEmision.get(pedido.factura_id)!;
      const fechaCot = new Date(fechaDeDocumentoEnPais((pedido.cotizaciones as any).fecha, zona));
      const fechaFactura = new Date(fecha);
      const dias = Math.ceil((fechaFactura.getTime() - fechaCot.getTime()) / 86400000);
      if (!Number.isFinite(dias) || dias < 0) throw new BadRequestException('Fechas inconsistentes entre cotización y comprobante');
      return { dias, fecha };
    });

    if (leadTimes.length === 0) {
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

    // Estadísticas
    const dias = leadTimes.map((lt) => lt.dias).sort((a, b) => a - b);
    const promedio = dias.reduce((sum, d) => sum + d, 0) / dias.length;
    const mitad = Math.floor(dias.length / 2);
    const mediana = dias.length % 2 ? dias[mitad] : (dias[mitad - 1] + dias[mitad]) / 2;
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

    const meses = new Map<string, { dias: number; cantidad: number }>();
    for (const item of leadTimes) {
      const mes = item.fecha.slice(0, 7);
      const acumulado = meses.get(mes) || { dias: 0, cantidad: 0 };
      acumulado.dias += item.dias;
      acumulado.cantidad += 1;
      meses.set(mes, acumulado);
    }
    const tendencia = [...meses].sort(([a], [b]) => a.localeCompare(b))
      .map(([periodo, acumulado]) => ({ periodo, promedio_dias: acumulado.dias / acumulado.cantidad }));

    return {
      promedio_dias: promedio,
      mediana_dias: mediana,
      minimo_dias: minimo,
      maximo_dias: maximo,
      total_conversiones: leadTimes.length,
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
        .select('id,total,estado,fecha,pedido_id', { count: 'exact' })
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

    // Regla de embudo: cada etapa se mide sobre la que la precede, no sobre
    // poblaciones distintas. Antes se dividian todas las facturas emitidas entre
    // los pedidos del periodo, y como el POS emite boletas que nunca nacieron de
    // un pedido el ratio superaba el 100% (21 facturas / 1 pedido = 2100%).
    const ESTADOS_PEDIDO_FACTURADO = ['FACTURADO', 'COMPLETADO', 'COMPLETADO_CON_GRE'];
    const cotizacionesPeriodo = cotizaciones || [];
    const pedidosPeriodo = pedidos || [];

    const idsPedidosFacturados = new Set(
      pedidosPeriodo
        .filter((pedido: any) =>
          ESTADOS_PEDIDO_FACTURADO.includes(String(pedido?.estado ?? '').toUpperCase()),
        )
        .map((pedido: any) => pedido.id),
    );
    const cotizacionesConvertidas = cotizacionesPeriodo.filter((cot: any) => cot?.pedido_id);
    const cotizacionesFacturadas = cotizacionesConvertidas.filter((cot: any) =>
      idsPedidosFacturados.has(cot.pedido_id),
    );

    const ratio = (parte: number, base: number) => (base > 0 ? this.round2((parte / base) * 100) : 0);

    const conversiones = {
      cotizaciones_a_pedidos: ratio(cotizacionesConvertidas.length, cotizacionesPeriodo.length),
      pedidos_a_facturas: ratio(idsPedidosFacturados.size, pedidosPeriodo.length),
      total: ratio(cotizacionesFacturadas.length, cotizacionesPeriodo.length),
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
    fechaCorte?: string,
    clienteFiltro?: string,
  ) {
    const corte = fechaCorte?.trim() || null;
    if (corte) {
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(corte)
        ? new Date(`${corte}T00:00:00.000Z`)
        : null;
      if (
        !parsed ||
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== corte
      ) {
        throw new BadRequestException('fechaCorte debe ser una fecha válida YYYY-MM-DD');
      }
    }

    const client = this.supabase.getClient();
    const { data, error } = await client.rpc('reporte_cxc_aging_470', {
      p_tenant_id: tenantId,
      p_fecha_corte: corte,
      p_cliente_filtro: clienteFiltro?.trim() || null,
      p_limit: 1000,
    });

    if (error) throw error;
    if (!data || typeof data !== 'object' || !Array.isArray((data as any).detalle)) {
      throw new Error('El reporte canónico de CxC devolvió una respuesta inválida');
    }

    return data;
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
