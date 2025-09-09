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
exports.GreController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const gre_service_1 = require("./gre.service");
let GreController = class GreController {
    constructor(greService) {
        this.greService = greService;
    }
    findAll() {
        return this.greService.findAll();
    }
    async findAllGuias(filters) {
        try {
            console.log('🔍 Recibiendo petición para listar GREs con filtros:', filters);
            const guias = await this.greService.findAllGuias();
            console.log(`✅ Controlador: Se encontraron ${guias.length} GREs`);
            return {
                success: true,
                data: guias,
                message: `Se encontraron ${guias.length} guías de remisión`
            };
        }
        catch (error) {
            console.error('❌ Error en controlador al listar GREs:', error);
            return {
                success: false,
                data: [],
                message: error.message || 'Error al consultar las guías de remisión'
            };
        }
    }
    async findGuiaById(id) {
        console.log(`🔍 Obteniendo guía de remisión con ID: ${id}`);
        try {
            const guia = await this.greService.findGuiaById(id);
            console.log(`✅ Guía de remisión obtenida:`, guia);
            return {
                success: true,
                message: 'Guía de remisión obtenida exitosamente',
                data: guia
            };
        }
        catch (error) {
            console.error('❌ Error al obtener guía:', error);
            return {
                success: false,
                message: error.message || 'Error al obtener la guía de remisión',
                error: error.message
            };
        }
    }
    async createGuia(greData) {
        console.log('📦 Recibiendo datos para crear GRE:', greData);
        try {
            const nuevaGuia = await this.greService.createGuia(greData);
            console.log('✅ GRE creada exitosamente:', nuevaGuia);
            return {
                success: true,
                message: `Guía de remisión ${nuevaGuia.numero} creada exitosamente`,
                data: nuevaGuia
            };
        }
        catch (error) {
            console.error('❌ Error al crear GRE:', error);
            return {
                success: false,
                message: error.message || 'Error al crear la guía de remisión',
                error: error.message
            };
        }
    }
    generateReport() {
        return {
            success: true,
            data: null,
            message: 'Funcionalidad en desarrollo'
        };
    }
    async getStats() {
        try {
            const stats = await this.greService.getStats();
            return {
                success: true,
                data: stats
            };
        }
        catch (error) {
            console.error('❌ Error al obtener estadísticas:', error);
            return {
                success: true,
                data: {
                    greEmitidas: 0,
                    totalGre: 0,
                    enTransito: 0,
                    completados: 0
                }
            };
        }
    }
    async reenviarGre(id) {
        console.log(`🔄 [GRE] Reenviando GRE ${id} a SUNAT...`);
        try {
            const resultado = await this.greService.reenviarGre(id);
            return {
                success: resultado.success,
                message: resultado.message,
                data: { id, timestamp: new Date() }
            };
        }
        catch (error) {
            console.error(`❌ Error reenviando GRE ${id}:`, error);
            return {
                success: false,
                message: `Error reenviando GRE: ${error.message}`,
                error: error.message
            };
        }
    }
    async consultarEstadoSunat(id) {
        console.log(`🔍 [GRE] Consultando estado de GRE ${id} en SUNAT...`);
        try {
            const estado = await this.greService.consultarEstadoGre(id);
            return {
                success: true,
                message: 'Estado consultado exitosamente',
                data: estado
            };
        }
        catch (error) {
            console.error(`❌ Error consultando estado de GRE ${id}:`, error);
            return {
                success: false,
                message: `Error consultando estado: ${error.message}`,
                error: error.message
            };
        }
    }
    async obtenerXmlFirmado(id, res) {
        console.log(`📄 [GRE] Obteniendo XML de GRE ${id}...`);
        try {
            const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!-- XML firmado de GRE ${id} -->
<DespatchAdvice>
  <ID>GRE-${id}</ID>
  <IssueDate>${new Date().toISOString().split('T')[0]}</IssueDate>
  <!-- Contenido XML completo se implementará -->
</DespatchAdvice>`;
            res.setHeader('Content-Type', 'application/xml');
            res.setHeader('Content-Disposition', `attachment; filename="GRE-${id}.xml"`);
            return res.send(xmlContent);
        }
        catch (error) {
            console.error(`❌ Error obteniendo XML de GRE ${id}:`, error);
            return res.status(500).json({
                success: false,
                message: `Error obteniendo XML: ${error.message}`
            });
        }
    }
    async enviarManualmenteSunat(id) {
        console.log(`🚀 [GRE] Envío manual a SUNAT solicitado para GRE ${id}`);
        try {
            const gre = await this.greService.findGuiaById(id);
            if (gre.estado !== 'FIRMADO') {
                return {
                    success: false,
                    message: `GRE debe estar en estado FIRMADO para enviar a SUNAT. Estado actual: ${gre.estado}`
                };
            }
            const resultado = await this.greService.enviarManualmenteSunat(id);
            return {
                success: resultado.success,
                message: resultado.message,
                data: { id, timestamp: new Date() }
            };
        }
        catch (error) {
            console.error(`❌ Error enviando GRE ${id} a SUNAT:`, error);
            return {
                success: false,
                message: `Error enviando GRE a SUNAT: ${error.message}`
            };
        }
    }
};
exports.GreController = GreController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get GRE list (placeholder)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GreController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('guias'),
    (0, swagger_1.ApiOperation)({ summary: 'Listar guías de remisión' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GreController.prototype, "findAllGuias", null);
__decorate([
    (0, common_1.Get)('guias/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener una guía de remisión por ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Guía de remisión obtenida exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], GreController.prototype, "findGuiaById", null);
__decorate([
    (0, common_1.Post)('guias'),
    (0, swagger_1.ApiOperation)({ summary: 'Crear nueva guía de remisión electrónica' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Guía de remisión creada exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GreController.prototype, "createGuia", null);
__decorate([
    (0, common_1.Get)('reporte'),
    (0, swagger_1.ApiOperation)({ summary: 'Generar reporte GRE' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GreController.prototype, "generateReport", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener estadísticas de GRE' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GreController.prototype, "getStats", null);
__decorate([
    (0, common_1.Post)('guias/:id/reenviar'),
    (0, swagger_1.ApiOperation)({ summary: 'Reenviar guía de remisión a SUNAT' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'GRE reenviada exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], GreController.prototype, "reenviarGre", null);
__decorate([
    (0, common_1.Get)('guias/:id/estado-sunat'),
    (0, swagger_1.ApiOperation)({ summary: 'Consultar estado de GRE en SUNAT' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Estado consultado exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], GreController.prototype, "consultarEstadoSunat", null);
__decorate([
    (0, common_1.Get)('guias/:id/xml'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener XML firmado de la GRE' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'XML obtenido exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], GreController.prototype, "obtenerXmlFirmado", null);
__decorate([
    (0, common_1.Post)('guias/:id/enviar-sunat'),
    (0, swagger_1.ApiOperation)({ summary: 'Enviar GRE firmada a SUNAT manualmente' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'GRE enviada a SUNAT exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], GreController.prototype, "enviarManualmenteSunat", null);
exports.GreController = GreController = __decorate([
    (0, swagger_1.ApiTags)('gre'),
    (0, common_1.Controller)('gre'),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [gre_service_1.GreService])
], GreController);
//# sourceMappingURL=gre.controller.js.map