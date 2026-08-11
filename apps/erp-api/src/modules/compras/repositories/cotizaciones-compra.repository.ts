import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

@Injectable()
export class CotizacionesCompraRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findById(id: string, tenantId: string) {
    const supabase = this.supabaseService.getClient();
    const { data: cotizacion, error: cotizacionError } = await supabase
      .from('cotizaciones_compra')
      .select(`
        *,
        proveedores:proveedores(id, ruc, razon_social, nombre_comercial, email, telefono)
      `)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (cotizacionError) return null;

    const { data: detalles, error: detallesError } = await supabase
      .from('cotizacion_compra_detalles')
      .select(`
        *,
        productos:productos(id, codigo, nombre, unidad_medida, afectacion_igv)
      `)
      .eq('cotizacion_id', id)
      .eq('tenant_id', tenantId);

    if (detallesError) {
      throw new Error(`Error al obtener detalles: ${detallesError.message}`);
    }
    return { ...cotizacion, detalles: detalles || [] };
  }

  async findByNumero(numero: string, tenantId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('cotizaciones_compra')
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
      .from('cotizaciones_compra')
      .select(
        `
          *,
          proveedores:proveedores(id, ruc, razon_social, nombre_comercial)
        `,
        { count: 'exact' },
      )
      .eq('tenant_id', tenantId);

    if (filters?.estado) query = query.eq('estado', filters.estado);
    if (filters?.proveedor_id) query = query.eq('proveedor_id', filters.proveedor_id);
    if (filters?.fecha_desde) query = query.gte('fecha_cotizacion', filters.fecha_desde);
    if (filters?.fecha_hasta) query = query.lte('fecha_cotizacion', filters.fecha_hasta);
    query = query.order('fecha_cotizacion', { ascending: false });
    if (filters?.limit) query = query.limit(filters.limit);
    if (filters?.offset !== undefined) {
      query = query.range(
        filters.offset,
        filters.offset + (filters.limit || 10) - 1,
      );
    }

    const { data, error, count } = await query;
    if (error) throw new Error(`Error al obtener cotizaciones: ${error.message}`);
    return { data: data || [], count: count || 0 };
  }
}
