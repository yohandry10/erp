import { IsString, IsOptional } from 'class-validator';
import { CreateFacturaDto, FacturaDto, TipoDocumento } from './factura.dto';

export class CreateNotaCreditoDto extends CreateFacturaDto {
  tipo_documento = TipoDocumento.NOTA_CREDITO; // Nota de Crédito

  @IsString()
  documento_referencia: string; // Documento que se está anulando

  @IsString()
  motivo: string; // Motivo de la nota de crédito

  @IsString()
  @IsOptional()
  descripcion_motivo?: string;
}

export class NotaCreditoDto extends FacturaDto {
  documento_referencia: string;
  motivo: string;
  descripcion_motivo?: string;
} 