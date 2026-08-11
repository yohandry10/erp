import { IsIn, IsNotEmpty, IsString, IsNumber, IsDateString, IsOptional, IsEnum, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const METODOS_PAGO_BANCOS = ['TRANSFERENCIA', 'CHEQUE', 'TARJETA', 'OTRO'] as const;
const CATEGORIAS_BANCARIAS = [
  'APORTE_CAPITAL',
  'PRESTAMO',
  'COMISION_BANCARIA',
  'INTERES_BANCARIO',
  'IMPUESTO_BANCARIO',
  'OTRO_INGRESO',
  'OTRO_EGRESO',
  'AJUSTE_CONCILIACION',
] as const;

export class CrearMovimientoBancarioDto {
  @ApiProperty({
    description: 'ID de la cuenta bancaria',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsNotEmpty({ message: 'El ID de la cuenta bancaria es requerido' })
  @IsUUID('4', { message: 'El ID de la cuenta bancaria debe ser un UUID válido' })
  cuenta_bancaria_id: string;

  @ApiProperty({ description: 'Cuenta contable de contrapartida', format: 'uuid' })
  @IsUUID('4', { message: 'La contracuenta debe ser un UUID válido' })
  cuenta_contrapartida_id!: string;

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

  @ApiProperty({ description: 'Moneda ISO-4217 de la cuenta', example: 'PEN' })
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'La moneda debe usar tres letras mayúsculas' })
  moneda!: string;

  @ApiPropertyOptional({ description: 'Tipo de cambio a moneda local; obligatorio para moneda extranjera' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  tipo_cambio?: number;

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

  @ApiProperty({ enum: CATEGORIAS_BANCARIAS, description: 'Categoría contable explícita' })
  @IsIn(CATEGORIAS_BANCARIAS, { message: 'Categoría bancaria inválida' })
  categoria!: typeof CATEGORIAS_BANCARIAS[number];

  @ApiProperty({ description: 'Clave estable de intención (8-180 caracteres)' })
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key!: string;

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

  @ApiPropertyOptional({ description: 'Conciliación abierta; sólo para AJUSTE_CONCILIACION' })
  @IsOptional()
  @IsUUID('4')
  conciliacion_id?: string;
}
