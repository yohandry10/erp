import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para generar documento fiscal desde un pedido
 */
export class GenerarDocumentoDto {
  @ApiProperty({
    description: 'Tipo de documento fiscal a generar',
    enum: ['01', '03'],
    example: '01',
    required: true,
  })
  @IsNotEmpty({ message: 'El tipo de documento es requerido' })
  @IsString()
  @IsIn(['01', '03'], {
    message: 'El tipo de documento debe ser "01" (Factura) o "03" (Boleta)',
  })
  tipo_documento: '01' | '03';
}
