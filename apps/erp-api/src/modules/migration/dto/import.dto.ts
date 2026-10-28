import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength, IsDateString, IsNumber, Min, IsBoolean, IsObject } from 'class-validator';
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
  'contratos_suministro',
  'oc_suministro',
  'cronograma_suministro',
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
  'contratos_suministro',
  'oc_suministro',
  'cronograma_suministro',
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

/** Ensayo FOX completo: archivos CSV en base64; nada se escribe. */
export class FoxEnsayoDto {
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) contratos?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) oc?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) cronograma?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) stock?: string;
  @ApiProperty({ description: 'Fecha de corte del stock inicial (YYYY-MM-DD)', required: false })
  @IsOptional() @IsDateString() fechaCorte?: string;
  @ApiProperty({ description: 'Totales de control del extracto FOX por entidad', required: false })
  @IsOptional() @IsObject() control?: Record<string, unknown>;
}

export class FoxConciliacionDto {
  @ApiProperty({ description: 'Totales de control del extracto FOX por entidad' })
  @IsObject() control!: Record<string, unknown>;
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
