import { Equals, IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

export class RegistrarHabilitacionDianDto {
  @IsBoolean()
  @Equals(true, {
    message: 'Debe confirmar expresamente que el software figura Habilitado en el portal DIAN',
  })
  confirmed!: true;

  @IsString()
  @MinLength(8)
  @MaxLength(500)
  evidenceReference!: string;
}
