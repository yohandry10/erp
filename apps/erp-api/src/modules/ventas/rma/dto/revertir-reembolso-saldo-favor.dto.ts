import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class RevertirReembolsoSaldoFavorDto {
  @IsString()
  @Length(3, 500)
  motivo!: string;

  @IsOptional()
  @IsUUID('4')
  sesion_caja_id?: string;
}
