import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import { UserManagementService } from '../usuarios/user-management.service';
import { CreateTenantDto, UpdateTenantDto, TenantFiltersDto, ActivateDemoTenantDto } from './dto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class TenantManagementService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly userManagementService: UserManagementService,
    private readonly tenantContext: TenantContextService,
  ) { }

  /**
   * Create a new tenant with first admin user
   * Requirements: 1.2, 1.3
   */
  async createTenant(tenantData: CreateTenantDto) {
    const client = this.supabase.getClient();

    const paisIdInput = Number(tenantData.pais_id);
    if (!paisIdInput || Number.isNaN(paisIdInput)) {
      throw new BadRequestException('pais_id es requerido para crear el tenant');
    }

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

    if (tenantData.pais && tenantData.pais.toUpperCase() !== pais) {
      throw new BadRequestException('pais_id no coincide con el país enviado');
    }

    // ✅ F2: Validar unicidad de RUC por país
    const { data: existingTenantByRuc } = await client
      .from('empresa_config')
      .select('tenant_id, razon_social')
      .eq('ruc', tenantData.ruc)
      .eq('pais', pais)
      .maybeSingle();

    if (existingTenantByRuc) {
      throw new ConflictException(
        `Ya existe un tenant con RUC ${tenantData.ruc} en el país ${pais}. Razón Social: ${existingTenantByRuc.razon_social}`
      );
    }

    // Validate email uniqueness
    const { data: existingTenant } = await client
      .from('empresa_config')
      .select('tenant_id')
      .eq('email', tenantData.email)
      .single();

    if (existingTenant) {
      throw new ConflictException('El email del tenant ya está registrado');
    }

    // Generate unique tenant_id
    const tenantId = crypto.randomUUID();

    // Set default values
    const moneda = tenantData.moneda || paisData.moneda_codigo || 'PEN';
    const adminEmail = tenantData.admin_email || tenantData.email;
    const adminNombre = tenantData.admin_nombre || 'Administrador';
    const paisId = paisData.id;

    // Insert tenant record with sales configuration
    const { data: newTenant, error: tenantError } = await client
      .from('empresa_config')
      .insert({
        tenant_id: tenantId,
        razon_social: tenantData.razon_social,
        nombre_comercial: tenantData.nombre_comercial || tenantData.razon_social,
        ruc: tenantData.ruc,
        direccion_fiscal: tenantData.direccion,
        telefono: tenantData.telefono,
        email: tenantData.email,
        pais: pais,
        moneda_defecto: moneda,
        estado: 'ACTIVO',
        plan: 'BASICO',
        fecha_inicio: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        pais_id: paisId,
        // Sales configuration
        tipo_empresa: tenantData.tipo_empresa || 'MICRO',
        usar_flujo_logistica: tenantData.usar_flujo_logistica ?? false,
        gre_obligatorio: tenantData.gre_obligatorio ?? false,
        gre_automatico_habilitado: tenantData.gre_automatico_habilitado ?? false,
        umbral_gre_automatico: tenantData.umbral_gre_automatico || 700,
        configuracion_completa: true
      })
      .select()
      .single();

    if (tenantError) {
      console.error('Error creating tenant:', tenantError);
      throw new BadRequestException(`Error al crear tenant: ${tenantError.message}`);
    }

    console.log('✅ [TENANT-MGMT] Tenant creado - ID:', tenantId, 'Razón Social:', tenantData.razon_social);

    // Create first admin user for tenant
    try {
      // First, get or create the ADMIN role for this tenant
      let adminRoleId: string;

      const { data: existingRole } = await client
        .from('roles')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('nombre', 'ADMIN')
        .single();

      if (existingRole) {
        adminRoleId = existingRole.id;
      } else {
        // Create ADMIN role for this tenant
        const { data: newRole, error: roleError } = await client
          .from('roles')
          .insert({
            tenant_id: tenantId,
            nombre: 'ADMIN',
            descripcion: 'Administrador del tenant con acceso completo',
            is_system_role: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (roleError) {
          console.error('Error creating ADMIN role:', roleError);
          throw new BadRequestException('Error al crear rol de administrador');
        }

        adminRoleId = newRole.id;
        console.log('✅ [TENANT-MGMT] Rol ADMIN creado para tenant:', tenantId);

        // Copy permissions from template tenant (VIERDES)
        // Vierdes is the template tenant with base permissions (44 permisos)
        // Super-admin tenant has additional permissions (52 permisos) that should NOT be copied
        const TEMPLATE_TENANT_ID = '25593ea2-5129-42f3-a9d0-f4da8d59dc1a'; // VIERDES

        // Get all permissions from template tenant
        const { data: templatePermissions } = await client
          .from('permisos')
          .select('modulo, accion, recurso, descripcion')
          .eq('tenant_id', TEMPLATE_TENANT_ID);

        if (templatePermissions && templatePermissions.length > 0) {
          // Create permissions for new tenant
          const newPermissions = templatePermissions.map(perm => ({
            tenant_id: tenantId,
            modulo: perm.modulo,
            accion: perm.accion,
            recurso: perm.recurso,
            descripcion: perm.descripcion,
            activo: true,
            created_at: new Date().toISOString()
          }));

          const { data: createdPermissions, error: permCreateError } = await client
            .from('permisos')
            .insert(newPermissions)
            .select('id');

          if (permCreateError) {
            console.error('Error creating permissions for new tenant:', permCreateError);
          } else if (createdPermissions && createdPermissions.length > 0) {
            console.log(`✅ [TENANT-MGMT] ${createdPermissions.length} permisos creados para el tenant`);

            // Assign all new permissions to ADMIN role
            const rolePermissions = createdPermissions.map(permission => ({
              role_id: adminRoleId,
              permiso_id: permission.id,
              created_at: new Date().toISOString()
            }));

            const { error: permAssignError } = await client
              .from('rol_permisos')
              .insert(rolePermissions);

            if (permAssignError) {
              console.error('Error assigning permissions to ADMIN role:', permAssignError);
            } else {
              console.log(`✅ [TENANT-MGMT] ${rolePermissions.length} permisos asignados al rol ADMIN`);
            }
          }
        }
      }

      // Create the admin user with custom password if provided
      const adminUser = await this.userManagementService.createUser(tenantId, {
        nombre: adminNombre,
        apellido: tenantData.admin_apellido,
        email: adminEmail,
        password: tenantData.admin_password, // Use custom password if provided
        roles: [adminRoleId]
      });

      console.log('✅ [TENANT-MGMT] Usuario admin creado - Email:', adminEmail);

      return {
        success: true,
        message: 'Tenant creado exitosamente',
        data: {
          tenant: newTenant,
          adminUser: {
            id: adminUser.id,
            nombre: adminUser.nombre,
            email: adminUser.email,
            temporaryPassword: adminUser.temporaryPassword
          }
        }
      };
    } catch (error) {
      // Rollback: delete the tenant if user creation fails
      await client
        .from('empresa_config')
        .delete()
        .eq('tenant_id', tenantId);

      console.error('Error creating admin user, tenant rolled back:', error);
      throw new BadRequestException('Error al crear usuario administrador del tenant');
    }
  }

  /**
   * Update tenant information
   * Requirements: 1.1
   */
  async updateTenant(tenantId: string, tenantData: UpdateTenantDto) {
    const client = this.supabase.getClient();

    // Validate tenant exists
    const { data: existingTenant } = await client
      .from('empresa_config')
      .select('tenant_id, pais_id')
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
      resolvedPaisId = parsedPaisId;
    }

    if (typeof tenantData.pais === 'string' && tenantData.pais.trim()) {
      resolvedPaisCodigo = tenantData.pais.trim().toUpperCase();
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
    }

    if (!resolvedPaisId && !existingTenant?.pais_id) {
      throw new BadRequestException('Debes configurar el país antes de actualizar el tenant');
    }

    const updatePayload: Record<string, any> = {
      ...tenantData,
      updated_at: new Date().toISOString()
    };

    if (resolvedPaisId) {
      updatePayload.pais_id = resolvedPaisId;
    }
    if (resolvedPaisCodigo) {
      updatePayload.pais = resolvedPaisCodigo;
    }

    // Update tenant record
    const { data: updatedTenant, error } = await client
      .from('empresa_config')
      .update(updatePayload)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('Error updating tenant:', error);
      throw new BadRequestException('Error al actualizar tenant');
    }

    console.log('✅ [TENANT-MGMT] Tenant actualizado - ID:', tenantId);
    return updatedTenant;
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
        query = query.or(`razon_social.ilike.%${filters.search}%,nombre_comercial.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
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
  async activateDemoTenant(tenantId: string, dto: ActivateDemoTenantDto, actor?: any) {
    const client = this.supabase.getClient();

    const { data: tenant, error: tenantError } = await client
      .from('empresa_config')
      .select('tenant_id, razon_social, is_demo, demo_expires_at, demo_created_at')
      .eq('tenant_id', tenantId)
      .single();

    if (tenantError || !tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    const dias = dto.dias_duracion ?? 15;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + dias * 24 * 60 * 60 * 1000);
    const demoCreatedAt = tenant.demo_created_at ? new Date(tenant.demo_created_at) : now;
    const demoExtended = Boolean(tenant.is_demo);

    const { error: demoError } = await client
      .from('empresa_config')
      .update({
        is_demo: true,
        demo_created_at: demoCreatedAt.toISOString(),
        demo_expires_at: expiresAt.toISOString(),
        demo_extended: demoExtended,
        updated_at: now.toISOString(),
      })
      .eq('tenant_id', tenantId);

    if (demoError) {
      console.error('Error activando demo:', demoError);
      throw new BadRequestException('No se pudo activar el modo demo');
    }

    // Obtener rol ADMIN para asegurar acceso
    let adminRoleId: string | null = null;
    const { data: adminRole } = await client
      .from('roles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('nombre', 'ADMIN')
      .single();

    if (adminRole?.id) {
      adminRoleId = adminRole.id;
    }

    const { data: existingUser } = await client
      .from('usuarios_sistema')
      .select('id, email, nombre, apellido')
      .eq('tenant_id', tenantId)
      .eq('email', dto.email)
      .maybeSingle();

    const passwordHash = await bcrypt.hash(dto.password, 10);
    let userId = existingUser?.id || null;

    if (existingUser) {
      const { error: updateError } = await client
        .from('usuarios_sistema')
        .update({
          password_hash: passwordHash,
          estado: 'ACTIVO',
          is_demo_user: true,
          demo_email_temp: dto.email,
          nombre: dto.nombre || existingUser.nombre,
          apellido: dto.apellido || existingUser.apellido,
          updated_at: now.toISOString(),
        })
        .eq('id', existingUser.id)
        .eq('tenant_id', tenantId);

      if (updateError) {
        console.error('Error actualizando usuario demo:', updateError);
        throw new BadRequestException('No se pudo actualizar el usuario demo');
      }
    } else {
      const newUser = await this.userManagementService.createUser(
        tenantId,
        {
          nombre: dto.nombre || 'Demo',
          apellido: dto.apellido || 'Usuario',
          email: dto.email,
          password: dto.password,
          roles: adminRoleId ? [adminRoleId] : [],
        },
        actor?.id || actor?.sub || 'SYSTEM',
      );

      userId = newUser.id;

      await client
        .from('usuarios_sistema')
        .update({
          is_demo_user: true,
          demo_email_temp: dto.email,
          updated_at: now.toISOString(),
        })
        .eq('id', newUser.id)
        .eq('tenant_id', tenantId);
    }

    if (adminRoleId && userId) {
      await this.userManagementService.assignRoles(tenantId, userId, [adminRoleId]);
    }

    return {
      success: true,
      tenant_id: tenantId,
      demo_expires_at: expiresAt.toISOString(),
      dias_duracion: dias,
      user: {
        id: userId,
        email: dto.email,
        password: dto.password,
      },
    };
  }

  /**
   * Deactivate demo mode for a tenant
   */
  async deactivateDemoTenant(tenantId: string, actor?: any) {
    const client = this.supabase.getClient();

    const { data: tenant } = await client
      .from('empresa_config')
      .select('tenant_id, is_demo')
      .eq('tenant_id', tenantId)
      .single();

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    const now = new Date();
    const { error: updateError } = await client
      .from('empresa_config')
      .update({
        is_demo: false,
        demo_expires_at: null,
        demo_extended: false,
        updated_at: now.toISOString(),
      })
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('Error desactivando demo:', updateError);
      throw new BadRequestException('No se pudo desactivar el modo demo');
    }

    await client
      .from('usuarios_sistema')
      .update({
        is_demo_user: false,
        demo_email_temp: null,
        updated_at: now.toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('is_demo_user', true);

    return {
      success: true,
      tenant_id: tenantId,
      message: 'Modo demo desactivado',
      actor_id: actor?.id || actor?.sub || null,
    };
  }

  /**
   * Activate tenant and enable user logins
   * Requirements: 1.1
   */
  async activateTenant(tenantId: string) {
    const client = this.supabase.getClient();

    // Update estado to 'ACTIVO'
    const { data: tenant, error } = await client
      .from('empresa_config')
      .update({
        estado: 'ACTIVO',
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error || !tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    console.log('✅ [TENANT-MGMT] Tenant activado - ID:', tenantId);
    return tenant;
  }

  /**
   * Deactivate tenant and revoke all sessions
   * Requirements: 1.6
   * 🔴 CRÍTICO FIX: Valida que el tenant tenga al menos un admin antes de desactivar
   */
  async deactivateTenant(tenantId: string) {
    const client = this.supabase.getClient();

    // 🔴 CRÍTICO FIX: Validar que el tenant tenga al menos un admin activo antes de desactivar
    // Primero obtener el ID del rol ADMIN del tenant
    const { data: adminRole, error: roleError } = await client
      .from('roles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('nombre', 'ADMIN')
      .single();

    if (roleError || !adminRole) {
      console.error('Error obteniendo rol ADMIN del tenant:', roleError);
      throw new BadRequestException(
        'No se puede desactivar el tenant porque no se encontró el rol ADMIN. ' +
        'El tenant podría estar en un estado inconsistente.'
      );
    }

    // Obtener usuarios con rol ADMIN y filtrar por tenant_id y estado en JavaScript
    // (más robusto que filtrar relaciones anidadas en Supabase PostgREST)
    const { data: adminUserRoles, error: adminError } = await client
      .from('user_roles')
      .select(`
        usuario_sistema_id,
        usuarios_sistema (
          id,
          estado,
          tenant_id
        )
      `)
      .eq('role_id', adminRole.id);

    if (adminError) {
      console.error('Error verificando admins del tenant:', adminError);
      throw new BadRequestException('No se pudo verificar los administradores del tenant');
    }

    // Filtrar usuarios activos del tenant con rol ADMIN
    const activeAdmins = (adminUserRoles || [])
      .map(ur => ur.usuarios_sistema)
      .filter((user: any) => 
        user && 
        user.tenant_id === tenantId && 
        user.estado === 'ACTIVO'
      );

    const activeAdminsCount = activeAdmins.length;

    if (activeAdminsCount === 0) {
      throw new BadRequestException(
        'No se puede desactivar el tenant porque no tiene al menos un administrador activo. ' +
        'El tenant quedaría sin acceso administrativo y no se podría reactivar fácilmente.'
      );
    }

    if (activeAdminsCount === 1) {
      console.warn(
        `⚠️ [TENANT-MGMT] Tenant ${tenantId} solo tiene 1 admin activo. Desactivar dejará al tenant sin admins.`
      );
    }

    // Update estado to 'INACTIVO'
    const { data: tenant, error } = await client
      .from('empresa_config')
      .update({
        estado: 'INACTIVO',
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error || !tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    // Revoke all active sessions for tenant users
    const { error: sessionError } = await client
      .from('user_sessions')
      .delete()
      .eq('tenant_id', tenantId);

    if (sessionError) {
      console.error('Error revoking tenant sessions:', sessionError);
      // Continue even if session revocation fails
    }

    console.log(`🔒 [TENANT-MGMT] Tenant desactivado y sesiones revocadas - ID: ${tenantId} (${activeAdminsCount} admins activos)`);
    return tenant;
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
