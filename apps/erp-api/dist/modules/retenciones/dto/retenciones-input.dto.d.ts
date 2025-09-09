export interface CreateRetencionDto {
    proveedor_id: string;
    numero_comprobante: string;
    fecha_emision: string;
    fecha_pago: string;
    monto_pago: number;
    categoria_retencion: 'CUARTA' | 'QUINTA';
    tasa_retencion: number;
    monto_retencion: number;
    observaciones?: string;
}
export interface CalcularRetencionDto {
    monto_pago: number;
    categoria_retencion: 'CUARTA' | 'QUINTA';
    proveedor_id: string;
}
export interface UpdateRetencionDto {
    numero_comprobante?: string;
    fecha_emision?: string;
    fecha_pago?: string;
    monto_pago?: number;
    categoria_retencion?: 'CUARTA' | 'QUINTA';
    tasa_retencion?: number;
    monto_retencion?: number;
    observaciones?: string;
    estado?: 'PENDIENTE' | 'PROCESADA' | 'ANULADA';
}
export interface FiltrosRetencionDto {
    proveedor_id?: string;
    categoria_retencion?: 'CUARTA' | 'QUINTA';
    estado?: 'PENDIENTE' | 'PROCESADA' | 'ANULADA';
    fecha_inicio?: string;
    fecha_fin?: string;
    monto_minimo?: number;
    monto_maximo?: number;
    numero_comprobante?: string;
}
export interface PaginacionDto {
    page?: number;
    limit?: number;
    sort_by?: string;
    sort_order?: 'ASC' | 'DESC';
}
