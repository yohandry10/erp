import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

@Injectable()
export class DevolucionesProveedorRepository {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Obtiene una devolución por ID
   */
  async obtenerPorId(devolucionId: string, tenantId: string): Promise<any> {
    const { data, error } = await this.supabase.getClient()
      .from('devoluciones_proveedor')
      .select(`
        *,
        orden:ordenes_compra(id, numero),
        proveedor:proveedores(id, razon_social, ruc),
        recepcion:recepciones(id, numero),
        items:devolucion_items(
          *,
          producto:productos(id, codigo, nombre)
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('id', devolucionId)
      .single();

    if (error) {
      throw new BadRequestException(`Error al obtener devolución: ${error.message}`);
    }

    return data;
  }

  /**
   * Lista devoluciones con filtros
   */
  async listar(tenantId: string, filtros?: any): Promise<any[]> {
    let query = this.supabase.getClient()
      .from('devoluciones_proveedor')
      .select(`
        *,
        orden:ordenes_compra(id, numero),
        proveedor:proveedores(id, razon_social, ruc),
        recepcion:recepciones(id, numero)
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (filtros?.estado) {
      query = query.eq('estado', filtros.estado);
    }

    if (filtros?.proveedor_id) {
      query = query.eq('proveedor_id', filtros.proveedor_id);
    }

    if (filtros?.orden_id) {
      query = query.eq('orden_id', filtros.orden_id);
    }

    if (filtros?.fecha_desde) {
      query = query.gte('fecha_devolucion', filtros.fecha_desde);
    }

    if (filtros?.fecha_hasta) {
      query = query.lte('fecha_devolucion', filtros.fecha_hasta);
    }

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException(`Error al listar devoluciones: ${error.message}`);
    }

    return data || [];
  }

}
