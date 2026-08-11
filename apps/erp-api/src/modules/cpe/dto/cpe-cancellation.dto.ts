import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export class SolicitarAnulacionCpeDto {
  @IsString()
  @Length(3, 500)
  motivo!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}$/)
  tipo_nota?: string;
}

export class RevertirCobroCxcDto {
  @IsString()
  @Length(3, 500)
  motivo!: string;

  @IsOptional()
  @IsUUID('4')
  sesion_caja_id?: string;
}

export class RevertirAjusteCxcDto {
  @IsString()
  @Length(3, 500)
  motivo!: string;
}
