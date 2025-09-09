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
exports.GuiaRemisionResponseDto = exports.CreateGuiaRemisionDto = exports.MotivoTraslado = exports.ModalidadTransporte = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
var ModalidadTransporte;
(function (ModalidadTransporte) {
    ModalidadTransporte["TRANSPORTE_PUBLICO"] = "TRANSPORTE_PUBLICO";
    ModalidadTransporte["TRANSPORTE_PRIVADO"] = "TRANSPORTE_PRIVADO";
})(ModalidadTransporte || (exports.ModalidadTransporte = ModalidadTransporte = {}));
var MotivoTraslado;
(function (MotivoTraslado) {
    MotivoTraslado["VENTA"] = "VENTA";
    MotivoTraslado["COMPRA"] = "COMPRA";
    MotivoTraslado["TRASLADO_ENTRE_ESTABLECIMIENTOS"] = "TRASLADO_ENTRE_ESTABLECIMIENTOS";
    MotivoTraslado["CONSIGNACION"] = "CONSIGNACION";
    MotivoTraslado["DEVOLUCION"] = "DEVOLUCION";
    MotivoTraslado["OTROS"] = "OTROS";
})(MotivoTraslado || (exports.MotivoTraslado = MotivoTraslado = {}));
class CreateGuiaRemisionDto {
}
exports.CreateGuiaRemisionDto = CreateGuiaRemisionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Nombre o razón social del destinatario' }),
    (0, class_validator_1.IsString)({ message: 'El destinatario debe ser un texto válido' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'El destinatario es obligatorio' }),
    __metadata("design:type", String)
], CreateGuiaRemisionDto.prototype, "destinatario", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Dirección completa de destino' }),
    (0, class_validator_1.IsString)({ message: 'La dirección de destino debe ser un texto válido' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'La dirección de destino es obligatoria' }),
    __metadata("design:type", String)
], CreateGuiaRemisionDto.prototype, "direccionDestino", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Fecha de traslado en formato YYYY-MM-DD' }),
    (0, class_validator_1.IsString)({ message: 'La fecha debe ser un texto válido' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'La fecha de traslado es obligatoria' }),
    __metadata("design:type", String)
], CreateGuiaRemisionDto.prototype, "fechaTraslado", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ModalidadTransporte,
        description: 'Modalidad de transporte utilizada'
    }),
    (0, class_validator_1.IsEnum)(ModalidadTransporte, { message: 'La modalidad de transporte debe ser TRANSPORTE_PUBLICO o TRANSPORTE_PRIVADO' }),
    __metadata("design:type", String)
], CreateGuiaRemisionDto.prototype, "modalidad", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: MotivoTraslado,
        description: 'Motivo del traslado de los bienes'
    }),
    (0, class_validator_1.IsEnum)(MotivoTraslado, { message: 'El motivo del traslado no es válido' }),
    __metadata("design:type", String)
], CreateGuiaRemisionDto.prototype, "motivo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Peso total de los bienes en kilogramos' }),
    (0, class_validator_1.IsNumber)({}, { message: 'El peso debe ser un número válido' }),
    (0, class_validator_1.Min)(0.01, { message: 'El peso debe ser mayor a 0' }),
    (0, class_transformer_1.Transform)(({ value }) => parseFloat(value)),
    __metadata("design:type", Number)
], CreateGuiaRemisionDto.prototype, "pesoTotal", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Observaciones adicionales', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)({ message: 'Las observaciones deben ser un texto válido' }),
    __metadata("design:type", String)
], CreateGuiaRemisionDto.prototype, "observaciones", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Nombre del transportista (para transporte público)', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)({ message: 'El nombre del transportista debe ser un texto válido' }),
    __metadata("design:type", String)
], CreateGuiaRemisionDto.prototype, "transportista", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Placa del vehículo (para transporte privado)', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)({ message: 'La placa del vehículo debe ser un texto válido' }),
    __metadata("design:type", String)
], CreateGuiaRemisionDto.prototype, "placaVehiculo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Número de licencia de conducir (para transporte privado)', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)({ message: 'La licencia de conducir debe ser un texto válido' }),
    __metadata("design:type", String)
], CreateGuiaRemisionDto.prototype, "licenciaConducir", void 0);
class GuiaRemisionResponseDto {
}
exports.GuiaRemisionResponseDto = GuiaRemisionResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], GuiaRemisionResponseDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], GuiaRemisionResponseDto.prototype, "numero", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], GuiaRemisionResponseDto.prototype, "estado", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], GuiaRemisionResponseDto.prototype, "destinatario", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], GuiaRemisionResponseDto.prototype, "direccionDestino", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], GuiaRemisionResponseDto.prototype, "fechaTraslado", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], GuiaRemisionResponseDto.prototype, "fechaCreacion", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], GuiaRemisionResponseDto.prototype, "modalidad", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], GuiaRemisionResponseDto.prototype, "motivo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], GuiaRemisionResponseDto.prototype, "pesoTotal", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    __metadata("design:type", String)
], GuiaRemisionResponseDto.prototype, "observaciones", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    __metadata("design:type", String)
], GuiaRemisionResponseDto.prototype, "transportista", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    __metadata("design:type", String)
], GuiaRemisionResponseDto.prototype, "placaVehiculo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    __metadata("design:type", String)
], GuiaRemisionResponseDto.prototype, "licenciaConducir", void 0);
//# sourceMappingURL=guia-remision.dto.js.map