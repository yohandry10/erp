import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

export interface CreateAprobacionDto {
  orden_id: string;
  nivel: number;
  aprobador_id: string;
  aprobador_nombre: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  fecha_aprobacion?: string;
  comentarios?: string;
}

@Injectable()
export class OcAprobacionesRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async create(createDto: CreateAprobacionDto) {
    const supabase = this.supabaseService.getClient();

    const aprobacionData: any = {
      orden_id: createDto.orden_id,
      nivel: createDto.nivel,
      aprobador_id: createDto.aprobador_id,
      aprobador_nombre: createDto.aprobador_nombre,
      estado: createDto.estado,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (createDto.fecha_aprobacion) {
      aprobacionData.fecha_aprobacion = createDto.fecha_aprobacion;
    }

    if (createDto.comentarios) {
      aprobacionData.comentarios = createDto.comentarios;
    }

    const { data, error } = await supabase
      .from('oc_aprobaciones')
      .insert(aprobacionData)
      .select()
      .single();

    if (error) {
      throw new Error(`Error al crear registro de aprobación: ${error.message}`);
    }

    return data;
  }

  async findByOrdenId(ordenId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('oc_aprobaciones')
      .select('*')
      .eq('orden_id', ordenId)
      .order('nivel', { ascending: true });

    if (error) {
      throw new Error(`Error al obtener aprobaciones: ${error.message}`);
    }

    return data || [];
  }

  async updateEstado(
    id: string,
    estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA',
    comentarios?: string
  ) {
    const supabase = this.supabaseService.getClient();

    const updateData: any = {
      estado,
      fecha_aprobacion: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (comentarios) {
      updateData.comentarios = comentarios;
    }

    const { data, error } = await supabase
      .from('oc_aprobaciones')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Error al actualizar estado de aprobación: ${error.message}`);
    }

    return data;
  }

  async findPendingByAprobadorId(aprobadorId: string, tenantId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('oc_aprobaciones')
      .select(`
        *,
        orden:ordenes_compra(
          id,
          numero,
          fecha_orden,
          total,
          estado,
          tenant_id,
          proveedor:proveedores(id, razon_social, nombre_comercial)
        )
      `)
      .eq('aprobador_id', aprobadorId)
      .eq('estado', 'PENDIENTE')
      .filter('orden.tenant_id', 'eq', tenantId);

    if (error) {
      throw new Error(`Error al obtener aprobaciones pendientes: ${error.message}`);
    }

    return data || [];
  }

  async countPendingByOrdenId(ordenId: string): Promise<number> {
    const supabase = this.supabaseService.getClient();

    const { count, error } = await supabase
      .from('oc_aprobaciones')
      .select('*', { count: 'exact', head: true })
      .eq('orden_id', ordenId)
      .eq('estado', 'PENDIENTE');

    if (error) {
      throw new Error(`Error al contar aprobaciones pendientes: ${error.message}`);
    }

    return count || 0;
  }

  async hasRejectedApprovals(ordenId: string): Promise<boolean> {
    const supabase = this.supabaseService.getClient();

    const { count, error } = await supabase
      .from('oc_aprobaciones')
      .select('*', { count: 'exact', head: true })
      .eq('orden_id', ordenId)
      .eq('estado', 'RECHAZADA');

    if (error) {
      throw new Error(`Error al verificar aprobaciones rechazadas: ${error.message}`);
    }

    return (count || 0) > 0;
  }
}
