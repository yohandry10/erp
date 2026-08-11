import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class AprobarRmaDto {
  @IsOptional()
  @IsBoolean()
  aprobar?: boolean = true;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notas?: string;
}
