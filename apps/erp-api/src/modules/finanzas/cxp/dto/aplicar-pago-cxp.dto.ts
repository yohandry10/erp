import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class AplicarPagoCxpDto {
  @ApiProperty({
    description: 'Monto del pago a aplicar',
    example: 1000.00,
    minimum: 0.01,
  })
  @IsNotEmpty({ message: 'El monto es requerido' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El monto debe ser un número con máximo 2 decimales' })
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  monto: number;

  @ApiProperty({
    description: 'Fecha del pago',
    example: '2025-10-25',
  })
  @IsNotEmpty({ message: 'La fecha de pago es requerida' })
  @IsDateString({}, { message: 'La fecha de pago debe ser una fecha válida en formato ISO' })
  fecha_pago: string;

  @ApiProperty({
    description: 'Método de pago utilizado',
    example: 'TRANSFERENCIA',
    enum: ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA'],
  })
  @IsNotEmpty({ message: 'El método de pago es requerido' })
  @IsIn(['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA'], { message: 'Método de pago inválido. Valores permitidos: EFECTIVO, TRANSFERENCIA, CHEQUE, TARJETA' })
  metodo_pago: string;

  @ApiProperty({
    description: 'ID de la cuenta bancaria desde donde se realizó el pago (opcional)',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @IsOptional()
  @IsUUID('4', { message: 'El ID de cuenta bancaria debe ser un UUID válido' })
  cuenta_bancaria_id?: string;

  @ApiPropertyOptional({
    description: 'Sesion de caja abierta para pagos en efectivo; si se omite se resuelve la unica sesion del actor',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El ID de sesion de caja debe ser un UUID valido' })
  sesion_caja_id?: string;

  @ApiProperty({
    description: 'Número de referencia del pago (número de operación, cheque, etc.)',
    example: 'OP-2025-001234',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'La referencia debe ser una cadena de texto' })
  referencia?: string;

  @ApiProperty({
    description: 'Observaciones adicionales sobre el pago',
    example: 'Pago parcial de factura',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Las observaciones deben ser una cadena de texto' })
  observaciones?: string;

  @ApiProperty({
    description: 'Llave de idempotencia estable del intento de pago',
    example: 'cxp-pago-tenant-123-cxp-456-20251025',
  })
  @IsNotEmpty({ message: 'La llave de idempotencia es requerida' })
  @IsString({ message: 'La llave de idempotencia debe ser una cadena de texto' })
  idempotency_key: string;
}
