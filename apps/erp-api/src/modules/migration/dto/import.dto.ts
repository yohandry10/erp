import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength, IsDateString, IsNumber, Min, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const MIGRATION_RUN_TYPES = [
  'clientes',
  'proveedores',
  'productos',
  'plan_cuentas',
  'cuentas_bancarias',
  'cxc_abiertas',
  'cxp_abiertas',
  'balance_apertura',
  'stock_inicial',
  'comprobantes_historico',
] as const;

export type MigrationRunType = (typeof MIGRATION_RUN_TYPES)[number];

export const MIGRATION_IMPORTER_RUN_TYPES = [
  'clientes',
  'proveedores',
  'cxc_abiertas',
  'cxp_abiertas',
  'balance_apertura',
  'stock_inicial',
  'comprobantes_historico',
] as const satisfies readonly MigrationRunType[];

export type MigrationImporterRunType = (typeof MIGRATION_IMPORTER_RUN_TYPES)[number];

export class MigrationImportDto {
  @ApiProperty({ description: 'CSV codificado en base64 (UTF-8)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20 * 1024 * 1024) // ~15 MB CSV crudo, 20 MB base64
  fileBase64: string;

  @ApiProperty({ description: 'Nombre original del archivo (informativo)', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  filename?: string;

  @ApiProperty({ description: 'Fecha de corte (YYYY-MM-DD), obligatoria para saldos iniciales', required: false })
  @IsDateString()
  @IsOptional()
  fechaCorte?: string;

  @ApiProperty({ description: 'Total declarado por el cliente para reconciliación', required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  totalDeclarado?: number;

  @ApiProperty({ description: 'Si true, valida y reporta sin escribir', required: false })
  @IsBoolean()
  @IsOptional()
  dryRun?: boolean;
}

export class MigrationPreviewDto {
  @ApiProperty({ description: 'CSV codificado en base64 (UTF-8)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20 * 1024 * 1024)
  fileBase64: string;

  @ApiProperty({ description: 'Tipo de importación soportado por importador CSV', enum: MIGRATION_IMPORTER_RUN_TYPES })
  @IsString()
  @IsNotEmpty()
  @IsIn(MIGRATION_IMPORTER_RUN_TYPES as unknown as string[])
  runType: MigrationImporterRunType;
}

export interface ImporterRowError {
  rowIndex: number; // 1-indexed para el usuario (incluye encabezado)
  externalId?: string | null;
  field?: string;
  message: string;
}

export interface ImporterResult {
  totalRows: number;
  okRows: number;
  errorRows: number;
  skippedRows: number;
  errors: ImporterRowError[];
  created: number;
  updated: number;
}
