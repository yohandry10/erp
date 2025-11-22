import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CreateCajaDto } from './dto/create-caja.dto';
import { UpdateCajaDto } from './dto/update-caja.dto';
import { AbrirCajaDto } from './dto/abrir-caja.dto';
import { CerrarCajaDto } from './dto/cerrar-caja.dto';

@Injectable()
export class CajasService {
  private readonly logger = new Logger(CajasService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async listarCajas(tenantId: string) {
    const { data, error } = await this.supabase.getClient()
      .from('cajas')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async crearCaja(tenantId: string, dto: CreateCajaDto, userId?: string) {
    const nueva = {
      tenant_id: tenantId,
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? null,
      sucursal_id: dto.sucursal_id ?? null,
      almacen_id: dto.almacen_id ?? null,
      dispositivo: dto.dispositivo ?? null,
      tipo: dto.tipo ?? 'TIENDA',
      estado: 'ACTIVO',
      creado_por: userId ?? null,
    };
    const { data, error } = await this.supabase.getClient()
      .from('cajas')
      .insert([nueva])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async actualizarCaja(tenantId: string, id: string, dto: UpdateCajaDto) {
    const { data: existing, error: findError } = await this.supabase.getClient()
      .from('cajas')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .single();
    if (findError || !existing) {
      throw new NotFoundException('Caja no encontrada');
    }

    const updateData = {
      nombre: dto.nombre ?? undefined,
      descripcion: dto.descripcion ?? undefined,
      sucursal_id: dto.sucursal_id ?? undefined,
      almacen_id: dto.almacen_id ?? undefined,
      dispositivo: dto.dispositivo ?? undefined,
      tipo: dto.tipo ?? undefined,
      estado: dto.estado ?? undefined,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase.getClient()
      .from('cajas')
      .update(updateData)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async abrirCaja(tenantId: string, cajaId: string, dto: AbrirCajaDto, userId?: string) {
    // Validar caja
    const { data: caja, error: findError } = await this.supabase.getClient()
      .from('cajas')
      .select('id, estado')
      .eq('tenant_id', tenantId)
      .eq('id', cajaId)
      .single();
    if (findError || !caja) throw new NotFoundException('Caja no encontrada');

    // Validar que no exista sesión abierta
    const { data: abierta } = await this.supabase.getClient()
      .from('sesiones_caja')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('caja_id', cajaId)
      .eq('estado', 'ABIERTA')
      .maybeSingle();
    if (abierta?.id) {
      throw new BadRequestException('La caja ya tiene una sesión abierta');
    }

    const nuevaSesion = {
      caja_id: cajaId,
      tenant_id: tenantId,
      cajero_id: dto.cajero_id ?? null,
      abierto_por: userId ?? dto.cajero_id ?? null,
      monto_inicio: dto.monto_inicio,
      moneda: dto.moneda ?? 'PEN',
      dispositivo: dto.dispositivo ?? null,
      estado: 'ABIERTA',
    };

    const { data, error } = await this.supabase.getClient()
      .from('sesiones_caja')
      .insert([nuevaSesion])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async cerrarCaja(tenantId: string, cajaId: string, sesionId: string, dto: CerrarCajaDto, userId?: string) {
    const { data: sesion, error: findError } = await this.supabase.getClient()
      .from('sesiones_caja')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('caja_id', cajaId)
      .eq('id', sesionId)
      .eq('estado', 'ABIERTA')
      .single();
    if (findError || !sesion) throw new NotFoundException('Sesión de caja no encontrada o ya cerrada');

    const cierre = {
      estado: 'CERRADA',
      monto_cierre: dto.monto_cierre,
      moneda: dto.moneda ?? sesion.moneda ?? 'PEN',
      hora_cierre: new Date().toISOString(),
      cerrado_por: userId ?? sesion.cajero_id ?? null,
      notas: dto.notas ?? null,
      resumen: dto.resumen ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase.getClient()
      .from('sesiones_caja')
      .update(cierre)
      .eq('id', sesionId)
      .eq('tenant_id', tenantId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async listarSesiones(tenantId: string, filters: { fecha_desde?: string; fecha_hasta?: string; estado?: string; cajero_id?: string }) {
    let query = this.supabase.getClient()
      .from('sesiones_caja')
      .select('*')
      .eq('tenant_id', tenantId);

    if (filters.estado) {
      query = query.eq('estado', filters.estado);
    }
    if (filters.cajero_id) {
      query = query.eq('cajero_id', filters.cajero_id);
    }
    if (filters.fecha_desde) {
      query = query.gte('hora_apertura', filters.fecha_desde);
    }
    if (filters.fecha_hasta) {
      query = query.lte('hora_apertura', filters.fecha_hasta);
    }

    const { data, error } = await query.order('hora_apertura', { ascending: false });
    if (error) throw error;
    return data || [];
  }
}
