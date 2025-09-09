export declare enum SireTipo {
    RVIE = "RVIE",// Registro de Ventas e Ingresos Electrónicos
    RCE = "RCE"
}
export declare class CreateSireRequestDto {
    periodo: string;
    tipo: SireTipo;
    observaciones?: string;
}
export declare class SireRequestDto extends CreateSireRequestDto {
    id: string;
    tenant_id: string;
    estado: string;
    filename?: string;
    file_path?: string;
    total_registros: number;
    created_at: Date;
    updated_at: Date;
}
//# sourceMappingURL=sire-request.dto.d.ts.map