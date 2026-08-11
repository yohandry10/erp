import { ApiProperty } from '@nestjs/swagger';
import { IsEmpty, IsUUID, IsString, MinLength, MaxLength } from 'class-validator';

export class MarcarItemDto {
  @ApiProperty({ description: 'Clave estable de intención' })
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key!: string;

  @ApiProperty({
    description: 'ID del movimiento del sistema a conciliar',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  movimiento_sistema_id: string;

  @ApiProperty({
    description: 'ID del movimiento del extracto bancario a conciliar',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsUUID()
  movimiento_extracto_id: string;

  @IsEmpty({ message: 'Las diferencias requieren un ajuste bancario explícito y contabilizado' })
  diferencia?: number;

  @IsEmpty({ message: 'No se permite aceptar diferencias sin ajuste explícito' })
  aceptar_diferencia?: boolean;

}
