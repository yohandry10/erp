import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

@Injectable()
export class OcAprobacionesRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findByOrdenId(ordenId: string, tenantId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('oc_aprobaciones')
      .select('*')
      .eq('orden_id', ordenId)
      .eq('tenant_id', tenantId)
      .order('nivel', { ascending: true });

    if (error) throw new Error(`Error al obtener aprobaciones: ${error.message}`);
    return data || [];
  }
}
