import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import { CreateTenantDto, UpdateTenantDto, TenantFiltersDto, ActivateDemoTenantDto } from './dto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { sanitizePostgrestSearch } from '../../common/util/postgrest.util';
import {
  INITIAL_ACTIVE_COUNTRY_MESSAGE,
  getActiveCountryById,
  isInitialActiveCountryCode,
  isInitialActiveCountryId,
  validateCountryTaxId,
} from '../paises/initial-country';

@Injectable()
export class TenantManagementService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly tenantContext: TenantContextService,
  ) { }

  private assertInitialActiveCountry(paisId?: number | null, paisCodigo?: string | null): void {
    if (paisId !== undefined && paisId !== null && !isInitialActiveCountryId(paisId)) {
      throw new BadRequestException(INITIAL_ACTIVE_COUNTRY_MESSAGE);
    }
    if (paisCodigo && !isInitialActiveCountryCode(paisCodigo)) {
      throw new BadRequestException(INITIAL_ACTIVE_COUNTRY_MESSAGE);
    }
  }

  /**
   * Create a new tenant with first admin user
   * Requirements: 1.2, 1.3
   */
  async createTenant(
    tenantData: CreateTenantDto,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    const client = this.supabase.getClient();

    const paisIdInput = Number(tenantData.pais_id);
    if (!paisIdInput || Number.isNaN(paisIdInput)) {
      throw new BadRequestException('pais_id es requerido para crear el tenant');
    }
    this.assertInitialActiveCountry(paisIdInput, tenantData.pais);

    const { data: paisData, error: paisError } = await client
      .from('paises')
      .select('id, codigo_iso, moneda_codigo')
      .eq('id', paisIdInput)
      .single();

    if (paisError || !paisData?.id) {
      throw new BadRequestException(`pais_id no válido: ${tenantData.pais_id}`);
    }

    const pais = paisData.codigo_iso?.toUpperCase();
    if (!pais) {
      throw new BadRequestException('El país seleccionado no tiene código ISO válido');
    }
    const profile = getActiveCountryById(paisData.id);
    this.assertInitialActiveCountry(paisData.id, pais);

    if (tenantData.pais && tenantData.pais.toUpperCase() !== pais) {
      throw new BadRequestException('pais_id no coincide con el país enviado');
    }
    if (!validateCountryTaxId(pais, tenantData.ruc)) {
      const label = profile?.documentoFiscal || 'documento fiscal';
      throw new BadRequestException(`${label} inválido para ${profile?.nombre || pais}`);
    }

    // La unicidad y la idempotencia se resuelven bajo locks dentro del RPC.
    // Un pre-check aquí convertiría un retry exitoso en un falso conflicto.
    const tenantId = crypto.randomUUID();

    // Set default values
    const moneda = tenantData.moneda || paisData.moneda_codigo || profile?.moneda || 'PEN';
    const adminEmail = tenantData.admin_email || tenantData.email;
    const adminNombre = tenantData.admin_nombre || 'Administrador';
    const paisId = Number(paisData.id);

    const key = String(idempotencyKey || '').trim();
    if (!actorId || key.length < 8 || key.length > 255) {
      throw new BadRequestException(
        'Idempotency-Key es obligatorio y el actor superadministrador debe estar identificado',
      );
    }
    const temporaryPassword = tenantData.admin_password
      || `A1!${crypto.randomBytes(18).toString('base64url')}`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const { data: atomicResult, error: atomicError } = await client.rpc(
      'crear_tenant_empresa_admin_tx',
      {
        p_actor_id: actorId,
        p_idempotency_key: key,
        p_tenant_id: tenantId,
        p_empresa: {
          razon_social: tenantData.razon_social,
          nombre_comercial: tenantData.nombre_comercial || tenantData.razon_social,
          ruc: tenantData.ruc,
          direccion_fiscal: tenantData.direccion,
          telefono: tenantData.telefono,
          email: tenantData.email,
          pais,
          pais_id: paisId,
          moneda_defecto: moneda,
          plan: 'BASICO',
          tipo_empresa: tenantData.tipo_empresa || 'MICRO',
          usar_flujo_logistica: tenantData.usar_flujo_logistica ?? false,
          gre_obligatorio: tenantData.gre_obligatorio ?? false,
          gre_automatico_habilitado: tenantData.gre_automatico_habilitado ?? false,
          umbral_gre_automatico: tenantData.umbral_gre_automatico || 700,
        },
        p_admin: {
          email: adminEmail,
          nombre: adminNombre,
          apellido: tenantData.admin_apellido,
          password_hash: passwordHash,
        },
      },
    );
    if (atomicError) {
      if (atomicError.code === '23505') throw new ConflictException(atomicError.message);
      throw new BadRequestException(`No se pudo crear el tenant: ${atomicError.message}`);
    }
    const result = atomicResult as any;
    return {
      success: true,
      message: result?.idempotent ? 'El tenant ya había sido creado' : 'Tenant creado exitosamente',
      data: {
        tenant: result?.tenant,
        adminUser: {
          ...(result?.adminUser || {}),
          temporaryPassword: result?.idempotent ? undefined : temporaryPassword,
        },
      },
      idempotent: result?.idempotent === true,
    };

  }

  /**
   * Update tenant information
   * Requirements: 1.1
   */
  async updateTenant(
    tenantId: string,
    tenantData: UpdateTenantDto,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    const client = this.supabase.getClient();
    const key = String(idempotencyKey || '').trim();
    if (!actorId || key.length < 8 || key.length > 255) {
      throw new BadRequestException(
        'Idempotency-Key es obligatorio y el actor superadministrador debe estar identificado',
      );
    }

    // Validate tenant exists
    const { data: existingTenant } = await client
      .from('empresa_config')
      .select('tenant_id, pais_id, pais')
      .eq('tenant_id', tenantId)
      .single();

    if (!existingTenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    let resolvedPaisId: number | null = null;
    let resolvedPaisCodigo: string | null = null;

    if (tenantData.pais_id !== undefined) {
      const parsedPaisId = Number(tenantData.pais_id);
      if (!parsedPaisId || Number.isNaN(parsedPaisId)) {
        throw new BadRequestException('pais_id debe ser válido');
      }
      this.assertInitialActiveCountry(parsedPaisId, null);
      resolvedPaisId = parsedPaisId;
    }

    if (typeof tenantData.pais === 'string' && tenantData.pais.trim()) {
      resolvedPaisCodigo = tenantData.pais.trim().toUpperCase();
      this.assertInitialActiveCountry(null, resolvedPaisCodigo);
    }

    if (resolvedPaisId) {
      const { data: paisData, error: paisError } = await client
        .from('paises')
        .select('id, codigo_iso')
        .eq('id', resolvedPaisId)
        .single();

      if (paisError || !paisData?.id) {
        throw new BadRequestException('pais_id no válido');
      }

      const paisCodigo = paisData.codigo_iso?.toUpperCase();
      if (!paisCodigo) {
        throw new BadRequestException('El país seleccionado no tiene código ISO válido');
      }
      this.assertInitialActiveCountry(paisData.id, paisCodigo);

      if (resolvedPaisCodigo && resolvedPaisCodigo !== paisCodigo) {
        throw new BadRequestException('pais_id no coincide con el país enviado');
      }

      resolvedPaisCodigo = paisCodigo;
    } else if (resolvedPaisCodigo) {
      const { data: paisData, error: paisError } = await client
        .from('paises')
        .select('id, codigo_iso')
        .eq('codigo_iso', resolvedPaisCodigo)
        .maybeSingle();

      if (paisError || !paisData?.id) {
        throw new BadRequestException('País no válido');
      }

      resolvedPaisId = paisData.id;
      resolvedPaisCodigo = paisData.codigo_iso?.toUpperCase() || resolvedPaisCodigo;
      this.assertInitialActiveCountry(resolvedPaisId, resolvedPaisCodigo);
    }

    if (!resolvedPaisId && !existingTenant?.pais_id) {
      throw new BadRequestException('Debes configurar el país antes de actualizar el tenant');
    }

    const effectiveCountry = resolvedPaisCodigo || existingTenant.pais;
    if (tenantData.ruc && !validateCountryTaxId(effectiveCountry, tenantData.ruc)) {
      throw new BadRequestException(`Documento fiscal inválido para ${effectiveCountry}`);
    }

    const updatePayload: Record<string, unknown> = {};
    if (tenantData.nombre !== undefined || tenantData.razon_social !== undefined) {
      updatePayload.razon_social = tenantData.razon_social ?? tenantData.nombre;
    }
    if (tenantData.nombre_comercial !== undefined) {
      updatePayload.nombre_comercial = tenantData.nombre_comercial;
    }
    if (tenantData.ruc !== undefined) updatePayload.ruc = tenantData.ruc;
    if (tenantData.direccion !== undefined) updatePayload.direccion_fiscal = tenantData.direccion;
    if (tenantData.telefono !== undefined) updatePayload.telefono = tenantData.telefono;
    if (tenantData.email !== undefined) updatePayload.email = tenantData.email;
    if (tenantData.moneda !== undefined) updatePayload.moneda_defecto = tenantData.moneda;
    if (tenantData.estado !== undefined) updatePayload.estado = tenantData.estado;
    if (tenantData.plan !== undefined) updatePayload.plan = tenantData.plan;
    if (tenantData.tipo_empresa !== undefined) updatePayload.tipo_empresa = tenantData.tipo_empresa;
    if (tenantData.usar_flujo_logistica !== undefined) {
      updatePayload.usar_flujo_logistica = tenantData.usar_flujo_logistica;
    }
    if (tenantData.gre_obligatorio !== undefined) updatePayload.gre_obligatorio = tenantData.gre_obligatorio;
    if (tenantData.gre_automatico_habilitado !== undefined) {
      updatePayload.gre_automatico_habilitado = tenantData.gre_automatico_habilitado;
    }
    if (tenantData.umbral_gre_automatico !== undefined) {
      updatePayload.umbral_gre_automatico = tenantData.umbral_gre_automatico;
    }

    if (resolvedPaisId) {
      updatePayload.pais_id = resolvedPaisId;
    }
    if (resolvedPaisCodigo) {
      updatePayload.pais = resolvedPaisCodigo;
    }

    const { data: result, error } = await client.rpc('actualizar_empresa_config_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_idempotency_key: key,
      p_operation: 'TENANT_UPDATE',
      p_patch: updatePayload,
    });

    if (error) {
      console.error('Error updating tenant:', error);
      throw new BadRequestException(`Error al actualizar tenant: ${error.message}`);
    }

    console.log('✅ [TENANT-MGMT] Tenant actualizado - ID:', tenantId);
    return (result as any)?.configuracion;
  }

  /**
   * Get all tenants with filters and pagination
   * Requirements: 1.4
   */
  async getTenants(filters?: TenantFiltersDto, user?: any) {
    const execute = async () => {
      await this.supabase.prepareTenantContext();

      const client = this.supabase.getClient();

      const page = filters?.page || 1;
      const limit = filters?.limit || 50;
      const offset = (page - 1) * limit;

      let query = client
        .from('empresa_config')
        .select('tenant_id, razon_social, nombre_comercial, ruc, email, direccion_fiscal, telefono, pais, moneda_defecto, estado, plan, fecha_inicio, fecha_fin, created_at, updated_at, is_demo, demo_expires_at, demo_created_at', { count: 'exact' });

      if (filters?.search) {
        // HARDENING: sanitizar para evitar PostgREST filter injection.
        const safe = sanitizePostgrestSearch(filters.search);
        if (safe.length > 0) {
          query = query.or(
            `razon_social.ilike.%${safe}%,nombre_comercial.ilike.%${safe}%,email.ilike.%${safe}%`,
          );
        }
      }

      if (filters?.estado) {
        query = query.eq('estado', filters.estado);
      }

      query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching tenants:', error);
        throw new BadRequestException('Error al obtener tenants');
      }

      const [totalTenantsResult, activeTenantsResult, totalUsersResult, activeUsersResult] = await Promise.all([
        client.from('empresa_config').select('tenant_id', { count: 'exact', head: true }),
        client.from('empresa_config').select('tenant_id', { count: 'exact', head: true }).eq('estado', 'ACTIVO'),
        client.from('usuarios_sistema').select('id', { count: 'exact', head: true }),
        client.from('usuarios_sistema').select('id', { count: 'exact', head: true }).eq('estado', 'ACTIVO'),
      ]);

      const statsError = [
        totalTenantsResult.error,
        activeTenantsResult.error,
        totalUsersResult.error,
        activeUsersResult.error,
      ].find(Boolean);

      if (statsError) {
        console.error('Error fetching global tenant statistics:', statsError);
        throw new BadRequestException('Error al obtener estadísticas globales');
      }

      const mappedData = (data || []).map(tenant => ({
        id: tenant.tenant_id,
        razon_social: tenant.razon_social,
        nombre_comercial: tenant.nombre_comercial,
        ruc: tenant.ruc,
        email: tenant.email,
        direccion: tenant.direccion_fiscal,
        telefono: tenant.telefono,
        pais: tenant.pais,
        moneda: tenant.moneda_defecto,
        estado: tenant.estado,
        plan: tenant.plan,
        fecha_inicio: tenant.fecha_inicio,
        fecha_fin: tenant.fecha_fin,
        created_at: tenant.created_at,
        updated_at: tenant.updated_at,
        is_demo: tenant.is_demo,
        demo_expires_at: tenant.demo_expires_at,
        demo_created_at: tenant.demo_created_at,
      }));

      return {
        success: true,
        data: mappedData,
        stats: {
          totalTenants: totalTenantsResult.count || 0,
          activeTenants: activeTenantsResult.count || 0,
          totalUsers: totalUsersResult.count || 0,
          activeUsers: activeUsersResult.count || 0,
        },
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    };

    if (user?.is_super_admin) {
      return this.tenantContext.run(
        {
          tenantId: null,
          userId: user.id ?? user.sub ?? null,
          supabaseAccessToken: null,
          isSuperAdmin: true,
        },
        execute,
      );
    }

    return execute();
  }

  /**
   * Get tenant by ID with configuration
   * Requirements: 1.4
   */
  async getTenantById(tenantId: string) {
    const client = this.supabase.getClient();

    // NOTA: app.set_tenant_context() no funciona porque Supabase PostgREST no mantiene sesión
    // La política RLS debe permitir acceso cuando el backend filtra por tenant_id explícitamente
    // Intentar establecer contexto (puede fallar silenciosamente)
    try {
      await client.rpc('app.set_tenant_context', { p_tenant_id: tenantId });
    } catch (rpcError) {
      // Ignorar error - RLS debería funcionar de todas formas
    }

    console.log(`[TenantService] Buscando tenant ${tenantId} en empresa_config...`);

    // Intentar primero con select('*') - a veces PostgREST tiene problemas con campos específicos
    let { data: tenants, error } = await client
      .from('empresa_config')
      .select('*')
      .eq('tenant_id', tenantId);

    // Si hay error PGRST301, intentar con cliente público directamente
    if (error && error.code === 'PGRST301') {
      console.warn(`[TenantService] ⚠️ Error PGRST301 detectado, intentando con cliente público...`);

      const publicClient = this.supabase.getPublicClient();
      const altQuery = await publicClient
        .from('empresa_config')
        .select('*')
        .eq('tenant_id', tenantId);

      if (!altQuery.error && altQuery.data) {
        console.log(`[TenantService] ✅ Query alternativa exitosa con cliente público`);
        tenants = altQuery.data;
        error = null;
      }
    }

    // Extraer el primer elemento del array (o null si no hay resultados)
    let tenant = tenants && tenants.length > 0 ? tenants[0] : null;

    // Si falla por RLS (policy violation), intentar con cliente público como fallback
    // Esto es necesario porque SERVICE_ROLE_KEY debería bypasear RLS pero a veces no lo hace
    if (error && (error.code === '42501' || error.code === 'P0001' || error.message?.includes('policy') || error.message?.includes('permission') || error.message?.includes('RLS'))) {
      console.warn(`[TenantService] ⚠️ RLS bloqueó acceso (${error.code}), intentando con cliente público como fallback...`);
      console.warn(`[TenantService] Error original: ${error.message}`);

      const publicClient = this.supabase.getPublicClient();
      const fallbackResult = await publicClient
        .from('empresa_config')
        .select('*')
        .eq('tenant_id', tenantId);

      // Extraer el primer elemento del array del fallback
      const fallbackTenant = fallbackResult.data && fallbackResult.data.length > 0 ? fallbackResult.data[0] : null;

      if (!fallbackResult.error && fallbackTenant) {
        console.log(`[TenantService] ✅ Fallback exitoso - usando cliente público (SERVICE_ROLE_KEY bypass RLS)`);
        tenant = fallbackTenant;
        error = null;
      } else {
        console.error(`[TenantService] ❌ Fallback también falló:`, fallbackResult.error);
      }
    }

    if (error) {
      console.error('[TenantService] ❌ Error de Supabase obteniendo tenant:', error);
      console.error('[TenantService] ❌ Error code:', error.code);
      console.error('[TenantService] ❌ Error message:', error.message);
      console.error('[TenantService] ❌ Error details:', JSON.stringify(error, null, 2));
      console.error('[TenantService] ❌ Error hint:', error.hint);

      // Si es error de RLS o permiso, dar mensaje más específico
      if (error.code === '42501' || error.message?.includes('permission denied') || error.message?.includes('policy')) {
        console.error('[TenantService] ⚠️ ERROR DE RLS: La política RLS está bloqueando el acceso');
        throw new NotFoundException(`Tenant no encontrado: Acceso bloqueado por RLS. Verificar políticas RLS en empresa_config. Error: ${error.message}`);
      }

      throw new NotFoundException(`Tenant no encontrado: ${error.message || 'Error desconocido'}`);
    }

    console.log(`[TenantService] ✅ Query exitosa. Tenant encontrado:`, tenant ? 'SÍ' : 'NO');

    if (!tenant) {
      console.error(`[TenantService] ⚠️ No existe registro en empresa_config con tenant_id: ${tenantId}`);
      console.error(`[TenantService] 💡 Esto puede indicar que:`);
      console.error(`[TenantService]    1. El tenant existe pero no tiene configuración de empresa creada`);
      console.error(`[TenantService]    2. RLS está bloqueando el acceso y el fallback no funcionó`);
      console.error(`[TenantService]    3. El tenant_id es incorrecto`);
      throw new NotFoundException(`Tenant no encontrado: No existe registro en empresa_config con tenant_id ${tenantId}`);
    }

    // Map empresa_config fields to tenant fields
    return {
      id: tenant.tenant_id,
      nombre: tenant.razon_social || tenant.nombre_comercial,
      ruc: tenant.ruc,
      email: tenant.email,
      direccion: tenant.direccion_fiscal,
      telefono: tenant.telefono,
      pais: tenant.pais,
      moneda: tenant.moneda_defecto,
      estado: tenant.estado,
      plan: tenant.plan,
      fecha_inicio: tenant.fecha_inicio,
      fecha_fin: tenant.fecha_fin,
      created_at: tenant.created_at,
      updated_at: tenant.updated_at,
      is_demo: tenant.is_demo,
      demo_expires_at: tenant.demo_expires_at,
      demo_created_at: tenant.demo_created_at,
      demo_extended: tenant.demo_extended,
    };
  }

  /**
   * Activate demo mode for an existing tenant and create/update demo user
   */
  async activateDemoTenant(
    tenantId: string,
    dto: ActivateDemoTenantDto,
    actor?: any,
    idempotencyKey?: string,
  ) {
    const client = this.supabase.getClient();
    const actorId = actor?.id || actor?.sub;
    const key = String(idempotencyKey || '').trim();
    if (!actorId || key.length < 8 || key.length > 255) {
      throw new BadRequestException(
        'Idempotency-Key es obligatorio y el actor superadministrador debe estar identificado',
      );
    }
    const dias = dto.dias_duracion ?? 15;
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const passwordFingerprint = crypto
      .createHash('sha256')
      .update(dto.password, 'utf8')
      .digest('hex');
    const { data: result, error } = await client.rpc('configurar_demo_tenant_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_idempotency_key: key,
      p_activo: true,
      p_dias_duracion: dias,
      p_email: dto.email,
      p_password_hash: passwordHash,
      p_password_fingerprint: passwordFingerprint,
      p_perfil: {
        nombre: dto.nombre || 'Demo',
        apellido: dto.apellido || 'Usuario',
      },
    });
    if (error || !result) {
      throw new BadRequestException(error?.message || 'No se pudo activar el modo demo');
    }

    return {
      success: true,
      tenant_id: tenantId,
      demo_expires_at: (result as any).demo_expires_at,
      dias_duracion: dias,
      user: {
        id: (result as any).user?.id,
        email: dto.email,
        password: dto.password,
      },
      idempotent: (result as any).idempotent === true,
    };
  }

  /**
   * Deactivate demo mode for a tenant
   */
  async deactivateDemoTenant(tenantId: string, actor?: any, idempotencyKey?: string) {
    const client = this.supabase.getClient();
    const actorId = actor?.id || actor?.sub;
    const key = String(idempotencyKey || '').trim();
    if (!actorId || key.length < 8 || key.length > 255) {
      throw new BadRequestException(
        'Idempotency-Key es obligatorio y el actor superadministrador debe estar identificado',
      );
    }
    const { data: result, error } = await client.rpc('configurar_demo_tenant_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_idempotency_key: key,
      p_activo: false,
      p_dias_duracion: null,
      p_email: null,
      p_password_hash: null,
      p_password_fingerprint: null,
      p_perfil: {},
    });
    if (error || !result) {
      throw new BadRequestException(error?.message || 'No se pudo desactivar el modo demo');
    }

    return {
      success: true,
      tenant_id: tenantId,
      message: 'Modo demo desactivado',
      actor_id: actorId,
      idempotent: (result as any).idempotent === true,
    };
  }

  /**
   * Activate tenant and enable user logins
   * Requirements: 1.1
   */
  async activateTenant(tenantId: string, actorId?: string, idempotencyKey?: string) {
    const client = this.supabase.getClient();
    const key = String(idempotencyKey || '').trim();
    if (!actorId || key.length < 8 || key.length > 255) {
      throw new BadRequestException(
        'Idempotency-Key es obligatorio y el actor superadministrador debe estar identificado',
      );
    }

    const { data: result, error } = await client.rpc('cambiar_estado_tenant_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_idempotency_key: key,
      p_estado: 'ACTIVO',
    });

    if (error || !result) {
      throw new NotFoundException(error?.message || 'Tenant no encontrado');
    }

    console.log('✅ [TENANT-MGMT] Tenant activado - ID:', tenantId);
    return (result as any).tenant;
  }

  /**
   * Deactivate tenant and revoke all sessions
   * Requirements: 1.6
   * 🔴 CRÍTICO FIX: Valida que el tenant tenga al menos un admin antes de desactivar
   */
  async deactivateTenant(tenantId: string, actorId?: string, idempotencyKey?: string) {
    const client = this.supabase.getClient();
    const key = String(idempotencyKey || '').trim();
    if (!actorId || key.length < 8 || key.length > 255) {
      throw new BadRequestException(
        'Idempotency-Key es obligatorio y el actor superadministrador debe estar identificado',
      );
    }

    const { data: result, error } = await client.rpc('cambiar_estado_tenant_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_idempotency_key: key,
      p_estado: 'INACTIVO',
    });
    if (error || !result) {
      throw new BadRequestException(error?.message || 'Tenant no encontrado');
    }

    console.log(`🔒 [TENANT-MGMT] Tenant desactivado y sesiones revocadas - ID: ${tenantId}`);
    return (result as any).tenant;
  }

  /**
   * Get tenant statistics
   * Requirements: 1.4
   */
  async getTenantStats(tenantId: string) {
    const client = this.supabase.getClient();

    // Validate tenant exists
    const { data: tenant } = await client
      .from('empresa_config')
      .select('tenant_id')
      .eq('tenant_id', tenantId)
      .single();

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    // Count total users
    const { count: totalUsers, error: totalError } = await client
      .from('usuarios_sistema')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    if (totalError) {
      console.error('Error counting total users:', totalError);
    }

    // Count active users
    const { count: activeUsers, error: activeError } = await client
      .from('usuarios_sistema')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('estado', 'ACTIVO');

    if (activeError) {
      console.error('Error counting active users:', activeError);
    }

    // Calculate storage usage (placeholder - would need actual implementation based on storage strategy)
    // For now, we'll return 0 as storage calculation requires additional infrastructure
    const storageUsage = 0;

    return {
      tenantId,
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,
      inactiveUsers: (totalUsers || 0) - (activeUsers || 0),
      storageUsage,
      storageUnit: 'MB'
    };
  }

  /**
   * Get all users for a tenant
   * Requirements: 1.4
   */
  async getTenantUsers(tenantId: string) {
    const client = this.supabase.getClient();

    // Validate tenant exists
    const { data: tenant } = await client
      .from('empresa_config')
      .select('tenant_id')
      .eq('tenant_id', tenantId)
      .single();

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    // Query usuarios_sistema filtered by tenant_id with roles
    const { data: users, error } = await client
      .from('usuarios_sistema')
      .select('*, user_roles(role_id, roles(id, nombre, descripcion))')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tenant users:', error);
      throw new BadRequestException('Error al obtener usuarios del tenant');
    }

    // Remove sensitive data from results
    const sanitizedUsers = (users || []).map(user => {
      const { password_hash, password_reset_token, ...userWithoutSensitiveData } = user;
      return userWithoutSensitiveData;
    });

    return sanitizedUsers;
  }
}
