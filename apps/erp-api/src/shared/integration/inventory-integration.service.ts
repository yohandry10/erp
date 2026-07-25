import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EventBusService, ERPEvent, VentaProcessedEvent, MovimientoStockEvent, CompraEntregadaEvent } from '../events/event-bus.service';
import { TenantContextService } from '../tenant/tenant-context.service';

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
  almacenId?: string;
  almacen_id?: string;
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
  private readonly logger = new Logger(InventoryIntegrationService.name); // HARDENING: centraliza trazabilidad cross-módulo.
  
  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly tenantContext: TenantContextService,
  ) {
    this.logger.log('🏗️ [InventoryIntegrationService] Constructor inicializado'); // HARDENING: evita console.log global.
    this.initializeEventListeners();
    this.logger.log('✅ [InventoryIntegrationService] Listeners registrados'); // HARDENING: registra readiness.
  }
  private resolveTenantId(tenantId?: string): string {
    const contextTenant = tenantId ?? this.tenantContext.getTenantId();
    if (!contextTenant) {
      // HARDENING: todo movimiento de inventario requiere tenant.
      throw new BadRequestException('Tenant requerido para operaciones de inventario');
    }
    return contextTenant;
  }

  initializeEventListeners() {
    this.logger.log('📦 [Inventario] Inicializando listeners de eventos...'); // HARDENING: audit trail listeners.
    
    this.eventBus.onVentaProcessed(async (event: ERPEvent) => {
        const data = event.data as VentaProcessedEvent;
        await this.procesarVentaParaInventario(data);
    });

    this.eventBus.onCompraEntregada(async (event: ERPEvent) => {
        const data = event.data as CompraEntregadaEvent;
        await this.procesarCompraParaInventario(data);
    });
}

  private formatError(error: unknown): string { // HARDENING: estandariza serialización segura de errores.
    if (!error) {
      return 'unknown error';
    }
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }
    if (typeof error === 'string') {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  async procesarVentaParaInventario(venta: VentaProcessedEvent): Promise<void> {
    try {
      if (venta.inventarioAplicado) {
        this.logger.log(
          `⏭️ [Inventario] Venta ${venta.numeroTicket} omitida: inventario ya aplicado por el flujo de pedidos`,
        );
        return;
      }

      // ✅ MULTI-TENANT: Extraer tenant_id del evento
      const tenantId = venta.tenantId;
      if (!tenantId) {
        // HARDENING: sin tenant no se procesa, evita fuga multi-tenant.
        this.logger.warn('⚠️ [Inventario] Evento de venta sin tenantId, se omite actualización de stock'); // HARDENING: sin tenant no procesa.
        return;
      }

      this.logger.log(`📦 [Inventario] [Tenant: ${tenantId}] Procesando venta ${venta.numeroTicket}`); // HARDENING: substituye console.log.
      this.logger.debug(`📦 [Inventario] Datos de venta ${venta.numeroTicket}: ${JSON.stringify(venta)}`);

      for (const item of venta.items) {
        this.logger.debug(`📦 [Inventario] Procesando item ${item.productoId} - cantidad: ${item.cantidad}`); // HARDENING.
        
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
          ventaId: venta.ventaId,
          almacenId: venta.almacenId ?? undefined,
        }, tenantId); // ✅ Pasar tenant_id
      }

      this.logger.log(`✅ [Inventario] Stock actualizado para venta ${venta.numeroTicket}`);
    } catch (error) {
      this.logger.error('❌ [Inventario] Error procesando venta', this.formatError(error));
    }
  }

  async procesarCompraParaInventario(compra: CompraEntregadaEvent): Promise<void> {
    try {
      if (compra.inventarioAplicado) {
        this.logger.log(
          `⏭️ [Inventario] Compra ${compra.numeroOrden} omitida: inventario ya aplicado por recepción`,
        );
        return;
      }

      // ✅ MULTI-TENANT: Extraer tenant_id del evento
      const tenantId = compra.tenantId;
      if (!tenantId) {
        // HARDENING: sin tenant no se procesa, evita fuga multi-tenant.
        this.logger.warn('⚠️ [Inventario] Evento de recepción sin tenantId, se omite actualización de stock'); // HARDENING.
        return;
      }

      this.logger.log(`📦 [Inventario] [Tenant: ${tenantId}] Procesando compra ${compra.numeroOrden}`);

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
          referencia: compra.numeroOrden,
          almacenId: compra.almacenId ?? undefined,
        }, tenantId); // ✅ Pasar tenant_id
      }

      this.logger.log(`✅ [Inventario] Stock actualizado para compra ${compra.numeroOrden}`);
    } catch (error) {
      this.logger.error('❌ [Inventario] Error procesando compra', this.formatError(error));
    }
  }

  async realizarMovimientoStock(movimiento: MovimientoStock, tenantId?: string): Promise<string | null> {
    try {
      // ✅ MULTI-TENANT: Usar tenant_id proporcionado o default
      const currentTenantId = this.resolveTenantId(tenantId);
      
      // Sanitizar cantidad: solo enteros para evitar errores de casteo en DB
      const cantidadEntera = Math.round(Number(movimiento.cantidad ?? 0));
      if (!Number.isFinite(cantidadEntera)) {
        throw new BadRequestException('Cantidad de movimiento inválida');
      }
      if (movimiento.tipoMovimiento !== 'AJUSTE' && cantidadEntera <= 0) {
        throw new BadRequestException('La cantidad del movimiento debe ser mayor a cero');
      }
      if (movimiento.tipoMovimiento === 'AJUSTE' && cantidadEntera === 0) {
        throw new BadRequestException('La cantidad de ajuste no puede ser cero');
      }
      if (cantidadEntera !== movimiento.cantidad) {
        this.logger.warn(
          `⚠️ [Inventario] Ajustando cantidad de ${movimiento.cantidad} a entero ${cantidadEntera} para producto ${movimiento.productoId}`,
        );
      }
      movimiento.cantidad = cantidadEntera;
      const almacenId = movimiento.almacenId ?? movimiento.almacen_id ?? null;
      if (!almacenId) {
        throw new BadRequestException('almacenId es obligatorio para todo movimiento físico de inventario');
      }
      
      this.logger.log(`📦 [Inventario] [Tenant: ${currentTenantId}] Movimiento ${movimiento.tipoMovimiento} - ${movimiento.cantidad} unidades de ${movimiento.productoId}`); // HARDENING.

      // 1. Obtener producto por ID o código (CON FILTRO DE TENANT)
      this.logger.debug(`🔍 [Inventario] Buscando producto ${movimiento.productoId}`); // HARDENING.
      
      let producto = null;
      
      // Intentar buscar por ID primero (UUID) USANDO COLUMNAS EXACTAS
      if (movimiento.productoId && movimiento.productoId.length > 10) {
        const { data: productoPorId, error: errorPorId } = await this.supabase.getClient()
          .from('productos')
          .select('id, codigo, nombre, precio, stock_actual, categoria, activo, tenant_id')
          .eq('tenant_id', currentTenantId) // ✅ MULTI-TENANT: Filtrar por tenant
          .eq('id', movimiento.productoId)
          .single();

        if (!errorPorId && productoPorId) {
          this.logger.debug(`✅ [Inventario] Producto encontrado por ID ${movimiento.productoId}: ${JSON.stringify(productoPorId)}`);
          producto = productoPorId;
        }
      }
      
      // Si no encuentra por ID, buscar por código
      if (!producto) {
        const { data: productoPorCodigo, error: errorPorCodigo } = await this.supabase.getClient()
          .from('productos')
          .select('id, codigo, nombre, precio, stock_actual, categoria, activo, tenant_id')
          .eq('tenant_id', currentTenantId) // ✅ MULTI-TENANT: Filtrar por tenant
          .eq('codigo', movimiento.productoId)
          .single();

        if (!errorPorCodigo && productoPorCodigo) {
          this.logger.debug(`✅ [Inventario] Producto encontrado por código ${movimiento.productoId}: ${JSON.stringify(productoPorCodigo)}`);
          producto = productoPorCodigo;
        }
      }
      
      // Si aún no encuentra, buscar por nombre
      if (!producto) {
        const { data: productoPorNombre, error: errorPorNombre } = await this.supabase.getClient()
          .from('productos')
          .select('id, codigo, nombre, precio, stock_actual, categoria, activo, tenant_id')
          .eq('tenant_id', currentTenantId) // ✅ MULTI-TENANT: Filtrar por tenant
          .eq('nombre', movimiento.productoId)
          .single();

        if (!errorPorNombre && productoPorNombre) {
          this.logger.debug(`✅ [Inventario] Producto encontrado por nombre ${movimiento.productoId}: ${JSON.stringify(productoPorNombre)}`);
          producto = productoPorNombre;
        }
      }

      if (!producto) {
        this.logger.error(`❌ [Inventario] Producto ${movimiento.productoId} no encontrado en ninguna búsqueda`);
        return null;
      }

      const { data: almacen, error: almacenError } = await this.supabase.getClient()
        .from('almacenes')
        .select('id, activo')
        .eq('tenant_id', currentTenantId)
        .eq('id', almacenId)
        .maybeSingle();

      if (almacenError) {
        throw new BadRequestException(`No se pudo validar el almacén: ${almacenError.message}`);
      }
      if (!almacen || almacen.activo === false) {
        throw new BadRequestException('Almacén inválido o inactivo para el movimiento de inventario');
      }

      if (movimiento.referencia) {
        const { data: movimientoExistente, error: movimientoExistenteError } = await this.supabase.getClient()
          .from('stock_movimientos')
          .select('id')
          .eq('tenant_id', currentTenantId)
          .eq('producto_id', producto.id)
          .eq('tipo_movimiento', movimiento.tipoMovimiento)
          .eq('cantidad', movimiento.cantidad)
          .eq('referencia', movimiento.referencia)
          .limit(1)
          .maybeSingle();

        if (movimientoExistenteError) {
          throw new BadRequestException(`No se pudo verificar duplicidad del movimiento: ${movimientoExistenteError.message}`);
        }
        if (movimientoExistente?.id) {
          this.logger.warn(
            `⚠️ [Inventario] Movimiento duplicado ignorado por referencia ${movimiento.referencia}: ${movimientoExistente.id}`,
          );
          return movimientoExistente.id;
        }
      }

      const stockActual = parseFloat((producto as any).stock_actual || 0);
      movimiento.stockAnterior = stockActual;

      const referenciaId = movimiento.ventaId && /^[0-9a-f-]{36}$/i.test(movimiento.ventaId)
        ? movimiento.ventaId
        : null;
      const rpcName = movimiento.tipoMovimiento === 'AJUSTE'
        ? 'ajustar_stock_en_almacen_tx'
        : 'aplicar_movimiento_inventario_tx';
      const rpcPayload = movimiento.tipoMovimiento === 'AJUSTE'
        ? {
            p_tenant_id: currentTenantId,
            p_producto_id: producto.id,
            p_almacen_id: almacenId,
            p_delta: movimiento.cantidad,
            p_referencia_tipo: 'INTEGRACION_AJUSTE',
            p_referencia_id: referenciaId,
            p_notas: movimiento.motivo,
            p_metadata: { source: 'inventory_integration', external_reference: movimiento.referencia ?? null },
          }
        : {
            p_tenant_id: currentTenantId,
            p_producto_id: producto.id,
            p_almacen_id: almacenId,
            p_tipo: movimiento.tipoMovimiento,
            p_cantidad: movimiento.cantidad,
            p_referencia_tipo: movimiento.ventaId ? 'VENTA' : 'INTEGRACION',
            p_referencia_id: referenciaId,
            p_notas: movimiento.motivo,
            p_created_by: movimiento.usuarioId,
            p_metadata: {
              source: 'inventory_integration',
              external_reference: movimiento.referencia ?? null,
              costo_unitario: movimiento.precioUnitario,
              valor_total: movimiento.valorTotal,
            },
          };
      const { data: movimientoId, error: movimientoError } = await this.supabase.getClient().rpc(rpcName, rpcPayload);
      if (movimientoError) {
        throw new BadRequestException(`No se pudo aplicar el movimiento físico: ${movimientoError.message}`);
      }
      
      // VERIFICACIÓN ADICIONAL - Leer de nuevo el producto para confirmar
      const { data: verificacion } = await this.supabase.getClient()
        .from('productos')
        .select('id, codigo, nombre, stock_actual')
        .eq('id', producto.id)
        .eq('tenant_id', currentTenantId)
        .single();
      
      this.logger.debug(`🔍 [Inventario] Verificación post actualización: ${JSON.stringify(verificacion)}`);
      movimiento.stockNuevo = Number(verificacion?.stock_actual ?? stockActual);

      // 5. Emitir evento para otros módulos (contabilidad, finanzas)
      this.eventBus.emitMovimientoStock({
        productoId: movimiento.productoId,
        tipoMovimiento: movimiento.tipoMovimiento,
        cantidad: movimiento.cantidad,
        stockAnterior: movimiento.stockAnterior,
        stockNuevo: movimiento.stockNuevo,
        motivo: movimiento.motivo,
        valor: movimiento.valorTotal,
        ventaId: movimiento.ventaId,
        tenantId: currentTenantId,
      }, currentTenantId);

      this.logger.log(`✅ [Inventario] Movimiento canónico registrado ${movimientoId}`);
      return String(movimientoId);

    } catch (error) {
      this.logger.error('❌ [Inventario] Error realizando movimiento de stock', this.formatError(error));
      throw error;
    }
  }

  async getProductosStock(tenantId?: string): Promise<ProductoStock[]> {
    try {
      // ✅ MULTI-TENANT: Filtrar por tenant
      const currentTenantId = this.resolveTenantId(tenantId);
      
      const { data: productos, error } = await this.supabase.getClient()
        .from('productos')
        .select('id, codigo, nombre, stock_actual, stock_minimo, precio, categoria, activo')
        .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
        .eq('activo', true)
        .order('nombre');

      if (error) throw error;

      return productos?.map(producto => ({
        id: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        stockActual: parseFloat((producto as any).stock_actual || 0),
        stockMinimo: parseFloat(producto.stock_minimo || 0),
        valorUnitario: parseFloat(producto.precio || 0),
        valorTotal: parseFloat((producto as any).stock_actual || 0) * parseFloat(producto.precio || 0),
        categoria: producto.categoria,
        activo: producto.activo
      })) || [];
    } catch (error) {
      this.logger.error('❌ [Inventario] Error obteniendo productos stock', this.formatError(error));
      return [];
    }
  }

  async getMovimientosStock(filtros: any = {}, tenantId?: string): Promise<any[]> {
    try {
      // ✅ MULTI-TENANT: Filtrar por tenant
      const currentTenantId = this.resolveTenantId(tenantId ?? filtros?.tenantId);
      
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
      this.logger.error('❌ [Inventario] Error obteniendo movimientos de stock', this.formatError(error));
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
      this.logger.error('❌ [Inventario] Error calculando estadísticas de inventario', this.formatError(error));
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
      const currentTenantId = this.resolveTenantId(tenantId);
      this.logger.log(`📦 [Inventario] [Tenant: ${currentTenantId}] Ajustando stock de ${productoId}: ${cantidadAjuste > 0 ? '+' : ''}${cantidadAjuste}`);

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
      this.logger.error('❌ [Inventario] Error ajustando stock', this.formatError(error));
      throw error;
    }
  }

  async registrarEntrada(productoId: string, cantidad: number, precioUnitario: number, motivo: string, usuarioId: string = 'system', tenantId?: string): Promise<string | null> {
    try {
      const currentTenantId = this.resolveTenantId(tenantId);
      this.logger.log(`📦 [Inventario] [Tenant: ${currentTenantId}] Registrando entrada de ${cantidad} unidades de ${productoId}`);

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
      this.logger.error('❌ [Inventario] Error registrando entrada', this.formatError(error));
      throw error;
    }
  }

  async getProductosStockCritico(tenantId?: string): Promise<ProductoStock[]> {
    try {
      const productos = await this.getProductosStock(tenantId);
      return productos.filter(p => p.stockActual <= p.stockMinimo);
    } catch (error) {
      this.logger.error('❌ [Inventario] Error obteniendo productos con stock crítico', this.formatError(error));
      return [];
    }
  }

  async getProductosSinStock(tenantId?: string): Promise<ProductoStock[]> {
    try {
      const productos = await this.getProductosStock(tenantId);
      return productos.filter(p => p.stockActual <= 0);
    } catch (error) {
      this.logger.error('❌ [Inventario] Error obteniendo productos sin stock', this.formatError(error));
      return [];
    }
  }

  async verificarDisponibilidadStock(productosVenta: { productoId: string, cantidad: number }[], tenantId?: string): Promise<{ disponible: boolean, faltantes: any[] }> {
    try {
      const currentTenantId = this.resolveTenantId(tenantId);
      this.logger.debug(`🔍 [Inventario] Verificando disponibilidad de stock: ${JSON.stringify(productosVenta)}`);
      const faltantes = [];
      
      for (const item of productosVenta) {
        this.logger.debug(`📦 [Inventario] Verificando producto ${item.productoId} (cantidad: ${item.cantidad})`);
        
        // Buscar por ID primero (UUID), luego por código
        let producto = null;
        
        // Intentar por ID (UUID)
        if (item.productoId && item.productoId.length > 10) {
          const { data: productoPorId } = await this.supabase.getClient()
            .from('productos')
            .select('stock_actual, nombre, codigo')
            .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
            .eq('id', item.productoId)
            .single();
          
          if (productoPorId) {
            this.logger.debug(`✅ [Inventario] Producto encontrado por ID ${item.productoId}: ${JSON.stringify(productoPorId)}`);
            producto = productoPorId;
          }
        }
        
        // Si no se encontró por ID, buscar por código
        if (!producto) {
          const { data: productoPorCodigo } = await this.supabase.getClient()
            .from('productos')
            .select('stock_actual, nombre, codigo')
            .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
            .eq('codigo', item.productoId)
            .single();
          
          if (productoPorCodigo) {
            this.logger.debug(`✅ [Inventario] Producto encontrado por código ${item.productoId}: ${JSON.stringify(productoPorCodigo)}`);
            producto = productoPorCodigo;
          }
        }

        if (!producto) {
          this.logger.warn(`❌ [Inventario] Producto no encontrado: ${item.productoId}`);
          faltantes.push({
            productoId: item.productoId,
            solicitado: item.cantidad,
            disponible: 0,
            faltante: item.cantidad,
            motivo: 'Producto no encontrado'
          });
          continue;
        }

        const stockDisponible = parseFloat((producto as any).stock_actual || 0);
        this.logger.debug(`📊 [Inventario] Stock disponible ${stockDisponible} vs solicitado ${item.cantidad}`);
        
        if (stockDisponible < item.cantidad) {
          this.logger.warn(`❌ [Inventario] Stock insuficiente para ${producto.nombre}: disponible ${stockDisponible}, solicitado ${item.cantidad}`);
          faltantes.push({
            productoId: item.productoId,
            nombre: producto.nombre,
            solicitado: item.cantidad,
            disponible: stockDisponible,
            faltante: item.cantidad - stockDisponible,
            motivo: 'Stock insuficiente'
          });
        } else {
          this.logger.debug(`✅ [Inventario] Stock suficiente para ${producto.nombre}: disponible ${stockDisponible}, solicitado ${item.cantidad}`);
        }
      }

      return {
        disponible: faltantes.length === 0,
        faltantes
      };
    } catch (error) {
      this.logger.error('❌ [Inventario] Error verificando disponibilidad de stock', this.formatError(error));
      return {
        disponible: false,
        faltantes: [{ motivo: 'Error verificando stock', error: this.formatError(error) }]
      };
    }
  }
}
