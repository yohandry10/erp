import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CreateCotizacionCompraDto, CotizacionCompraDetalleDto } from '../dto/create-cotizacion-compra.dto';
import { UpdateCotizacionCompraDto } from '../dto/update-cotizacion-compra.dto';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';

@Injectable()
export class CotizacionesCompraRepository {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly taxCalculator: TaxCalculatorService,
  ) {}

  async create(
    createDto: CreateCotizacionCompraDto,
    tenantId: string,
    userId?: string,
    totales?: { subtotal: number; igv: number; total: number }
  ) {
    const supabase = this.supabaseService.getClient();

    // ✅ SRP: Los totales deben venir calculados desde el servicio
    let subtotal: number, igv: number, total: number;
    
    if (totales) {
      subtotal = totales.subtotal;
      igv = totales.igv;
      total = totales.total;
    } else {
      // Fallback: calcular si no se proporcionan
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

    // Calcular fecha de vencimiento
    const fechaCotizacion = createDto.fecha_cotizacion ? new Date(createDto.fecha_cotizacion) : new Date();
    const validezDias = createDto.validez_dias || 30;
    const fechaVencimiento = new Date(fechaCotizacion);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + validezDias);

    // Insertar cotización
    const { data: cotizacion, error: cotizacionError } = await supabase
      .from('cotizaciones_compra')
      .insert({
        tenant_id: tenantId,
        numero: createDto.numero,
        proveedor_id: createDto.proveedor_id,
        fecha_cotizacion: fechaCotizacion.toISOString().split('T')[0],
        fecha_vencimiento: fechaVencimiento.toISOString().split('T')[0],
        validez_dias: validezDias,
        estado: createDto.estado || 'BORRADOR',
        subtotal,
        igv,
        total,
        observaciones: createDto.observaciones,
        created_by: userId
      })
      .select()
      .single();

    if (cotizacionError) {
      throw new Error(`Error al crear cotización: ${cotizacionError.message}`);
    }

    // Insertar detalles
    const detallesConSubtotal = createDto.detalles.map(detalle => ({
      cotizacion_id: cotizacion.id,
      producto_id: detalle.producto_id,
      descripcion: detalle.descripcion,
      cantidad: detalle.cantidad,
      precio_unitario: detalle.precio_unitario,
      subtotal: detalle.cantidad * detalle.precio_unitario
    }));

    const { data: detalles, error: detallesError } = await supabase
      .from('cotizacion_compra_detalles')
      .insert(detallesConSubtotal)
      .select();

    if (detallesError) {
      // Rollback: eliminar cotización si falla la inserción de detalles
      await supabase
        .from('cotizaciones_compra')
        .delete()
        .eq('id', cotizacion.id);
      
      throw new Error(`Error al crear detalles de cotización: ${detallesError.message}`);
    }

    return {
      ...cotizacion,
      detalles
    };
  }

  async findById(id: string, tenantId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: cotizacion, error: cotizacionError } = await supabase
      .from('cotizaciones_compra')
      .select(`
        *,
        proveedor:proveedores(id, ruc, razon_social, nombre_comercial)
      `)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (cotizacionError) {
      return null;
    }

    // Obtener detalles
    const { data: detalles, error: detallesError } = await supabase
      .from('cotizacion_compra_detalles')
      .select(`
        *,
        producto:productos(id, codigo, nombre)
      `)
      .eq('cotizacion_id', id);

    if (detallesError) {
      throw new Error(`Error al obtener detalles: ${detallesError.message}`);
    }

    return {
      ...cotizacion,
      detalles: detalles || []
    };
  }

  async findByNumero(numero: string, tenantId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('cotizaciones_compra')
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
      .from('cotizaciones_compra')
      .select(`
        *,
        proveedor:proveedores(id, ruc, razon_social, nombre_comercial)
      `, { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (filters?.estado) {
      query = query.eq('estado', filters.estado);
    }

    if (filters?.proveedor_id) {
      query = query.eq('proveedor_id', filters.proveedor_id);
    }

    if (filters?.fecha_desde) {
      query = query.gte('fecha_cotizacion', filters.fecha_desde);
    }

    if (filters?.fecha_hasta) {
      query = query.lte('fecha_cotizacion', filters.fecha_hasta);
    }

    query = query.order('fecha_cotizacion', { ascending: false });

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.range(filters.offset, (filters.offset || 0) + (filters.limit || 10) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Error al obtener cotizaciones: ${error.message}`);
    }

    return {
      data: data || [],
      count: count || 0
    };
  }

  async update(
    id: string,
    updateDto: UpdateCotizacionCompraDto,
    tenantId: string,
    userId?: string
  ) {
    const supabase = this.supabaseService.getClient();

    // Verificar que la cotización existe
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new Error('Cotización no encontrada');
    }

    // Preparar datos de actualización
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (updateDto.numero !== undefined) {
      updateData.numero = updateDto.numero;
    }

    if (updateDto.proveedor_id !== undefined) {
      updateData.proveedor_id = updateDto.proveedor_id;
    }

    if (updateDto.fecha_cotizacion !== undefined) {
      const fecha = updateDto.fecha_cotizacion instanceof Date 
        ? updateDto.fecha_cotizacion 
        : new Date(updateDto.fecha_cotizacion);
      updateData.fecha_cotizacion = fecha.toISOString().split('T')[0];
    }

    if (updateDto.validez_dias !== undefined) {
      updateData.validez_dias = updateDto.validez_dias;
      
      // Recalcular fecha de vencimiento
      const fechaCotizacion = updateDto.fecha_cotizacion || existing.fecha_cotizacion;
      const fechaVencimiento = new Date(fechaCotizacion);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + updateDto.validez_dias);
      updateData.fecha_vencimiento = fechaVencimiento.toISOString().split('T')[0];
    }

    if (updateDto.estado !== undefined) {
      updateData.estado = updateDto.estado;
    }

    if (updateDto.observaciones !== undefined) {
      updateData.observaciones = updateDto.observaciones;
    }

    // Si se actualizan los detalles, recalcular totales
    if (updateDto.detalles && updateDto.detalles.length > 0) {
      const subtotal = updateDto.detalles.reduce(
        (sum, detalle) => sum + (detalle.cantidad * detalle.precio_unitario),
        0
      );
      
      // ✅ CORRECCIÓN: Usar servicio centralizado
      const taxResult = await this.taxCalculator.calcularImpuestos({
        subtotal,
        tenantId,
      });
      
      const igv = taxResult.igv;
      const total = taxResult.total;

      updateData.subtotal = subtotal;
      updateData.igv = igv;
      updateData.total = total;
    }

    // Actualizar cotización
    const { data: cotizacion, error: cotizacionError } = await supabase
      .from('cotizaciones_compra')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (cotizacionError) {
      throw new Error(`Error al actualizar cotización: ${cotizacionError.message}`);
    }

    // Si se proporcionan detalles, actualizar
    if (updateDto.detalles && updateDto.detalles.length > 0) {
      // Eliminar detalles existentes
      const { error: deleteError } = await supabase
        .from('cotizacion_compra_detalles')
        .delete()
        .eq('cotizacion_id', id);

      if (deleteError) {
        throw new Error(`Error al eliminar detalles existentes: ${deleteError.message}`);
      }

      // Insertar nuevos detalles
      const detallesConSubtotal = updateDto.detalles.map(detalle => ({
        cotizacion_id: id,
        producto_id: detalle.producto_id,
        descripcion: detalle.descripcion,
        cantidad: detalle.cantidad,
        precio_unitario: detalle.precio_unitario,
        subtotal: detalle.cantidad * detalle.precio_unitario
      }));

      const { data: detalles, error: detallesError } = await supabase
        .from('cotizacion_compra_detalles')
        .insert(detallesConSubtotal)
        .select();

      if (detallesError) {
        throw new Error(`Error al crear nuevos detalles: ${detallesError.message}`);
      }

      return {
        ...cotizacion,
        detalles
      };
    }

    // Si no se actualizan detalles, obtener los existentes
    const { data: detalles } = await supabase
      .from('cotizacion_compra_detalles')
      .select('*')
      .eq('cotizacion_id', id);

    return {
      ...cotizacion,
      detalles: detalles || []
    };
  }

  async updateEstado(
    id: string,
    estado: string,
    tenantId: string,
    userId?: string
  ) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('cotizaciones_compra')
      .update({
        estado,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select(`
        *,
        proveedor:proveedores(id, ruc, razon_social, nombre_comercial)
      `)
      .single();

    if (error) {
      throw new Error(`Error al actualizar estado de cotización: ${error.message}`);
    }

    // Obtener detalles
    const { data: detalles } = await supabase
      .from('cotizacion_compra_detalles')
      .select(`
        *,
        producto:productos(id, codigo, nombre)
      `)
      .eq('cotizacion_id', id);

    return {
      ...data,
      detalles: detalles || []
    };
  }

  async updateEstadoConObservaciones(
    id: string,
    estado: string,
    observaciones: string,
    tenantId: string,
    userId?: string
  ) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('cotizaciones_compra')
      .update({
        estado,
        observaciones,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select(`
        *,
        proveedor:proveedores(id, ruc, razon_social, nombre_comercial)
      `)
      .single();

    if (error) {
      throw new Error(`Error al actualizar estado de cotización: ${error.message}`);
    }

    // Obtener detalles
    const { data: detalles } = await supabase
      .from('cotizacion_compra_detalles')
      .select(`
        *,
        producto:productos(id, codigo, nombre)
      `)
      .eq('cotizacion_id', id);

    return {
      ...data,
      detalles: detalles || []
    };
  }

  async marcarComoConvertida(cotizacionId: string, ordenCompraId: string, tenantId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('cotizaciones_compra')
      .update({
        orden_compra_id: ordenCompraId,
        updated_at: new Date().toISOString()
      })
      .eq('id', cotizacionId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      throw new Error(`Error al marcar cotización como convertida: ${error.message}`);
    }

    return data;
  }
}
