import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

export interface Almacen {
  id: string;
  tenant_id: string;
  nombre: string;
  codigo: string;
  es_principal: boolean;
  activo: boolean;
  direccion?: string | null;
  telefono?: string | null;
  descripcion?: string | null;
  estado?: string | null;
}

export interface UbicacionAlmacen {
  id: string;
  tenant_id: string;
  almacen_id: string;
  nombre: string;
  codigo: string;
  descripcion?: string | null;
  tipo?: string | null;
  estado: string;
  activo: boolean;
}

@Injectable()
export class AlmacenesService {
  constructor(private readonly supabase: SupabaseService) {}

  async listar(tenantId: string, includeInactive = false): Promise<Almacen[]> {
    let query = this.supabase
      .getClient()
      .from('almacenes')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('es_principal', { ascending: false })
      .order('nombre', { ascending: true });
    if (!includeInactive) query = query.eq('activo', true);
    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(`Error al listar almacenes: ${error.message}`);
    }

    return (data as Almacen[] | null) ?? [];
  }

  async listarUbicaciones(
    tenantId: string,
    almacenId: string,
    includeInactive = false,
  ): Promise<UbicacionAlmacen[]> {
    await this.obtenerPorId(tenantId, almacenId);
    let query = this.supabase
      .getClient()
      .from('almacen_ubicaciones')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('almacen_id', almacenId)
      .order('codigo', { ascending: true });
    if (!includeInactive) query = query.eq('estado', 'ACTIVO');
    const { data, error } = await query;
    if (error) {
      throw new InternalServerErrorException(`Error al listar ubicaciones: ${error.message}`);
    }
    return ((data as Array<Omit<UbicacionAlmacen, 'activo'>> | null) ?? []).map((row) => ({
      ...row,
      activo: String(row.estado).toUpperCase() === 'ACTIVO',
    }));
  }

  async obtenerPrincipal(tenantId: string): Promise<Almacen | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from('almacenes')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('activo', true)
      .order('es_principal', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`Error obteniendo almacén principal: ${error.message}`);
    }

    return (data as Almacen | null) ?? null;
  }

  async obtenerPorId(tenantId: string, almacenId: string): Promise<Almacen> {
    const { data, error } = await this.supabase
      .getClient()
      .from('almacenes')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', almacenId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`Error obteniendo almacén ${almacenId}: ${error.message}`);
    }

    if (!data) {
      throw new NotFoundException('Almacén no encontrado');
    }

    return data as Almacen;
  }
}
