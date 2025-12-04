import { Controller, Get, Post, Put, Delete, Body, Param, Req, Query, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PermissionService } from './permissions/permission.service';
import { TenantContextService } from '../shared/tenant/tenant-context.service';

@ApiTags('usuarios-sistema')
@Controller('usuarios-sistema')
export class UsuariosController {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly permissionService: PermissionService,
    private readonly tenantContext: TenantContextService,
  ) {}

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

  @Get('/')
  @RequirePermission('configuracion', 'ver', 'usuarios')
  @ApiOperation({ summary: 'Obtener todos los usuarios del sistema' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios obtenida exitosamente' })
  async getUsuarios(@Req() req: any, @Query('rol') rol?: string, @Query('estado') estado?: string) {
    try {
      console.log('👥 Obteniendo usuarios del sistema...');
      const user = req.user as any;
      const tenantId = this.resolveTenantOrThrow(req);

      // NOTA: Usamos left join (sin !inner) para incluir usuarios sin rol asignado
      let query = this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .select(`
          *,
          roles_usuario:user_roles (
            roles (
              id,
              nombre,
              descripcion,
              permisos
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
  // NOTA: Sin @RequirePermission porque se necesita para el dropdown de crear usuario
  // y el Admin del tenant siempre tiene acceso a este módulo
  @ApiOperation({ summary: 'Obtener todos los roles disponibles' })
  @ApiResponse({ status: 200, description: 'Lista de roles obtenida exitosamente' })
  async getRoles(@Req() req: any) {
    try {
      console.log('🔑 Obteniendo roles del sistema...');
      const user = req.user as any;
      const tenantId = this.resolveTenantOrThrow(req);

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
      const rolesConStats = roles?.map(rol => {
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

      console.log(`✅ ${roles?.length || 0} roles encontrados`);

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

      // Validar datos requeridos
      if (!usuarioData.nombre || !usuarioData.email || !usuarioData.rol_id || !usuarioData.password) {
        throw new BadRequestException('Datos requeridos: nombre, email, rol_id, password');
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
      const nuevoUsuario = {
        id: authUser.user.id, // Usar el mismo ID de auth.users
        tenant_id: tenantId,
        nombre: usuarioData.nombre,
        email: usuarioData.email,
        telefono: usuarioData.telefono || null,
        estado: usuarioData.estado || 'ACTIVO',
        activo: true,
        fecha_ultimo_acceso: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: usuarioCreado, error: errorUsuario } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .insert(nuevoUsuario)
        .select()
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

      return {
        success: true,
        data: { ...usuarioCreado, password: undefined },
        message: `Usuario "${usuarioData.nombre}" creado exitosamente. Ya puede iniciar sesión con su email y contraseña.`
      };

    } catch (error) {
      console.error('❌ Error creando usuario:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
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

      // Verificar que el usuario existe
      const { data: usuarioExistente } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .select('id')
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

      // Remover campos que no deben actualizarse directamente
      delete datosActualizacion.id;
      delete datosActualizacion.tenant_id;
      delete datosActualizacion.created_at;

      const { data: usuarioActualizado, error } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .update(datosActualizacion)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) {
        console.error('❌ Error actualizando usuario:', error);
        throw error;
      }

      console.log('✅ Usuario actualizado exitosamente');

      return {
        success: true,
        data: usuarioActualizado,
        message: 'Usuario actualizado exitosamente'
      };

    } catch (error) {
      console.error('❌ Error actualizando usuario:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }

  @Put('/:id/estado')
  @RequirePermission('configuracion', 'editar', 'usuarios')
  @ApiOperation({ summary: 'Cambiar estado de usuario (activar/desactivar)' })
  @ApiResponse({ status: 200, description: 'Estado actualizado exitosamente' })
  async cambiarEstado(@Param('id') id: string, @Body() estadoData: { estado: string }, @Req() req: any) {
    try {
      console.log(`🔄 Cambiando estado de usuario ${id} a ${estadoData.estado}`);
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

      const rolesData = targetUser.roles_usuario?.[0]?.roles as any;
      const targetRole = Array.isArray(rolesData) ? rolesData[0]?.nombre : rolesData?.nombre || '';

      // NOTA: El Admin del tenant SÍ puede desactivar otros Admins que creó
      // Solo no puede desactivarse a sí mismo (ya validado arriba)

      const { data: usuarioActualizado, error } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .update({
          estado: estadoData.estado,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) {
        console.error('❌ Error cambiando estado:', error);
        throw error;
      }

      console.log(`✅ Estado de usuario ${targetUser.nombre} cambiado a ${estadoData.estado} por ${user?.id}`);

      return {
        success: true,
        data: usuarioActualizado,
        message: `Usuario ${estadoData.estado.toLowerCase()} exitosamente`
      };

    } catch (error) {
      console.error('❌ Error cambiando estado:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
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

      const rolesData = targetUser.roles_usuario?.[0]?.roles as any;
      const targetRole = Array.isArray(rolesData) ? rolesData[0]?.nombre : rolesData?.nombre || '';

      // NOTA: El Admin del tenant SÍ puede eliminar otros Admins que creó
      // Solo no puede eliminarse a sí mismo (ya validado arriba)

      // Eliminar relaciones de rol primero
      await this.supabaseService
        .getClient()
        .from('user_roles')
        .delete()
        .eq('usuario_sistema_id', id);

      // Eliminar usuario
      const { error } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) {
        console.error('❌ Error eliminando usuario:', error);
        throw error;
      }

      console.log(`✅ Usuario ${targetUser.nombre} eliminado por ${user?.id}`);

      return {
        success: true,
        message: 'Usuario eliminado exitosamente'
      };

    } catch (error) {
      console.error('❌ Error eliminando usuario:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Get('/:id/permissions')
  @ApiOperation({ summary: 'Obtener permisos del usuario' })
  @ApiResponse({ status: 200, description: 'Permisos obtenidos exitosamente' })
  async getUserPermissions(@Param('id') id: string, @Req() req: any) {
    // NOTA: Este endpoint NO tiene @RequirePermission porque se usa durante el login
    // para obtener los permisos del usuario. Si tuviera @RequirePermission, crearía
    // una dependencia circular (necesitas permisos para obtener permisos).
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
          *,
          user_roles!inner (
            roles (
              id,
              nombre,
              descripcion,
              permisos
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
