import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class AplicarPagoCxpDto {
  @ApiProperty({
    description: 'Monto del pago a aplicar',
    example: 1000.00,
    minimum: 0.01,
  })
  @IsNotEmpty({ message: 'El monto es requerido' })
  @IsNumber({}, { message: 'El monto debe ser un número' })
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  monto: number;

  @ApiProperty({
    description: 'Fecha del pago',
    example: '2025-10-25',
  })
  @IsNotEmpty({ message: 'La fecha de pago es requerida' })
  @IsString({ message: 'La fecha debe ser una cadena de texto' })
  fecha_pago: string;

  @ApiProperty({
    description: 'Método de pago utilizado',
    example: 'TRANSFERENCIA',
    enum: ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA'],
  })
  @IsNotEmpty({ message: 'El método de pago es requerido' })
  @IsString({ message: 'El método de pago debe ser una cadena de texto' })
  metodo_pago: string;

  @ApiProperty({
    description: 'ID de la cuenta bancaria desde donde se realizó el pago (opcional)',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @IsOptional()
  @IsUUID('4', { message: 'El ID de cuenta bancaria debe ser un UUID válido' })
  cuenta_bancaria_id?: string;

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

  @ApiPropertyOptional({
    description: 'Llave de idempotencia para asegurar pagos idempotentes',
    example: 'cxp-pago-tenant-123-cxp-456-20251025',
  })
  @IsOptional()
  @IsString({ message: 'La llave de idempotencia debe ser una cadena de texto' })
  idempotency_key?: string;
}
