import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EventBusService, ERPEvent, VentaProcessedEvent, MovimientoStockEvent, CompraEntregadaEvent } from '../events/event-bus.service';

export interface MovimientoStock {
  id?: string;
  productoId: string;
  tipoMovimiento: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
  cantidad: number;
  stockAnterior: number;
  stockNuevo: number;
  motivo: string;
  precioUnitario: number;
  valorTotal: number;
  usuarioId: string;
  referencia?: string;
  ventaId?: string;
}

export interface ProductoStock {
  id: string;
  codigo: string;
  nombre: string;
  stockActual: number;
  stockMinimo: number;
  valorUnitario: number;
  valorTotal: number;
  categoria: string;
  activo: boolean;
}

@Injectable()
export class InventoryIntegrationService {
  
  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService
  ) {
    console.log('🏗️ [InventoryIntegrationService] Constructor llamado - inicializando...');
    this.initializeEventListeners();
    console.log('✅ [InventoryIntegrationService] Servicio de inventario listo y listeners registrados');
  }

  initializeEventListeners() {
    console.log('📦 [Inventario] Inicializando listeners de eventos...');
    
    this.eventBus.onVentaProcessed(async (event: ERPEvent) => {
        const data = event.data as VentaProcessedEvent;
        await this.procesarVentaParaInventario(data);
    });

    this.eventBus.onCompraEntregada(async (event: ERPEvent) => {
        const data = event.data as CompraEntregadaEvent;
        await this.procesarCompraParaInventario(data);
    });
}

  async procesarVentaParaInventario(venta: VentaProcessedEvent): Promise<void> {
    try {
      // ✅ MULTI-TENANT: Extraer tenant_id del evento
      const tenantId = venta.tenantId || '550e8400-e29b-41d4-a716-446655440000';
      
      console.log(`📦 [INVENTARIO] [Tenant: ${tenantId}] Procesando venta ${venta.numeroTicket} para inventario`);
      console.log(`📦 [INVENTARIO] Datos de venta:`, JSON.stringify(venta, null, 2));

      for (const item of venta.items) {
        console.log(`📦 [INVENTARIO] Procesando item: ${item.productoId} - cantidad: ${item.cantidad}`);
        
        await this.realizarMovimientoStock({
          productoId: item.productoId,
          tipoMovimiento: 'SALIDA',
          cantidad: item.cantidad,
          stockAnterior: 0, // Se calculará en el método
          stockNuevo: 0, // Se calculará en el método
          motivo: `Venta ${venta.numeroTicket}`,
          precioUnitario: item.precio,
          valorTotal: item.total,
          usuarioId: 'system',
          referencia: venta.numeroTicket,
          ventaId: venta.ventaId
        }, tenantId); // ✅ Pasar tenant_id
      }

      console.log(`✅ [INVENTARIO] Stock actualizado para venta ${venta.numeroTicket}`);
    } catch (error) {
      console.error('❌ [INVENTARIO] Error procesando venta para inventario:', error);
    }
  }

  async procesarCompraParaInventario(compra: CompraEntregadaEvent): Promise<void> {
    try {
      // ✅ MULTI-TENANT: Extraer tenant_id del evento
      const tenantId = compra.tenantId || '550e8400-e29b-41d4-a716-446655440000';
      
      console.log(`📦 [Tenant: ${tenantId}] Procesando compra entregada ${compra.numeroOrden} para inventario`);

      for (const item of compra.items) {
        await this.realizarMovimientoStock({
          productoId: item.productoId,
          tipoMovimiento: 'ENTRADA',
          cantidad: item.cantidad,
          stockAnterior: 0, // Se calculará en el método
          stockNuevo: 0, // Se calculará en el método
          motivo: `Compra ${compra.numeroOrden} - ${compra.proveedorNombre}`,
          precioUnitario: item.precioUnitario,
          valorTotal: item.total,
          usuarioId: 'system',
          referencia: compra.numeroOrden
        }, tenantId); // ✅ Pasar tenant_id
      }

      console.log(`✅ Stock actualizado para compra ${compra.numeroOrden}`);
    } catch (error) {
      console.error('❌ Error procesando compra para inventario:', error);
    }
  }

  async realizarMovimientoStock(movimiento: MovimientoStock, tenantId?: string): Promise<string | null> {
    try {
      // ✅ MULTI-TENANT: Usar tenant_id proporcionado o default
      const currentTenantId = tenantId || '550e8400-e29b-41d4-a716-446655440000';
      
      console.log(`📦 [Tenant: ${currentTenantId}] Realizando movimiento: ${movimiento.tipoMovimiento} - ${movimiento.cantidad} unidades de ${movimiento.productoId}`);

      // 1. Obtener producto por ID o código (CON FILTRO DE TENANT)
      console.log(`🔍 Buscando producto con ID/código: ${movimiento.productoId}`);
      
      let producto = null;
      
      // Intentar buscar por ID primero (UUID) USANDO COLUMNAS EXACTAS
      if (movimiento.productoId && movimiento.productoId.length > 10) {
        const { data: productoPorId, error: errorPorId } = await this.supabase.getClient()
          .from('productos')
          .select('id, codigo, nombre, precio, stock, categoria, activo, tenant_id')
          .eq('tenant_id', currentTenantId) // ✅ MULTI-TENANT: Filtrar por tenant
          .eq('id', movimiento.productoId)
          .single();

        if (!errorPorId && productoPorId) {
          console.log(`✅ Producto encontrado por ID:`, productoPorId);
          producto = productoPorId;
        }
      }
      
      // Si no encuentra por ID, buscar por código
      if (!producto) {
        const { data: productoPorCodigo, error: errorPorCodigo } = await this.supabase.getClient()
          .from('productos')
          .select('id, codigo, nombre, precio, stock, categoria, activo, tenant_id')
          .eq('tenant_id', currentTenantId) // ✅ MULTI-TENANT: Filtrar por tenant
          .eq('codigo', movimiento.productoId)
          .single();

        if (!errorPorCodigo && productoPorCodigo) {
          console.log(`✅ Producto encontrado por código:`, productoPorCodigo);
          producto = productoPorCodigo;
        }
      }
      
      // Si aún no encuentra, buscar por nombre
      if (!producto) {
        const { data: productoPorNombre, error: errorPorNombre } = await this.supabase.getClient()
          .from('productos')
          .select('id, codigo, nombre, precio, stock, categoria, activo, tenant_id')
          .eq('tenant_id', currentTenantId) // ✅ MULTI-TENANT: Filtrar por tenant
          .eq('nombre', movimiento.productoId)
          .single();

        if (!errorPorNombre && productoPorNombre) {
          console.log(`✅ Producto encontrado por nombre:`, productoPorNombre);
          producto = productoPorNombre;
        }
      }

      if (!producto) {
        console.error(`❌ Producto ${movimiento.productoId} no encontrado en ninguna búsqueda`);
        return null;
      }

      const stockActual = parseFloat(producto.stock || 0);
      movimiento.stockAnterior = stockActual;

      // 2. Calcular nuevo stock según tipo de movimiento
      let nuevoStock: number;
      switch (movimiento.tipoMovimiento) {
        case 'ENTRADA':
          nuevoStock = stockActual + movimiento.cantidad;
          break;
        case 'SALIDA':
          nuevoStock = stockActual - movimiento.cantidad;
          if (nuevoStock < 0) {
            console.warn(`⚠️ Stock negativo para ${movimiento.productoId}: ${nuevoStock}`);
            // Permitir stock negativo pero generar alerta
          }
          break;
        case 'AJUSTE':
          nuevoStock = stockActual + movimiento.cantidad; // cantidad puede ser negativa
          break;
        default:
          throw new Error(`Tipo de movimiento no válido: ${movimiento.tipoMovimiento}`);
      }

      movimiento.stockNuevo = nuevoStock;

      // 3. Actualizar stock en tabla productos (usar ID del producto encontrado)
      console.log(`📦 ACTUALIZANDO STOCK: producto.id=${producto.id}, stockActual=${stockActual}, nuevoStock=${nuevoStock}`);
      
      const { data: updateData, error: updateError } = await this.supabase.getClient()
        .from('productos')
        .update({ 
          stock: nuevoStock
        })
        .eq('id', producto.id)
        .select();

      if (updateError) {
        console.error('❌ Error actualizando stock del producto:', updateError);
        throw updateError;
      }

      console.log(`✅ STOCK ACTUALIZADO EXITOSAMENTE:`, updateData);
      
      // VERIFICACIÓN ADICIONAL - Leer de nuevo el producto para confirmar
      const { data: verificacion } = await this.supabase.getClient()
        .from('productos')
        .select('id, codigo, nombre, stock')
        .eq('id', producto.id)
        .single();
      
      console.log(`🔍 VERIFICACIÓN POST-UPDATE:`, verificacion);

      // 4. Registrar el movimiento en histórico usando las columnas correctas según Supabase
      const { data: movimientoGuardado, error: movimientoError } = await this.supabase.getClient()
        .from('stock_movimientos')
        .insert({
          tenant_id: currentTenantId, // ✅ MULTI-TENANT: Usar tenant actual
          producto_id: producto.id, // Usar el ID del producto encontrado
          tipo_movimiento: movimiento.tipoMovimiento,
          cantidad: movimiento.cantidad,
          motivo: movimiento.motivo,
          referencia: movimiento.referencia || null,
          usuario_id: 'sistema', // Usar string fijo para evitar problemas de foreign key
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (movimientoError) {
        console.error('❌ Error registrando movimiento de stock:', movimientoError);
        throw movimientoError;
      }

      // 5. Emitir evento para otros módulos (contabilidad, finanzas)
      this.eventBus.emitMovimientoStock({
        productoId: movimiento.productoId,
        tipoMovimiento: movimiento.tipoMovimiento,
        cantidad: movimiento.cantidad,
        stockAnterior: movimiento.stockAnterior,
        stockNuevo: movimiento.stockNuevo,
        motivo: movimiento.motivo,
        valor: movimiento.valorTotal,
        ventaId: movimiento.ventaId
      });

      console.log(`✅ Movimiento de stock registrado: ${movimientoGuardado.id}`);
      return movimientoGuardado.id;

    } catch (error) {
      console.error('❌ Error realizando movimiento de stock:', error);
      throw error;
    }
  }

  async getProductosStock(tenantId?: string): Promise<ProductoStock[]> {
    try {
      // ✅ MULTI-TENANT: Filtrar por tenant
      const currentTenantId = tenantId || '550e8400-e29b-41d4-a716-446655440000';
      
      const { data: productos, error } = await this.supabase.getClient()
        .from('productos')
        .select('codigo, nombre, stock, stock_minimo, precio, categoria, activo')
        .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
        .eq('activo', true)
        .order('nombre');

      if (error) throw error;

      return productos?.map(producto => ({
        id: producto.codigo,
        codigo: producto.codigo,
        nombre: producto.nombre,
        stockActual: parseFloat(producto.stock || 0),
        stockMinimo: parseFloat(producto.stock_minimo || 0),
        valorUnitario: parseFloat(producto.precio || 0),
        valorTotal: parseFloat(producto.stock || 0) * parseFloat(producto.precio || 0),
        categoria: producto.categoria,
        activo: producto.activo
      })) || [];
    } catch (error) {
      console.error('❌ Error obteniendo productos stock:', error);
      return [];
    }
  }

  async getMovimientosStock(filtros: any = {}, tenantId?: string): Promise<any[]> {
    try {
      // ✅ MULTI-TENANT: Filtrar por tenant
      const currentTenantId = tenantId || filtros.tenantId || '550e8400-e29b-41d4-a716-446655440000';
      
      let query = this.supabase.getClient()
        .from('stock_movimientos')
        .select(`
          id,
          tenant_id,
          producto_id,
          tipo_movimiento,
          cantidad,
          motivo,
          referencia,
          usuario_id,
          created_at
        `)
        .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
        .order('created_at', { ascending: false });

      if (filtros.productoId) {
        query = query.eq('producto_id', filtros.productoId);
      }

      if (filtros.tipoMovimiento) {
        query = query.eq('tipo_movimiento', filtros.tipoMovimiento);
      }

      if (filtros.fechaDesde) {
        query = query.gte('created_at', filtros.fechaDesde);
      }

      if (filtros.fechaHasta) {
        query = query.lte('created_at', filtros.fechaHasta);
      }

      const limit = filtros.limit ? parseInt(filtros.limit) : 50;
      query = query.limit(limit);

      const { data, error } = await query;
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Error obteniendo movimientos de stock:', error);
      return [];
    }
  }

  async getEstadisticasInventario(tenantId?: string) {
    try {
      // ✅ MULTI-TENANT: Pasar tenant a métodos internos
      const productos = await this.getProductosStock(tenantId);
      
      const totalProductos = productos.length;
      const valorInventario = productos.reduce((sum, p) => sum + p.valorTotal, 0);
      const productosStockBajo = productos.filter(p => p.stockActual <= p.stockMinimo).length;
      const productosSinStock = productos.filter(p => p.stockActual <= 0).length;

      // Obtener movimientos de hoy
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const movimientosHoy = await this.getMovimientosStock({
        fechaDesde: hoy.toISOString(),
        limit: 1000,
        tenantId // ✅ Pasar tenantId
      }, tenantId);

      const movimientosHoyCount = movimientosHoy.length;
      const entradasHoy = movimientosHoy.filter(m => m.tipo_movimiento === 'ENTRADA').length;
      const salidasHoy = movimientosHoy.filter(m => m.tipo_movimiento === 'SALIDA').length;

      return {
        totalProductos,
        valorInventario,
        productosStockBajo,
        productosSinStock,
        movimientosHoy: movimientosHoyCount,
        entradasHoy,
        salidasHoy,
        productosConStock: totalProductos - productosSinStock,
        rotacionPromedio: this.calcularRotacionPromedio(productos, movimientosHoy)
      };
    } catch (error) {
      console.error('❌ Error calculando estadísticas de inventario:', error);
      return {
        totalProductos: 0,
        valorInventario: 0,
        productosStockBajo: 0,
        productosSinStock: 0,
        movimientosHoy: 0,
        entradasHoy: 0,
        salidasHoy: 0,
        productosConStock: 0,
        rotacionPromedio: 0
      };
    }
  }

  private calcularRotacionPromedio(productos: ProductoStock[], movimientos: any[]): number {
    if (productos.length === 0) return 0;
    
    // Calcular rotación básica como salidas / stock promedio
    const totalSalidas = movimientos
      .filter(m => m.tipo_movimiento === 'SALIDA')
      .reduce((sum, m) => sum + parseFloat(m.cantidad || 0), 0);
    
    const stockPromedio = productos.reduce((sum, p) => sum + p.stockActual, 0) / productos.length;
    
    return stockPromedio > 0 ? totalSalidas / stockPromedio : 0;
  }

  async actualizarStockProducto(
    productoId: string, 
    cantidad: number, 
    tipoMovimiento: 'ENTRADA' | 'SALIDA' | 'AJUSTE', 
    motivo: string, 
    precioUnitario: number = 0, 
    usuarioId: string = 'system',
    tenantId?: string
  ): Promise<string | null> {
    return await this.realizarMovimientoStock({
      productoId,
      tipoMovimiento,
      cantidad,
      stockAnterior: 0, // Se calculará automáticamente
      stockNuevo: 0, // Se calculará automáticamente
      motivo,
      precioUnitario,
      valorTotal: cantidad * precioUnitario,
      usuarioId,
      referencia: motivo
    }, tenantId);
  }

  async ajustarStock(productoId: string, cantidadAjuste: number, motivo: string, usuarioId: string = 'system', tenantId?: string): Promise<string | null> {
    try {
      const currentTenantId = tenantId || '550e8400-e29b-41d4-a716-446655440000';
      console.log(`📦 [Tenant: ${currentTenantId}] Ajustando stock de ${productoId}: ${cantidadAjuste > 0 ? '+' : ''}${cantidadAjuste}`);

      // Obtener precio del producto para valorizar el ajuste
      const { data: producto } = await this.supabase.getClient()
        .from('productos')
        .select('precio')
        .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
        .eq('codigo', productoId)
        .single();

      const precioUnitario = parseFloat(producto?.precio || 0);
      const valorAjuste = Math.abs(cantidadAjuste) * precioUnitario;

      return await this.realizarMovimientoStock({
        productoId,
        tipoMovimiento: 'AJUSTE',
        cantidad: cantidadAjuste,
        stockAnterior: 0, // Se calculará automáticamente
        stockNuevo: 0, // Se calculará automáticamente
        motivo,
        precioUnitario,
        valorTotal: valorAjuste,
        usuarioId,
        referencia: `AJUSTE-${Date.now()}`
      }, currentTenantId);
    } catch (error) {
      console.error('❌ Error ajustando stock:', error);
      throw error;
    }
  }

  async registrarEntrada(productoId: string, cantidad: number, precioUnitario: number, motivo: string, usuarioId: string = 'system', tenantId?: string): Promise<string | null> {
    try {
      const currentTenantId = tenantId || '550e8400-e29b-41d4-a716-446655440000';
      console.log(`📦 [Tenant: ${currentTenantId}] Registrando entrada: ${cantidad} unidades de ${productoId}`);

      return await this.realizarMovimientoStock({
        productoId,
        tipoMovimiento: 'ENTRADA',
        cantidad,
        stockAnterior: 0, // Se calculará automáticamente
        stockNuevo: 0, // Se calculará automáticamente
        motivo,
        precioUnitario,
        valorTotal: cantidad * precioUnitario,
        usuarioId,
        referencia: `ENTRADA-${Date.now()}`
      }, currentTenantId);
    } catch (error) {
      console.error('❌ Error registrando entrada:', error);
      throw error;
    }
  }

  async getProductosStockCritico(tenantId?: string): Promise<ProductoStock[]> {
    try {
      const productos = await this.getProductosStock(tenantId);
      return productos.filter(p => p.stockActual <= p.stockMinimo);
    } catch (error) {
      console.error('❌ Error obteniendo productos con stock crítico:', error);
      return [];
    }
  }

  async getProductosSinStock(tenantId?: string): Promise<ProductoStock[]> {
    try {
      const productos = await this.getProductosStock(tenantId);
      return productos.filter(p => p.stockActual <= 0);
    } catch (error) {
      console.error('❌ Error obteniendo productos sin stock:', error);
      return [];
    }
  }

  async verificarDisponibilidadStock(productosVenta: { productoId: string, cantidad: number }[], tenantId?: string): Promise<{ disponible: boolean, faltantes: any[] }> {
    try {
      const currentTenantId = tenantId || '550e8400-e29b-41d4-a716-446655440000';
      console.log(`🔍 [Tenant: ${currentTenantId}] Verificando disponibilidad de stock para:`, productosVenta);
      const faltantes = [];
      
      for (const item of productosVenta) {
        console.log(`📦 Verificando producto: ${item.productoId} (cantidad: ${item.cantidad})`);
        
        // Buscar por ID primero (UUID), luego por código
        let producto = null;
        
        // Intentar por ID (UUID)
        if (item.productoId && item.productoId.length > 10) {
          const { data: productoPorId } = await this.supabase.getClient()
            .from('productos')
            .select('stock, nombre, codigo')
            .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
            .eq('id', item.productoId)
            .single();
          
          if (productoPorId) {
            console.log(`✅ Producto encontrado por ID:`, productoPorId);
            producto = productoPorId;
          }
        }
        
        // Si no se encontró por ID, buscar por código
        if (!producto) {
          const { data: productoPorCodigo } = await this.supabase.getClient()
            .from('productos')
            .select('stock, nombre, codigo')
            .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
            .eq('codigo', item.productoId)
            .single();
          
          if (productoPorCodigo) {
            console.log(`✅ Producto encontrado por código:`, productoPorCodigo);
            producto = productoPorCodigo;
          }
        }

        if (!producto) {
          console.log(`❌ Producto no encontrado: ${item.productoId}`);
          faltantes.push({
            productoId: item.productoId,
            solicitado: item.cantidad,
            disponible: 0,
            faltante: item.cantidad,
            motivo: 'Producto no encontrado'
          });
          continue;
        }

        const stockDisponible = parseFloat(producto.stock || 0);
        console.log(`📊 Stock disponible: ${stockDisponible}, solicitado: ${item.cantidad}`);
        
        if (stockDisponible < item.cantidad) {
          console.log(`❌ Stock insuficiente para ${producto.nombre}: disponible ${stockDisponible}, solicitado ${item.cantidad}`);
          faltantes.push({
            productoId: item.productoId,
            nombre: producto.nombre,
            solicitado: item.cantidad,
            disponible: stockDisponible,
            faltante: item.cantidad - stockDisponible,
            motivo: 'Stock insuficiente'
          });
        } else {
          console.log(`✅ Stock suficiente para ${producto.nombre}: disponible ${stockDisponible}, solicitado ${item.cantidad}`);
        }
      }

      return {
        disponible: faltantes.length === 0,
        faltantes
      };
    } catch (error) {
      console.error('❌ Error verificando disponibilidad de stock:', error);
      return {
        disponible: false,
        faltantes: [{ motivo: 'Error verificando stock', error: error.message }]
      };
    }
  }
}