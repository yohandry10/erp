import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CerrarConciliacionDto {
  @ApiProperty({ description: 'Clave estable de intención' })
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key: string;
}
