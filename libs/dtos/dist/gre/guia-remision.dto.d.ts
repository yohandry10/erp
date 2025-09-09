export declare enum ModalidadTransporte {
    TRANSPORTE_PUBLICO = "TRANSPORTE_PUBLICO",
    TRANSPORTE_PRIVADO = "TRANSPORTE_PRIVADO"
}
export declare enum MotivoTraslado {
    VENTA = "VENTA",
    COMPRA = "COMPRA",
    TRASLADO_ENTRE_ESTABLECIMIENTOS = "TRASLADO_ENTRE_ESTABLECIMIENTOS",
    CONSIGNACION = "CONSIGNACION",
    DEVOLUCION = "DEVOLUCION",
    OTROS = "OTROS"
}
export declare class CreateGuiaRemisionDto {
    destinatario: string;
    direccionDestino: string;
    fechaTraslado: string;
    modalidad: ModalidadTransporte;
    motivo: MotivoTraslado;
    pesoTotal: number;
    observaciones?: string;
    transportista?: string;
    placaVehiculo?: string;
    licenciaConducir?: string;
}
export declare class GuiaRemisionResponseDto {
    id: string;
    numero: string;
    estado: string;
    destinatario: string;
    direccionDestino: string;
    fechaTraslado: string;
    fechaCreacion: string;
    modalidad: ModalidadTransporte;
    motivo: MotivoTraslado;
    pesoTotal: number;
    observaciones?: string;
    transportista?: string;
    placaVehiculo?: string;
    licenciaConducir?: string;
}
//# sourceMappingURL=guia-remision.dto.d.ts.map