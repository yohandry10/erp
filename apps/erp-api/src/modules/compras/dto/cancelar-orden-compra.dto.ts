import { IsBoolean, IsString, IsOptional, IsUUID, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CancelarOrdenCompraDto {
  @ApiPropertyOptional({
    description: 'ID del usuario que cancela',
    example: '550e8400-e29b-41d4-a716-446655440001'
  })
  @IsOptional()
  @IsUUID()
  cancelado_por_id?: string;

  @ApiPropertyOptional({
    description: 'Nombre del usuario que cancela',
    example: 'Carlos Rodríguez'
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cancelado_por_nombre?: string;

  @ApiProperty({
    description: 'Motivo de la cancelación (requerido)',
    example: 'Cambio en los requerimientos del proyecto'
  })
  @IsNotEmpty({ message: 'El motivo de la cancelación es requerido' })
  @IsString()
  motivo_cancelacion: string;

  @ApiPropertyOptional({
    description:
      'Permite cancelar la OC aun si existen recepciones activas (no CERRADAS). Requiere confirmación explícita.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  permitir_cancelar_con_recepciones_activas?: boolean;

  @ApiPropertyOptional({
    description:
      'Permite cancelar la OC aun si existen recepciones CERRADAS (implica reversa manual/automática posterior). Requiere confirmación explícita.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  permitir_cancelar_con_recepciones_cerradas?: boolean;
}
