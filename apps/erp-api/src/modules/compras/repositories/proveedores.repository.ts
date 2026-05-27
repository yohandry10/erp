import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CreateProveedorDto } from '../dto/create-proveedor.dto';
import { UpdateProveedorDto } from '../dto/update-proveedor.dto';
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

  async create(createDto: CreateProveedorDto, tenantId: string, userId?: string) {
    const { data, error } = await this.supabase.getClient()
      .from('proveedores')
      .insert({
        tenant_id: tenantId,
        ruc: createDto.ruc.trim(),
        razon_social: createDto.razon_social.trim(),
        nombre_comercial: createDto.nombre_comercial?.trim() || createDto.razon_social.trim(),
        direccion: createDto.direccion?.trim() || null,
        telefono: createDto.telefono?.trim() || null,
        email: createDto.email.trim(),
        contacto: createDto.contacto?.trim() || null,
        condiciones_pago: createDto.condiciones_pago || 'CONTADO',
        limite_credito: createDto.limite_credito || 0,
        dias_credito: createDto.dias_credito || 0,
        estado: 'ACTIVO',
        activo: true,
        created_by: userId
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, updateDto: UpdateProveedorDto, tenantId: string) {
    const updateData: any = {};

    if (updateDto.ruc !== undefined) updateData.ruc = updateDto.ruc.trim();
    if (updateDto.razon_social !== undefined) updateData.razon_social = updateDto.razon_social.trim();
    if (updateDto.nombre_comercial !== undefined) updateData.nombre_comercial = updateDto.nombre_comercial.trim();
    if (updateDto.direccion !== undefined) updateData.direccion = updateDto.direccion?.trim() || null;
    if (updateDto.telefono !== undefined) updateData.telefono = updateDto.telefono?.trim() || null;
    if (updateDto.email !== undefined) updateData.email = updateDto.email.trim();
    if (updateDto.contacto !== undefined) updateData.contacto = updateDto.contacto?.trim() || null;
    if (updateDto.condiciones_pago !== undefined) updateData.condiciones_pago = updateDto.condiciones_pago;
    if (updateDto.limite_credito !== undefined) updateData.limite_credito = updateDto.limite_credito;
    if (updateDto.dias_credito !== undefined) updateData.dias_credito = updateDto.dias_credito;

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await this.supabase.getClient()
      .from('proveedores')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async softDelete(id: string, tenantId: string) {
    const { data, error } = await this.supabase.getClient()
      .from('proveedores')
      .update({
        activo: false,
        estado: 'INACTIVO',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
