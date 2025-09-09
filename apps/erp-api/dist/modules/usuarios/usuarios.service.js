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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsuariosService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../../shared/supabase/supabase.service");
let UsuariosService = class UsuariosService {
    constructor(supabase) {
        this.supabase = supabase;
    }
    async findAll() {
        const { data, error } = await this.supabase.getClient()
            .from('usuarios_sistema')
            .select('*')
            .eq('activo', true);
        if (error)
            throw error;
        return data;
    }
    async findOne(id) {
        const { data, error } = await this.supabase.getClient()
            .from('usuarios_sistema')
            .select('*')
            .eq('id', id)
            .single();
        if (error)
            throw error;
        return data;
    }
    async create(userData) {
        const { data, error } = await this.supabase.getClient()
            .from('usuarios_sistema')
            .insert(userData)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    async update(id, userData) {
        const { data, error } = await this.supabase.getClient()
            .from('usuarios_sistema')
            .update(userData)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
};
exports.UsuariosService = UsuariosService;
exports.UsuariosService = UsuariosService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService])
], UsuariosService);
//# sourceMappingURL=usuarios.service.js.map