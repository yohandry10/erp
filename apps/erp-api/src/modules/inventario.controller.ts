import { Controller, Get, Post, Body, Query, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { InventoryIntegrationService } from '../shared/integration/inventory-integration.service';

@ApiTags('inventario')
@Controller('inventario')
export class InventarioController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly inventoryService: InventoryIntegrationService
  ) {}
  
  @Get('test-connection')
  @ApiOperation({ summary: 'Probar conexión a Supabase' })
  async testConnection() {
    try {
      console.log('🔍 Probando conexión a Supabase...');
      
      // Probar conexión básica
      const client = this.supabase.getClient();
      if (!client) {
        return {
          success: false,
          message: 'Cliente de Supabase no inicializado',
          debug: {
            hasSupabaseService: !!this.supabase,
            hasClient: !!client
          }
        };
      }

      // Probar consulta simple
      const { data, error, count } = await client
        .from('productos')
        .select('*', { count: 'exact' })
        .limit(1);

      if (error) {
        console.error('❌ Error de Supabase:', error);
        return {
          success: false,
          message: 'Error en consulta Supabase',
          error: error.message,
          debug: {
            code: error.code,
            details: error.details,
            hint: error.hint
          }
        };
      }

      console.log('✅ Conexión exitosa. Productos encontrados:', count);
      return {
        success: true,
        message: 'Conexión exitosa',
        data: {
          totalProductos: count,
          muestraProductos: data
        }
      };

    } catch (error) {
      console.error('❌ Error general:', error);
      return {
        success: false,
        message: 'Error general de conexión',
        error: error.message
      };
    }
  }
  
  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de inventario' })
  @ApiResponse({ status: 200, description: 'Estadísticas obtenidas exitosamente' })
  async getStats() {
    try {
      console.log('📊 Obteniendo estadísticas de inventario...');
      
      // Verificar cliente de Supabase
      const client = this.supabase.getClient();
      if (!client) {
        console.error('❌ Cliente de Supabase no disponible');
        return {
          success: true,
          data: {
            totalProductos: 0,
            valorInventario: 0,
            movimientosHoy: 0,
            productosStockBajo: 0
          },
          message: 'Usando datos por defecto - Supabase no configurado'
        };
      }

      // Obtener estadísticas reales de la base de datos
      const { data: productos, error: productosError } = await client
        .from('productos')
        .select('precio, stock, stock_minimo');

      if (productosError) {
        console.error('❌ Error obteniendo productos:', productosError);
        throw productosError;
      }

      const totalProductos = productos?.length || 0;
      const valorInventario = productos?.reduce((sum, p) => sum + (parseFloat(p.precio || 0) * parseFloat(p.stock || 0)), 0) || 0;
      const productosStockBajo = productos?.filter(p => parseFloat(p.stock || 0) <= parseFloat(p.stock_minimo || 0)).length || 0;

      // Obtener movimientos de hoy
      const hoy = new Date().toISOString().split('T')[0];
              const { data: movimientos, error: movimientosError } = await client
        .from('stock_movimientos')
        .select('*')
        .gte('created_at', `${hoy}T00:00:00`)
        .lt('created_at', `${hoy}T23:59:59`);

      if (movimientosError) console.warn('⚠️ Error obteniendo movimientos:', movimientosError);

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
        },
        message: 'Error en base de datos: ' + error.message
      };
    }
  }

  @Get('productos')
  @ApiOperation({ summary: 'Listar productos de inventario' })
  @ApiResponse({ status: 200, description: 'Productos listados exitosamente' })
  async findAllProductos(@Query() query: any) {
    try {
      console.log('📦 Obteniendo productos del inventario desde Supabase...');
      
      const client = this.supabase.getClient();
      let supaQuery = client.from('productos').select('*');
      
      // Aplicar filtros si existen
      if (query.categoria) {
        supaQuery = supaQuery.eq('categoria', query.categoria);
      }
      
      if (query.estado) {
        supaQuery = supaQuery.eq('activo', query.estado === 'ACTIVO');
      }
      
      if (query.stockBajo === 'true') {
        supaQuery = supaQuery.lt('stock', 'stock_minimo');
      }

      console.log('🚀 Ejecutando consulta a tabla productos...');
      const { data, error } = await supaQuery.order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error de Supabase:', error);
        throw error;
      }

      console.log(`✅ ${data?.length || 0} productos obtenidos de Supabase`);
      console.log('📦 PRODUCTOS CON STOCK:', JSON.stringify(data?.map(p => ({
        nombre: p.nombre,
        stock: p.stock,
        precio: p.precio
      })), null, 2));
      
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

  @Get('movimientos')
  @ApiOperation({ summary: 'Listar movimientos de inventario' })
  @ApiResponse({ status: 200, description: 'Movimientos listados exitosamente' })
  async findAllMovimientos(@Query() query: any) {
    try {
      console.log('📊 Obteniendo movimientos de inventario...');
      
      const limit = query.limit ? parseInt(query.limit) : 50;
      
      // Verificar primero si la tabla existe
      const client = this.supabase.getClient();
      if (!client) {
        console.warn('⚠️ Cliente Supabase no disponible para movimientos');
        return { 
          success: true, 
          data: [],
          message: 'Sin conexión a base de datos'
        };
      }

      try {
        const { data, error } = await client
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
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) {
          console.warn('⚠️ Error consultando movimientos:', error);
          // Si la tabla no existe o hay error, devolver array vacío
          return { 
            success: true, 
            data: [],
            message: 'Tabla de movimientos vacía o no disponible'
          };
        }

        console.log(`✅ ${data?.length || 0} movimientos obtenidos`);
        
        return { 
          success: true, 
          data: data || [] 
        };
      } catch (queryError) {
        console.warn('⚠️ Error en query de movimientos:', queryError);
        return { 
          success: true, 
          data: [],
          message: 'Sin movimientos registrados'
        };
      }
    } catch (error) {
      console.error('❌ Error general obteniendo movimientos:', error);
      return { 
        success: true, // Cambiado a true para no bloquear la UI
        message: 'Sin movimientos disponibles',
        data: [] 
      };
    }
  }

  @Post('productos')
  @ApiOperation({ summary: 'Crear nuevo producto' })
  @ApiResponse({ status: 201, description: 'Producto creado exitosamente' })
  async createProducto(@Body() productData: any) {
    try {
      console.log('🆕 Creando nuevo producto:', productData);

      // Validar datos requeridos
      if (!productData.codigo || !productData.nombre || !productData.categoria) {
        return {
          success: false,
          message: 'Código, nombre y categoría son requeridos'
        };
      }

      // Verificar que no exista un producto con el mismo código
      const { data: existingProduct } = await this.supabase.getClient()
        .from('productos')
        .select('id')
        .eq('codigo', productData.codigo)
        .single();

      if (existingProduct) {
        return {
          success: false,
          message: 'Ya existe un producto con ese código'
        };
      }

      // Preparar datos para inserción usando nombres de columna correctos
      const nuevoProducto = {
        codigo: productData.codigo,
        nombre: productData.nombre,
        precio: parseFloat(productData.precioVenta || 0),
        stock: parseInt(productData.stock || 0),
        categoria: productData.categoria,
        activo: true,
        codigo_barras: productData.codigo,
        precio_mayorista: parseFloat(productData.precioCompra || 0),
        precio_especial: parseFloat(productData.precioVenta || 0),
        stock_minimo: parseInt(productData.stockMinimo || 0),
        impuesto: 18.0
      };

      const { data: insertedProduct, error } = await this.supabase.getClient()
        .from('productos')
        .insert([nuevoProducto])
        .select()
        .single();

      if (error) throw error;

      // Registrar movimiento de stock inicial si hay stock
      if (nuevoProducto.stock > 0) {
        try {
          await this.supabase.getClient()
            .from('stock_movimientos')
            .insert([{
              tenant_id: '550e8400-e29b-41d4-a716-446655440000',
              producto_id: insertedProduct.id,
              tipo_movimiento: 'ENTRADA',
              cantidad: nuevoProducto.stock,
              motivo: 'Stock inicial del producto',
              referencia: 'INICIAL',
              usuario_id: '550e8400-e29b-41d4-a716-446655440000',
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

  @Get('productos/:id')
  @ApiOperation({ summary: 'Obtener producto por ID' })
  @ApiResponse({ status: 200, description: 'Producto obtenido exitosamente' })
  async findOneProducto(@Param('id') id: string) {
    try {
      console.log('🔍 Obteniendo producto por ID:', id);
      
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select('*')
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

  @Delete('productos/:id')
  @ApiOperation({ summary: 'Eliminar producto por ID' })
  @ApiResponse({ status: 200, description: 'Producto eliminado exitosamente' })
  async deleteProducto(@Param('id') id: string) {
    try {
      console.log('🗑️ Eliminando producto por ID:', id);
      
      // Verificar que el producto existe
      const { data: producto, error: findError } = await this.supabase.getClient()
        .from('productos')
        .select('*')
        .eq('id', id)
        .single();

      if (findError || !producto) {
        return {
          success: false,
          message: 'Producto no encontrado'
        };
      }

      // Verificar si el producto tiene movimientos
      const { data: movimientos } = await this.supabase.getClient()
        .from('stock_movimientos')
        .select('id')
        .eq('producto_id', id)
        .limit(1);

      if (movimientos && movimientos.length > 0) {
        // En lugar de eliminar físicamente, marcamos como inactivo
        const { data: updatedProduct, error: updateError } = await this.supabase.getClient()
          .from('productos')
          .update({ activo: false })
          .eq('id', id)
          .select()
          .single();

        if (updateError) throw updateError;

        console.log('✅ Producto marcado como inactivo:', producto.nombre);
        return {
          success: true,
          data: updatedProduct,
          message: 'Producto desactivado exitosamente (tiene movimientos registrados)'
        };
      } else {
        // Si no tiene movimientos, eliminar físicamente
        const { error: deleteError } = await this.supabase.getClient()
          .from('productos')
          .delete()
          .eq('id', id);

        if (deleteError) throw deleteError;

        console.log('✅ Producto eliminado físicamente:', producto.nombre);
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