import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RechazarCotizacionDto {
  @ApiProperty({
    description: 'Motivo del rechazo (requerido)',
    example: 'Precios no competitivos con el mercado actual'
  })
  @IsNotEmpty({ message: 'El motivo del rechazo es requerido' })
  @IsString()
  @MaxLength(500)
  motivo: string;
}
