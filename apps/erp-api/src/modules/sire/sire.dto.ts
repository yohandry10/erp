import { IsBoolean, IsIn, IsOptional, Matches } from 'class-validator';

const SIRE_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export class GenerateSireReportDto {
  @IsIn(['REGISTRO_VENTAS', 'REGISTRO_COMPRAS', 'REG_VEN', 'REG_COM'])
  tipoReporte!: 'REGISTRO_VENTAS' | 'REGISTRO_COMPRAS' | 'REG_VEN' | 'REG_COM';

  @Matches(SIRE_PERIOD_PATTERN, { message: 'periodo debe tener formato YYYY-MM' })
  periodo!: string;

  @IsOptional()
  @IsIn(['TXT'])
  formato?: 'TXT';

  @IsOptional()
  @IsBoolean()
  incluirAnulados?: boolean;
}

export class SireReportFiltersDto {
  @IsOptional()
  @Matches(SIRE_PERIOD_PATTERN, { message: 'periodo debe tener formato YYYY-MM' })
  periodo?: string;

  @IsOptional()
  @IsIn(['REGISTRO_VENTAS', 'REGISTRO_COMPRAS', 'REG_VEN', 'REG_COM'])
  tipoReporte?: 'REGISTRO_VENTAS' | 'REGISTRO_COMPRAS' | 'REG_VEN' | 'REG_COM';

  @IsOptional()
  @IsIn(['GENERANDO', 'GENERADO', 'PENDIENTE', 'ENVIADO', 'ERROR'])
  estado?: 'GENERANDO' | 'GENERADO' | 'PENDIENTE' | 'ENVIADO' | 'ERROR';
}
