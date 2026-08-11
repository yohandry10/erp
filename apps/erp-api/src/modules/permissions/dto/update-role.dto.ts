import { IsArray, IsString, IsOptional, IsUUID } from 'class-validator';

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  permission_ids?: string[];
}
