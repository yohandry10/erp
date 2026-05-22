import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  Query,
  BadRequestException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PermissionService } from './permissions/permission.service';
import { TenantContextService } from '../shared/tenant/tenant-context.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { AuditService } from './audit/audit.service';
import * as bcrypt from 'bcrypt';

const USUARIO_SAFE_COLUMNS = `
  id,
  tenant_id,
  email,
  nombre,
  apellido,
  telefono,
  activo,
  estado,
  is_super_admin,
  fecha_ultimo_acceso,
  created_at,
  updated_at
`;

const DEMO_ALLOWED_ROLE_NAMES = new Set([
  'ADMIN_DEMO',
  'GERENCIA',
  'COMPRAS',
  'ALMACEN',
  'VENDEDOR',
  'CAJERO',
  'FINANZAS',
  'CONTADOR',
  'RRHH',
]);
const DEMO_MAX_USERS = 5;

@ApiTags('usuarios-sistema')
@Controller(['usuarios-sistema', 'usuarios'])
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UsuariosController {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly permissionService: PermissionService,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
  ) {}

  private normalizeEstado(estado: string | undefined): 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO' {
    const normalized = (estado || 'ACTIVO').trim().toUpperCase();
    if (!['ACTIVO', 'INACTIVO', 'SUSPENDIDO'].includes(normalized)) {
      throw new BadRequestException('Estado de usuario inválido');
    }
    return normalized as 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO';
  }

  private async assertNotLastSuperAdmin(
    tenantId: string,
    targetUser: any,
    nextEstado: string,
  ): Promise<void> {
    if (!targetUser?.is_super_admin || nextEstado === 'ACTIVO') {
      return;
    }

    const { count, error } = await this.supabaseService
      .getClient()
      .from('usuarios_sistema')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_super_admin', true)
      .eq('activo', true)
      .neq('id', targetUser.id);

    if (error) {
      throw new BadRequestException(`No se pudo validar superadmins activos: ${error.message}`);
    }

    if ((count || 0) === 0) {
      throw new ForbiddenException('No se puede inactivar o eliminar el último super admin activo');
    }
  }

  private async registrarAuditoriaUsuario(
    tableName: string,
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    req: any,
    tenantId: string,
    recordId: string,
    oldValues?: Record<string, any> | null,
    newValues?: Record<string, any> | null,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.auditService.registrarCambio(
      tableName,
      operation,
      req?.user?.id || 'SYSTEM',
      {
        old: oldValues || undefined,
        new: newValues || undefined,
      },
      tenantId,
      recordId,
      metadata,
    );
  }

  private resolveTenantOrThrow(req: any): string {
    const fromUser = req?.user?.tenant_id;
    const fromMiddleware = req?.tenantId || req?.tenant_id;
    const fromHeaders =
      req?.headers?.['x-tenant-id'] ||
      req?.headers?.['x-tenant'] ||
      req?.headers?.['tenant-id'];

    const tenantId = (fromMiddleware || fromUser || fromHeaders)?.toString().trim();

    if (!tenantId) {
      // HARDENING: no permitir defaults ni tenants ajenos.
      throw new BadRequestException('Tenant requerido en la sesión actual');
    }

    // Normalizar en la request para el resto del pipeline.
    req.tenantId = tenantId;
    req.tenant_id = tenantId;

    return tenantId;
  }

  private async getDemoContext(tenantId: string): Promise<{
    isDemo: boolean;
    expiresAt: string | null;
    retentionUntil: string | null;
  }> {
    const { data } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select('is_demo, demo_expires_at')
      .eq('tenant_id', tenantId)
      .single();

    const isDemo = data?.is_demo === true;
    const expiresAt = data?.demo_expires_at || null;

    return {
      isDemo,
      expiresAt,
      retentionUntil: expiresAt ? new Date(new Date(expiresAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
    };
  }

  private async assertDemoUserLimit(tenantId: string): Promise<void> {
    const { count, error } = await this.supabaseService
      .getClient()
      .from('usuarios_sistema')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('activo', true);

    if (error) {
      throw new BadRequestException(`No se pudo validar límite de usuarios demo: ${error.message}`);
    }

    if ((count || 0) >= DEMO_MAX_USERS) {
      throw new ForbiddenException(`El demo permite hasta ${DEMO_MAX_USERS} usuarios activos`);
    }
  }

  private async assertDemoRoleAllowed(tenantId: string, roleId: string): Promise<void> {
    const { data: role, error } = await this.supabaseService
      .getClient()
      .from('roles')
      .select('id, nombre')
      .eq('id', roleId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !role) {
      throw new BadRequestException('Rol no válido para este tenant');
    }

    const roleName = String(role.nombre || '').trim().toUpperCase();
    if (!DEMO_ALLOWED_ROLE_NAMES.has(roleName)) {
      throw new ForbiddenException('Ese rol no está disponible en modo demo');
    }
  }

  @Get('/')
  @RequirePermission('configuracion', 'ver', 'usuarios')
  @ApiOperation({ summary: 'Obtener todos los usuarios del sistema' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios obtenida exitosamente' })
  async getUsuarios(
    @Req() req: any,
    @Query('rol') rol?: string,
    @Query('estado') estado?: string,
    @Query('activo') activo?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      console.log('👥 Obteniendo usuarios del sistema...');
      const user = req.user as any;
      const tenantId = this.resolveTenantOrThrow(req);

      // NOTA: Usamos left join (sin !inner) para incluir usuarios sin rol asignado
      let query = this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .select(`
          ${USUARIO_SAFE_COLUMNS},
          roles_usuario:user_roles (
            roles (
              id,
              nombre,
              descripcion
            )
          )
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (rol && rol !== 'todos') {
        query = query.eq('roles_usuario.roles.nombre', rol);
      }

      if (estado && estado !== 'todos') {
        query = query.eq('estado', estado);
      }

      if (activo != null && activo !== '') {
        const activoNormalizado = String(activo).trim().toLowerCase();
        if (['true', '1', 'si', 'sí'].includes(activoNormalizado)) {
          query = query.eq('activo', true);
        } else if (['false', '0', 'no'].includes(activoNormalizado)) {
          query = query.eq('activo', false);
        }
      }

      const parsedLimit = Number.parseInt(String(limit || ''), 10);
      if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
        query = query.limit(Math.min(parsedLimit, 100));
      }

      const { data: usuarios, error } = await query;

      if (error) {
        console.error('❌ Error obteniendo usuarios:', error);
        throw error;
      }

      console.log(`✅ ${usuarios?.length || 0} usuarios encontrados`);

      return {
        success: true,
        data: usuarios,
        total: usuarios?.length || 0
      };

    } catch (error) {
      console.error('❌ Error en getUsuarios:', error);
      return {
        success: false,
        data: [],
        error: error.message
      };
    }
  }

  @Get('/stats')
  @RequirePermission('configuracion', 'ver', 'usuarios')
  @ApiOperation({ summary: 'Obtener estadísticas de usuarios' })
  @ApiResponse({ status: 200, description: 'Estadísticas obtenidas exitosamente' })
  async getStats(@Req() req: any) {
    try {
      console.log('📊 Obteniendo estadísticas de usuarios...');
      const user = req.user as any;
      const tenantId = this.resolveTenantOrThrow(req);

      // Total usuarios
      const { count: totalUsuarios } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      // Usuarios activos
      const { count: usuariosActivos } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('estado', 'ACTIVO');

      // Usuarios inactivos
      const { count: usuariosInactivos } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('estado', 'INACTIVO');

      // Total roles
      const { count: totalRoles } = await this.supabaseService
        .getClient()
        .from('roles')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      const stats = {
        totalUsuarios: totalUsuarios || 0,
        usuariosActivos: usuariosActivos || 0,
        usuariosInactivos: usuariosInactivos || 0,
        totalRoles: totalRoles || 0
      };

      console.log('✅ Estadísticas obtenidas:', stats);

      return {
        success: true,
        data: stats
      };

    } catch (error) {
      console.error('❌ Error obteniendo estadísticas:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }

  @Get('/roles')
  @RequirePermission('configuracion', 'ver', 'usuarios')
  @ApiOperation({ summary: 'Obtener todos los roles disponibles' })
  @ApiResponse({ status: 200, description: 'Lista de roles obtenida exitosamente' })
  async getRoles(@Req() req: any) {
    try {
      console.log('🔑 Obteniendo roles del sistema...');
      const user = req.user as any;
      const tenantId = this.resolveTenantOrThrow(req);
      const demoContext = await this.getDemoContext(tenantId);

      const { data: roles, error } = await this.supabaseService
        .getClient()
        .from('roles')
        .select(`
          *,
          user_roles (
            usuarios_sistema (
              id,
              nombre,
              estado
            )
          ),
          rol_permisos (
            permisos (
              modulo,
              accion
            )
          )
        `)
        .eq('tenant_id', tenantId)
        .order('nombre');

      if (error) {
        console.error('❌ Error obteniendo roles:', error);
        throw error;
      }

      // Calcular estadísticas y formatear permisos por rol
      const rolesFiltrados = demoContext.isDemo
        ? roles?.filter((rol) => DEMO_ALLOWED_ROLE_NAMES.has(String(rol.nombre || '').trim().toUpperCase()))
        : roles;

      const rolesConStats = rolesFiltrados?.map(rol => {
        // Extraer permisos únicos en formato legible
        const permisosSet = new Set<string>();
        rol.rol_permisos?.forEach((rp: any) => {
          if (rp.permisos) {
            permisosSet.add(`${rp.permisos.modulo}:${rp.permisos.accion}`);
          }
        });
        
        // Agrupar por módulo para mostrar más limpio
        const permisosPorModulo: Record<string, string[]> = {};
        permisosSet.forEach(p => {
          const [modulo, accion] = p.split(':');
          if (!permisosPorModulo[modulo]) {
            permisosPorModulo[modulo] = [];
          }
          permisosPorModulo[modulo].push(accion);
        });
        
        // Crear lista resumida de permisos
        const permisosResumen = Object.entries(permisosPorModulo).map(
          ([modulo, acciones]) => `${modulo} (${acciones.length})`
        );

        return {
          ...rol,
          usuariosCount: rol.user_roles?.length || 0,
          usuariosActivos: rol.user_roles?.filter((ru: any) => ru.usuarios_sistema?.estado === 'ACTIVO').length || 0,
          permisos: permisosResumen, // Array de strings para el frontend
          permisosDetalle: permisosPorModulo // Detalle completo si se necesita
        };
      });

      console.log(`✅ ${rolesConStats?.length || 0} roles encontrados`);

      return {
        success: true,
        data: rolesConStats
      };

    } catch (error) {
      console.error('❌ Error en getRoles:', error);
      return {
        success: false,
        data: [],
        error: error.message
      };
    }
  }

  @Post('/crear')
  @RequirePermission('configuracion', 'crear', 'usuarios')
  @ApiOperation({ summary: 'Crear nuevo usuario del sistema' })
  @ApiResponse({ status: 201, description: 'Usuario creado exitosamente' })
  async crearUsuario(@Body() usuarioData: any, @Req() req: any) {
    try {
      console.log('👤 Creando nuevo usuario del sistema...');

      const user = req.user as any;
      const tenantId = this.resolveTenantOrThrow(req);
      const demoContext = await this.getDemoContext(tenantId);

      // Validar datos requeridos
      if (!usuarioData.nombre || !usuarioData.email || !usuarioData.rol_id || !usuarioData.password) {
        throw new BadRequestException('Datos requeridos: nombre, email, rol_id, password');
      }

      if (demoContext.isDemo) {
        await this.assertDemoUserLimit(tenantId);
        await this.assertDemoRoleAllowed(tenantId, usuarioData.rol_id);
      }

      // Validar contraseña
      if (usuarioData.password.length < 8) {
        throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
      }

      // Verificar que el email no exista en usuarios_sistema
      const { data: existeEmail } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .select('id')
        .eq('email', usuarioData.email)
        .single();

      if (existeEmail) {
        throw new BadRequestException('Ya existe un usuario con este email');
      }

      // 1. Crear usuario en Supabase Auth
      const { data: authUser, error: authError } = await this.supabaseService
        .getAdminClient()
        .auth.admin.createUser({
          email: usuarioData.email,
          password: usuarioData.password,
          email_confirm: true, // Confirmar email automáticamente
          user_metadata: {
            nombre: usuarioData.nombre,
            tenant_id: tenantId
          }
        });

      if (authError) {
        console.error('❌ Error creando usuario en auth:', authError);
        throw new BadRequestException(authError.message || 'Error creando credenciales de usuario');
      }

      // 2. Crear usuario en usuarios_sistema con el mismo ID
      const estado = this.normalizeEstado(usuarioData.estado);
      const passwordHash = await bcrypt.hash(usuarioData.password, 10);
      const nuevoUsuario = {
        id: authUser.user.id, // Usar el mismo ID de auth.users
        tenant_id: tenantId,
        nombre: usuarioData.nombre,
        email: usuarioData.email,
        password_hash: passwordHash,
        telefono: usuarioData.telefono || null,
        estado,
        activo: estado === 'ACTIVO',
        is_super_admin: false,
        is_demo_user: demoContext.isDemo,
        demo_email_temp: demoContext.isDemo ? usuarioData.email : null,
        demo_expires_at: demoContext.isDemo ? demoContext.expiresAt : null,
        demo_retention_until: demoContext.isDemo ? demoContext.retentionUntil : null,
        demo_created_by: demoContext.isDemo ? user?.id || null : null,
        fecha_ultimo_acceso: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: usuarioCreado, error: errorUsuario } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .insert(nuevoUsuario)
        .select(USUARIO_SAFE_COLUMNS)
        .single();

      if (errorUsuario) {
        console.error('❌ Error creando usuario en BD:', errorUsuario);
        // Revertir: eliminar usuario de auth
        await this.supabaseService.getAdminClient().auth.admin.deleteUser(authUser.user.id);
        throw errorUsuario;
      }

      // 3. Asignar rol
      const { error: errorRol } = await this.supabaseService
        .getClient()
        .from('user_roles')
        .insert({
          usuario_sistema_id: usuarioCreado.id,
          role_id: usuarioData.rol_id,
          tenant_id: tenantId,
          created_at: new Date().toISOString()
        });

      if (errorRol) {
        console.error('❌ Error asignando rol:', errorRol);
        // Revertir: eliminar usuario de BD y auth
        await this.supabaseService.getClient().from('usuarios_sistema').delete().eq('id', usuarioCreado.id);
        await this.supabaseService.getAdminClient().auth.admin.deleteUser(authUser.user.id);
        throw errorRol;
      }

      console.log('✅ Usuario creado exitosamente:', usuarioCreado.id);

      await this.registrarAuditoriaUsuario(
        'usuarios_sistema',
        'INSERT',
        req,
        tenantId,
        usuarioCreado.id,
        null,
        usuarioCreado,
        { accion: 'CREAR_USUARIO', rol_id: usuarioData.rol_id },
      );

      return {
        success: true,
        data: { ...usuarioCreado, password: undefined },
        message: `Usuario "${usuarioData.nombre}" creado exitosamente. Ya puede iniciar sesión con su email y contraseña.`
      };

    } catch (error) {
      console.error('❌ Error creando usuario:', error);
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(error.message || 'Error creando usuario');
    }
  }

  @Put('/:id')
  @RequirePermission('configuracion', 'editar', 'usuarios')
  @ApiOperation({ summary: 'Actualizar usuario del sistema' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado exitosamente' })
  async actualizarUsuario(@Param('id') id: string, @Body() usuarioData: any, @Req() req: any) {
    try {
      console.log(`✏️ Actualizando usuario: ${id}`);
      const user = req.user as any;
      const tenantId = this.resolveTenantOrThrow(req);
      const demoContext = await this.getDemoContext(tenantId);

      // Verificar que el usuario existe
      const { data: usuarioExistente } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .select(USUARIO_SAFE_COLUMNS)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (!usuarioExistente) {
        throw new BadRequestException('Usuario no encontrado');
      }

      // Actualizar usuario
      const datosActualizacion = {
        ...usuarioData,
        updated_at: new Date().toISOString()
      };
      const requestedRoleId = datosActualizacion.rol_id;

      if (demoContext.isDemo && requestedRoleId) {
        await this.assertDemoRoleAllowed(tenantId, requestedRoleId);
      }

      // Remover campos que no deben actualizarse directamente
      delete datosActualizacion.id;
      delete datosActualizacion.tenant_id;
      delete datosActualizacion.created_at;
      delete datosActualizacion.password;
      delete datosActualizacion.password_hash;
      delete datosActualizacion.password_reset_token;
      delete datosActualizacion.password_reset_expires;
      delete datosActualizacion.failed_login_attempts;
      delete datosActualizacion.locked_until;
      delete datosActualizacion.is_super_admin;
      delete datosActualizacion.rol_id;
      if (datosActualizacion.estado !== undefined) {
        datosActualizacion.estado = this.normalizeEstado(datosActualizacion.estado);
        datosActualizacion.activo = datosActualizacion.estado === 'ACTIVO';
      }

      const { data: usuarioActualizado, error } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .update(datosActualizacion)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select(USUARIO_SAFE_COLUMNS)
        .single();

      if (error) {
        console.error('❌ Error actualizando usuario:', error);
        throw error;
      }

      if (requestedRoleId) {
        const { data: role, error: roleError } = await this.supabaseService
          .getClient()
          .from('roles')
          .select('id')
          .eq('id', requestedRoleId)
          .eq('tenant_id', tenantId)
          .single();

        if (roleError || !role) {
          throw new BadRequestException('Rol no válido para este tenant');
        }

        await this.supabaseService
          .getClient()
          .from('user_roles')
          .delete()
          .eq('usuario_sistema_id', id);

        const { error: roleAssignError } = await this.supabaseService
          .getClient()
          .from('user_roles')
          .insert({
            usuario_sistema_id: id,
            role_id: requestedRoleId,
            tenant_id: tenantId,
            created_at: new Date().toISOString(),
          });

        if (roleAssignError) {
          throw new BadRequestException(`Error asignando rol: ${roleAssignError.message}`);
        }
      }

      await this.registrarAuditoriaUsuario(
        'usuarios_sistema',
        'UPDATE',
        req,
        tenantId,
        id,
        usuarioExistente,
        usuarioActualizado,
        { accion: 'ACTUALIZAR_USUARIO', rol_id: requestedRoleId || null },
      );

      console.log('✅ Usuario actualizado exitosamente');

      return {
        success: true,
        data: usuarioActualizado,
        message: 'Usuario actualizado exitosamente'
      };

    } catch (error) {
      console.error('❌ Error actualizando usuario:', error);
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(error.message || 'Error actualizando usuario');
    }
  }

  @Put('/:id/estado')
  @RequirePermission('configuracion', 'editar', 'usuarios')
  @ApiOperation({ summary: 'Cambiar estado de usuario (activar/desactivar)' })
  @ApiResponse({ status: 200, description: 'Estado actualizado exitosamente' })
  async cambiarEstado(@Param('id') id: string, @Body() estadoData: { estado: string }, @Req() req: any) {
    try {
      const estado = this.normalizeEstado(estadoData.estado);
      console.log(`🔄 Cambiando estado de usuario ${id} a ${estado}`);
      const user = req.user as any;
      const tenantId = this.resolveTenantOrThrow(req);

      // VALIDACIÓN 1: No puedes desactivarte a ti mismo
      if (id === user?.id) {
        throw new ForbiddenException('No puedes cambiar el estado de tu propia cuenta');
      }

      // Obtener el usuario objetivo y su rol
      const { data: targetUser, error: fetchError } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .select(`
          id,
          nombre,
          email,
          estado,
          activo,
          is_super_admin,
          roles_usuario:user_roles (
            roles (
              nombre
            )
          )
        `)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (fetchError || !targetUser) {
        throw new BadRequestException('Usuario no encontrado');
      }

      await this.assertNotLastSuperAdmin(tenantId, targetUser, estado);

      const { data: usuarioActualizado, error } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .update({
          estado,
          activo: estado === 'ACTIVO',
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select(USUARIO_SAFE_COLUMNS)
        .single();

      if (error) {
        console.error('❌ Error cambiando estado:', error);
        throw error;
      }

      await this.registrarAuditoriaUsuario(
        'usuarios_sistema',
        'UPDATE',
        req,
        tenantId,
        id,
        {
          id: targetUser.id,
          email: targetUser.email,
          estado: targetUser.estado,
          activo: targetUser.activo,
          is_super_admin: targetUser.is_super_admin,
        },
        usuarioActualizado,
        { accion: 'CAMBIAR_ESTADO_USUARIO', estado },
      );

      console.log(`✅ Estado de usuario ${targetUser.nombre} cambiado a ${estado} por ${user?.id}`);

      return {
        success: true,
        data: usuarioActualizado,
        message: `Usuario ${estado.toLowerCase()} exitosamente`
      };

    } catch (error) {
      console.error('❌ Error cambiando estado:', error);
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(error.message || 'Error cambiando estado');
    }
  }

  @Delete('/:id')
  @RequirePermission('configuracion', 'eliminar', 'usuarios')
  @ApiOperation({ summary: 'Eliminar usuario del sistema' })
  @ApiResponse({ status: 200, description: 'Usuario eliminado exitosamente' })
  async eliminarUsuario(@Param('id') id: string, @Req() req: any) {
    try {
      console.log(`🗑️ Eliminando usuario: ${id}`);
      const user = req.user as any;
      const tenantId = this.resolveTenantOrThrow(req);

      // VALIDACIÓN 1: No puedes eliminarte a ti mismo
      if (id === user?.id) {
        throw new ForbiddenException('No puedes eliminar tu propia cuenta');
      }

      // Obtener el usuario objetivo y su rol
      const { data: targetUser, error: fetchError } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .select(`
          id,
          nombre,
          email,
          estado,
          activo,
          is_super_admin,
          roles_usuario:user_roles (
            roles (
              nombre
            )
          )
        `)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (fetchError || !targetUser) {
        throw new BadRequestException('Usuario no encontrado');
      }

      await this.assertNotLastSuperAdmin(tenantId, targetUser, 'INACTIVO');

      // Mantener trazabilidad: el borrado lógico preserva usuario, roles y auditoría.
      const { data: usuarioActualizado, error } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .update({
          estado: 'INACTIVO',
          activo: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select(USUARIO_SAFE_COLUMNS)
        .single();

      if (error) {
        console.error('❌ Error inactivando usuario:', error);
        throw error;
      }

      await this.registrarAuditoriaUsuario(
        'usuarios_sistema',
        'DELETE',
        req,
        tenantId,
        id,
        {
          id: targetUser.id,
          email: targetUser.email,
          estado: targetUser.estado,
          activo: targetUser.activo,
          is_super_admin: targetUser.is_super_admin,
        },
        usuarioActualizado,
        { accion: 'INACTIVAR_USUARIO_POR_DELETE_LOGICO' },
      );

      console.log(`✅ Usuario ${targetUser.nombre} inactivado por ${user?.id}`);

      return {
        success: true,
        message: 'Usuario inactivado exitosamente'
      };

    } catch (error) {
      console.error('❌ Error eliminando usuario:', error);
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(error.message || 'Error eliminando usuario');
    }
  }

  @Get('/me/permissions')
  @ApiOperation({ summary: 'Obtener permisos del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Permisos obtenidos exitosamente' })
  async getMyPermissions(@Req() req: any) {
    try {
      const user = req.user as any;
      const tenantId = this.resolveTenantOrThrow(req);
      const requestedUserId = (user?.id || '').trim();

      if (!requestedUserId) {
        throw new ForbiddenException('Usuario no autenticado');
      }

      this.tenantContext.setContext({
        tenantId,
        userId: requestedUserId,
        isSuperAdmin: user?.is_super_admin ?? false,
      });

      const { data: userRoles, error: rolesError } = await this.supabaseService
        .getClient()
        .from('user_roles')
        .select(`
          role_id,
          roles!inner (
            id,
            nombre
          )
        `)
        .eq('usuario_sistema_id', requestedUserId);

      if (rolesError) {
        throw rolesError;
      }

      if (!userRoles || userRoles.length === 0) {
        return {
          success: true,
          data: [],
        };
      }

      const roleIds = userRoles.map(ur => ur.role_id);

      const { data: rolePermissions, error: permError } = await this.supabaseService
        .getClient()
        .from('rol_permisos')
        .select(`
          permiso_id,
          permisos!inner (
            id,
            tenant_id,
            modulo,
            accion,
            recurso,
            descripcion
          )
        `)
        .in('role_id', roleIds);

      if (permError) {
        throw permError;
      }

      const permissions = rolePermissions?.map(rp => rp.permisos).flat() || [];
      const uniquePermissions = Array.from(
        new Map(permissions.map((p: any) => [p.id, p])).values(),
      );

      return {
        success: true,
        data: uniquePermissions,
      };
    } catch (error) {
      console.error('❌ Error obteniendo permisos del usuario autenticado:', error);
      return {
        success: false,
        data: [],
        error: error.message,
      };
    }
  }

  @Get('/:id/permissions')
  @RequirePermission('configuracion', 'ver', 'usuarios')
  @ApiOperation({ summary: 'Obtener permisos del usuario' })
  @ApiResponse({ status: 200, description: 'Permisos obtenidos exitosamente' })
  async getUserPermissions(@Param('id') id: string, @Req() req: any) {
    try {
      console.log(`🔑 Obteniendo permisos del usuario: ${id}`);
      const user = req.user as any;
        const tenantId = this.resolveTenantOrThrow(req);
        const requesterId = (user?.id || id || '').trim();
        const requestedUserId = (id || '').trim();

        if (!requesterId) {
          throw new ForbiddenException('Usuario no autenticado');
        }

        // Asegurar contexto tenant para Supabase (evita errores en service layer)
        this.tenantContext.setContext({
          tenantId,
          userId: requesterId,
          isSuperAdmin: user?.is_super_admin ?? false,
        });

        // Permitir que un usuario obtenga sus propios permisos
        // Si intenta obtener permisos de otro usuario, verificar permiso
        if (requesterId !== requestedUserId) {
          // Solo super-admins pueden ver permisos de otros usuarios
          if (!user?.is_super_admin) {
            throw new ForbiddenException('Solo puedes ver tus propios permisos');
          }
        }

      // Get user's roles
      console.log(`📋 Buscando roles para usuario_sistema_id: ${requestedUserId}`);
      const { data: userRoles, error: rolesError } = await this.supabaseService
        .getClient()
        .from('user_roles')
        .select(`
          role_id,
          roles!inner (
            id,
            nombre
          )
        `)
          .eq('usuario_sistema_id', requestedUserId);

      if (rolesError) {
        console.error('❌ Error obteniendo roles del usuario:', rolesError);
        console.error('❌ Detalles del error:', JSON.stringify(rolesError, null, 2));
        throw rolesError;
      }

      console.log(`📋 Roles encontrados: ${userRoles?.length || 0}`, userRoles);

      if (!userRoles || userRoles.length === 0) {
        console.log('⚠️ Usuario sin roles asignados - retornando array vacío de permisos');
        return {
          success: true,
          data: []
        };
      }

      // Get permissions for all user's roles
      const roleIds = userRoles.map(ur => ur.role_id);
      console.log(`🔑 Buscando permisos para roles:`, roleIds);
      
      const { data: rolePermissions, error: permError } = await this.supabaseService
        .getClient()
        .from('rol_permisos')
        .select(`
          permiso_id,
          permisos!inner (
            id,
            modulo,
            accion,
            recurso,
            descripcion
          )
        `)
        .in('role_id', roleIds);

      if (permError) {
        console.error('❌ Error obteniendo permisos:', permError);
        console.error('❌ Detalles del error:', JSON.stringify(permError, null, 2));
        throw permError;
      }

      // Extract unique permissions
      const permissions = rolePermissions?.map(rp => rp.permisos) || [];
      const uniquePermissions = Array.from(
        new Map(permissions.map((p: any) => [p.id, p])).values()
      );

      console.log(`✅ ${uniquePermissions.length} permisos encontrados para el usuario`);

      return {
        success: true,
        data: uniquePermissions
      };

    } catch (error) {
      console.error('❌ Error obteniendo permisos del usuario:', error);
      return {
        success: false,
        data: [],
        error: error.message
      };
    }
  }

  @Get('/:id')
  @RequirePermission('configuracion', 'ver', 'usuarios')
  @ApiOperation({ summary: 'Obtener usuario por ID' })
  @ApiResponse({ status: 200, description: 'Usuario obtenido exitosamente' })
  async getUsuario(@Param('id') id: string, @Req() req: any) {
    try {
      console.log(`👤 Obteniendo usuario: ${id}`);
      const user = req.user as any;
      const tenantId = this.resolveTenantOrThrow(req);

      const { data: usuario, error } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .select(`
          ${USUARIO_SAFE_COLUMNS},
          user_roles!inner (
            roles (
              id,
              nombre,
              descripcion
            )
          )
        `)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (error) {
        console.error('❌ Error obteniendo usuario:', error);
        throw error;
      }

      console.log('✅ Usuario obtenido exitosamente');

      return {
        success: true,
        data: usuario
      };

    } catch (error) {
      console.error('❌ Error obteniendo usuario:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }
} 
