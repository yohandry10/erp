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
exports.LibrosRequeridosDto = exports.LibroContableDto = exports.ValidacionDocumentoDto = exports.ConfiguracionPaisDto = exports.ReglasValidacionDto = exports.EtiquetasConfigDto = exports.FormatoConfigDto = exports.TipoImpuestoDto = exports.TipoDocumentoDto = exports.UpdateUsuarioConfiguracionDto = exports.UsuarioConfiguracionDto = exports.ConfiguracionFiscalDto = exports.PaisDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
class PaisDto {
}
exports.PaisDto = PaisDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID del país' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], PaisDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Código ISO del país (PE, CO)', example: 'PE' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaisDto.prototype, "codigo_iso", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Nombre del país', example: 'Perú' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaisDto.prototype, "nombre", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Nombre de la entidad fiscal', example: 'SUNAT' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaisDto.prototype, "nombre_fiscal", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Código de moneda', example: 'PEN' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaisDto.prototype, "moneda_codigo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Símbolo de moneda', example: 'S/' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PaisDto.prototype, "moneda_simbolo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Estado activo del país' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], PaisDto.prototype, "activo", void 0);
class ConfiguracionFiscalDto {
}
exports.ConfiguracionFiscalDto = ConfiguracionFiscalDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID de configuración fiscal' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ConfiguracionFiscalDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID del país' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ConfiguracionFiscalDto.prototype, "pais_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Nombre del impuesto principal', example: 'IGV' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConfiguracionFiscalDto.prototype, "impuesto_principal_nombre", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Porcentaje del impuesto principal', example: 18.00 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ConfiguracionFiscalDto.prototype, "impuesto_principal_porcentaje", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Documento de identidad empresarial', example: 'RUC' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConfiguracionFiscalDto.prototype, "documento_identidad_empresa", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Longitud del documento empresarial', example: 11 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ConfiguracionFiscalDto.prototype, "longitud_documento_empresa", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Requiere Libro Mayor y Balances consolidado' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ConfiguracionFiscalDto.prototype, "requiere_libro_mayor_balances", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Requiere libros societarios' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ConfiguracionFiscalDto.prototype, "requiere_libros_societarios", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Requiere Libro Diario' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ConfiguracionFiscalDto.prototype, "requiere_libro_diario", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Requiere Libro Mayor' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ConfiguracionFiscalDto.prototype, "requiere_libro_mayor", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Requiere Libro de Inventarios' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ConfiguracionFiscalDto.prototype, "requiere_libro_inventarios", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Requiere Libro de Compras' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ConfiguracionFiscalDto.prototype, "requiere_libro_compras", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Requiere Libro de Ventas' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ConfiguracionFiscalDto.prototype, "requiere_libro_ventas", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Requiere Kardex Valorizado' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ConfiguracionFiscalDto.prototype, "requiere_kardex_valorizado", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Formato de fecha', example: 'DD/MM/YYYY' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConfiguracionFiscalDto.prototype, "formato_fecha", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Separador decimal', example: '.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConfiguracionFiscalDto.prototype, "separador_decimal", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Separador de miles', example: ',' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ConfiguracionFiscalDto.prototype, "separador_miles", void 0);
class UsuarioConfiguracionDto {
}
exports.UsuarioConfiguracionDto = UsuarioConfiguracionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID de configuración de usuario' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], UsuarioConfiguracionDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID del usuario' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], UsuarioConfiguracionDto.prototype, "usuario_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID del país preferido' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UsuarioConfiguracionDto.prototype, "pais_preferido_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Idioma preferido', example: 'es' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UsuarioConfiguracionDto.prototype, "idioma", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Zona horaria', example: 'America/Lima' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UsuarioConfiguracionDto.prototype, "zona_horaria", void 0);
class UpdateUsuarioConfiguracionDto {
}
exports.UpdateUsuarioConfiguracionDto = UpdateUsuarioConfiguracionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID del país preferido' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UpdateUsuarioConfiguracionDto.prototype, "pais_preferido_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Idioma preferido', example: 'es' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateUsuarioConfiguracionDto.prototype, "idioma", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Zona horaria', example: 'America/Lima' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateUsuarioConfiguracionDto.prototype, "zona_horaria", void 0);
class TipoDocumentoDto {
}
exports.TipoDocumentoDto = TipoDocumentoDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID del tipo de documento' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TipoDocumentoDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Código del tipo de documento', example: '01' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TipoDocumentoDto.prototype, "codigo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Nombre del tipo de documento', example: 'Factura' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TipoDocumentoDto.prototype, "nombre", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Descripción del documento' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TipoDocumentoDto.prototype, "descripcion", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Requiere RUC/NIT del cliente' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], TipoDocumentoDto.prototype, "requiere_ruc", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permite exportación' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], TipoDocumentoDto.prototype, "permite_exportacion", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Si está activo' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], TipoDocumentoDto.prototype, "activo", void 0);
class TipoImpuestoDto {
}
exports.TipoImpuestoDto = TipoImpuestoDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID del tipo de impuesto' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TipoImpuestoDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Código del tipo de impuesto', example: 'IGV' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TipoImpuestoDto.prototype, "codigo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Nombre del impuesto', example: 'Impuesto General a las Ventas' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TipoImpuestoDto.prototype, "nombre", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Porcentaje del impuesto', example: 18.00 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TipoImpuestoDto.prototype, "porcentaje", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tipo de cálculo', example: 'porcentaje' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TipoImpuestoDto.prototype, "tipo_calculo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Aplica a', example: 'venta' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TipoImpuestoDto.prototype, "aplica_a", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Si está activo' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], TipoImpuestoDto.prototype, "activo", void 0);
class FormatoConfigDto {
}
exports.FormatoConfigDto = FormatoConfigDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Formato de fecha', example: 'DD/MM/YYYY' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FormatoConfigDto.prototype, "fecha", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Formato de moneda', example: '#,##0.00' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FormatoConfigDto.prototype, "moneda", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Separador decimal', example: '.' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FormatoConfigDto.prototype, "separador_decimal", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Separador de miles', example: ',' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FormatoConfigDto.prototype, "separador_miles", void 0);
class EtiquetasConfigDto {
}
exports.EtiquetasConfigDto = EtiquetasConfigDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Etiqueta para documento de identidad', example: 'RUC' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], EtiquetasConfigDto.prototype, "documento_identidad", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Etiqueta para impuesto principal', example: 'IGV' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], EtiquetasConfigDto.prototype, "impuesto_principal", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Etiqueta para moneda', example: 'Soles' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], EtiquetasConfigDto.prototype, "moneda", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Etiqueta para entidad fiscal', example: 'SUNAT' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], EtiquetasConfigDto.prototype, "entidad_fiscal", void 0);
class ReglasValidacionDto {
}
exports.ReglasValidacionDto = ReglasValidacionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Longitud mínima del documento', example: 11 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ReglasValidacionDto.prototype, "documento_min_length", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Longitud máxima del documento', example: 11 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ReglasValidacionDto.prototype, "documento_max_length", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Patrón regex para validación', example: '^[0-9]+$' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReglasValidacionDto.prototype, "documento_pattern", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Mensaje de error personalizado' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReglasValidacionDto.prototype, "documento_error_message", void 0);
class ConfiguracionPaisDto {
}
exports.ConfiguracionPaisDto = ConfiguracionPaisDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Información básica del país' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => PaisDto),
    __metadata("design:type", PaisDto)
], ConfiguracionPaisDto.prototype, "pais", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Configuración fiscal' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ConfiguracionFiscalDto),
    __metadata("design:type", ConfiguracionFiscalDto)
], ConfiguracionPaisDto.prototype, "configuracion_fiscal", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tipos de documentos disponibles', type: [TipoDocumentoDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => TipoDocumentoDto),
    __metadata("design:type", Array)
], ConfiguracionPaisDto.prototype, "tipos_documentos", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tipos de impuestos disponibles', type: [TipoImpuestoDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => TipoImpuestoDto),
    __metadata("design:type", Array)
], ConfiguracionPaisDto.prototype, "tipos_impuestos", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Configuración de formatos' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => FormatoConfigDto),
    __metadata("design:type", FormatoConfigDto)
], ConfiguracionPaisDto.prototype, "formatos", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Etiquetas personalizadas' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => EtiquetasConfigDto),
    __metadata("design:type", EtiquetasConfigDto)
], ConfiguracionPaisDto.prototype, "etiquetas", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Reglas de validación' }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ReglasValidacionDto),
    __metadata("design:type", ReglasValidacionDto)
], ConfiguracionPaisDto.prototype, "validaciones", void 0);
class ValidacionDocumentoDto {
}
exports.ValidacionDocumentoDto = ValidacionDocumentoDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Documento validado' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ValidacionDocumentoDto.prototype, "documento", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Nombre del país' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ValidacionDocumentoDto.prototype, "pais", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tipo de documento', example: 'RUC' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ValidacionDocumentoDto.prototype, "tipo_documento", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Longitud requerida del documento' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ValidacionDocumentoDto.prototype, "longitud_requerida", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Si el documento es válido' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ValidacionDocumentoDto.prototype, "es_valido", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Mensaje de validación', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ValidacionDocumentoDto.prototype, "mensaje", void 0);
class LibroContableDto {
}
exports.LibroContableDto = LibroContableDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID del libro contable' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], LibroContableDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Código del libro', example: '5.1' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LibroContableDto.prototype, "codigo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Nombre del libro', example: 'Libro Diario' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LibroContableDto.prototype, "nombre", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Descripción del libro' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LibroContableDto.prototype, "descripcion", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Si es obligatorio' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], LibroContableDto.prototype, "obligatorio", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Periodicidad', example: 'mensual' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LibroContableDto.prototype, "periodicidad", void 0);
class LibrosRequeridosDto {
}
exports.LibrosRequeridosDto = LibrosRequeridosDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Nombre del país' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LibrosRequeridosDto.prototype, "pais", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Entidad fiscal', example: 'SUNAT' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LibrosRequeridosDto.prototype, "entidad_fiscal", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Lista de libros requeridos', type: [LibroContableDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => LibroContableDto),
    __metadata("design:type", Array)
], LibrosRequeridosDto.prototype, "libros_requeridos", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Fecha de última actualización' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LibrosRequeridosDto.prototype, "ultima_actualizacion", void 0);
//# sourceMappingURL=paises.dto.js.map