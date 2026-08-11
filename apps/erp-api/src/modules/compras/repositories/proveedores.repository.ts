import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { sanitizePostgrestSearch } from '../../../common/util/postgrest.util';

@Injectable()
export class ProveedoresRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(tenantId: string, filters?: {
    activo?: boolean;
    search?: string;
    estado?: string;
    condiciones_pago?: string;
    ruc?: string;
    limit?: number;
    offset?: number;
  }) {
    let query = this.supabase.getClient()
      .from('proveedores')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('razon_social', { ascending: true });

    // Filter by activo status
    if (filters?.activo !== undefined) {
      query = query.eq('activo', filters.activo);
    }

    // Filter by estado
    if (filters?.estado) {
      query = query.eq('estado', filters.estado);
    }

    // Filter by condiciones_pago
    if (filters?.condiciones_pago) {
      query = query.eq('condiciones_pago', filters.condiciones_pago);
    }

    // Filter by RUC (exact match)
    if (filters?.ruc) {
      query = query.eq('ruc', filters.ruc);
    }

    // Search across multiple fields (razon_social, ruc, nombre_comercial).
    // HARDENING: sanitizar input para evitar PostgREST filter injection
    // (coma o punto inyectados romperían/ampliarían el filtro dentro del tenant).
    if (filters?.search) {
      const safeSearch = sanitizePostgrestSearch(filters.search);
      if (safeSearch.length > 0) {
        query = query.or(
          `razon_social.ilike.%${safeSearch}%,ruc.ilike.%${safeSearch}%,nombre_comercial.ilike.%${safeSearch}%`,
        );
      }
    }

    // Apply pagination
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
  }

  async findById(id: string, tenantId: string) {
    const { data, error } = await this.supabase.getClient()
      .from('proveedores')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (error) throw error;
    return data;
  }

  async findByRuc(ruc: string, tenantId: string) {
    const { data, error } = await this.supabase.getClient()
      .from('proveedores')
      .select('*')
      .eq('ruc', ruc)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

}
