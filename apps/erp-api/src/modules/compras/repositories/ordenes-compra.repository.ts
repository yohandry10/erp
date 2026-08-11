import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

@Injectable()
export class OrdenesCompraRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findById(id: string, tenantId: string) {
    const supabase = this.supabaseService.getClient();
    const { data: orden, error: ordenError } = await supabase
      .from('ordenes_compra')
      .select(`
        *,
        proveedor:proveedores(id, ruc, razon_social, nombre_comercial, condiciones_pago, dias_credito, email, telefono),
        almacen:almacenes(id, nombre, codigo)
      `)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (ordenError) return null;

    const { data: detalles, error: detallesError } = await supabase
      .from('orden_compra_detalles')
      .select(`
        *,
        productos:productos!orden_compra_detalles_producto_id_fkey_runtime(
          id,
          codigo,
          nombre,
          unidad_medida,
          tipo,
          es_servicio,
          controla_stock,
          afectacion_igv
        )
      `)
      .eq('orden_id', id)
      .eq('tenant_id', tenantId);

    if (detallesError) {
      throw new Error(`Error al obtener detalles: ${detallesError.message}`);
    }
    return { ...orden, detalles: detalles || [] };
  }

  async findByNumero(numero: string, tenantId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('ordenes_compra')
      .select('*')
      .eq('numero', numero)
      .eq('tenant_id', tenantId)
      .single();
    return error ? null : data;
  }

  async findAll(
    tenantId: string,
    filters?: {
      estado?: string;
      proveedor_id?: string;
      fecha_desde?: string;
      fecha_hasta?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    let query = this.supabaseService
      .getClient()
      .from('ordenes_compra')
      .select(
        `
          *,
          proveedores:proveedores(id, ruc, razon_social, nombre_comercial)
        `,
        { count: 'exact' },
      )
      .eq('tenant_id', tenantId);

    if (filters?.estado) {
      const estados = filters.estado
        .split(',')
        .map((estado) => estado.trim())
        .filter(Boolean);
      query = estados.length > 1
        ? query.in('estado', estados)
        : query.eq('estado', estados[0]);
    }
    if (filters?.proveedor_id) query = query.eq('proveedor_id', filters.proveedor_id);
    if (filters?.fecha_desde) query = query.gte('fecha_orden', filters.fecha_desde);
    if (filters?.fecha_hasta) query = query.lte('fecha_orden', filters.fecha_hasta);
    query = query.order('fecha_orden', { ascending: false });
    if (filters?.limit) query = query.limit(filters.limit);
    if (filters?.offset !== undefined) {
      query = query.range(
        filters.offset,
        filters.offset + (filters.limit || 10) - 1,
      );
    }

    const { data, error, count } = await query;
    if (error) throw new Error(`Error al obtener órdenes de compra: ${error.message}`);
    return { data: data || [], count: count || 0 };
  }

  async findRecepcionesByOrdenId(ordenId: string, tenantId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
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

    if (error) throw new Error(`Error al obtener recepciones: ${error.message}`);
    return data || [];
  }
}
