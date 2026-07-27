import { IsNotEmpty, IsString } from 'class-validator';

export class ImportCatalogoDto {
  @IsString()
  @IsNotEmpty()
  fileBase64: string;

  @IsString()
  @IsNotEmpty()
  tenantId: string;
}
