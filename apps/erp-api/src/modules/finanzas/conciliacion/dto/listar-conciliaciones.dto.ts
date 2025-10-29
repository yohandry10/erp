import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ListarConciliacionesDto {
  @IsOptional()
  @IsUUID('4', { message: 'El ID de la cuenta bancaria debe ser un UUID válido' })
  cuenta_bancaria_id?: string;

  @IsOptional()
  @IsEnum(['ABIERTA', 'EN_PROCESO', 'CERRADA'], {
    message: 'El estado debe ser ABIERTA, EN_PROCESO o CERRADA',
  })
  estado?: 'ABIERTA' | 'EN_PROCESO' | 'CERRADA';

  @IsOptional()
  periodo?: string;
}
