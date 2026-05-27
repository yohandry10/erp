import { IsIn, IsNotEmpty, IsString, IsNumber, IsDateString, IsOptional, IsEnum, IsUUID, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const METODOS_PAGO_BANCOS = ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA'] as const;

export class CrearMovimientoBancarioDto {
  @ApiProperty({
    description: 'ID de la cuenta bancaria',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsNotEmpty({ message: 'El ID de la cuenta bancaria es requerido' })
  @IsUUID('4', { message: 'El ID de la cuenta bancaria debe ser un UUID válido' })
  cuenta_bancaria_id: string;

  @ApiProperty({
    description: 'Tipo de movimiento: ABONO (ingreso) o CARGO (egreso)',
    example: 'ABONO',
    enum: ['ABONO', 'CARGO'],
  })
  @IsNotEmpty({ message: 'El tipo de movimiento es requerido' })
  @IsEnum(['ABONO', 'CARGO'], { message: 'El tipo debe ser ABONO o CARGO' })
  tipo: 'ABONO' | 'CARGO';

  @ApiProperty({
    description: 'Monto del movimiento (debe ser mayor a 0)',
    example: 1500.50,
    minimum: 0.01,
  })
  @IsNotEmpty({ message: 'El monto es requerido' })
  @IsNumber({}, { message: 'El monto debe ser un número' })
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  monto: number;

  @ApiProperty({
    description: 'Fecha del movimiento en formato ISO (YYYY-MM-DD)',
    example: '2025-10-25',
  })
  @IsNotEmpty({ message: 'La fecha es requerida' })
  @IsDateString({}, { message: 'La fecha debe ser una fecha válida en formato ISO' })
  fecha: string;

  @ApiProperty({
    description: 'Descripción del movimiento',
    example: 'Depósito por venta de contado',
  })
  @IsNotEmpty({ message: 'La descripción es requerida' })
  @IsString({ message: 'La descripción debe ser un texto' })
  @MaxLength(300, { message: 'La descripción no puede exceder 300 caracteres' })
  descripcion: string;

  @ApiPropertyOptional({
    description: 'Número de referencia u operación bancaria',
    example: 'OP-2025-001234',
  })
  @IsOptional()
  @IsString({ message: 'La referencia debe ser un texto' })
  @MaxLength(120, { message: 'La referencia no puede exceder 120 caracteres' })
  referencia?: string;

  @ApiPropertyOptional({
    description: 'Método de pago utilizado',
    example: 'TRANSFERENCIA',
    enum: METODOS_PAGO_BANCOS,
  })
  @IsOptional()
  @IsString({ message: 'El método de pago debe ser un texto' })
  @IsIn(METODOS_PAGO_BANCOS, { message: 'Método de pago inválido' })
  metodo_pago?: string;

  @ApiPropertyOptional({
    description: 'ID del proveedor relacionado (si aplica)',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El ID del proveedor debe ser un UUID válido' })
  proveedor_id?: string;
}
