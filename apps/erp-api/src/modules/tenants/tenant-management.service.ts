import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { UserManagementService } from '../usuarios/user-management.service';
import { CreateTenantDto, UpdateTenantDto, TenantFiltersDto } from './dto';
import * as crypto from 'crypto';

@Injectable()
export class TenantManagementService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly userManagementService: UserManagementService
  ) { }

  /**
   * Create a new tenant with first admin user
   * Requirements: 1.2, 1.3
   */
  async createTenant(tenantData: CreateTenantDto) {
    const client = this.supabase.getClient();

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
    const pais = tenantData.pais || 'PE';
    const moneda = tenantData.moneda || 'PEN';
    const adminEmail = tenantData.admin_email || tenantData.email;
    const adminNombre = tenantData.admin_nombre || 'Administrador';

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
        pais_id: pais === 'PE' ? 1 : 2,
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
      .select('tenant_id')
      .eq('tenant_id', tenantId)
      .single();

    if (!existingTenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    // Update tenant record
    const { data: updatedTenant, error } = await client
      .from('empresa_config')
      .update({
        ...tenantData,
        updated_at: new Date().toISOString()
      })
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
  async getTenants(filters?: TenantFiltersDto) {
    const client = this.supabase.getClient();

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;

    // Query all tenants (no tenant filter for super-admin)
    let query = client
      .from('empresa_config')
      .select('tenant_id, razon_social, nombre_comercial, ruc, email, direccion_fiscal, telefono, pais, moneda_defecto, estado, plan, fecha_inicio, fecha_fin, created_at, updated_at', { count: 'exact' });

    // Apply search filter (search by nombre or email)
    if (filters?.search) {
      query = query.or(`nombre.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
    }

    // Apply estado filter
    if (filters?.estado) {
      query = query.eq('estado', filters.estado);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching tenants:', error);
      throw new BadRequestException('Error al obtener tenants');
    }

    // Map empresa_config fields to tenant fields
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
      updated_at: tenant.updated_at
    }));

    return {
      success: true,
      data: mappedData,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  /**
   * Get tenant by ID with configuration
   * Requirements: 1.4
   */
  async getTenantById(tenantId: string) {
    const client = this.supabase.getClient();

    // Establecer el contexto del tenant para RLS
    await client.rpc('app.set_tenant_context', { p_tenant_id: tenantId });

    const { data: tenant, error } = await client
      .from('empresa_config')
      .select('tenant_id, razon_social, nombre_comercial, ruc, email, direccion_fiscal, telefono, pais, moneda_defecto, estado, plan, fecha_inicio, fecha_fin, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !tenant) {
      throw new NotFoundException('Tenant no encontrado');
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
      updated_at: tenant.updated_at
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
   */
  async deactivateTenant(tenantId: string) {
    const client = this.supabase.getClient();

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

    console.log('🔒 [TENANT-MGMT] Tenant desactivado y sesiones revocadas - ID:', tenantId);
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
