import { IsString, IsEnum, IsOptional } from 'class-validator';

export enum SireTipo {
  RVIE = 'RVIE', // Registro de Ventas e Ingresos Electrónicos
  RCE = 'RCE',   // Registro de Compras Electrónicas
}

export class CreateSireRequestDto {
  @IsString()
  periodo: string; // YYYY-MM

  @IsEnum(SireTipo)
  tipo: SireTipo;

  @IsString()  @IsOptional()
  observaciones?: string;
}

export class SireRequestDto extends CreateSireRequestDto {
  id: string;
  tenant_id: string;
  estado: string;
  filename?: string;
  file_path?: string;
  total_registros: number;
  created_at: Date;
  updated_at: Date;
} 
