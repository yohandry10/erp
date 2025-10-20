import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../shared/supabase/supabase.service';

@Injectable()
export class PosService {
  constructor(private readonly supabase: SupabaseService) {}

  async getClientes(tenantId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('clientes')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error) throw error;
    return data;
  }

  async getMetodosPago() {
    const { data, error } = await this.supabase
      .getClient()
      .from('metodos_pago')
      .select('*');

    if (error) throw error;
    return data;
  }

  async getEmpresaConfig(tenantId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('empresa_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (error) throw error;
    return data;
  }

  async getSesionCajaAbierta(tenantId: string) {
    // Obtener fecha de inicio del día actual (00:00:00)
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicioDia = hoy.toISOString();

    // Buscar sesión ABIERTA del día actual
    const { data, error } = await this.supabase
      .getClient()
      .from('sesiones_caja')
      .select('*')
      .eq('estado', 'ABIERTA')
      .gte('fecha_apertura', inicioDia)
      .order('fecha_apertura', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async getVentasRecientes(tenantId: string, limit = 10) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ventas_pos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  async getDetallesVenta(ventaId: string, tenantId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('detalle_ventas_pos')
      .select('*')
      .eq('venta_id', ventaId)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    return data;
  }
}
