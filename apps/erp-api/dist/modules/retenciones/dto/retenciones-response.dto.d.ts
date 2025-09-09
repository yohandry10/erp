export interface RetencionResponse {
    id: string;
    numero_comprobante: string;
    proveedor: {
        id: string;
        razon_social: string;
        numero_documento: string;
        tipo_documento: string;
        email?: string;
        telefono?: string;
    };
    fecha_emision: string;
    fecha_pago: string;
    monto_pago: number;
    categoria_retencion: string;
    tasa_retencion: number;
    monto_retencion: number;
    monto_neto: number;
    estado: string;
    observaciones?: string;
    created_at: string;
    updated_at: string;
    created_by?: string;
    updated_by?: string;
}
export interface RetencionCalculada {
    monto_pago: number;
    tasa_retencion: number;
    monto_retencion: number;
    monto_neto: number;
    categoria: string;
    exonerado: boolean;
    motivo_exoneracion?: string;
    base_calculo: number;
    fecha_calculo: string;
}
export interface ListaRetencionesResponse {
    retenciones: RetencionResponse[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
}
export interface DetalleRetencionResponse extends RetencionResponse {
    documentos_relacionados?: {
        id: string;
        tipo_documento: string;
        numero_documento: string;
        fecha_emision: string;
        monto: number;
    }[];
    historial_cambios?: {
        fecha: string;
        usuario: string;
        accion: string;
        valores_anteriores?: any;
        valores_nuevos?: any;
    }[];
}
