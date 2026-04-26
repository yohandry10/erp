import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class EnviarCotizacionDto {
  @ApiPropertyOptional({
    description: 'Observaciones al enviar la cotización',
    example: 'Cotización enviada al proveedor por correo electrónico'
  })
  @IsOptional()
  @IsString()
  observaciones?: string;
}
