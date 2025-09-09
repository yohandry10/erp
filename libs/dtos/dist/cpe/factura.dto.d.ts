export declare enum TipoDocumento {
    FACTURA = "01",
    BOLETA = "03",
    NOTA_CREDITO = "07",
    NOTA_DEBITO = "08"
}
export type EstadoCPE = 'PENDIENTE' | 'FIRMADO' | 'ENVIADO' | 'ACEPTADO' | 'RECHAZADO';
export declare class ItemFacturaDto {
    codigo: string;
    descripcion: string;
    cantidad: number;
    unidad: string;
    precio_unitario: number;
    valor_venta: number;
    igv: number;
    precio_venta: number;
}
export declare class CreateFacturaDto {
    serie: string;
    numero: number;
    tipo_documento: TipoDocumento;
    ruc_emisor: string;
    razon_social_emisor: string;
    tipo_documento_receptor: string;
    documento_receptor: string;
    razon_social_receptor: string;
    direccion_receptor?: string;
    moneda: string;
    items: ItemFacturaDto[];
    total_gravadas: number;
    total_igv: number;
    total_venta: number;
}
export declare class FacturaDto extends CreateFacturaDto {
    id: string;
    estado: EstadoCPE;
    hash?: string;
    xml_firmado?: string;
    cdr_sunat?: string;
    error_message?: string;
    tenant_id: string;
    created_at: Date;
    updated_at: Date;
}
//# sourceMappingURL=factura.dto.d.ts.map