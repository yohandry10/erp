import { BadRequestException, Controller, Get, Post, Put, Body, Param, Query, UseGuards, Delete, Headers, InternalServerErrorException, Logger, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentTenant, CurrentUser } from '../../common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { AlmacenesService } from './almacenes/almacenes.service';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { InventarioService } from './inventario.service';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { RequireFeatureFlag } from '../../common/decorators/feature-flag.decorator';
import { TaxCalculatorService } from '../../shared/utils/tax-calculator';
import { CreateCategoriaProductoDto, UpdateCategoriaProductoDto } from './dto/categoria-producto.dto';
import {
  RegistrarAjusteInventarioDto,
  TransferirInventarioDto,
} from './dto/operacion-inventario.dto';
import {
  CreateAlmacenDto,
  CreateProductoMaestroDto,
  CreateUbicacionDto,
  UpdateAlmacenDto,
  UpdateProductoMaestroDto,
  UpdateUbicacionDto,
} from './dto/maestro-inventario.dto';
import { MAX_PRODUCT_IMAGE_BYTES, ProductImagesService, ProductImageUpload } from './product-images.service';
import { rangoDelDiaDelTenant } from '../../shared/utils/fecha-tenant.util';

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
    private readonly supabase: SupabaseService,
    private readonly almacenesService: AlmacenesService,
    private readonly inventarioService: InventarioService,
    private readonly taxCalculator: TaxCalculatorService,
    private readonly productImagesService: ProductImagesService,
  ) {}

  private requireActor(actorId: string): string {
    if (!actorId) {
      throw new BadRequestException('Se requiere un usuario autenticado para modificar inventario');
    }
    return actorId;
  }

  private requireIdempotencyKey(key?: string): string {
    const value = key?.trim() ?? '';
    if (value.length < 8 || value.length > 180) {
      throw new BadRequestException('Idempotency-Key debe tener entre 8 y 180 caracteres');
    }
    return value;
  }

  /**
   * Obtener almacenes activos del tenant
   */
  @Get('almacenes')
  @RequirePermission('inventario.almacenes.read') // HARDENING: listado de almacenes requiere permiso.
  @ApiOperation({ summary: 'Listar almacenes activos' })
  @ApiResponse({ status: 200, description: 'Almacenes listados exitosamente' })
  async getAlmacenes(
    @CurrentTenant() tenantId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    try {
      this.logger.log(`🏢 [Tenant: ${tenantId}] Obteniendo almacenes...`); // HARDENING: reemplaza console.log para auditoría multitenant.
      const almacenes = await this.almacenesService.listar(
        tenantId,
        `${includeInactive ?? 'false'}`.toLowerCase() === 'true',
      );
      
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

  @Post('almacenes')
  @RequirePermission('inventario.almacenes.create')
  @ApiOperation({ summary: 'Crear almacén de inventario' })
  async createAlmacen(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Body() body: CreateAlmacenDto,
  ) {
    const data = await this.inventarioService.crearAlmacenMaestro(
      tenantId,
      this.requireActor(actorId),
      body,
    );
    return { success: true, data, message: 'Almacén creado exitosamente' };
  }

  @Put('almacenes/:almacenId')
  @RequirePermission('inventario.almacenes.update')
  @ApiOperation({ summary: 'Actualizar almacén de inventario' })
  async updateAlmacen(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Param('almacenId') almacenId: string,
    @Body() body: UpdateAlmacenDto,
  ) {
    const data = await this.inventarioService.actualizarAlmacenMaestro(
      tenantId,
      this.requireActor(actorId),
      almacenId,
      body,
    );
    return { success: true, data, message: 'Almacén actualizado exitosamente' };
  }

  @Delete('almacenes/:almacenId')
  @RequirePermission('inventario.almacenes.delete')
  @ApiOperation({ summary: 'Desactivar almacén sin stock ni reservas' })
  async deleteAlmacen(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Param('almacenId') almacenId: string,
    @Headers('idempotency-key') key?: string,
  ) {
    const data = await this.inventarioService.desactivarAlmacenMaestro(
      tenantId,
      this.requireActor(actorId),
      almacenId,
      this.requireIdempotencyKey(key),
    );
    return { success: true, data, message: 'Almacén desactivado exitosamente' };
  }

  /**
   * Obtener ubicaciones de un almacén
   */
  @Get('almacenes/:almacenId/ubicaciones')
  @RequirePermission('inventario.ubicaciones.read')
  @ApiOperation({ summary: 'Listar ubicaciones de un almacén' })
  @ApiResponse({ status: 200, description: 'Ubicaciones listadas exitosamente' })
  async getUbicaciones(
    @CurrentTenant() tenantId: string,
    @Param('almacenId') almacenId: string
  ) {
    try {
      this.logger.log(`📍 [Tenant: ${tenantId}] Obteniendo ubicaciones del almacén ${almacenId}...`); // HARDENING: traza accesos a estructuras de inventario.
      
      const data = await this.almacenesService.listarUbicaciones(tenantId, almacenId, true);

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

  @Post('almacenes/:almacenId/ubicaciones')
  @RequirePermission('inventario.ubicaciones.create')
  @ApiOperation({ summary: 'Crear ubicación dentro de un almacén' })
  async createUbicacion(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Param('almacenId') almacenId: string,
    @Body() body: CreateUbicacionDto,
  ) {
    const data = await this.inventarioService.crearUbicacionMaestro(
      tenantId,
      this.requireActor(actorId),
      almacenId,
      body,
    );
    return { success: true, data, message: 'Ubicación creada exitosamente' };
  }

  @Put('almacenes/:almacenId/ubicaciones/:ubicacionId')
  @RequirePermission('inventario.ubicaciones.update')
  @ApiOperation({ summary: 'Actualizar ubicación de almacén' })
  async updateUbicacion(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Param('almacenId') almacenId: string,
    @Param('ubicacionId') ubicacionId: string,
    @Body() body: UpdateUbicacionDto,
  ) {
    const data = await this.inventarioService.actualizarUbicacionMaestro(
      tenantId,
      this.requireActor(actorId),
      almacenId,
      ubicacionId,
      body,
    );
    return { success: true, data, message: 'Ubicación actualizada exitosamente' };
  }

  @Delete('almacenes/:almacenId/ubicaciones/:ubicacionId')
  @RequirePermission('inventario.ubicaciones.delete')
  @ApiOperation({ summary: 'Desactivar ubicación sin stock ni reservas' })
  async deleteUbicacion(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Param('almacenId') almacenId: string,
    @Param('ubicacionId') ubicacionId: string,
    @Headers('idempotency-key') key?: string,
  ) {
    const data = await this.inventarioService.desactivarUbicacionMaestro(
      tenantId,
      this.requireActor(actorId),
      almacenId,
      ubicacionId,
      this.requireIdempotencyKey(key),
    );
    return { success: true, data, message: 'Ubicación desactivada exitosamente' };
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
   * Obtener kardex valorizado de todos los movimientos físicos del inventario
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
        throw new Error('Cliente de base de datos no disponible');
      }

      const { data: productos, error: productosError } = await client
        .from('productos')
        .select('precio_compra, costo, stock_actual, stock_minimo')
        .eq('tenant_id', tenantId)
        .eq('activo', true);

      if (productosError) throw productosError;

      const totalProductos = productos?.length || 0;
      const valorInventario =
        productos?.reduce(
          (sum, p) =>
            sum +
              (parseFloat(p.precio_compra || 0) || parseFloat((p as any).costo || 0)) *
                parseFloat((p as any).stock_actual || 0),
          0,
        ) || 0;
      const productosStockBajo =
        productos?.filter(
          p => parseFloat((p as any).stock_actual || 0) <= parseFloat(p.stock_minimo || 0),
        ).length || 0;

      // `created_at` es timestamptz: comparar contra un literal sin zona hacía que
      // «los movimientos de hoy» abarcaran desde las 19:00 de ayer para un tenant
      // peruano. Y el borde superior dejaba fuera el último milisegundo del día.
      const { desde, hasta } = await rangoDelDiaDelTenant(client, tenantId);
      const { count: movimientosHoy, error: movimientosError } = await client
        .from('movimientos_inventario')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', desde)
        .lt('created_at', hasta);
      if (movimientosError) throw movimientosError;

      return {
        success: true,
        data: {
          totalProductos,
          valorInventario,
          productosStockBajo,
          movimientosHoy: movimientosHoy || 0
        }
      };
    } catch (error) {
      this.logger.error('❌ Error obteniendo estadísticas', error as Error);
      throw new InternalServerErrorException('No fue posible calcular las estadísticas de inventario');
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
      } else {
        supaQuery = supaQuery.eq('activo', true);
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
  async createProducto(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Body() productData: CreateProductoMaestroDto,
  ) {
    const impuesto = productData.impuesto
      ?? (await this.taxCalculator.getTasaIgv(tenantId)) * 100;
    const data = await this.inventarioService.crearProductoMaestro(
      tenantId,
      this.requireActor(actorId),
      { ...productData, impuesto },
    );
    return { success: true, data, message: 'Producto creado exitosamente' };
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

  /** Ajuste manual: ledger, saldo y outbox contable en una sola RPC. */
  @Post('movimientos')
  @RequirePermission('inventario.movimientos.create') // HARDENING: creación de movimientos limitada.
  @ApiOperation({ summary: 'Registrar ajuste manual de inventario' })
  async realizarMovimiento(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Body() movimiento: RegistrarAjusteInventarioDto,
  ) {
    if (!actorId) {
      throw new BadRequestException('Se requiere un usuario autenticado para ajustar inventario');
    }
    this.logger.log(`📦 [Inventario] Registrando ajuste atómico para tenant: ${tenantId}`);
    const data = await this.inventarioService.registrarAjusteAtomico(
      tenantId,
      actorId,
      movimiento,
    );
    return { success: true, data };
  }

  /** Traslado físico entre almacenes; no crea ingreso ni gasto contable. */
  @Post('transferencias')
  @RequirePermission('inventario.movimientos.create')
  @ApiOperation({ summary: 'Transferir existencias entre almacenes' })
  async transferirInventario(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Body() transferencia: TransferirInventarioDto,
  ) {
    if (!actorId) {
      throw new BadRequestException('Se requiere un usuario autenticado para transferir inventario');
    }
    const data = await this.inventarioService.transferirStockAtomico(
      tenantId,
      actorId,
      transferencia,
    );
    return { success: true, data };
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
  async deleteProducto(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Headers('idempotency-key') key?: string,
  ) {
    const data = await this.inventarioService.desactivarProductoMaestro(
      tenantId,
      this.requireActor(actorId),
      id,
      this.requireIdempotencyKey(key),
    );
    return { success: true, data, message: 'Producto desactivado exitosamente' };
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
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Body() productData: UpdateProductoMaestroDto,
  ) {
    const data = await this.inventarioService.actualizarProductoMaestro(
      tenantId,
      this.requireActor(actorId),
      id,
      productData,
    );
    return { success: true, data, message: 'Producto actualizado exitosamente' };
  }

  @Post('productos/:id/imagen')
  @RequirePermission('inventario.productos.update')
  @UseInterceptors(FileInterceptor('file', {
    limits: { files: 1, fileSize: MAX_PRODUCT_IMAGE_BYTES },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Subir o reemplazar la imagen de un producto' })
  async uploadProductImage(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Param('id') productId: string,
    @Headers('idempotency-key') key: string | undefined,
    @UploadedFile() file?: ProductImageUpload,
  ) {
    const data = await this.productImagesService.upload(
      tenantId,
      this.requireActor(actorId),
      productId,
      this.requireIdempotencyKey(key),
      file,
    );
    return {
      success: true,
      data,
      message: data.cleanup_pending
        ? 'Imagen actualizada; la limpieza del objeto anterior quedó pendiente de reintento'
        : 'Imagen del producto actualizada exitosamente',
    };
  }

  @Delete('productos/:id/imagen')
  @RequirePermission('inventario.productos.update')
  @ApiOperation({ summary: 'Quitar de forma segura la imagen de un producto' })
  async deleteProductImage(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Param('id') productId: string,
    @Headers('idempotency-key') key?: string,
  ) {
    const data = await this.productImagesService.remove(
      tenantId,
      this.requireActor(actorId),
      productId,
      this.requireIdempotencyKey(key),
    );
    return { success: true, data, message: 'Imagen del producto eliminada exitosamente' };
  }

  // ============================================================
  // CRUD de Categorías de Producto
  // ============================================================

  /**
   * Listar categorías de producto del tenant
   */
  @Get('categorias')
  @RequirePermission('inventario.productos.read')
  @ApiOperation({ summary: 'Listar categorías de producto' })
  @ApiResponse({ status: 200, description: 'Categorías listadas exitosamente' })
  async getCategorias(@CurrentTenant() tenantId: string) {
    try {
      this.logger.log(`🏷️ [Tenant: ${tenantId}] Obteniendo categorías de producto...`);
      const { data, error } = await this.supabase.getClient()
        .from('categorias_producto')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .order('orden', { ascending: true });

      if (error) throw error;

      return { success: true, data: data || [] };
    } catch (error) {
      this.logger.error('❌ Error obteniendo categorías', error as Error);
      return { success: false, message: 'Error al obtener categorías: ' + (error as Error).message, data: [] };
    }
  }

  /**
   * Crear categoría de producto
   */
  @Post('categorias')
  @RequirePermission('inventario.productos.create')
  @ApiOperation({ summary: 'Crear categoría de producto' })
  @ApiResponse({ status: 201, description: 'Categoría creada exitosamente' })
  async createCategoria(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Body() body: CreateCategoriaProductoDto,
  ) {
    const data = await this.inventarioService.crearCategoriaMaestro(
      tenantId,
      this.requireActor(actorId),
      body,
    );
    return { success: true, data, message: 'Categoría creada exitosamente' };
  }

  /**
   * Actualizar categoría de producto
   */
  @Put('categorias/:id')
  @RequirePermission('inventario.productos.update')
  @ApiOperation({ summary: 'Actualizar categoría de producto' })
  @ApiResponse({ status: 200, description: 'Categoría actualizada exitosamente' })
  async updateCategoria(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Body() body: UpdateCategoriaProductoDto,
  ) {
    const data = await this.inventarioService.actualizarCategoriaMaestro(
      tenantId,
      this.requireActor(actorId),
      id,
      body,
    );
    return { success: true, data, message: 'Categoría actualizada exitosamente' };
  }

  /**
   * Eliminar categoría de producto
   */
  @Delete('categorias/:id')
  @RequirePermission('inventario.productos.delete')
  @ApiOperation({ summary: 'Eliminar categoría de producto' })
  @ApiResponse({ status: 200, description: 'Categoría eliminada exitosamente' })
  async deleteCategoria(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Headers('idempotency-key') key?: string,
  ) {
    const data = await this.inventarioService.desactivarCategoriaMaestro(
      tenantId,
      this.requireActor(actorId),
      id,
      this.requireIdempotencyKey(key),
    );
    return { success: true, data, message: 'Categoría desactivada exitosamente' };
  }
}
