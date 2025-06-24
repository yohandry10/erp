import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EventBusService, VentaProcessedEvent, MovimientoStockEvent, CompraEntregadaEvent } from '../events/event-bus.service';

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
    this.initializeEventListeners();
  }

  private initializeEventListeners() {
    console.log('📦 [Inventario] Inicializando listeners de eventos...');
    
    this.eventBus.onVentaProcessed(async (event) => {
      console.log('📦 [Inventario] Procesando venta para actualizar stock...');
      await this.procesarVentaParaInventario(event.data);
    });

    this.eventBus.onCompraEntregada(async (event) => {
      console.log('📦 [Inventario] Procesando compra entregada para actualizar stock...');
      await this.procesarCompraParaInventario(event.data);
    });
  }

  async procesarVentaParaInventario(venta: VentaProcessedEvent): Promise<void> {
    try {
      console.log(`📦 Procesando venta ${venta.numeroTicket} para inventario`);

      for (const item of venta.items) {
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
        });
      }

      console.log(`✅ Stock actualizado para venta ${venta.numeroTicket}`);
    } catch (error) {
      console.error('❌ Error procesando venta para inventario:', error);
    }
  }

  async procesarCompraParaInventario(compra: CompraEntregadaEvent): Promise<void> {
    try {
      console.log(`📦 Procesando compra entregada ${compra.numeroOrden} para inventario`);

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
        });
      }

      console.log(`✅ Stock actualizado para compra ${compra.numeroOrden}`);
    } catch (error) {
      console.error('❌ Error procesando compra para inventario:', error);
    }
  }

  async realizarMovimientoStock(movimiento: MovimientoStock): Promise<string | null> {
    try {
      console.log(`📦 Realizando movimiento: ${movimiento.tipoMovimiento} - ${movimiento.cantidad} unidades de ${movimiento.productoId}`);

      // 1. Obtener producto por ID o código
      console.log(`🔍 Buscando producto con ID/código: ${movimiento.productoId}`);
      
      let producto = null;
      
      // Intentar buscar por ID primero (UUID) USANDO COLUMNAS EXACTAS
      if (movimiento.productoId && movimiento.productoId.length > 10) {
        const { data: productoPorId, error: errorPorId } = await this.supabase.getClient()
          .from('productos')
          .select('id, codigo, nombre, precio, stock, categoria, activo')
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
          .select('id, codigo, nombre, precio, stock, categoria, activo')
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
          .select('id, codigo, nombre, precio, stock, categoria, activo')
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
      const { error: updateError } = await this.supabase.getClient()
        .from('productos')
        .update({ 
          stock: nuevoStock
        })
        .eq('id', producto.id);

      if (updateError) {
        console.error('❌ Error actualizando stock del producto:', updateError);
        throw updateError;
      }

      // 4. Registrar el movimiento en histórico usando las columnas correctas según Supabase
      const { data: movimientoGuardado, error: movimientoError } = await this.supabase.getClient()
        .from('stock_movimientos')
        .insert({
          tenant_id: '550e8400-e29b-41d4-a716-446655440000',
          producto_id: producto.id, // Usar el ID del producto encontrado
          tipo_movimiento: movimiento.tipoMovimiento,
          cantidad: movimiento.cantidad,
          motivo: movimiento.motivo,
          referencia: movimiento.referencia || null,
          usuario_id: movimiento.usuarioId || '550e8400-e29b-41d4-a716-446655440000',
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

  async getProductosStock(): Promise<ProductoStock[]> {
    try {
      const { data: productos, error } = await this.supabase.getClient()
        .from('productos')
        .select('codigo, nombre, stock, stock_minimo, precio, categoria, activo')
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

  async getMovimientosStock(filtros: any = {}): Promise<any[]> {
    try {
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

  async getEstadisticasInventario() {
    try {
      const productos = await this.getProductosStock();
      
      const totalProductos = productos.length;
      const valorInventario = productos.reduce((sum, p) => sum + p.valorTotal, 0);
      const productosStockBajo = productos.filter(p => p.stockActual <= p.stockMinimo).length;
      const productosSinStock = productos.filter(p => p.stockActual <= 0).length;

      // Obtener movimientos de hoy
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const movimientosHoy = await this.getMovimientosStock({
        fechaDesde: hoy.toISOString(),
        limit: 1000
      });

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

  async ajustarStock(productoId: string, cantidadAjuste: number, motivo: string, usuarioId: string = 'system'): Promise<string | null> {
    try {
      console.log(`📦 Ajustando stock de ${productoId}: ${cantidadAjuste > 0 ? '+' : ''}${cantidadAjuste}`);

      // Obtener precio del producto para valorizar el ajuste
      const { data: producto } = await this.supabase.getClient()
        .from('productos')
        .select('precio')
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
      });
    } catch (error) {
      console.error('❌ Error ajustando stock:', error);
      throw error;
    }
  }

  async registrarEntrada(productoId: string, cantidad: number, precioUnitario: number, motivo: string, usuarioId: string = 'system'): Promise<string | null> {
    try {
      console.log(`📦 Registrando entrada: ${cantidad} unidades de ${productoId}`);

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
      });
    } catch (error) {
      console.error('❌ Error registrando entrada:', error);
      throw error;
    }
  }

  async getProductosStockCritico(): Promise<ProductoStock[]> {
    try {
      const productos = await this.getProductosStock();
      return productos.filter(p => p.stockActual <= p.stockMinimo);
    } catch (error) {
      console.error('❌ Error obteniendo productos con stock crítico:', error);
      return [];
    }
  }

  async getProductosSinStock(): Promise<ProductoStock[]> {
    try {
      const productos = await this.getProductosStock();
      return productos.filter(p => p.stockActual <= 0);
    } catch (error) {
      console.error('❌ Error obteniendo productos sin stock:', error);
      return [];
    }
  }

  async verificarDisponibilidadStock(productosVenta: { productoId: string, cantidad: number }[]): Promise<{ disponible: boolean, faltantes: any[] }> {
    try {
      const faltantes = [];
      
      for (const item of productosVenta) {
        const { data: producto } = await this.supabase.getClient()
          .from('productos')
          .select('stock, nombre')
          .eq('codigo', item.productoId)
          .single();

        if (!producto) {
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
        if (stockDisponible < item.cantidad) {
          faltantes.push({
            productoId: item.productoId,
            nombre: producto.nombre,
            solicitado: item.cantidad,
            disponible: stockDisponible,
            faltante: item.cantidad - stockDisponible,
            motivo: 'Stock insuficiente'
          });
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