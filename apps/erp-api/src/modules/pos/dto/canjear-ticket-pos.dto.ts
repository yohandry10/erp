import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Intención fiscal para convertir un ticket interno Txxx en un único
 * comprobante 01/03. Los importes y líneas nunca llegan desde el navegador:
 * PostgreSQL los reconstruye desde el snapshot inmutable de la venta POS.
 */
export class CanjearTicketPosDto {
  @IsString({ message: 'idempotency_key es obligatorio' })
  @MaxLength(200)
  idempotency_key: string;

  @IsIn(['01', '03'], { message: 'tipo_documento debe ser 01 o 03' })
  tipo_documento: '01' | '03';

  @IsOptional()
  @IsString()
  @MaxLength(4)
  serie?: string;

  @ValidateIf((value: CanjearTicketPosDto) =>
    value.tipo_documento === '01' || value.cliente_id !== undefined,
  )
  @IsUUID('4', { message: 'cliente_id debe ser UUID v4' })
  cliente_id?: string;

  @IsString({ message: 'cliente_documento es obligatorio' })
  @MaxLength(20)
  cliente_documento: string;

  @IsString({ message: 'cliente_tipo_documento es obligatorio' })
  @MaxLength(10)
  cliente_tipo_documento: string;

  @IsString({ message: 'cliente_nombre es obligatorio' })
  @MaxLength(300)
  cliente_nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cliente_direccion?: string;

}
