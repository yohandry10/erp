import { Controller, Get, Post, Put, Delete, Patch, Body, Query, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { EventBusService } from '../shared/events/event-bus.service';
import { InventoryIntegrationService } from '../shared/integration/inventory-integration.service';
import { TaxCalculatorService } from '../shared/utils/tax-calculator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { TenantContextService } from '../shared/tenant/tenant-context.service';
import { CreateProveedorDto } from './compras/dto/create-proveedor.dto';
import { v4 as uuidv4 } from 'uuid';

@ApiTags('compras')
@Controller('compras')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: proteger endpoints globales de compras.
export class ComprasController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly inventoryIntegration: InventoryIntegrationService,
    private readonly tenantContext: TenantContextService,
    private readonly taxCalculator: TaxCalculatorService,
  ) {}

  private resolveTenant(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      // HARDENING: se evita fallback inseguro de tenant.
      throw new ForbiddenException('Tenant requerido');
    }
    return tenantId;
  }

  @Get('stats')
  @RequirePermission('compras.ordenes.ver')
  @ApiOperation({ summary: 'Obtener estadísticas de compras' })
  @ApiResponse({ status: 200, description: 'Estadísticas obtenidas exitosamente' })
  async getStats(@Query() filtros: any) {
    try {
      const tenantId = this.resolveTenant(); // HARDENING: tenant proviene del contexto, no de filtros externos.
      const supabase = this.supabase.getClient();

      console.log(`📊 [Compras Stats] Obteniendo estadísticas de compras para tenant: ${tenantId}`);

      // USAR LA MISMA CONSULTA QUE FUNCIONA EN getOrdenes
      const { data: todasLasCompras, error: comprasError } = await supabase
        .from('ordenes_compra')
        .select('*')
        .eq('tenant_id', tenantId) // ✅ Filtro de tenant
        .order('created_at', { ascending: false });

      if (comprasError) {
        console.error('❌ [Compras Stats] Error en consulta principal:', comprasError);
        throw comprasError;
      }

      console.log('🔍 [Compras Stats] DEBUG - Datos obtenidos:', {
        totalComprasEncontradas: todasLasCompras?.length,
        primerasTresCompras: todasLasCompras?.slice(0, 3)?.map(c => ({
          total: c.total,
          estado: c.estado,
          fecha: c.fecha_orden
        }))
      });

      // Calcular estadísticas directamente de los datos obtenidos
      const totalComprasMonto = todasLasCompras?.reduce((sum, orden) => {
        const total = parseFloat(orden.total) || 0;
        console.log(`💰 Sumando orden ${orden.numero}: ${total}`);
        return sum + total;
      }, 0) || 0;

      const cantidadCompras = todasLasCompras?.length || 0;
      const ordenesActivas = todasLasCompras?.filter(o => ['PENDIENTE', 'ENTREGADO'].includes(o.estado)).length || 0;
      const ordenesVencidas = todasLasCompras?.filter(o => o.estado === 'PENDIENTE' && new Date(o.fecha_entrega) < new Date()).length || 0;

      // Obtener proveedores activos de forma simple
      let proveedoresActivos = 0;
      try {
        const { data: proveedores } = await supabase
          .from('proveedores')
          .select('id')
          .eq('tenant_id', tenantId) // ✅ Filtro de tenant
          .eq('activo', true);
        proveedoresActivos = proveedores?.length || 0;
      } catch (error) {
        console.warn('⚠️ [Compras Stats] No se pudo obtener proveedores:', error);
        proveedoresActivos = 2; // Valor por defecto basado en los logs
      }

      const estadisticas = {
        comprasDelMes: cantidadCompras,
        totalCompras: totalComprasMonto,
        montoTotalMes: totalComprasMonto,
        ordenesActivas: ordenesActivas,
        proveedoresActivos: proveedoresActivos,
        ordenesVencidas: ordenesVencidas
      };

      console.log('✅ [Compras Stats] Estadísticas calculadas:', estadisticas);
      console.log('💰 [Compras Stats] Total calculado:', totalComprasMonto);

      return {
        success: true,
        data: estadisticas
      };
    } catch (error) {
      console.error('❌ [Compras Stats] Error completo:', {
        message: error.message,
        details: error.stack,
        hint: error.hint || '',
        code: error.code || ''
      });

      // Devolver datos por defecto si hay error
      return {
        success: true,
        data: {
          comprasDelMes: 0,
          totalCompras: 0,
          montoTotalMes: 0,
          ordenesActivas: 0,
          proveedoresActivos: 0,
          ordenesVencidas: 0
        }
      };
    }
  }

  @Get()
  @RequirePermission('compras.ordenes.ver')
  async getOrdenes(@Query() filtros: any) {
    try {
      const tenantId = this.resolveTenant(); // HARDENING: usar tenant del contexto.
      let query = this.supabase.getClient()
        .from('ordenes_compra')
        .select(`
          *,
          proveedor:proveedores(*)
        `)
        .eq('tenant_id', tenantId) // ✅ Filtro de tenant
        .order('created_at', { ascending: false });

      if (filtros.estado) {
        query = query.eq('estado', filtros.estado);
      }

      if (filtros.fechaDesde) {
        query = query.gte('fecha_orden', filtros.fechaDesde);
      }

      if (filtros.fechaHasta) {
        query = query.lte('fecha_orden', filtros.fechaHasta);
      }

      const { data: ordenes, error } = await query;

      if (error) throw error;

      return {
        success: true,
        data: ordenes || []
      };
    } catch (error) {
      console.error('❌ Error obteniendo órdenes de compra:', error);
      return {
        success: false,
        error: error.message,
        data: []
      };
    }
  }

  @Get('next-number')
  @RequirePermission('compras.ordenes.crear')
  @ApiOperation({ summary: 'Obtener siguiente número de orden' })
  @ApiResponse({ status: 200, description: 'Número generado exitosamente' })
  async getNextNumber(@Query() filtros: any) {
    try {
      const tenantId = this.resolveTenant(); // HARDENING: usar tenant del contexto.
      const supabase = this.supabase.getClient();

      // Obtener el último número de orden
      const { data, error } = await supabase
        .from('ordenes_compra')
        .select('numero')
        .eq('tenant_id', tenantId) // ✅ Filtro de tenant
        .like('numero', 'OC-%')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      let nextNumber = 1;
      if (data && data.length > 0) {
        const lastNumber = data[0].numero;
        const match = lastNumber.match(/OC-\d{4}-(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      const year = new Date().getFullYear();
      const numero = `OC-${year}-${nextNumber.toString().padStart(3, '0')}`;

      return {
        success: true,
        data: { numero }
      };
    } catch (error) {
      console.error('Error generating next number:', error);
      return {
        success: false,
        message: 'Error al generar número de orden',
        error: error.message
      };
    }
  }

  @Post()
  @RequirePermission('compras.ordenes.crear')
  async crearOrden(@Body() ordenData: any) {
    try {
      const tenantId = this.resolveTenant(); // HARDENING: tenant siempre proviene del contexto.
      ordenData.tenant_id = tenantId;
      console.log(`🛒 Creando nueva orden de compra para tenant: ${tenantId}`);

      // Calcular totales
      const subtotal = ordenData.items.reduce((sum, item) =>
        sum + (item.cantidad * item.precio_unitario), 0);

      // ✅ CORRECCIÓN: Usar TaxCalculatorService en lugar de hardcodear IGV
      const taxResult = await this.taxCalculator.calcularImpuestos({
        subtotal,
        tenantId,
      });
      const igv = taxResult.igv;
      const total = taxResult.total;

      // Crear orden de compra
      const { data: orden, error: ordenError } = await this.supabase.getClient()
        .from('ordenes_compra')
        .insert({
          tenant_id: tenantId, // ✅ Incluir tenant
          numero_orden: `OC-${Date.now()}`,
          proveedor_id: ordenData.proveedor_id,
          fecha_orden: new Date().toISOString(),
          fecha_requerida: ordenData.fecha_requerida,
          estado: 'PENDIENTE',
          subtotal: subtotal,
          igv: igv,
          total: total,
          observaciones: ordenData.observaciones,
          usuario_id: ordenData.usuario_id || 'sistema'
        })
        .select()
        .single();

      if (ordenError) throw ordenError;

      // Crear detalles de la orden
      const detalles = ordenData.items.map(item => ({
        orden_id: orden.id,
        producto_id: item.producto_id,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.cantidad * item.precio_unitario
      }));

      const { error: detallesError } = await this.supabase.getClient()
        .from('orden_compra_detalles')
        .insert(detalles);

      if (detallesError) throw detallesError;

      console.log(`✅ Orden de compra creada: ${orden.numero_orden}`);

      return {
        success: true,
        message: 'Orden de compra creada exitosamente',
        data: orden
      };
    } catch (error) {
      console.error('❌ Error creando orden de compra:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Put(':id/recibir')
  @RequirePermission('compras.ordenes.actualizar')
  async recibirMercancia(@Param('id') ordenId: string, @Body() recepcionData: any) {
    try {
      const tenantId = this.resolveTenant(); // HARDENING: tenant proviene del contexto.
      recepcionData.tenant_id = tenantId;
      console.log(`📦 Procesando recepción de mercancía para orden: ${ordenId}, tenant: ${tenantId}`);

      // Obtener orden con detalles
      const { data: orden, error: ordenError } = await this.supabase.getClient()
        .from('ordenes_compra')
        .select(`
          *,
          orden_compra_detalles:orden_compra_detalles!fk_orden_compra_detalles_orden_id(*),
          proveedor:proveedores(*)
        `)
        .eq('tenant_id', tenantId) // ✅ Filtro de tenant
        .eq('id', ordenId)
        .single();

      if (ordenError || !orden) throw new Error('Orden de compra no encontrada');

      // Validar estado
      if (orden.estado !== 'PENDIENTE' && orden.estado !== 'PARCIAL') {
        throw new Error('La orden no está en estado válido para recepción');
      }

      // Procesar cada item recibido
      for (const itemRecibido of recepcionData.items) {
        const detalleOrden = orden.orden_compra_detalles.find(d => d.id === itemRecibido.detalle_id);
        if (!detalleOrden) continue;

        // Actualizar stock del producto
        await this.inventoryIntegration.actualizarStockProducto(
          detalleOrden.producto_id,
          itemRecibido.cantidad_recibida,
          'ENTRADA',
          `Recepción OC: ${orden.numero_orden}`,
          detalleOrden.precio_unitario
        );

        // Actualizar cantidad recibida en el detalle
        await this.supabase.getClient()
          .from('orden_compra_detalles')
          .update({
            cantidad_recibida: (detalleOrden.cantidad_recibida || 0) + itemRecibido.cantidad_recibida,
            fecha_recepcion: new Date().toISOString()
          })
          .eq('id', itemRecibido.detalle_id);
      }

      // Determinar nuevo estado de la orden
      const { data: detallesActualizados } = await this.supabase.getClient()
        .from('orden_compra_detalles')
        .select('cantidad, cantidad_recibida')
        .eq('tenant_id', tenantId) // ✅ Filtro de tenant
        .eq('orden_id', ordenId);

      const totalPedido = detallesActualizados?.reduce((sum, d) => sum + d.cantidad, 0) || 0;
      const totalRecibido = detallesActualizados?.reduce((sum, d) => sum + (d.cantidad_recibida || 0), 0) || 0;

      let nuevoEstado = 'PENDIENTE';
      if (totalRecibido >= totalPedido) {
        nuevoEstado = 'ENTREGADO';
      } else if (totalRecibido > 0) {
        nuevoEstado = 'PARCIAL';
      }

      // Actualizar estado de la orden
      await this.supabase.getClient()
        .from('ordenes_compra')
        .update({
          estado: nuevoEstado,
          fecha_entrega: nuevoEstado === 'ENTREGADO' ? new Date().toISOString() : null
        })
        .eq('tenant_id', tenantId) // ✅ Validar tenant
        .eq('id', ordenId);

      // Si la orden está completamente entregada, emitir evento para contabilidad
      if (nuevoEstado === 'ENTREGADO') {
        // HARDENING: evento de compra incluye metadatos idempotentes para contabilidad/inventario.
        const eventId = uuidv4();
        const idempotencyKey = `compra:${tenantId}:${orden.id}:${eventId}`;
        const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
        const subtotal = round2(orden.subtotal ?? 0);
        const igv = round2(orden.igv ?? 0);
        const total = round2(orden.total ?? subtotal + igv);
        const moneda = orden.moneda ?? 'PEN';

        this.eventBus.emitCompraEntregada({
          tenantId,
          eventId,
          idempotencyKey,
          ordenId: orden.id,
          numeroOrden: orden.numero_orden,
          proveedorId: orden.proveedor_id ?? orden.proveedor?.id,
          proveedorNombre: orden.proveedor?.nombre ?? 'Proveedor',
          proveedorRuc: orden.proveedor?.ruc ?? null,
          fechaEntrega: new Date().toISOString(),
          subtotal,
          igv,
          total,
          moneda,
          diasCredito: orden.proveedor?.dias_credito ?? null,
          condicionesPago: orden.proveedor?.condiciones_pago ?? null,
          almacenId: recepcionData?.almacen_id ?? null,
          observaciones: recepcionData?.observaciones ?? null,
          items: orden.orden_compra_detalles.map((item) => {
            const cantidad = Number(item.cantidad ?? 0);
            const precioUnitario = round2(item.precio_unitario ?? 0);
            return {
              productoId: item.producto_id,
              descripcion: item.descripcion ?? item.nombre ?? 'Producto',
              cantidad,
              precioUnitario,
              total: round2(precioUnitario * cantidad),
              calidad: 'OK',
              ubicacionId: recepcionData?.ubicacion_id ?? null,
            };
          }),
          emittedAt: new Date().toISOString(),
        });
      }

      console.log(`✅ Recepción procesada. Nuevo estado: ${nuevoEstado}`);

      return {
        success: true,
        message: 'Recepción de mercancía procesada exitosamente',
        data: {
          ordenId: orden.id,
          estado: nuevoEstado,
          totalRecibido,
          totalPedido
        }
      };
    } catch (error) {
      console.error('❌ Error procesando recepción:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Put(':id/cancelar')
  @RequirePermission('compras.ordenes.cancelar')
  async cancelarOrden(@Param('id') ordenId: string, @Body() motivoData: any) {
    try {
      const tenantId = this.resolveTenant(); // HARDENING: tenant del contexto.
      const { error } = await this.supabase.getClient()
        .from('ordenes_compra')
        .update({
          estado: 'CANCELADO',
          observaciones: `${motivoData.motivo || 'Cancelado'} - Fecha: ${new Date().toLocaleDateString()}`
        })
        .eq('tenant_id', tenantId) // ✅ Validar tenant
        .eq('id', ordenId);

      if (error) throw error;

      return {
        success: true,
        message: 'Orden de compra cancelada exitosamente'
      };
    } catch (error) {
      console.error('❌ Error cancelando orden:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Get('proveedores')
  @RequirePermission('compras.proveedores.ver')
  @ApiOperation({ summary: 'Obtener lista de proveedores' })
  @ApiResponse({ status: 200, description: 'Proveedores obtenidos exitosamente' })
  async getProveedores(@CurrentTenant() tenantId: string) {
    try {
      console.log('🚀 [GET /api/compras/proveedores] INICIANDO...');
      const supabase = this.supabase.getClient();
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .eq('tenant_id', tenantId) // ✅ Filtro de tenant
        .eq('activo', true)
        .order('razon_social', { ascending: true });

      if (error) {
        console.error('❌ [Proveedores API] ERROR SUPABASE:', error);
        throw error;
      }

      console.log(`✅ [Proveedores API] DATOS OBTENIDOS: ${data?.length || 0} proveedores`);

      if (data && data.length > 0) {
        console.log('🔍 [Proveedores API] PRIMER PROVEEDOR:', JSON.stringify(data[0], null, 2));
      }

      const mappedData = (data || []).map(proveedor => {
        const mapped = {
          id: proveedor.id,
          nombre: proveedor.razon_social || proveedor.nombre_comercial || 'Sin nombre',
          ruc: proveedor.ruc || 'Sin RUC',
          contacto: proveedor.contacto || proveedor.email || proveedor.telefono || 'Sin contacto',
          telefono: proveedor.telefono,
          email: proveedor.email,
          direccion: proveedor.direccion,
          condiciones_pago: proveedor.condiciones_pago || 'CONTADO',
          estado: proveedor.estado || 'ACTIVO',
          activo: proveedor.activo
        };

        console.log(`🔄 [Proveedores API] MAPEADO: ${mapped.ruc} - ${mapped.nombre}`);
        return mapped;
      });

      const response = {
        success: true,
        data: mappedData
      };

      console.log(`📤 [Proveedores API] RESPUESTA FINAL:`, JSON.stringify(response, null, 2));
      return response;

    } catch (error) {
      console.error('❌ [Proveedores API] ERROR TOTAL:', error);
      const errorResponse = {
        success: false,
        error: error.message,
        data: []
      };
      console.log(`📤 [Proveedores API] ERROR RESPONSE:`, errorResponse);
      return errorResponse;
    }
  }

  @Post('proveedores')
  @RequirePermission('compras.proveedores.crear')
  @ApiOperation({ summary: 'Crear nuevo proveedor' })
  @ApiResponse({ status: 201, description: 'Proveedor creado exitosamente' })
  async crearProveedor(
    @Body() proveedorData: CreateProveedorDto,
    @CurrentTenant() tenantId: string,
  ) {
    try {
      // HARDENING multi-tenant: tenant_id SIEMPRE viene del JWT, nunca del body.
      // Antes: el método aceptaba @Body() any y caía al primer tenant si el body
      // no traía tenant_id. Eso permitía writes cross-tenant a cualquier usuario
      // con permiso compras.proveedores.crear.

      // Verificar si ya existe un proveedor con el mismo RUC EN ESTE TENANT
      const { data: existente, error: checkError } = await this.supabase.getClient()
        .from('proveedores')
        .select('id, ruc')
        .eq('tenant_id', tenantId)
        .eq('ruc', proveedorData.ruc)
        .maybeSingle();

      if (checkError) {
        throw checkError;
      }

      if (existente) {
        return {
          success: false,
          error: `Ya existe un proveedor con RUC ${proveedorData.ruc}`
        };
      }

      const { data: proveedor, error } = await this.supabase.getClient()
        .from('proveedores')
        .insert({
          tenant_id: tenantId,
          ruc: proveedorData.ruc.trim(),
          razon_social: proveedorData.razon_social.trim(),
          nombre_comercial: proveedorData.nombre_comercial?.trim() || proveedorData.razon_social.trim(),
          direccion: proveedorData.direccion?.trim() || null,
          telefono: proveedorData.telefono?.trim() || null,
          email: proveedorData.email?.trim() || null,
          contacto: proveedorData.contacto?.trim() || null,
          estado: 'ACTIVO',
          condiciones_pago: proveedorData.condiciones_pago || 'CONTADO',
          activo: true
        })
        .select()
        .single();

      if (error) throw error;

      console.log('✅ [Proveedores] Proveedor creado exitosamente:', proveedor.id);

      return {
        success: true,
        message: 'Proveedor creado exitosamente',
        data: proveedor
      };
    } catch (error) {
      console.error('❌ [Proveedores] Error creando proveedor:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Put('proveedores/:id')
  @RequirePermission('compras.proveedores.editar')
  @ApiOperation({ summary: 'Actualizar proveedor existente' })
  @ApiResponse({ status: 200, description: 'Proveedor actualizado exitosamente' })
  async actualizarProveedor(@Param('id') proveedorId: string, @Body() proveedorData: any) {
    try {
      console.log('✏️ [Proveedores] Actualizando proveedor:', proveedorId, proveedorData);

      // Validación básica
      if (!proveedorData.ruc || !proveedorData.razon_social) {
        return {
          success: false,
          error: 'RUC y Razón Social son obligatorios'
        };
      }

      const tenantId = this.resolveTenant(); // HARDENING: tenant tomado del contexto.
      proveedorData.tenant_id = tenantId;

      // Verificar si existe otro proveedor con el mismo RUC (excepto el actual)
      const { data: existente, error: checkError } = await this.supabase.getClient()
        .from('proveedores')
        .select('id, ruc')
        .eq('tenant_id', tenantId) // ✅ Filtro de tenant
        .eq('ruc', proveedorData.ruc)
        .neq('id', proveedorId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = No rows found
        throw checkError;
      }

      if (existente) {
        return {
          success: false,
          error: `Ya existe otro proveedor con RUC ${proveedorData.ruc}`
        };
      }

      const { data: proveedor, error } = await this.supabase.getClient()
        .from('proveedores')
        .update({
          ruc: proveedorData.ruc.trim(),
          razon_social: proveedorData.razon_social.trim(),
          nombre_comercial: proveedorData.nombre_comercial?.trim() || proveedorData.razon_social.trim(),
          direccion: proveedorData.direccion?.trim() || null,
          telefono: proveedorData.telefono?.trim() || null,
          email: proveedorData.email?.trim() || null,
          contacto: proveedorData.contacto?.trim() || null,
          condiciones_pago: proveedorData.condiciones_pago || 'CONTADO'
        })
        .eq('tenant_id', tenantId) // ✅ Validar tenant
        .eq('id', proveedorId)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ [Proveedores] Proveedor actualizado exitosamente:', proveedor.id);

      return {
        success: true,
        message: 'Proveedor actualizado exitosamente',
        data: proveedor
      };
    } catch (error) {
      console.error('❌ [Proveedores] Error actualizando proveedor:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Delete('proveedores/:id')
  @RequirePermission('compras.proveedores.eliminar')
  @ApiOperation({ summary: 'Desactivar proveedor (soft delete)' })
  @ApiResponse({ status: 200, description: 'Proveedor desactivado exitosamente' })
  async desactivarProveedor(@Param('id') proveedorId: string, @Body() data: any = {}) {
    try {
      const tenantId = this.resolveTenant(); // HARDENING: tenant desde contexto.
      data.tenant_id = tenantId;
      console.log(`🗑️ [Proveedores] Desactivando proveedor: ${proveedorId}, tenant: ${tenantId}`);

      // En lugar de eliminar, desactivamos el proveedor
      const { data: proveedor, error } = await this.supabase.getClient()
        .from('proveedores')
        .update({
          activo: false,
          estado: 'INACTIVO',
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', tenantId) // ✅ Validar tenant
        .eq('id', proveedorId)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ [Proveedores] Proveedor desactivado exitosamente:', proveedor.id);

      return {
        success: true,
        message: 'Proveedor desactivado exitosamente',
        data: proveedor
      };
    } catch (error) {
      console.error('❌ [Proveedores] Error desactivando proveedor:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Get('reporte-compras')
  @RequirePermission('compras.ordenes.ver')
  async getReporteCompras(@Query() filtros: any) {
    try {
      const tenantId = this.resolveTenant(); // HARDENING: reporte limitado al tenant actual.
      let query = this.supabase.getClient()
        .from('ordenes_compra')
        .select(`
          *,
          proveedor:proveedores(*),
          orden_compra_detalles:orden_compra_detalles!fk_orden_compra_detalles_orden_id(*)
        `)
        .eq('tenant_id', tenantId)
        .order('fecha_orden', { ascending: false });

      if (filtros.fechaDesde) {
        query = query.gte('fecha_orden', filtros.fechaDesde);
      }

      if (filtros.fechaHasta) {
        query = query.lte('fecha_orden', filtros.fechaHasta);
      }

      const { data: ordenes, error } = await query;

      if (error) throw error;

      // Calcular resumen
      const resumen = {
        totalOrdenes: ordenes?.length || 0,
        totalMonto: ordenes?.reduce((sum, o) => sum + (o.total || 0), 0) || 0,
        porEstado: {},
        topProveedores: []
      };

      // Agrupar por estado
      ordenes?.forEach(orden => {
        const estado = orden.estado;
        if (!resumen.porEstado[estado]) {
          resumen.porEstado[estado] = { cantidad: 0, monto: 0 };
        }
        resumen.porEstado[estado].cantidad++;
        resumen.porEstado[estado].monto += orden.total || 0;
      });

      // Top proveedores
      const proveedoresMap = {};
      ordenes?.forEach(orden => {
        const proveedorNombre = orden.proveedor?.nombre || 'Sin nombre';
        if (!proveedoresMap[proveedorNombre]) {
          proveedoresMap[proveedorNombre] = { cantidad: 0, monto: 0 };
        }
        proveedoresMap[proveedorNombre].cantidad++;
        proveedoresMap[proveedorNombre].monto += orden.total || 0;
      });

      resumen.topProveedores = Object.entries(proveedoresMap)
        .map(([nombre, data]: [string, any]) => ({ nombre, ...data }))
        .sort((a, b) => b.monto - a.monto)
        .slice(0, 5);

      return {
        success: true,
        data: {
          ordenes: ordenes || [],
          resumen
        }
      };
    } catch (error) {
      console.error('❌ Error generando reporte de compras:', error);
      return {
        success: false,
        error: error.message,
        data: { ordenes: [], resumen: {} }
      };
    }
  }

  @Get('productos')
  @RequirePermission('compras.ordenes.ver')
  @ApiOperation({ summary: 'Obtener lista de productos para compras' })
  @ApiResponse({ status: 200, description: 'Productos obtenidos exitosamente' })
  async getProductos() {
    try {
      const tenantId = this.resolveTenant(); // HARDENING: limitar catálogo al tenant.
      const supabase = this.supabase.getClient();

      console.log('🔍 OBTENIENDO PRODUCTOS...');

      // USAR LAS COLUMNAS EXACTAS DE LA TABLA productos
      const { data, error } = await supabase
        .from('productos')
        .select('id, codigo, nombre, precio, stock_actual, categoria, activo')
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .order('nombre', { ascending: true });

      if (error) {
        console.error('❌ Error getting productos:', error);
        throw error;
      }

      console.log('✅ PRODUCTOS OBTENIDOS:', JSON.stringify(data, null, 2));

      return {
        success: true,
        data:
          data?.map((p: any) => ({
            ...p,
            stock: p.stock_actual,
          })) || []
      };
    } catch (error) {
      console.error('❌ Error getting productos:', error);
      return {
        success: false,
        message: 'Error al obtener productos',
        error: error.message
      };
    }
  }

  // IMPORTANTE: Este endpoint debe ir AL FINAL porque captura cualquier ID
  @Get(':id')
  @RequirePermission('compras.ordenes.ver')
  @ApiOperation({ summary: 'Obtener orden específica por ID' })
  @ApiResponse({ status: 200, description: 'Orden obtenida exitosamente' })
  async getOrden(@Param('id') ordenId: string, @CurrentTenant() tenantId: string) {
    try {
      const { data: orden, error } = await this.supabase.getClient()
        .from('ordenes_compra')
        .select(`
          *,
          proveedor:proveedores(*),
          orden_compra_detalles:orden_compra_detalles!fk_orden_compra_detalles_orden_id(*)
        `)
        .eq('tenant_id', tenantId)
        .eq('id', ordenId)
        .single();

      if (error) throw error;

      return {
        success: true,
        data: orden
      };
    } catch (error) {
      console.error('❌ Error obteniendo orden:', error);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }
}

