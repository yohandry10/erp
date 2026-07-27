import { IsIn, IsNotEmpty, IsArray, IsString, IsOptional, IsUUID, IsDateString, MaxLength, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const METODOS_PAGO_TESORERIA = ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA'] as const;

export class PagoLoteItemDto {
  @ApiProperty({
    description: 'ID de la cuenta por pagar a la que se aplicará el pago',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsNotEmpty({ message: 'El ID de la cuenta por pagar es requerido' })
  @IsUUID('4', { message: 'El ID de la cuenta por pagar debe ser un UUID válido' })
  cxp_id: string;

  @ApiPropertyOptional({
    description: 'Monto del pago a aplicar. Si no se especifica, se paga el saldo completo',
    example: 1500.50,
  })
  @IsOptional()
  monto?: number;
}

export class RegistrarPagoLoteDto {
  @ApiProperty({
    description: 'Lista de cuentas por pagar a procesar en el lote',
    type: [PagoLoteItemDto],
    example: [
      { cxp_id: '123e4567-e89b-12d3-a456-426614174000', monto: 1500.50 },
      { cxp_id: '123e4567-e89b-12d3-a456-426614174001' },
    ],
  })
  @IsNotEmpty({ message: 'La lista de pagos es requerida' })
  @IsArray({ message: 'Los pagos deben ser un arreglo' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un pago' })
  @ValidateNested({ each: true })
  @Type(() => PagoLoteItemDto)
  pagos: PagoLoteItemDto[];

  @ApiProperty({
    description: 'Fecha en que se realizan los pagos',
    example: '2025-10-25',
  })
  @IsNotEmpty({ message: 'La fecha de pago es requerida' })
  @IsDateString({}, { message: 'La fecha de pago debe ser una fecha válida en formato ISO' })
  fecha_pago: string;

  @ApiProperty({
    description: 'Método de pago utilizado',
    example: 'TRANSFERENCIA',
    enum: METODOS_PAGO_TESORERIA,
  })
  @IsNotEmpty({ message: 'El método de pago es requerido' })
  @IsString({ message: 'El método de pago debe ser un texto' })
  @IsIn(METODOS_PAGO_TESORERIA, { message: 'Método de pago inválido' })
  metodo_pago: string;

  @ApiProperty({
    description: 'ID de la cuenta bancaria desde la que se realizan los pagos',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsNotEmpty({ message: 'La cuenta bancaria es requerida para pagos en lote' })
  @IsUUID('4', { message: 'El ID de la cuenta bancaria debe ser un UUID válido' })
  cuenta_bancaria_id: string;

  @ApiPropertyOptional({
    description: 'Referencia del lote de pagos',
    example: 'LOTE-2025-001',
  })
  @IsOptional()
  @IsString({ message: 'La referencia debe ser un texto' })
  @MaxLength(120, { message: 'La referencia del lote no puede exceder 120 caracteres' })
  referencia_lote?: string;

  @ApiPropertyOptional({
    description: 'Clave idempotente generada por cliente desktop/offline para reintentos seguros',
    example: 'local-payment-batch-550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString({ message: 'La clave idempotente debe ser un texto' })
  @MaxLength(160, { message: 'La clave idempotente no puede exceder 160 caracteres' })
  idempotency_key?: string;

  @ApiPropertyOptional({
    description: 'Observaciones adicionales sobre el lote de pagos',
    example: 'Pago masivo de proveedores - Semana 43',
  })
  @IsOptional()
  @IsString({ message: 'Las observaciones deben ser un texto' })
  @MaxLength(1000, { message: 'Las observaciones no pueden exceder 1000 caracteres' })
  observaciones?: string;
}
