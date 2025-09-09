"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsuariosController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const supabase_service_1 = require("../shared/supabase/supabase.service");
let UsuariosController = class UsuariosController {
    constructor(supabaseService) {
        this.supabaseService = supabaseService;
    }
    async getUsuarios(req, rol, estado) {
        try {
            console.log('👥 Obteniendo usuarios del sistema...');
            const user = req.user;
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
        }
        catch (error) {
            console.error('❌ Error en getUsuarios:', error);
            return {
                success: false,
                data: [],
                error: error.message
            };
        }
    }
    async getStats(req) {
        try {
            console.log('📊 Obteniendo estadísticas de usuarios...');
            const user = req.user;
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
        }
        catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async getRoles(req) {
        try {
            console.log('🔑 Obteniendo roles del sistema...');
            const user = req.user;
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
        }
        catch (error) {
            console.error('❌ Error en getRoles:', error);
            return {
                success: false,
                data: [],
                error: error.message
            };
        }
    }
    async crearUsuario(usuarioData, req) {
        try {
            console.log('👤 Creando nuevo usuario del sistema...');
            console.log('📋 Datos recibidos:', JSON.stringify(usuarioData, null, 2));
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            // Validar datos requeridos
            if (!usuarioData.nombre || !usuarioData.email || !usuarioData.rol_id) {
                throw new common_1.BadRequestException('Datos requeridos: nombre, email, rol_id');
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
                throw new common_1.BadRequestException('Ya existe un usuario con este email');
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
        }
        catch (error) {
            console.error('❌ Error creando usuario:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async actualizarUsuario(id, usuarioData, req) {
        try {
            console.log(`✏️ Actualizando usuario: ${id}`);
            const user = req.user;
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
                throw new common_1.BadRequestException('Usuario no encontrado');
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
        }
        catch (error) {
            console.error('❌ Error actualizando usuario:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async cambiarEstado(id, estadoData, req) {
        try {
            console.log(`🔄 Cambiando estado de usuario ${id} a ${estadoData.estado}`);
            const user = req.user;
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
        }
        catch (error) {
            console.error('❌ Error cambiando estado:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async eliminarUsuario(id, req) {
        try {
            console.log(`🗑️ Eliminando usuario: ${id}`);
            const user = req.user;
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
        }
        catch (error) {
            console.error('❌ Error eliminando usuario:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    async getUsuario(id, req) {
        try {
            console.log(`👤 Obteniendo usuario: ${id}`);
            const user = req.user;
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
        }
        catch (error) {
            console.error('❌ Error obteniendo usuario:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
};
exports.UsuariosController = UsuariosController;
__decorate([
    (0, common_1.Get)('/'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener todos los usuarios del sistema' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Lista de usuarios obtenida exitosamente' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('rol')),
    __param(2, (0, common_1.Query)('estado')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], UsuariosController.prototype, "getUsuarios", null);
__decorate([
    (0, common_1.Get)('/stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener estadísticas de usuarios' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Estadísticas obtenidas exitosamente' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsuariosController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('/roles'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener todos los roles disponibles' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Lista de roles obtenida exitosamente' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsuariosController.prototype, "getRoles", null);
__decorate([
    (0, common_1.Post)('/crear'),
    (0, swagger_1.ApiOperation)({ summary: 'Crear nuevo usuario del sistema' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Usuario creado exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UsuariosController.prototype, "crearUsuario", null);
__decorate([
    (0, common_1.Put)('/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar usuario del sistema' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Usuario actualizado exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], UsuariosController.prototype, "actualizarUsuario", null);
__decorate([
    (0, common_1.Put)('/:id/estado'),
    (0, swagger_1.ApiOperation)({ summary: 'Cambiar estado de usuario (activar/desactivar)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Estado actualizado exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], UsuariosController.prototype, "cambiarEstado", null);
__decorate([
    (0, common_1.Delete)('/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Eliminar usuario del sistema' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Usuario eliminado exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], UsuariosController.prototype, "eliminarUsuario", null);
__decorate([
    (0, common_1.Get)('/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener usuario por ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Usuario obtenido exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], UsuariosController.prototype, "getUsuario", null);
exports.UsuariosController = UsuariosController = __decorate([
    (0, swagger_1.ApiTags)('usuarios-sistema'),
    (0, common_1.Controller)('usuarios-sistema'),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService])
], UsuariosController);
