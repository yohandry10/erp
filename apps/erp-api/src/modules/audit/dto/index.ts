import { IsString, IsOptional, IsEnum, IsObject, IsInt, Min, Max, IsDateString, IsUUID, MaxLength, IsIn } from 'class-validator';
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
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  table_name?: string;

  @IsOptional()
  @IsEnum(AuditOperation)
  operation?: AuditOperation;

  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;
}

export class IntegrationFiltersDto extends AuditFiltersDto {
  @IsOptional() @IsString() @MaxLength(100)
  servicio?: string;

  @IsOptional() @IsString() @MaxLength(200)
  correlacion_id?: string;

  @IsOptional() @IsString() @MaxLength(100)
  correlacion_tipo?: string;

  @IsOptional() @IsIn(['SUCCESS', 'ERROR', 'SKIP', 'PENDING', 'TIMEOUT', 'GENERATED', 'COMPLETED', 'WARNING', 'INFO'])
  status?: string;
}
