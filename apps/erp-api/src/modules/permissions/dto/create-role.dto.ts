import { IsString, IsOptional, IsArray, IsUUID, IsNotEmpty } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  permission_ids?: string[];
}
