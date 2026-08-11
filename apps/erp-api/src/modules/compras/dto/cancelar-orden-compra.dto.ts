import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelarOrdenCompraDto {
  @ApiProperty({
    description: 'Motivo de la cancelación (requerido)',
    example: 'Cambio en los requerimientos del proyecto'
  })
  @IsNotEmpty({ message: 'El motivo de la cancelación es requerido' })
  @IsString()
  @MaxLength(500)
  motivo_cancelacion: string;

}
