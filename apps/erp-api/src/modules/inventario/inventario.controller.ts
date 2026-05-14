import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Delete, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common';
import { InventoryIntegrationService } from '../../shared/integration/inventory-integration.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { AlmacenesService } from './almacenes/almacenes.service';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { InventarioService } from './inventario.service';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { RequireFeatureFlag } from '../../common/decorators/feature-flag.decorator';
import { TaxCalculatorService } from '../../shared/utils/tax-calculator';

/**
 * ✅ MULTI-TENANT: Controlador de Inventario con soporte multi-tenant
 * 
 * Todos los endpoints filtran automáticamente por tenant usando @CurrentTenant()
 */
@ApiTags('inventario')
@Controller('inventario')
@UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard) // HARDENING: inventario requiere permisos granulares + feature flags.
@RequireFeatureFlag('inventario') // HARDENING: bloquea el módulo si la bandera de inventario está deshabilitada.
@ApiBearerAuth()
export class InventarioController {
  private readonly logger = new Logger(InventarioController.name); // HARDENING: centraliza trazabilidad por módulo.
  constructor(
    private readonly inventoryService: InventoryIntegrationService,
    private readonly supabase: SupabaseService,
    private readonly almacenesService: AlmacenesService,
    private readonly inventarioService: InventarioService,
    private readonly taxCalculator: TaxCalculatorService,
  ) {}

  /**
   * Obtener almacenes activos del tenant
   */
  @Get('almacenes')
  @RequirePermission('inventario.almacenes.read') // HARDENING: listado de almacenes requiere permiso.
  @ApiOperation({ summary: 'Listar almacenes activos' })
  @ApiResponse({ status: 200, description: 'Almacenes listados exitosamente' })
  async getAlmacenes(@CurrentTenant() tenantId: string) {
    try {
      this.logger.log(`🏢 [Tenant: ${tenantId}] Obteniendo almacenes...`); // HARDENING: reemplaza console.log para auditoría multitenant.
      const almacenes = await this.almacenesService.listar(tenantId);
      
      return {
        success: true,
        data: almacenes
      };
    } catch (error) {
      this.logger.error('❌ Error obteniendo almacenes', error as Error); // HARDENING: utiliza Logger Nest para errores.
      return {
        success: false,
        message: 'Error al obtener almacenes: ' + (error as Error).message,
        data: []
      };
    }
  }

  /**
   * Obtener ubicaciones de un almacén
   */
  @Get('almacenes/:almacenId/ubicaciones')
  @RequirePermission('inventario.almacenes.read') // HARDENING: ubicaciones protegidas.
  @ApiOperation({ summary: 'Listar ubicaciones de un almacén' })
  @ApiResponse({ status: 200, description: 'Ubicaciones listadas exitosamente' })
  async getUbicaciones(
    @CurrentTenant() tenantId: string,
    @Param('almacenId') almacenId: string
  ) {
    try {
      this.logger.log(`📍 [Tenant: ${tenantId}] Obteniendo ubicaciones del almacén ${almacenId}...`); // HARDENING: traza accesos a estructuras de inventario.
      
      const { data, error } = await this.supabase.getClient()
        .from('almacen_ubicaciones')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('almacen_id', almacenId)
        .order('codigo', { ascending: true });

      if (error) {
        throw error;
      }

      this.logger.log(`✅ ${data?.length || 0} ubicaciones obtenidas`); // HARDENING: confirma operación exitosa para auditoría.
      
      return {
        success: true,
        data: data || []
      };
    } catch (error) {
      this.logger.error('❌ Error obteniendo ubicaciones', error as Error);
      return {
        success: false,
        message: 'Error al obtener ubicaciones: ' + (error as Error).message,
        data: []
      };
    }
  }

  /**
   * Listar recepciones con filtros básicos
   */
  @Get('recepciones')
  @RequirePermission('inventario.ingresos.write') // HARDENING: solo usuarios autorizados pueden gestionar recepciones.
  @ApiOperation({ summary: 'Listar recepciones de compra' })
  @ApiResponse({ status: 200, description: 'Recepciones listadas exitosamente' })
  async listarRecepciones(
    @CurrentTenant() tenantId: string,
    @Query('estado') estado?: string,
    @Query('almacenId') almacenId?: string,
    @Query('search') search?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('page') pageParam?: string,
    @Query('limit') limitParam?: string,
  ) {
    const page = pageParam ? parseInt(pageParam, 10) : undefined;
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    return this.inventarioService.listarRecepciones(tenantId, {
      estado,
      almacenId,
      search,
      desde,
      hasta,
      page,
      limit,
    });
  }

  /**
   * Obtener detalle de una recepción
   */
  @Get('recepciones/:id')
  @RequirePermission('inventario.ingresos.write')
  @ApiOperation({ summary: 'Detalle de recepción' })
  @ApiResponse({ status: 200, description: 'Detalle obtenido exitosamente' })
  async obtenerRecepcionDetalle(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.inventarioService.obtenerRecepcionPorId(tenantId, id);
  }

  /**
   * Obtener kardex valorizado (entradas) del inventario
   */
  @Get('kardex')
  @RequirePermission('inventario.kardex.read')
  @ApiOperation({ summary: 'Consultar kardex valorizado' })
  @ApiResponse({ status: 200, description: 'Kardex obtenido correctamente' })
  async obtenerKardex(
    @CurrentTenant() tenantId: string,
    @Query('productoId') productoId?: string,
    @Query('almacenId') almacenId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('limit') limitParam?: string,
  ) {
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    return this.inventarioService.obtenerKardexValorizado(tenantId, {
      productoId,
      almacenId,
      desde,
      hasta,
      limit,
    });
  }

  /**
   * Obtener estadísticas de inventario
   */
  @Get('stats')
  @RequirePermission('inventario.stats.read') // HARDENING: estadísticas requieren permiso.
  @ApiOperation({ summary: 'Obtener estadísticas de inventario' })
  @ApiResponse({ status: 200, description: 'Estadísticas obtenidas exitosamente' })
  async getStats(@CurrentTenant() tenantId: string) {
    try {
      this.logger.log(`📊 [Tenant: ${tenantId}] Obteniendo estadísticas de inventario...`); // HARDENING: trazabilidad de métricas sensibles.
      
      const client = this.supabase.getClient();
      if (!client) {
        return {
          success: true,
          data: {
            totalProductos: 0,
            valorInventario: 0,
            movimientosHoy: 0,
            productosStockBajo: 0
          }
        };
      }

      const { data: productos, error: productosError } = await client
        .from('productos')
        .select('precio_venta, stock_actual, stock_minimo')
        .eq('tenant_id', tenantId);

      if (productosError) throw productosError;

      const totalProductos = productos?.length || 0;
      const valorInventario =
        productos?.reduce(
          (sum, p) =>
            sum + parseFloat(p.precio_venta || 0) * parseFloat((p as any).stock_actual || 0),
          0,
        ) || 0;
      const productosStockBajo =
        productos?.filter(
          p => parseFloat((p as any).stock_actual || 0) <= parseFloat(p.stock_minimo || 0),
        ).length || 0;

      const hoy = new Date().toISOString().split('T')[0];
      const { data: movimientos } = await client
        .from('stock_movimientos')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('created_at', `${hoy}T00:00:00`)
        .lt('created_at', `${hoy}T23:59:59`);

      const movimientosHoy = movimientos?.length || 0;

      return {
        success: true,
        data: {
          totalProductos,
          valorInventario,
          productosStockBajo,
          movimientosHoy
        }
      };
    } catch (error) {
      this.logger.error('❌ Error obteniendo estadísticas', error as Error);
      return {
        success: true,
        data: {
          totalProductos: 0,
          valorInventario: 0,
          movimientosHoy: 0,
          productosStockBajo: 0
        }
      };
    }
  }

  /**
   * Obtener todos los productos del tenant actual
   */
  @Get('productos')
  @RequirePermission('inventario.productos.read') // HARDENING: listado de productos requiere permiso.
  @ApiOperation({ summary: 'Listar productos de inventario' })
  @ApiResponse({ status: 200, description: 'Productos listados exitosamente' })
  async getProductos(@CurrentTenant() tenantId: string, @Query() query: any) {
    try {
      this.logger.log(`📦 [Tenant: ${tenantId}] Obteniendo productos del inventario...`); // HARDENING: añade trazabilidad a listados sensibles.
      
      const client = this.supabase.getClient();
      let supaQuery = client.from('productos').select('*').eq('tenant_id', tenantId);
      
      if (query.categoria) {
        supaQuery = supaQuery.eq('categoria', query.categoria);
      }
      
      if (query.estado) {
        supaQuery = supaQuery.eq('activo', query.estado === 'ACTIVO');
      }

      const { data, error } = await supaQuery.order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      let enriched = data || [];
      const includeSucursal = `${query.includeSucursal ?? 'false'}`.toLowerCase() === 'true';
      if (includeSucursal && enriched.length > 0) {
        const ids = enriched.map((p: any) => p.id);
        const [preciosResp, stockResp] = await Promise.all([
          client.from('producto_precios_sucursal').select('*').in('producto_id', ids),
          client.from('producto_stock_sucursal').select('*').in('producto_id', ids),
        ]);
        const precios = preciosResp.data || [];
        const stocks = stockResp.data || [];
        enriched = enriched.map((p: any) => ({
          ...p,
          precios_sucursal: precios.filter((x: any) => x.producto_id === p.id),
          stock_sucursal: stocks.filter((x: any) => x.producto_id === p.id),
        }));
      }

      this.logger.log(`✅ ${enriched?.length || 0} productos obtenidos`); // HARDENING: confirma operación para auditoría.
      
      return { 
        success: true, 
        data: enriched 
      };
    } catch (error) {
      this.logger.error('❌ Error obteniendo productos', error as Error);
      return { 
        success: false, 
        message: 'Error al obtener productos: ' + (error as Error).message,
        data: [] 
      };
    }
  }

  /**
   * Crear nuevo producto
   */
  @Post('productos')
  @RequirePermission('inventario.productos.create') // HARDENING: creación de productos restringida.
  @ApiOperation({ summary: 'Crear nuevo producto' })
  @ApiResponse({ status: 201, description: 'Producto creado exitosamente' })
  async createProducto(@CurrentTenant() tenantId: string, @Body() productData: any) {
    try {
      this.logger.log(`🆕 [Tenant: ${tenantId}] Creando nuevo producto: ${productData?.codigo ?? 'sin-codigo'}`); // HARDENING: evita volsado de objetos completos y mantiene rastro.

      if (!productData.codigo || !productData.nombre || !productData.categoria) {
        return {
          success: false,
          message: 'Código, nombre y categoría son requeridos'
        };
      }

      const { data: existingProduct } = await this.supabase.getClient()
        .from('productos')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('codigo', productData.codigo)
        .single();

      if (existingProduct) {
        return {
          success: false,
          message: 'Ya existe un producto con ese código'
        };
      }

      // ✅ FIX H09: Obtener tasa de impuesto desde configuración fiscal
      const tasaIgv = await this.taxCalculator.getTasaIgv(tenantId);
      const impuestoPorcentaje = tasaIgv * 100; // Convertir 0.18 a 18.0

      const esServicio = productData.es_servicio === true || `${productData.es_servicio}`.toLowerCase() === 'true';
      const controlaStock = esServicio ? false : !(productData.controla_stock === false || `${productData.controla_stock}`.toLowerCase() === 'false');
      const precioVenta = parseFloat(productData.precioVenta || productData.precio_venta || 0);
      const precioCompra = parseFloat(productData.precioCompra || productData.precio_compra || 0);
      const stockMinimo = parseFloat(productData.stockMinimo || productData.stock_minimo || 0);
      const stockReservado = parseFloat(productData.stockReservado || productData.stock_reservado || 0);
      const sucursalId = productData.sucursal_id || null;
      const almacenId = productData.almacen_id || null;
      const stockInicial = controlaStock ? parseFloat(productData.stock || 0) : 0;

      const nuevoProducto = {
        tenant_id: tenantId,
        codigo: productData.codigo,
        nombre: productData.nombre,
        descripcion: productData.descripcion || null,
        precio_venta: precioVenta,
        precio_compra: precioCompra,
        stock_actual: stockInicial,
        categoria: productData.categoria,
        activo: true,
        codigo_barras: productData.codigoBarras || productData.codigo,
        stock_minimo: stockMinimo,
        stock_reservado: stockReservado,
        impuesto: impuestoPorcentaje,
        es_servicio: esServicio,
        controla_stock: controlaStock,
        afectacion_igv: productData.afectacion_igv || productData.afectacionIgv || '10',
        tipo_operacion: productData.tipo_operacion || productData.tipoOperacion || null,
        clasificador_sunat: productData.clasificador_sunat || productData.clasificadorSunat || null,
        favorito: productData.favorito === true || `${productData.favorito}`.toLowerCase() === 'true',
        imagen_url: productData.imagen_url || productData.imagenUrl || ''
      };

      const { data: insertedProduct, error } = await this.supabase.getClient()
        .from('productos')
        .insert([nuevoProducto])
        .select()
        .single();

      if (error) throw error;

      if (controlaStock && stockInicial > 0) {
        try {
          await this.supabase.getClient()
            .from('stock_movimientos')
            .insert([{
              tenant_id: tenantId,
              producto_id: insertedProduct.id,
              tipo_movimiento: 'ENTRADA',
              cantidad: stockInicial,
              motivo: 'Stock inicial del producto',
              referencia: 'INICIAL',
              created_at: new Date().toISOString()
            }]);
        } catch (movError) {
          this.logger.warn(`⚠️ No se pudo registrar movimiento inicial: ${(movError as Error).message}`); // HARDENING: mantiene registro de inconsistencias iniciales.
        }
      }

      // Guardar precios por sucursal (acepta arreglo o sucursal_id individual)
      const preciosSucursal = Array.isArray(productData.precios_sucursal) ? productData.precios_sucursal : [];
      if (sucursalId) {
        preciosSucursal.push({
          sucursal_id: sucursalId,
          moneda: productData.moneda || 'PEN',
          precio: precioVenta,
          activo: productData.activo ?? true,
        });
      }
      if (preciosSucursal.length > 0) {
        const preciosPayload = preciosSucursal
          .filter((p: any) => p?.sucursal_id)
          .map((p: any) => ({
            producto_id: insertedProduct.id,
            sucursal_id: p.sucursal_id,
            moneda: p.moneda || 'PEN',
            precio: parseFloat(p.precio ?? precioVenta ?? 0),
            activo: p.activo ?? true,
          }));
        if (preciosPayload.length > 0) {
          await this.supabase.getClient()
            .from('producto_precios_sucursal')
            .upsert(preciosPayload, { onConflict: 'producto_id,sucursal_id,moneda' });
        }
      }

      // Guardar stock por sucursal/almacén si controla stock
      const stockSucursal = Array.isArray(productData.stock_sucursal) ? productData.stock_sucursal : [];
      if (controlaStock && sucursalId) {
        stockSucursal.push({
          sucursal_id: sucursalId,
          almacen_id: almacenId,
          stock_actual: stockInicial,
          reservado: stockReservado,
          minimo: stockMinimo,
        });
      }
      if (controlaStock && stockSucursal.length > 0) {
        const stockPayload = stockSucursal
          .filter((s: any) => s?.sucursal_id)
          .map((s: any) => ({
            producto_id: insertedProduct.id,
            sucursal_id: s.sucursal_id,
            almacen_id: s.almacen_id || null,
            stock_actual: parseFloat(s.stock ?? 0),
            reservado: parseFloat(s.reservado ?? 0),
            minimo: parseFloat(s.minimo ?? 0),
          }));
        if (stockPayload.length > 0) {
          await this.supabase.getClient()
            .from('producto_stock_sucursal')
            .upsert(stockPayload, { onConflict: 'producto_id,sucursal_id,almacen_id' });
        }
      }

      this.logger.log(`✅ Producto creado exitosamente: ${insertedProduct.id}`); // HARDENING: confirma alta.

      return {
        success: true,
        data: insertedProduct,
        message: 'Producto creado exitosamente'
      };
    } catch (error) {
      this.logger.error('❌ Error creando producto', error as Error);
      return {
        success: false,
        message: 'Error al crear el producto: ' + (error as Error).message
      };
    }
  }

  /**
   * Obtener movimientos de stock del tenant actual
   */
  @Get('movimientos')
  @RequirePermission('inventario.movimientos.read') // HARDENING: historial de movimientos protegido.
  @ApiOperation({ summary: 'Listar movimientos de inventario' })
  @ApiResponse({ status: 200, description: 'Movimientos listados exitosamente' })
  async getMovimientos(
    @CurrentTenant() tenantId: string,
    @Query() query: any
  ) {
    try {
      this.logger.log(`📊 [Tenant: ${tenantId}] Obteniendo movimientos de inventario...`); // HARDENING: monitorea consultas a trazabilidad de stock.
      
      const limit = query.limit ? parseInt(query.limit) : 50;
      const client = this.supabase.getClient();

      const { data, error } = await client
        .from('movimientos_inventario')
        .select(`
          id,
          tenant_id,
          producto_id,
          tipo,
          cantidad,
          referencia_tipo,
          referencia_id,
          notas,
          created_by,
          created_at
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        this.logger.warn(`⚠️ Error consultando movimientos: ${(error as Error).message}`);
        throw error;
      }

      const productoIds = Array.from(new Set((data || []).map((mov: any) => mov.producto_id).filter(Boolean)));
      let productosPorId = new Map<string, any>();
      if (productoIds.length > 0) {
        const { data: productos, error: productosError } = await client
          .from('productos')
          .select('id, codigo, nombre')
          .eq('tenant_id', tenantId)
          .in('id', productoIds);

        if (productosError) {
          this.logger.warn(`⚠️ Error consultando productos de movimientos: ${(productosError as Error).message}`);
        } else {
          productosPorId = new Map((productos || []).map((producto: any) => [producto.id, producto]));
        }
      }

      const movimientos = (data || []).map((mov: any) => {
        const producto = productosPorId.get(mov.producto_id);
        return {
          id: mov.id,
          tenant_id: mov.tenant_id,
          producto_id: mov.producto_id,
          tipo_movimiento: mov.tipo,
          tipo: mov.tipo,
          cantidad: mov.cantidad,
          referencia_tipo: mov.referencia_tipo,
          referencia_id: mov.referencia_id,
          referencia: mov.referencia_id ?? mov.referencia_tipo ?? null,
          motivo: mov.notas ?? mov.referencia_tipo ?? null,
          usuario_id: mov.created_by,
          created_at: mov.created_at,
          codigo: producto?.codigo ?? null,
          nombre: producto?.nombre ?? null,
        };
      });

      this.logger.log(`✅ ${movimientos.length} movimientos obtenidos`); // HARDENING: confirma resultado.
      
      return { 
        success: true, 
        data: movimientos 
      };
    } catch (error) {
      this.logger.error('❌ Error obteniendo movimientos', error as Error);
      throw error;
    }
  }

  /**
   * Realizar un movimiento de stock
   */
  @Post('movimientos')
  @RequirePermission('inventario.movimientos.create') // HARDENING: creación de movimientos limitada.
  async realizarMovimiento(
    @CurrentTenant() tenantId: string,
    @Body() movimiento: any
  ) {
    this.logger.log(`📦 [Inventario] Realizando movimiento para tenant: ${tenantId}`); // HARDENING: monitorea movimientos críticos.
    return this.inventoryService.realizarMovimientoStock(movimiento, tenantId);
  }

  /**
   * Obtener producto específico por ID
   */
  @Get('productos/:id')
  @RequirePermission('inventario.productos.read') // HARDENING: lectura individual protegida.
  @ApiOperation({ summary: 'Obtener producto por ID' })
  @ApiResponse({ status: 200, description: 'Producto obtenido exitosamente' })
  async getProducto(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query() query: any
  ) {
    try {
      this.logger.log(`🔍 [Tenant: ${tenantId}] Obteniendo producto por ID: ${id}`); // HARDENING: evita logs sin contexto tenant.
      
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        return {
          success: false,
          message: 'Producto no encontrado'
        };
      }

      const includeSucursal = `${query?.includeSucursal ?? 'false'}`.toLowerCase() === 'true';
      if (includeSucursal && data?.id) {
        const [preciosResp, stockResp] = await Promise.all([
          this.supabase.getClient().from('producto_precios_sucursal').select('*').eq('producto_id', data.id),
          this.supabase.getClient().from('producto_stock_sucursal').select('*').eq('producto_id', data.id),
        ]);
        return {
          success: true,
          data: {
            ...data,
            precios_sucursal: preciosResp.data || [],
            stock_sucursal: stockResp.data || [],
          }
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      this.logger.error('Error obteniendo producto', error as Error);
      return {
        success: false,
        message: 'Error al obtener el producto'
      };
    }
  }

  /**
   * Eliminar producto por ID
   */
  @Delete('productos/:id')
  @RequirePermission('inventario.productos.delete') // HARDENING: eliminación controlada por permiso.
  @ApiOperation({ summary: 'Eliminar producto por ID' })
  @ApiResponse({ status: 200, description: 'Producto eliminado exitosamente' })
  async deleteProducto(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    try {
      this.logger.log(`🗑️ [Tenant: ${tenantId}] Eliminando producto por ID: ${id}`); // HARDENING: registra operaciones destructivas.
      
      const { data: producto, error: findError } = await this.supabase.getClient()
        .from('productos')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .single();

      if (findError || !producto) {
        return {
          success: false,
          message: 'Producto no encontrado'
        };
      }

      const { data: movimientos } = await this.supabase.getClient()
        .from('stock_movimientos')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('producto_id', id)
        .limit(1);

      if (movimientos && movimientos.length > 0) {
        const { data: updatedProduct, error: updateError } = await this.supabase.getClient()
          .from('productos')
          .update({ activo: false })
          .eq('tenant_id', tenantId)
          .eq('id', id)
          .select()
          .single();

        if (updateError) throw updateError;

        return {
          success: true,
          data: updatedProduct,
          message: 'Producto desactivado exitosamente'
        };
      } else {
        const { error: deleteError } = await this.supabase.getClient()
          .from('productos')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('id', id);

        if (deleteError) {
          throw deleteError;
        }

        return {
          success: true,
          data: producto,
          message: 'Producto eliminado exitosamente'
        };
      }
    } catch (error) {
      this.logger.error('❌ Error eliminando producto', error as Error);
      return {
        success: false,
        message: 'Error al eliminar el producto: ' + (error as Error).message
      };
    }
  }

  /**
   * Actualizar producto por ID
   */
  @Put('productos/:id')
  @RequirePermission('inventario.productos.update') // HARDENING: actualización controlada por permiso.
  @ApiOperation({ summary: 'Actualizar producto por ID' })
  @ApiResponse({ status: 200, description: 'Producto actualizado exitosamente' })
  async updateProducto(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() productData: any
  ) {
    try {
      this.logger.log(`✏️ [Tenant: ${tenantId}] Actualizando producto por ID: ${id}`);

      // Verificar que el producto existe
      const { data: existingProduct, error: findError } = await this.supabase.getClient()
        .from('productos')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .single();

      if (findError || !existingProduct) {
        return {
          success: false,
          message: 'Producto no encontrado'
        };
      }

      // Verificar si el código ya existe en otro producto
      if (productData.codigo && productData.codigo !== existingProduct.codigo) {
        const { data: duplicateProduct } = await this.supabase.getClient()
          .from('productos')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('codigo', productData.codigo)
          .neq('id', id)
          .single();

        if (duplicateProduct) {
          return {
            success: false,
            message: 'Ya existe otro producto con ese código'
          };
        }
      }

      // Preparar datos de actualización
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (productData.codigo) updateData.codigo = productData.codigo;
      if (productData.nombre) updateData.nombre = productData.nombre;
      if (productData.descripcion !== undefined) updateData.descripcion = productData.descripcion;
      if (productData.categoria) updateData.categoria = productData.categoria;
      if (productData.precioVenta !== undefined || productData.precio_venta !== undefined) {
        updateData.precio_venta = parseFloat(productData.precioVenta ?? productData.precio_venta);
      }
      if (productData.precioCompra !== undefined || productData.precio_compra !== undefined) {
        updateData.precio_compra = parseFloat(productData.precioCompra ?? productData.precio_compra);
      }
      if (productData.stockMinimo !== undefined || productData.stock_minimo !== undefined) {
        updateData.stock_minimo = parseFloat(productData.stockMinimo ?? productData.stock_minimo);
      }
      if (productData.codigoBarras !== undefined) updateData.codigo_barras = productData.codigoBarras;
      if (productData.impuesto !== undefined) updateData.impuesto = parseFloat(productData.impuesto);
      if (productData.activo !== undefined) updateData.activo = productData.activo;
      if (productData.stockReservado !== undefined || productData.stock_reservado !== undefined) {
        updateData.stock_reservado = parseFloat(productData.stockReservado ?? productData.stock_reservado);
      }
      if (productData.es_servicio !== undefined) {
        const esServicio = productData.es_servicio === true || `${productData.es_servicio}`.toLowerCase() === 'true';
        updateData.es_servicio = esServicio;
        if (esServicio) {
          updateData.controla_stock = false;
          updateData.stock_actual = 0;
        }
      }
      if (productData.controla_stock !== undefined) {
        const controlaStock = productData.controla_stock === true || `${productData.controla_stock}`.toLowerCase() === 'true';
        updateData.controla_stock = controlaStock;
      }
      if (productData.afectacion_igv !== undefined || productData.afectacionIgv !== undefined) {
        updateData.afectacion_igv = productData.afectacion_igv ?? productData.afectacionIgv;
      }
      if (productData.tipo_operacion !== undefined || productData.tipoOperacion !== undefined) {
        updateData.tipo_operacion = productData.tipo_operacion ?? productData.tipoOperacion;
      }
      if (productData.clasificador_sunat !== undefined || productData.clasificadorSunat !== undefined) {
        updateData.clasificador_sunat = productData.clasificador_sunat ?? productData.clasificadorSunat;
      }
      if (productData.favorito !== undefined) {
        updateData.favorito = productData.favorito === true || `${productData.favorito}`.toLowerCase() === 'true';
      }
      if (productData.imagen_url !== undefined || productData.imagenUrl !== undefined) {
        updateData.imagen_url = productData.imagen_url ?? productData.imagenUrl;
      }
      if (productData.stock !== undefined) {
        updateData.stock_actual = parseFloat(productData.stock);
      }

      // Actualizar producto
      const { data: updatedProduct, error: updateError } = await this.supabase.getClient()
        .from('productos')
        .update(updateData)
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Manejo de precio/stock por sucursal en update
      const sucursalId = productData.sucursal_id || null;
      const almacenId = productData.almacen_id || null;
      const precioVenta = parseFloat(productData.precioVenta ?? productData.precio_venta ?? updatedProduct.precio_venta ?? 0);
      const stockMinimo = parseFloat(productData.stockMinimo ?? productData.stock_minimo ?? updatedProduct.stock_minimo ?? 0);
      const stockReservado = parseFloat(productData.stockReservado ?? productData.stock_reservado ?? updatedProduct.stock_reservado ?? 0);
      const stockCantidad = parseFloat(productData.stock ?? (updatedProduct as any).stock_actual ?? 0);
      let controlaStock = updateData.controla_stock ?? updatedProduct.controla_stock ?? true;

      // Upsert precios por sucursal (acepta arreglo o sucursal_id individual)
      const preciosSucursal = Array.isArray(productData.precios_sucursal) ? productData.precios_sucursal : [];
      if (sucursalId) {
        preciosSucursal.push({
          sucursal_id: sucursalId,
          moneda: productData.moneda || 'PEN',
          precio: precioVenta,
          activo: productData.activo ?? true,
        });
      }
      if (preciosSucursal.length > 0) {
        const preciosPayload = preciosSucursal
          .filter((p: any) => p?.sucursal_id)
          .map((p: any) => ({
            producto_id: id,
            sucursal_id: p.sucursal_id,
            moneda: p.moneda || 'PEN',
            precio: parseFloat(p.precio ?? precioVenta ?? 0),
            activo: p.activo ?? true,
          }));
        if (preciosPayload.length > 0) {
          await this.supabase.getClient()
            .from('producto_precios_sucursal')
            .upsert(preciosPayload, { onConflict: 'producto_id,sucursal_id,moneda' });
        }
      }

      // Upsert stock por sucursal/almacén si controla stock (acepta arreglo)
      const stockSucursal = Array.isArray(productData.stock_sucursal) ? productData.stock_sucursal : [];
      // Si es servicio, nunca tocamos stock
      if (updateData.es_servicio === true) {
        controlaStock = false;
      }
      if (controlaStock && sucursalId) {
        stockSucursal.push({
          sucursal_id: sucursalId,
          almacen_id: almacenId,
          stock_actual: stockCantidad,
          reservado: stockReservado,
          minimo: stockMinimo,
        });
      }
      if (controlaStock && stockSucursal.length > 0) {
        const stockPayload = stockSucursal
          .filter((s: any) => s?.sucursal_id)
          .map((s: any) => ({
            producto_id: id,
            sucursal_id: s.sucursal_id,
            almacen_id: s.almacen_id || null,
            stock_actual: parseFloat(s.stock ?? 0),
            reservado: parseFloat(s.reservado ?? 0),
            minimo: parseFloat(s.minimo ?? 0),
          }));
        if (stockPayload.length > 0) {
          await this.supabase.getClient()
            .from('producto_stock_sucursal')
            .upsert(stockPayload, { onConflict: 'producto_id,sucursal_id,almacen_id' });
        }
      }

      this.logger.log(`✅ Producto actualizado exitosamente: ${id}`);

      return {
        success: true,
        data: updatedProduct,
        message: 'Producto actualizado exitosamente'
      };
    } catch (error) {
      this.logger.error('❌ Error actualizando producto', error as Error);
      return {
        success: false,
        message: 'Error al actualizar el producto: ' + (error as Error).message
      };
    }
  }
}
