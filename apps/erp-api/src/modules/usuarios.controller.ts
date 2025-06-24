import { Controller, Get, Post, Put, Delete, Body, Param, Req, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SupabaseService } from '../shared/supabase/supabase.service';

@ApiTags('usuarios-sistema')
@Controller('usuarios-sistema')
export class UsuariosController {
  constructor(private readonly supabaseService: SupabaseService) {}

  @Get('/')
  @ApiOperation({ summary: 'Obtener todos los usuarios del sistema' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios obtenida exitosamente' })
  async getUsuarios(@Req() req: any, @Query('rol') rol?: string, @Query('estado') estado?: string) {
    try {
      console.log('👥 Obteniendo usuarios del sistema...');
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';

      let query = this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .select(`
          *,
          user_roles!inner (
            roles (
              nombre,
              descripcion,
              permisos
            )
          )
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (rol && rol !== 'todos') {
        query = query.eq('user_roles.roles.nombre', rol);
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
  @ApiOperation({ summary: 'Obtener estadísticas de usuarios' })
  @ApiResponse({ status: 200, description: 'Estadísticas obtenidas exitosamente' })
  async getStats(@Req() req: any) {
    try {
      console.log('📊 Obteniendo estadísticas de usuarios...');
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';

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
  @ApiOperation({ summary: 'Obtener todos los roles disponibles' })
  @ApiResponse({ status: 200, description: 'Lista de roles obtenida exitosamente' })
  async getRoles(@Req() req: any) {
    try {
      console.log('🔑 Obteniendo roles del sistema...');
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';

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
          )
        `)
        .eq('tenant_id', tenantId)
        .order('nombre');

      if (error) {
        console.error('❌ Error obteniendo roles:', error);
        throw error;
      }

      // Calcular estadísticas por rol
      const rolesConStats = roles?.map(rol => ({
        ...rol,
        usuariosCount: rol.user_roles?.length || 0,
        usuariosActivos: rol.user_roles?.filter(ru => ru.usuarios_sistema?.estado === 'ACTIVO').length || 0
      }));

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
  @ApiOperation({ summary: 'Crear nuevo usuario del sistema' })
  @ApiResponse({ status: 201, description: 'Usuario creado exitosamente' })
  async crearUsuario(@Body() usuarioData: any, @Req() req: any) {
    try {
      console.log('👤 Creando nuevo usuario del sistema...');
      console.log('📋 Datos recibidos:', JSON.stringify(usuarioData, null, 2));

      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';

      // Validar datos requeridos
      if (!usuarioData.nombre || !usuarioData.email || !usuarioData.rol_id) {
        throw new BadRequestException('Datos requeridos: nombre, email, rol_id');
      }

      // Verificar que el email no exista
      const { data: existeEmail } = await this.supabaseService
        .getClient()
        .from('usuarios_sistema')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('email', usuarioData.email)
        .single();

      if (existeEmail) {
        throw new BadRequestException('Ya existe un usuario con este email');
      }

      // Crear usuario
      const nuevoUsuario = {
        tenant_id: tenantId,
        nombre: usuarioData.nombre,
        email: usuarioData.email,
        telefono: usuarioData.telefono || null,
        cargo: usuarioData.cargo || null,
        departamento: usuarioData.departamento || null,
        estado: usuarioData.estado || 'ACTIVO',
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
        console.error('❌ Error creando usuario:', errorUsuario);
        throw errorUsuario;
      }

      // Asignar rol
      const { error: errorRol } = await this.supabaseService
        .getClient()
        .from('user_roles')
        .insert({
          usuario_sistema_id: usuarioCreado.id,
          role_id: usuarioData.rol_id,
          user_id: user?.id || null,
          created_at: new Date().toISOString()
        });

      if (errorRol) {
        console.error('❌ Error asignando rol:', errorRol);
        // Revertir creación de usuario
        await this.supabaseService
          .getClient()
          .from('usuarios_sistema')
          .delete()
          .eq('id', usuarioCreado.id);
        
        throw errorRol;
      }

      console.log('✅ Usuario creado exitosamente:', usuarioCreado.id);

      return {
        success: true,
        data: usuarioCreado,
        message: 'Usuario creado exitosamente'
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
  @ApiOperation({ summary: 'Actualizar usuario del sistema' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado exitosamente' })
  async actualizarUsuario(@Param('id') id: string, @Body() usuarioData: any, @Req() req: any) {
    try {
      console.log(`✏️ Actualizando usuario: ${id}`);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';

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
  @ApiOperation({ summary: 'Cambiar estado de usuario (activar/desactivar)' })
  @ApiResponse({ status: 200, description: 'Estado actualizado exitosamente' })
  async cambiarEstado(@Param('id') id: string, @Body() estadoData: { estado: string }, @Req() req: any) {
    try {
      console.log(`🔄 Cambiando estado de usuario ${id} a ${estadoData.estado}`);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';

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

      console.log('✅ Estado actualizado exitosamente');

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
  @ApiOperation({ summary: 'Eliminar usuario del sistema' })
  @ApiResponse({ status: 200, description: 'Usuario eliminado exitosamente' })
  async eliminarUsuario(@Param('id') id: string, @Req() req: any) {
    try {
      console.log(`🗑️ Eliminando usuario: ${id}`);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';

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

      console.log('✅ Usuario eliminado exitosamente');

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

  @Get('/:id')
  @ApiOperation({ summary: 'Obtener usuario por ID' })
  @ApiResponse({ status: 200, description: 'Usuario obtenido exitosamente' })
  async getUsuario(@Param('id') id: string, @Req() req: any) {
    try {
      console.log(`👤 Obteniendo usuario: ${id}`);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';

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