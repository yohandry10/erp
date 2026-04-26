import { IsEnum, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export enum TipoEventoLogisticoManual {
  PICKING = 'PICKING',
  PACKING = 'PACKING',
  DESPACHO = 'DESPACHO',
  TRANSITO = 'TRANSITO',
  ENTREGA = 'ENTREGA',
}

export class RegistrarEventoLogisticoDto {
  @IsEnum(TipoEventoLogisticoManual, { message: 'Tipo de evento logístico inválido' })
  tipo!: TipoEventoLogisticoManual;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Los bultos deben ser numéricos' })
  bultos?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El peso total debe ser numérico' })
  peso_total?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El volumen total debe ser numérico' })
  volumen_total?: number;

  @IsOptional()
  @IsString()
  transportista?: string;

  @IsOptional()
  @IsString()
  placa?: string;

  @IsOptional()
  @IsString()
  conductor?: string;

  @IsOptional()
  @IsString()
  responsable?: string;

  @IsOptional()
  @IsString()
  ubicacion?: string;

  @IsOptional()
  @IsString()
  estado?: string;

  @IsOptional()
  @IsObject()
  datos_extra?: Record<string, any>;
}
