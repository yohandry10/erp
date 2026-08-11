import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ImportCatalogoDto {
  @IsString()
  @IsNotEmpty()
  fileBase64: string;

  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key!: string;

  // Compatibilidad de entrada: nunca se usa como autoridad de tenant.
  @IsOptional()
  @IsString()
  tenantId?: string;
}
