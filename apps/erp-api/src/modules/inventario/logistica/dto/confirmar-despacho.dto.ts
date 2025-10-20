import { IsOptional, IsString, IsArray, IsUUID } from 'class-validator';

/**
 * ConfirmarDespachoDto
 * DTO para confirmar el despacho de un pedido
 * Requirements: 9.3, 9.4, 9.5
 */
export class ConfirmarDespachoDto {
  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  items_despachados?: string[]; // IDs de items del pedido que fueron despachados
}
