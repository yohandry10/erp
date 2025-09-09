export declare class PaisDto {
    id: number;
    codigo_iso: string;
    nombre: string;
    nombre_fiscal: string;
    moneda_codigo: string;
    moneda_simbolo: string;
    activo: boolean;
}
export declare class ConfiguracionFiscalDto {
    id: number;
    pais_id: number;
    impuesto_principal_nombre: string;
    impuesto_principal_porcentaje: number;
    documento_identidad_empresa: string;
    longitud_documento_empresa: number;
    requiere_libro_mayor_balances: boolean;
    requiere_libros_societarios: boolean;
    requiere_libro_diario: boolean;
    requiere_libro_mayor: boolean;
    requiere_libro_inventarios: boolean;
    requiere_libro_compras: boolean;
    requiere_libro_ventas: boolean;
    requiere_kardex_valorizado: boolean;
    formato_fecha?: string;
    separador_decimal?: string;
    separador_miles?: string;
}
export declare class UsuarioConfiguracionDto {
    id: string;
    usuario_id: string;
    pais_preferido_id?: number;
    idioma?: string;
    zona_horaria?: string;
}
export declare class UpdateUsuarioConfiguracionDto {
    pais_preferido_id?: number;
    idioma?: string;
    zona_horaria?: string;
}
export declare class TipoDocumentoDto {
    id: number;
    codigo: string;
    nombre: string;
    descripcion?: string;
    requiere_ruc: boolean;
    permite_exportacion: boolean;
    activo: boolean;
}
export declare class TipoImpuestoDto {
    id: number;
    codigo: string;
    nombre: string;
    porcentaje: number;
    tipo_calculo: string;
    aplica_a: string;
    activo: boolean;
}
export declare class FormatoConfigDto {
    fecha: string;
    moneda: string;
    separador_decimal: string;
    separador_miles: string;
}
export declare class EtiquetasConfigDto {
    documento_identidad: string;
    impuesto_principal: string;
    moneda: string;
    entidad_fiscal: string;
}
export declare class ReglasValidacionDto {
    documento_min_length: number;
    documento_max_length: number;
    documento_pattern: string;
    documento_error_message: string;
}
export declare class ConfiguracionPaisDto {
    pais: PaisDto;
    configuracion_fiscal: ConfiguracionFiscalDto;
    tipos_documentos: TipoDocumentoDto[];
    tipos_impuestos: TipoImpuestoDto[];
    formatos: FormatoConfigDto;
    etiquetas: EtiquetasConfigDto;
    validaciones: ReglasValidacionDto;
}
export declare class ValidacionDocumentoDto {
    documento: string;
    pais: string;
    tipo_documento: string;
    longitud_requerida: number;
    es_valido: boolean;
    mensaje?: string;
}
export declare class LibroContableDto {
    id: number;
    codigo: string;
    nombre: string;
    descripcion?: string;
    obligatorio: boolean;
    periodicidad: string;
}
export declare class LibrosRequeridosDto {
    pais: string;
    entidad_fiscal: string;
    libros_requeridos: LibroContableDto[];
    ultima_actualizacion?: string;
}
