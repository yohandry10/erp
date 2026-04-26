import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';

@Injectable()
export class UsuariosService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabase.getClient()
      .from('usuarios_sistema')
      .select('*')
      .eq('activo', true);
    
    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabase.getClient()
      .from('usuarios_sistema')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  }

  async create(userData: any) {
    const { data, error } = await this.supabase.getClient()
      .from('usuarios_sistema')
      .insert(userData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async update(id: string, userData: any) {
    const { data, error } = await this.supabase.getClient()
      .from('usuarios_sistema')
      .update(userData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}