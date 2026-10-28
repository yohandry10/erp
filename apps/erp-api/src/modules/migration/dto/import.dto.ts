import {
  ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested, IsString, IsNotEmpty, IsOptional, IsIn, IsInt, IsUUID, Matches, Max, MaxLength, MinLength,
  IsDateString, IsNumber, Min, IsBoolean, IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
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
  'almacenes',
  'listas_precios',
  'oc_compra',
  'pedidos_venta',
] as const;

export type MigrationRunType = (typeof MIGRATION_RUN_TYPES)[number];

/** Maestros y saldos abiertos FOX que entran por importar_maestro_fox_582. */
export const MIGRATION_FOX_MAESTRO_RUN_TYPES = [
  'almacenes',
  'plan_cuentas',
  'productos',
  'cuentas_bancarias',
  'listas_precios',
  'oc_compra',
  'pedidos_venta',
] as const satisfies readonly MigrationRunType[];

export type MigrationFoxMaestroRunType = (typeof MIGRATION_FOX_MAESTRO_RUN_TYPES)[number];

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
  ...MIGRATION_FOX_MAESTRO_RUN_TYPES,
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

/** Ensayo FOX integral: archivos CSV en base64, en el orden real; nada se escribe. */
export class FoxEnsayoDto {
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) clientes?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) proveedores?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) almacenes?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) plan_cuentas?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) productos?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) cuentas_bancarias?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) listas_precios?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) cxc?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) cxp?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) balance?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) contratos?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) oc?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) cronograma?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) oc_compra?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) pedidos_venta?: string;
  @IsOptional() @IsString() @MaxLength(20 * 1024 * 1024) stock?: string;
  @ApiProperty({ description: 'Fecha de corte de saldos, balance y stock (YYYY-MM-DD)', required: false })
  @IsOptional() @IsDateString() fechaCorte?: string;
  @ApiProperty({ description: 'Totales de control del extracto FOX por entidad', required: false })
  @IsOptional() @IsObject() control?: Record<string, unknown>;
}

export class FoxConciliacionDto {
  @ApiProperty({ description: 'Totales de control del extracto FOX por entidad' })
  @IsObject() control!: Record<string, unknown>;
}

/** Archivo íntegro FOX: un lote por extracto. */
export class FoxArchivoLoteDto {
  @IsString() @MinLength(3) @MaxLength(200) descripcion!: string;
  @IsOptional() @IsDateString() fechaCorte?: string;
}

/** Una fila del extracto: su clave estable en la tabla y su contenido tal cual. */
export class FoxArchivoFilaDto {
  @IsString() @MinLength(1) @MaxLength(250) clave!: string;
  @IsObject() fila!: Record<string, unknown>;
}

export class FoxArchivoFilasDto {
  @ApiProperty({ description: 'Nombre de la tabla FOX (letras, dígitos, _ . $ -)' })
  @IsString() @Matches(/^[A-Za-z0-9_.$-]{1,80}$/) tabla!: string;
  // Sin @Type la conversión implícita trataría cada fila como un arreglo vacío.
  @ApiProperty({ description: 'Hasta 2000 filas {clave, fila}', type: [FoxArchivoFilaDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => FoxArchivoFilaDto)
  filas!: FoxArchivoFilaDto[];
}

export class FoxArchivoCierreDto {
  @ApiProperty({ description: 'Filas declaradas por tabla; el lote cierra sólo si coinciden' })
  @IsObject() tablas!: Record<string, number>;
}

export class FoxArchivoDescarteDto {
  @IsString() @MinLength(5) @MaxLength(1000) motivo!: string;
}

export class FoxArchivoConsultaDto {
  @IsOptional() @IsUUID() loteId?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_.$-]{1,80}$/) tabla?: string;
  @IsOptional() @IsString() @MaxLength(200) texto?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limite?: number;
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
