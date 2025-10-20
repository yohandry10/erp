import { IsString, IsOptional, IsEnum, IsObject, IsInt, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export enum AuditOperation {
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

export class AuditLogDto {
  @IsString()
  table_name: string;

  @IsEnum(AuditOperation)
  operation: AuditOperation;

  @IsOptional()
  @IsObject()
  old_values?: Record<string, any>;

  @IsOptional()
  @IsObject()
  new_values?: Record<string, any>;

  @IsOptional()
  @IsString()
  user_id?: string;

  @IsString()
  tenant_id: string;

  @IsOptional()
  @IsString()
  ip_address?: string;

  @IsOptional()
  @IsString()
  user_agent?: string;
}

export class AuditFiltersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  table_name?: string;

  @IsOptional()
  @IsEnum(AuditOperation)
  operation?: AuditOperation;

  @IsOptional()
  @IsString()
  user_id?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;
}
