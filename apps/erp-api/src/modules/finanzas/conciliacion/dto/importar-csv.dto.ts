import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const BANCOS_SOPORTADOS = ['BCP', 'BBVA', 'INTERBANK', 'SCOTIABANK', 'GENERICO'] as const;

export class ImportarCsvDto {
  @ApiProperty({
    description: 'Contenido del archivo CSV en formato texto',
    example: 'Fecha,Descripcion,Tipo,Monto\n2025-10-15,Pago proveedor,CARGO,1500.00',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2 * 1024 * 1024, { message: 'El CSV no puede superar 2 MB' })
  contenidoCsv: string;

  @ApiProperty({
    description: 'Nombre del banco para usar el parser específico',
    example: 'BCP',
    enum: BANCOS_SOPORTADOS,
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(BANCOS_SOPORTADOS, { message: 'Banco no soportado' })
  banco?: string;
}
