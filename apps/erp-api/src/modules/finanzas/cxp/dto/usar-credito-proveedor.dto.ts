import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class UsarCreditoProveedorDto {
  @IsIn(['APLICACION', 'REEMBOLSO'])
  accion!: 'APLICACION' | 'REEMBOLSO';

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto!: number;

  @IsDateString()
  fecha!: string;

  @IsOptional()
  @IsUUID('4')
  factura_id?: string;

  @IsOptional()
  @IsUUID('4')
  cuenta_bancaria_id?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  tipo_cambio?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referencia?: string;

  @IsString()
  @MaxLength(160)
  idempotency_key!: string;
}
