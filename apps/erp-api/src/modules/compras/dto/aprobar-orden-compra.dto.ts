import { IsString, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AprobarOrdenCompraDto {
  @ApiPropertyOptional({
    description: 'ID del usuario aprobador',
    example: '550e8400-e29b-41d4-a716-446655440001'
  })
  @IsOptional()
  @IsUUID()
  aprobador_id?: string;

  @ApiPropertyOptional({
    description: 'Nombre del usuario aprobador',
    example: 'Juan Pérez'
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  aprobador_nombre?: string;

  @ApiPropertyOptional({
    description: 'Comentarios del aprobador',
    example: 'Aprobado según presupuesto del trimestre'
  })
  @IsOptional()
  @IsString()
  comentarios?: string;
}
