import { IsString, IsNotEmpty, IsNumber, IsOptional, IsDateString, IsEnum, Min, Max, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export enum ModalidadTransporte {
  TRANSPORTE_PUBLICO = 'TRANSPORTE_PUBLICO',
  TRANSPORTE_PRIVADO = 'TRANSPORTE_PRIVADO'
}

export enum MotivoTraslado {
  VENTA = 'VENTA',
  COMPRA = 'COMPRA',
  TRASLADO_ENTRE_ESTABLECIMIENTOS = 'TRASLADO_ENTRE_ESTABLECIMIENTOS',
  CONSIGNACION = 'CONSIGNACION',
  DEVOLUCION = 'DEVOLUCION',
  OTROS = 'OTROS'
}

export class CreateGuiaRemisionDto {
  @ApiProperty({ description: 'Nombre o razón social del destinatario' })
  @IsString({ message: 'El destinatario debe ser un texto válido' })
  @IsNotEmpty({ message: 'El destinatario es obligatorio' })
  destinatario: string;

  @ApiProperty({ description: 'Dirección completa de destino' })
  @IsString({ message: 'La dirección de destino debe ser un texto válido' })
  @IsNotEmpty({ message: 'La dirección de destino es obligatoria' })
  direccionDestino: string;

  @ApiProperty({ description: 'Fecha de traslado en formato YYYY-MM-DD' })
  @IsString({ message: 'La fecha debe ser un texto válido' })
  @IsNotEmpty({ message: 'La fecha de traslado es obligatoria' })
  fechaTraslado: string;

  @ApiProperty({ 
    enum: ModalidadTransporte,
    description: 'Modalidad de transporte utilizada'
  })
  @IsEnum(ModalidadTransporte, { message: 'La modalidad de transporte debe ser TRANSPORTE_PUBLICO o TRANSPORTE_PRIVADO' })
  modalidad: ModalidadTransporte;

  @ApiProperty({ 
    enum: MotivoTraslado,
    description: 'Motivo del traslado de los bienes'
  })
  @IsEnum(MotivoTraslado, { message: 'El motivo del traslado no es válido' })
  motivo: MotivoTraslado;

  @ApiProperty({ description: 'Peso total de los bienes en kilogramos' })
  @IsNumber({}, { message: 'El peso debe ser un número válido' })
  @Min(0.01, { message: 'El peso debe ser mayor a 0' })
  @Transform(({ value }) => parseFloat(value))
  pesoTotal: number;

  @ApiProperty({ description: 'Observaciones adicionales', required: false })
  @IsOptional()
  @IsString({ message: 'Las observaciones deben ser un texto válido' })
  observaciones?: string;

  @ApiProperty({ description: 'Nombre del transportista (para transporte público)', required: false })
  @IsOptional()
  @IsString({ message: 'El nombre del transportista debe ser un texto válido' })
  transportista?: string;

  @ApiProperty({ description: 'Placa del vehículo (para transporte privado)', required: false })
  @IsOptional()
  @IsString({ message: 'La placa del vehículo debe ser un texto válido' })
  placaVehiculo?: string;

  @ApiProperty({ description: 'Número de licencia de conducir (para transporte privado)', required: false })
  @IsOptional()
  @IsString({ message: 'La licencia de conducir debe ser un texto válido' })
  licenciaConducir?: string;
}

export class GuiaRemisionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  numero: string;

  @ApiProperty()
  estado: string;

  @ApiProperty()
  destinatario: string;

  @ApiProperty()
  direccionDestino: string;

  @ApiProperty()
  fechaTraslado: string;

  @ApiProperty()
  fechaCreacion: string;

  @ApiProperty()
  modalidad: ModalidadTransporte;

  @ApiProperty()
  motivo: MotivoTraslado;

  @ApiProperty()
  pesoTotal: number;

  @ApiProperty({ required: false })
  observaciones?: string;

  @ApiProperty({ required: false })
  transportista?: string;

  @ApiProperty({ required: false })
  placaVehiculo?: string;

  @ApiProperty({ required: false })
  licenciaConducir?: string;
} 