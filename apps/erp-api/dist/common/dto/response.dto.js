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
exports.ErrorResponseDto = exports.PaginatedResponseDto = exports.ResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class ResponseDto {
}
exports.ResponseDto = ResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Indica si la operación fue exitosa',
        example: true
    }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Datos de la respuesta',
        required: false
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ResponseDto.prototype, "data", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Mensaje descriptivo de la operación',
        required: false,
        example: 'Operación completada exitosamente'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ResponseDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Mensaje de error en caso de fallo',
        required: false,
        example: 'Error al procesar la solicitud'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ResponseDto.prototype, "error", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Metadatos adicionales de la respuesta',
        required: false
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ResponseDto.prototype, "metadata", void 0);
class PaginatedResponseDto extends ResponseDto {
}
exports.PaginatedResponseDto = PaginatedResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Información de paginación',
        example: {
            page: 1,
            limit: 10,
            total: 100,
            totalPages: 10,
            hasNext: true,
            hasPrev: false
        }
    }),
    __metadata("design:type", Object)
], PaginatedResponseDto.prototype, "pagination", void 0);
class ErrorResponseDto extends ResponseDto {
}
exports.ErrorResponseDto = ErrorResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Siempre false para errores',
        example: false
    }),
    __metadata("design:type", Boolean)
], ErrorResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Siempre null para errores',
        example: null
    }),
    __metadata("design:type", void 0)
], ErrorResponseDto.prototype, "data", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Código de error específico',
        example: 'VALIDATION_ERROR'
    }),
    __metadata("design:type", String)
], ErrorResponseDto.prototype, "errorCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Detalles adicionales del error',
        example: [{ field: 'email', message: 'Email is required' }]
    }),
    __metadata("design:type", Array)
], ErrorResponseDto.prototype, "details", void 0);
//# sourceMappingURL=response.dto.js.map