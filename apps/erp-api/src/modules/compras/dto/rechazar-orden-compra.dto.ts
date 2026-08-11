import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RechazarOrdenCompraDto {
  @ApiProperty({
    description: 'Motivo del rechazo (requerido)',
    example: 'Presupuesto insuficiente para este trimestre'
  })
  @IsNotEmpty({ message: 'El motivo del rechazo es requerido' })
  @IsString()
  @MaxLength(500)
  motivo_rechazo: string;
}
