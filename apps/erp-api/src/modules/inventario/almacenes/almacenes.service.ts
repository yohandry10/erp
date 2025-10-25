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
}

@Injectable()
export class AlmacenesService {
  constructor(private readonly supabase: SupabaseService) {}

  async listar(tenantId: string): Promise<Almacen[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('almacenes')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('activo', true)
      .order('es_principal', { ascending: false })
      .order('nombre', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(`Error al listar almacenes: ${error.message}`);
    }

    return (data as Almacen[] | null) ?? [];
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
