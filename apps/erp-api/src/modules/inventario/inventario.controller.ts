import { Controller, Get, Post, Body, Param, Query, UseGuards, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common';
import { InventoryIntegrationService } from '../../shared/integration/inventory-integration.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';

/**
 * ✅ MULTI-TENANT: Controlador de Inventario con soporte multi-tenant
 * 
 * Todos los endpoints filtran automáticamente por tenant usando @CurrentTenant()
 */
@ApiTags('inventario')
@Controller('inventario')
@UseGuards(JwtAuthGuard) // Requiere autenticación
export class InventarioController {
  constructor(
    private readonly inventoryService: InventoryIntegrationService,
    private readonly supabase: SupabaseService
  ) {}

  /**
   * Obtener estadísticas de inventario
   */
  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de inventario' })
  @ApiResponse({ status: 200, description: 'Estadísticas obtenidas exitosamente' })
  async getStats(@CurrentTenant() tenantId: string) {
    try {
      console.log(`📊 [Tenant: ${tenantId}] Obteniendo estadísticas de inventario...`);
      
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
      const valorInventario = productos?.reduce((sum, p) => sum + (parseFloat(p.precio_venta || 0) * parseFloat(p.stock_actual || 0)), 0) || 0;
      const productosStockBajo = productos?.filter(p => parseFloat(p.stock_actual || 0) <= parseFloat(p.stock_minimo || 0)).length || 0;

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
      console.error('❌ Error obteniendo estadísticas:', error);
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
  @ApiOperation({ summary: 'Listar productos de inventario' })
  @ApiResponse({ status: 200, description: 'Productos listados exitosamente' })
  async getProductos(@CurrentTenant() tenantId: string, @Query() query: any) {
    try {
      console.log(`📦 [Tenant: ${tenantId}] Obteniendo productos del inventario...`);
      
      const client = this.supabase.getClient();
      let supaQuery = client.from('productos').select('*').eq('tenant_id', tenantId);
      
      if (query.categoria) {
        supaQuery = supaQuery.eq('categoria', query.categoria);
      }
      
      if (query.estado) {
        supaQuery = supaQuery.eq('activo', query.estado === 'ACTIVO');
      }

      const { data, error } = await supaQuery.order('created_at', { ascending: false });

      if (error) throw error;

      console.log(`✅ ${data?.length || 0} productos obtenidos`);
      
      return { 
        success: true, 
        data: data || [] 
      };
    } catch (error) {
      console.error('❌ Error obteniendo productos:', error);
      return { 
        success: false, 
        message: 'Error al obtener productos: ' + error.message,
        data: [] 
      };
    }
  }

  /**
   * Crear nuevo producto
   */
  @Post('productos')
  @ApiOperation({ summary: 'Crear nuevo producto' })
  @ApiResponse({ status: 201, description: 'Producto creado exitosamente' })
  async createProducto(@CurrentTenant() tenantId: string, @Body() productData: any) {
    try {
      console.log(`🆕 [Tenant: ${tenantId}] Creando nuevo producto:`, productData);

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

      const nuevoProducto = {
        tenant_id: tenantId,
        codigo: productData.codigo,
        nombre: productData.nombre,
        precio_venta: parseFloat(productData.precioVenta || 0),
        stock_actual: parseInt(productData.stock || 0),
        categoria: productData.categoria,
        activo: true,
        codigo_barras: productData.codigoBarras || productData.codigo,
        precio_mayorista: parseFloat(productData.precioCompra || 0),
        stock_minimo: parseInt(productData.stockMinimo || 0),
        impuesto: 18.0
      };

      const { data: insertedProduct, error } = await this.supabase.getClient()
        .from('productos')
        .insert([nuevoProducto])
        .select()
        .single();

      if (error) throw error;

      if (nuevoProducto.stock_actual > 0) {
        try {
          await this.supabase.getClient()
            .from('stock_movimientos')
            .insert([{
              tenant_id: tenantId,
              producto_id: insertedProduct.id,
              tipo_movimiento: 'ENTRADA',
              cantidad: nuevoProducto.stock_actual,
              motivo: 'Stock inicial del producto',
              referencia: 'INICIAL',
              created_at: new Date().toISOString()
            }]);
        } catch (movError) {
          console.warn('⚠️ No se pudo registrar movimiento inicial:', movError.message);
        }
      }

      console.log('✅ Producto creado exitosamente:', insertedProduct.id);

      return {
        success: true,
        data: insertedProduct,
        message: 'Producto creado exitosamente'
      };
    } catch (error) {
      console.error('❌ Error creando producto:', error);
      return {
        success: false,
        message: 'Error al crear el producto: ' + error.message
      };
    }
  }

  /**
   * Obtener movimientos de stock del tenant actual
   */
  @Get('movimientos')
  @ApiOperation({ summary: 'Listar movimientos de inventario' })
  @ApiResponse({ status: 200, description: 'Movimientos listados exitosamente' })
  async getMovimientos(
    @CurrentTenant() tenantId: string,
    @Query() query: any
  ) {
    try {
      console.log(`📊 [Tenant: ${tenantId}] Obteniendo movimientos de inventario...`);
      
      const limit = query.limit ? parseInt(query.limit) : 50;
      const client = this.supabase.getClient();

      const { data, error } = await client
        .from('stock_movimientos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('⚠️ Error consultando movimientos:', error);
        return { 
          success: true, 
          data: []
        };
      }

      console.log(`✅ ${data?.length || 0} movimientos obtenidos`);
      
      return { 
        success: true, 
        data: data || [] 
      };
    } catch (error) {
      console.error('❌ Error obteniendo movimientos:', error);
      return { 
        success: true,
        data: [] 
      };
    }
  }

  /**
   * Realizar un movimiento de stock
   */
  @Post('movimientos')
  async realizarMovimiento(
    @CurrentTenant() tenantId: string,
    @Body() movimiento: any
  ) {
    console.log(`📦 [Inventario] Realizando movimiento para tenant: ${tenantId}`);
    return this.inventoryService.realizarMovimientoStock(movimiento, tenantId);
  }

  /**
   * Obtener producto específico por ID
   */
  @Get('productos/:id')
  @ApiOperation({ summary: 'Obtener producto por ID' })
  @ApiResponse({ status: 200, description: 'Producto obtenido exitosamente' })
  async getProducto(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string
  ) {
    try {
      console.log(`🔍 [Tenant: ${tenantId}] Obteniendo producto por ID:`, id);
      
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .single();

      if (error) throw error;

      if (!data) {
        return {
          success: false,
          message: 'Producto no encontrado'
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      console.error('Error obteniendo producto:', error);
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
  @ApiOperation({ summary: 'Eliminar producto por ID' })
  @ApiResponse({ status: 200, description: 'Producto eliminado exitosamente' })
  async deleteProducto(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    try {
      console.log(`🗑️ [Tenant: ${tenantId}] Eliminando producto por ID:`, id);
      
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

        if (deleteError) throw deleteError;

        return {
          success: true,
          data: producto,
          message: 'Producto eliminado exitosamente'
        };
      }
    } catch (error) {
      console.error('❌ Error eliminando producto:', error);
      return {
        success: false,
        message: 'Error al eliminar el producto: ' + error.message
      };
    }
  }
}
