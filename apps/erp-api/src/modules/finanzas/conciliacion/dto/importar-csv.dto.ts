import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ImportarCsvDto {
  @ApiProperty({
    description: 'Contenido del archivo CSV en formato texto',
    example: 'Fecha,Descripcion,Tipo,Monto\n2025-10-15,Pago proveedor,CARGO,1500.00',
  })
  @IsString()
  @IsNotEmpty()
  contenidoCsv: string;

  @ApiProperty({
    description: 'Nombre del banco para usar el parser específico',
    example: 'BCP',
    enum: ['BCP', 'BBVA', 'INTERBANK', 'SCOTIABANK', 'GENERICO'],
    required: false,
  })
  @IsString()
  @IsOptional()
  banco?: string;
}
