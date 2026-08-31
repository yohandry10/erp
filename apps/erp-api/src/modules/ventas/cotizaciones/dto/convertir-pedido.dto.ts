import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

/**
 * ConvertirPedidoDto
 * DTO para convertir una cotización a pedido
 * Requirements: 4.1, 4.2, 4.3
 */
export class ConvertirPedidoDto {
  @IsOptional()
  @IsString({ message: 'Las notas deben ser texto' })
  notas?: string;

  @IsOptional()
  @IsIn(['CONTADO', 'CREDITO'])
  condicion_pago?: 'CONTADO' | 'CREDITO';

  @IsOptional()
  @Matches(/^(?:\d{1,3}|ZZZ)$/i)
  medio_pago?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  plazo_pago_dias?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha_vencimiento?: string;
}
