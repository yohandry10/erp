import { IsString, IsOptional, IsUUID, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RechazarOrdenCompraDto {
  @ApiPropertyOptional({
    description: 'ID del usuario que rechaza',
    example: '550e8400-e29b-41d4-a716-446655440001'
  })
  @IsOptional()
  @IsUUID()
  rechazado_por_id?: string;

  @ApiPropertyOptional({
    description: 'Nombre del usuario que rechaza',
    example: 'María García'
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  rechazado_por_nombre?: string;

  @ApiProperty({
    description: 'Motivo del rechazo (requerido)',
    example: 'Presupuesto insuficiente para este trimestre'
  })
  @IsNotEmpty({ message: 'El motivo del rechazo es requerido' })
  @IsString()
  motivo_rechazo: string;
}
