"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const supabase_service_1 = require("../../shared/supabase/supabase.service");
const bcrypt = __importStar(require("bcrypt"));
let AuthService = class AuthService {
    constructor(supabaseService, jwtService) {
        this.supabaseService = supabaseService;
        this.jwtService = jwtService;
    }
    async validateUser(email, password) {
        try {
            const user = await this.findUserByEmail(email);
            if (!user) {
                return null;
            }
            const isPasswordValid = await bcrypt.compare(password, user.password_hash);
            if (!isPasswordValid) {
                return null;
            }
            if (!user.activo) {
                throw new common_1.UnauthorizedException('Usuario inactivo');
            }
            const { password_hash, ...result } = user;
            return result;
        }
        catch (error) {
            console.error('Error validating user:', error);
            return null;
        }
    }
    async login(loginDto) {
        const user = await this.validateUser(loginDto.email, loginDto.password);
        if (!user) {
            throw new common_1.UnauthorizedException('Credenciales inválidas');
        }
        const payload = {
            sub: user.id,
            email: user.email,
            username: user.nombre_usuario,
            roles: user.roles || []
        };
        return {
            access_token: this.jwtService.sign(payload),
            user: {
                id: user.id,
                email: user.email,
                nombre: user.nombre,
                apellido: user.apellido,
                nombre_usuario: user.nombre_usuario,
                roles: user.roles
            }
        };
    }
    async validateToken(token) {
        try {
            const payload = this.jwtService.verify(token);
            const user = await this.findUserById(payload.sub);
            if (!user || !user.activo) {
                throw new common_1.UnauthorizedException('Token inválido');
            }
            return user;
        }
        catch (error) {
            throw new common_1.UnauthorizedException('Token inválido');
        }
    }
    async findUserByEmail(email) {
        try {
            const client = this.supabaseService.getClient();
            const { data, error } = await client
                .from('usuarios_sistema')
                .select('*')
                .eq('email', email)
                .single();
            if (error) {
                console.error('Error finding user by email:', error);
                return null;
            }
            return data;
        }
        catch (error) {
            console.error('Error in findUserByEmail:', error);
            return null;
        }
    }
    async findUserById(id) {
        try {
            const client = this.supabaseService.getClient();
            const { data, error } = await client
                .from('usuarios_sistema')
                .select('*')
                .eq('id', id)
                .single();
            if (error) {
                console.error('Error finding user by id:', error);
                return null;
            }
            return data;
        }
        catch (error) {
            console.error('Error in findUserById:', error);
            return null;
        }
    }
    async refreshToken(user) {
        const payload = {
            sub: user.id,
            email: user.email,
            username: user.nombre_usuario,
            roles: user.roles || []
        };
        return {
            access_token: this.jwtService.sign(payload)
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map