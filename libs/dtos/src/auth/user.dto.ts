import { IsEmail, IsString, IsUUID, IsOptional } from 'class-validator';

export class UserDto {
  @IsUUID()
  id: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsUUID()
  tenant_id: string;

  created_at: Date;
  updated_at: Date;
}

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsUUID()
  tenant_id: string;
} 