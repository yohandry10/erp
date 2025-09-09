import { CreateFacturaDto, FacturaDto, TipoDocumento } from './factura.dto';
export declare class CreateNotaCreditoDto extends CreateFacturaDto {
    tipo_documento: TipoDocumento;
    documento_referencia: string;
    motivo: string;
    descripcion_motivo?: string;
}
export declare class NotaCreditoDto extends FacturaDto {
    documento_referencia: string;
    motivo: string;
    descripcion_motivo?: string;
}
//# sourceMappingURL=nota-credito.dto.d.ts.map