import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

@Injectable()
export class DevolucionesProveedorRepository {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Genera el siguiente número de devolución para el tenant
   */
  async generarNumeroDevolucion(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `DEV-${year}-`;

    const { data, error } = await this.supabase.getClient()
      .from('devoluciones_proveedor')
      .select('numero')
      .eq('tenant_id', tenantId)
      .like('numero', `${prefix}%`)
      .order('numero', { ascending: false })
      .limit(1);

    if (error) {
      throw new BadRequestException(`Error al generar número de devolución: ${error.message}`);
    }

    let nextNumber = 1;
    if (data && data.length > 0) {
      const lastNumber = data[0].numero;
      const match = lastNumber.match(/DEV-\d{4}-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
  }

  /**
   * Crea una nueva devolución a proveedor
   */
  async crear(tenantId: string, devolucionData: any, userId?: string): Promise<any> {
    const { data, error } = await this.supabase.getClient()
      .from('devoluciones_proveedor')
      .insert({
        ...devolucionData,
        tenant_id: tenantId,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Error al crear devolución: ${error.message}`);
    }

    return data;
  }

  /**
   * Crea los items de una devolución
   */
  async crearItems(items: any[]): Promise<any[]> {
    const { data, error } = await this.supabase.getClient()
      .from('devolucion_items')
      .insert(items)
      .select();

    if (error) {
      throw new BadRequestException(`Error al crear items de devolución: ${error.message}`);
    }

    return data || [];
  }

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

  /**
   * Actualiza el estado de una devolución
   */
  async actualizarEstado(devolucionId: string, tenantId: string, estado: string, userId?: string): Promise<any> {
    const updateData: any = {
      estado,
      updated_at: new Date().toISOString(),
    };

    if (estado === 'EMITIDA') {
      updateData.emitido_por = userId;
      updateData.emitido_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase.getClient()
      .from('devoluciones_proveedor')
      .update(updateData)
      .eq('id', devolucionId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Error al actualizar estado de devolución: ${error.message}`);
    }

    return data;
  }
}
