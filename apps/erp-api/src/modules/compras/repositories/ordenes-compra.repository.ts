import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CreateOrdenCompraDto } from '../dto/create-orden-compra.dto';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';

/**
 * Repositorio de Órdenes de Compra
 * 
 * RESPONSABILIDAD: Solo persistencia de datos (CRUD)
 * NO debe contener lógica de negocio ni cálculos
 */
@Injectable()
export class OrdenesCompraRepository {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly taxCalculator: TaxCalculatorService, // Solo para fallback
  ) {}

  async create(
    createDto: CreateOrdenCompraDto,
    tenantId: string,
    userId?: string,
    totales?: { subtotal: number; igv: number; total: number }
  ) {
    const supabase = this.supabaseService.getClient();

    // ✅ SRP: Los totales deben venir calculados desde el servicio
    // Si no se proporcionan, calcularlos aquí como fallback (pero el servicio debería enviarlos)
    let subtotal: number, igv: number, total: number;
    
    if (totales) {
      subtotal = totales.subtotal;
      igv = totales.igv;
      total = totales.total;
    } else {
      // Fallback: calcular si no se proporcionan (no recomendado)
      subtotal = createDto.detalles.reduce(
        (sum, detalle) => sum + (detalle.cantidad * detalle.precio_unitario),
        0
      );
      const taxResult = await this.taxCalculator.calcularImpuestos({
        subtotal,
        tenantId,
      });
      igv = taxResult.igv;
      total = taxResult.total;
    }

    // Preparar items array for JSONB field
    const items = createDto.detalles.map(detalle => ({
      producto_id: detalle.producto_id,
      producto_nombre: detalle.descripcion,
      cantidad: detalle.cantidad,
      precio_unitario: detalle.precio_unitario,
      subtotal: detalle.cantidad * detalle.precio_unitario
    }));

    // Preparar datos de la orden
    const ordenData: any = {
      tenant_id: tenantId,
      numero: createDto.numero,
      proveedor_id: createDto.proveedor_id,
      fecha_orden: createDto.fecha_orden 
        ? (createDto.fecha_orden instanceof Date 
            ? createDto.fecha_orden.toISOString().split('T')[0]
            : new Date(createDto.fecha_orden).toISOString().split('T')[0])
        : new Date().toISOString().split('T')[0],
      fecha_entrega: createDto.fecha_entrega_esperada
        ? (createDto.fecha_entrega_esperada instanceof Date
            ? createDto.fecha_entrega_esperada.toISOString().split('T')[0]
            : new Date(createDto.fecha_entrega_esperada).toISOString().split('T')[0])
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default: 30 days from now
      items: items, // JSONB array of items
      moneda: 'PEN', // Default currency
      estado: createDto.estado || 'PENDIENTE',
      subtotal,
      igv,
      total,
      created_by: userId
    };

    // Campos opcionales
    if (createDto.cotizacion_id) {
      ordenData.cotizacion_id = createDto.cotizacion_id;
    }

    if (createDto.fecha_entrega_esperada) {
      ordenData.fecha_entrega_esperada = createDto.fecha_entrega_esperada instanceof Date
        ? createDto.fecha_entrega_esperada.toISOString().split('T')[0]
        : new Date(createDto.fecha_entrega_esperada).toISOString().split('T')[0];
    }

    if (createDto.condiciones_pago) {
      ordenData.condiciones_pago = createDto.condiciones_pago;
    }

    if (createDto.dias_credito !== undefined) {
      ordenData.dias_credito = createDto.dias_credito;
    }

    if (createDto.almacen_destino_id) {
      ordenData.almacen_destino_id = createDto.almacen_destino_id;
    }

    if (createDto.observaciones) {
      ordenData.observaciones = createDto.observaciones;
    }

    // Insertar orden de compra
    const { data: orden, error: ordenError } = await supabase
      .from('ordenes_compra')
      .insert(ordenData)
      .select()
      .single();

    if (ordenError) {
      throw new Error(`Error al crear orden de compra: ${ordenError.message}`);
    }

    // Insertar detalles
    const detallesConSubtotal = createDto.detalles.map(detalle => ({
      orden_id: orden.id,
      producto_id: detalle.producto_id,
      descripcion: detalle.descripcion,
      cantidad: detalle.cantidad,
      precio_unitario: detalle.precio_unitario,
      subtotal: detalle.cantidad * detalle.precio_unitario,
      cantidad_recibida: detalle.cantidad_recibida || 0,
      cantidad_pendiente: detalle.cantidad - (detalle.cantidad_recibida || 0)
    }));

    const { data: detalles, error: detallesError } = await supabase
      .from('orden_compra_detalles')
      .insert(detallesConSubtotal)
      .select();

    if (detallesError) {
      // Rollback: eliminar orden si falla la inserción de detalles
      await supabase
        .from('ordenes_compra')
        .delete()
        .eq('id', orden.id);
      
      throw new Error(`Error al crear detalles de orden de compra: ${detallesError.message}`);
    }

    return {
      ...orden,
      detalles
    };
  }

  async findById(id: string, tenantId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: orden, error: ordenError } = await supabase
      .from('ordenes_compra')
      .select(`
        *,
        proveedor:proveedores(id, ruc, razon_social, nombre_comercial, condiciones_pago, dias_credito),
        almacen:almacenes(id, nombre, codigo)
      `)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (ordenError) {
      return null;
    }

    // Obtener detalles
    const { data: detalles, error: detallesError } = await supabase
      .from('orden_compra_detalles')
      .select('*')
      .eq('orden_id', id);

    if (detallesError) {
      throw new Error(`Error al obtener detalles: ${detallesError.message}`);
    }

    return {
      ...orden,
      detalles: detalles || []
    };
  }

  async findByNumero(numero: string, tenantId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('ordenes_compra')
      .select('*')
      .eq('numero', numero)
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      return null;
    }

    return data;
  }

  async findAll(tenantId: string, filters?: {
    estado?: string;
    proveedor_id?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    limit?: number;
    offset?: number;
  }) {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('ordenes_compra')
      .select(`
        *,
        proveedor:proveedores(id, ruc, razon_social, nombre_comercial)
      `, { count: 'exact' })
      .eq('tenant_id', tenantId);

    // ✅ FIX CRÍTICO: Soportar filtros compuestos con coma
    if (filters?.estado) {
      if (filters.estado.includes(',')) {
        // Múltiples estados separados por coma (ej: "APROBADA,PARCIAL")
        const estados = filters.estado.split(',').map((e: string) => e.trim());
        query = query.in('estado', estados);
      } else {
        // Un solo estado
        query = query.eq('estado', filters.estado);
      }
    }

    if (filters?.proveedor_id) {
      query = query.eq('proveedor_id', filters.proveedor_id);
    }

    if (filters?.fecha_desde) {
      query = query.gte('fecha_orden', filters.fecha_desde);
    }

    if (filters?.fecha_hasta) {
      query = query.lte('fecha_orden', filters.fecha_hasta);
    }

    query = query.order('fecha_orden', { ascending: false });

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.range(filters.offset, (filters.offset || 0) + (filters.limit || 10) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Error al obtener órdenes de compra: ${error.message}`);
    }

    return {
      data: data || [],
      count: count || 0
    };
  }

  async update(
    updateDto: any,
    id: string,
    tenantId: string,
    userId?: string
  ) {
    const supabase = this.supabaseService.getClient();

    // Verificar que la orden existe
    const { data: existingOrden, error: findError } = await supabase
      .from('ordenes_compra')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (findError || !existingOrden) {
      throw new Error(`Orden de compra con ID ${id} no encontrada`);
    }

    // Si se actualiza el número, verificar que no exista otro con ese número
    if (updateDto.numero && updateDto.numero !== existingOrden.numero) {
      const { data: duplicateOrden } = await supabase
        .from('ordenes_compra')
        .select('id')
        .eq('numero', updateDto.numero)
        .eq('tenant_id', tenantId)
        .neq('id', id)
        .single();

      if (duplicateOrden) {
        throw new Error(`Ya existe otra orden de compra con el número ${updateDto.numero}`);
      }
    }

    // Preparar datos de actualización
    const ordenData: any = {
      updated_at: new Date().toISOString()
    };

    // Campos opcionales
    if (updateDto.numero !== undefined) {
      ordenData.numero = updateDto.numero;
    }

    if (updateDto.proveedor_id !== undefined) {
      ordenData.proveedor_id = updateDto.proveedor_id;
    }

    if (updateDto.fecha_orden !== undefined) {
      ordenData.fecha_orden = updateDto.fecha_orden instanceof Date
        ? updateDto.fecha_orden.toISOString().split('T')[0]
        : new Date(updateDto.fecha_orden).toISOString().split('T')[0];
    }

    if (updateDto.fecha_entrega_esperada !== undefined) {
      const fechaEntrega = updateDto.fecha_entrega_esperada instanceof Date
        ? updateDto.fecha_entrega_esperada.toISOString().split('T')[0]
        : new Date(updateDto.fecha_entrega_esperada).toISOString().split('T')[0];
      ordenData.fecha_entrega_esperada = fechaEntrega;
      ordenData.fecha_entrega = fechaEntrega; // Also update fecha_entrega for backward compatibility
    }

    if (updateDto.condiciones_pago !== undefined) {
      ordenData.condiciones_pago = updateDto.condiciones_pago;
    }

    if (updateDto.dias_credito !== undefined) {
      ordenData.dias_credito = updateDto.dias_credito;
    }

    if (updateDto.almacen_destino_id !== undefined) {
      ordenData.almacen_destino_id = updateDto.almacen_destino_id;
    }

    if (updateDto.estado !== undefined) {
      ordenData.estado = updateDto.estado;
    }

    if (updateDto.observaciones !== undefined) {
      ordenData.observaciones = updateDto.observaciones;
    }

    // ✅ SRP: Si se actualizan los detalles, recalcular totales
    // NOTA: Idealmente el servicio debería enviar los totales ya calculados
    if (updateDto.detalles && updateDto.detalles.length > 0) {
      const subtotal = updateDto.detalles.reduce(
        (sum: number, detalle: any) => sum + (detalle.cantidad * detalle.precio_unitario),
        0
      );
      
      // Calcular impuestos (fallback - el servicio debería hacerlo)
      const taxResult = await this.taxCalculator.calcularImpuestos({
        subtotal,
        tenantId,
      });
      
      const igv = taxResult.igv;
      const total = taxResult.total;

      // Preparar items array for JSONB field
      const items = updateDto.detalles.map((detalle: any) => ({
        producto_id: detalle.producto_id,
        producto_nombre: detalle.descripcion,
        cantidad: detalle.cantidad,
        precio_unitario: detalle.precio_unitario,
        subtotal: detalle.cantidad * detalle.precio_unitario
      }));

      ordenData.subtotal = subtotal;
      ordenData.igv = igv;
      ordenData.total = total;
      ordenData.items = items;
    }

    // Actualizar orden de compra
    const { data: orden, error: ordenError } = await supabase
      .from('ordenes_compra')
      .update(ordenData)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select(`
        *,
        proveedor:proveedores(id, ruc, razon_social, nombre_comercial),
        almacen:almacenes(id, nombre, codigo)
      `)
      .single();

    if (ordenError) {
      throw new Error(`Error al actualizar orden de compra: ${ordenError.message}`);
    }

    // Si se proporcionan detalles, actualizar
    if (updateDto.detalles && updateDto.detalles.length > 0) {
      // Eliminar detalles existentes
      const { error: deleteError } = await supabase
        .from('orden_compra_detalles')
        .delete()
        .eq('orden_id', id);

      if (deleteError) {
        throw new Error(`Error al eliminar detalles existentes: ${deleteError.message}`);
      }

      // Insertar nuevos detalles
      const detallesConSubtotal = updateDto.detalles.map((detalle: any) => ({
        orden_id: id,
        producto_id: detalle.producto_id,
        descripcion: detalle.descripcion,
        cantidad: detalle.cantidad,
        precio_unitario: detalle.precio_unitario,
        subtotal: detalle.cantidad * detalle.precio_unitario,
        cantidad_recibida: detalle.cantidad_recibida || 0,
        cantidad_pendiente: detalle.cantidad - (detalle.cantidad_recibida || 0)
      }));

      const { data: detalles, error: detallesError } = await supabase
        .from('orden_compra_detalles')
        .insert(detallesConSubtotal)
        .select();

      if (detallesError) {
        throw new Error(`Error al actualizar detalles de orden de compra: ${detallesError.message}`);
      }

      return {
        ...orden,
        detalles
      };
    }

    // Si no se actualizan detalles, obtener los existentes
    const { data: detalles } = await supabase
      .from('orden_compra_detalles')
      .select('*')
      .eq('orden_id', id);

    return {
      ...orden,
      detalles: detalles || []
    };
  }

  async updateEstado(
    id: string,
    estado: string,
    tenantId: string,
    userId?: string,
    additionalData?: any
  ) {
    const supabase = this.supabaseService.getClient();

    const updateData: any = {
      estado,
      updated_at: new Date().toISOString()
    };

    // Agregar datos adicionales si se proporcionan
    if (additionalData) {
      Object.assign(updateData, additionalData);
    }

    const { data, error } = await supabase
      .from('ordenes_compra')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select(`
        *,
        proveedor:proveedores(id, ruc, razon_social, nombre_comercial)
      `)
      .single();

    if (error) {
      throw new Error(`Error al actualizar estado de orden de compra: ${error.message}`);
    }

    // Obtener detalles
    const { data: detalles } = await supabase
      .from('orden_compra_detalles')
      .select('*')
      .eq('orden_id', id);

    return {
      ...data,
      detalles: detalles || []
    };
  }

  async findRecepcionesByOrdenId(ordenId: string, tenantId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('recepciones')
      .select(`
        *,
        recepcion_items!recepcion_items_recepcion_id_fkey_runtime(
          id,
          producto_id,
          cantidad_recibida,
          calidad,
          lote,
          serie,
          almacen_id,
          fecha_expiracion
        )
      `)
      .eq('orden_id', ordenId)
      .eq('tenant_id', tenantId)
      .order('fecha_recepcion', { ascending: false });

    if (error) {
      throw new Error(`Error al obtener recepciones: ${error.message}`);
    }

    return data || [];
  }
}
