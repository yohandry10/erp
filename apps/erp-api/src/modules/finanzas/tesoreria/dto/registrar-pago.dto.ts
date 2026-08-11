import { IsIn, IsNotEmpty, IsNumber, IsString, IsOptional, IsUUID, IsDateString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const METODOS_PAGO_TESORERIA = ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA'] as const;

export class RegistrarPagoDto {
  @ApiProperty({
    description: 'ID de la cuenta por pagar a la que se aplicará el pago',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsNotEmpty({ message: 'El ID de la cuenta por pagar es requerido' })
  @IsUUID('4', { message: 'El ID de la cuenta por pagar debe ser un UUID válido' })
  cxp_id: string;

  @ApiProperty({
    description: 'Monto del pago a aplicar',
    example: 1500.50,
    minimum: 0.01,
  })
  @IsNotEmpty({ message: 'El monto del pago es requerido' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El monto debe ser un número con máximo 2 decimales' })
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  monto: number;

  @ApiProperty({
    description: 'Fecha en que se realizó el pago',
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

  @ApiPropertyOptional({
    description: 'ID de la cuenta bancaria desde la que se realiza el pago',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El ID de la cuenta bancaria debe ser un UUID válido' })
  cuenta_bancaria_id?: string;

  @ApiPropertyOptional({
    description: 'Sesion de caja abierta para pagos en efectivo; si se omite se usa la unica sesion abierta del actor',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El ID de la sesion de caja debe ser un UUID valido' })
  sesion_caja_id?: string;

  @ApiPropertyOptional({
    description: 'Número de referencia del pago (número de operación, cheque, etc.)',
    example: 'OP-2025-001234',
  })
  @IsOptional()
  @IsString({ message: 'La referencia debe ser un texto' })
  @MaxLength(120, { message: 'La referencia no puede exceder 120 caracteres' })
  referencia?: string;

  @ApiPropertyOptional({
    description: 'Observaciones adicionales sobre el pago',
    example: 'Pago parcial de factura F001-00123',
  })
  @IsOptional()
  @IsString({ message: 'Las observaciones deben ser un texto' })
  @MaxLength(1000, { message: 'Las observaciones no pueden exceder 1000 caracteres' })
  observaciones?: string;

  @ApiProperty({
    description: 'Llave de idempotencia estable del intento de pago',
    example: 'tesoreria:pago:tenant-uuid:cxp-uuid:ref-001',
  })
  @IsNotEmpty({ message: 'La llave de idempotencia es requerida' })
  @IsString({ message: 'La llave de idempotencia debe ser un texto' })
  @MaxLength(200, { message: 'La llave de idempotencia no puede exceder 200 caracteres' })
  idempotency_key: string;
}
