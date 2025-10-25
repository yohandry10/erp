import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AprobarRmaDto {
  @IsOptional()
  @IsBoolean()
  aprobar?: boolean = true;

  @IsOptional()
  @IsString()
  notas?: string;
}
