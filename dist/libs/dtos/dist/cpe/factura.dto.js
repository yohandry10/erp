"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FacturaDto = exports.CreateFacturaDto = exports.ItemFacturaDto = exports.TipoDocumento = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
var TipoDocumento;
(function (TipoDocumento) {
    TipoDocumento["FACTURA"] = "01";
    TipoDocumento["BOLETA"] = "03";
    TipoDocumento["NOTA_CREDITO"] = "07";
    TipoDocumento["NOTA_DEBITO"] = "08";
})(TipoDocumento || (exports.TipoDocumento = TipoDocumento = {}));
class ItemFacturaDto {
}
exports.ItemFacturaDto = ItemFacturaDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ItemFacturaDto.prototype, "codigo", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ItemFacturaDto.prototype, "descripcion", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.01),
    __metadata("design:type", Number)
], ItemFacturaDto.prototype, "cantidad", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ItemFacturaDto.prototype, "unidad", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ItemFacturaDto.prototype, "precio_unitario", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ItemFacturaDto.prototype, "valor_venta", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ItemFacturaDto.prototype, "igv", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ItemFacturaDto.prototype, "precio_venta", void 0);
class CreateFacturaDto {
}
exports.CreateFacturaDto = CreateFacturaDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateFacturaDto.prototype, "serie", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(99999999),
    __metadata("design:type", Number)
], CreateFacturaDto.prototype, "numero", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(TipoDocumento),
    __metadata("design:type", String)
], CreateFacturaDto.prototype, "tipo_documento", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateFacturaDto.prototype, "ruc_emisor", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateFacturaDto.prototype, "razon_social_emisor", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateFacturaDto.prototype, "tipo_documento_receptor", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateFacturaDto.prototype, "documento_receptor", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateFacturaDto.prototype, "razon_social_receptor", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateFacturaDto.prototype, "direccion_receptor", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateFacturaDto.prototype, "moneda", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ItemFacturaDto),
    __metadata("design:type", Array)
], CreateFacturaDto.prototype, "items", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateFacturaDto.prototype, "total_gravadas", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateFacturaDto.prototype, "total_igv", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateFacturaDto.prototype, "total_venta", void 0);
class FacturaDto extends CreateFacturaDto {
}
exports.FacturaDto = FacturaDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FacturaDto.prototype, "estado", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], FacturaDto.prototype, "hash", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], FacturaDto.prototype, "xml_firmado", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], FacturaDto.prototype, "cdr_sunat", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], FacturaDto.prototype, "error_message", void 0);
