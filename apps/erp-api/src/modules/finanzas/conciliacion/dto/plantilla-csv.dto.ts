import { IsString, IsNotEmpty, IsBoolean, IsArray, ValidateNested, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class FormatoFechaDto {
  @ApiProperty({
    description: 'Formato de fecha usado por el banco',
    example: 'DD/MM/YYYY',
    enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM-DD-YYYY'],
  })
  @IsString()
  @IsNotEmpty()
  formato: string;

  @ApiProperty({
    description: 'Separador usado en las fechas',
    example: '/',
    enum: ['/', '-', '.'],
  })
  @IsString()
  @IsNotEmpty()
  separador: string;
}

export class MapeoColumnaDto {
  @ApiProperty({
    description: 'Índice de la columna (0-based)',
    example: 0,
  })
  @IsNumber()
  indice: number;

  @ApiProperty({
    description: 'Tipo de dato que contiene la columna',
    example: 'fecha',
    enum: ['fecha', 'descripcion', 'referencia', 'tipo', 'monto', 'cargo', 'abono', 'saldo', 'ignorar'],
  })
  @IsString()
  @IsNotEmpty()
  tipo: string;

  @ApiProperty({
    description: 'Nombres alternativos de la columna para identificación en encabezado',
    example: ['fecha', 'date'],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  nombres?: string[];
}

export class RegistrarPlantillaCsvDto {
  @ApiProperty({
    description: 'Código único del banco o plantilla',
    example: 'MI_BANCO',
  })
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @ApiProperty({
    description: 'Nombre del banco',
    example: 'Mi Banco Personalizado',
  })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({
    description: 'Descripción del formato',
    example: 'Formato personalizado para extractos de Mi Banco',
  })
  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @ApiProperty({
    description: 'Indica si la primera línea es encabezado',
    example: true,
  })
  @IsBoolean()
  tieneEncabezado: boolean;

  @ApiProperty({
    description: 'Separador de columnas',
    example: ',',
    default: ',',
  })
  @IsString()
  @IsNotEmpty()
  separador: string;

  @ApiProperty({
    description: 'Formato de fecha usado por el banco',
    type: FormatoFechaDto,
  })
  @ValidateNested()
  @Type(() => FormatoFechaDto)
  formatoFecha: FormatoFechaDto;

  @ApiProperty({
    description: 'Mapeo de columnas del CSV',
    type: [MapeoColumnaDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MapeoColumnaDto)
  columnas: MapeoColumnaDto[];

  @ApiProperty({
    description: 'Indica si usa columnas separadas para cargo/abono (true) o una sola columna con tipo (false)',
    example: true,
  })
  @IsBoolean()
  usaCargoAbonoSeparado: boolean;

  @ApiProperty({
    description: 'Símbolos de moneda a eliminar al parsear',
    example: ['S/', '$', 'PEN'],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  simbolosMoneda?: string[];

  @ApiProperty({
    description: 'Separador decimal',
    example: '.',
    enum: ['.', ','],
  })
  @IsString()
  @IsNotEmpty()
  separadorDecimal: string;

  @ApiProperty({
    description: 'Separador de miles',
    example: ',',
    required: false,
  })
  @IsString()
  @IsOptional()
  separadorMiles?: string;
}
