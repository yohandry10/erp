import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// SEC-001 FIX: aprobador_id removido del contrato — el aprobador se identifica
// SIEMPRE por el JWT (controller pasa user.id al service). El body solo lleva
// metadata del acto de aprobacion. Con ValidationPipe global whitelist + forbidNonWhitelisted,
// si un cliente envia aprobador_id la API responde 400.
export class AprobarOrdenCompraDto {
  @ApiPropertyOptional({
    description: 'Comentarios del aprobador',
    example: 'Aprobado según presupuesto del trimestre'
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comentarios?: string;
}
