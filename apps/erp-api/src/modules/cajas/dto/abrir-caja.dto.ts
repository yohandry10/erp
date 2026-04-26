import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MinLength, IsObject, ValidateNested, IsIP, IsUrl, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

// Interface para denominaciones (billetes y monedas)
export class DenominacionesDto {
  @IsOptional()
  @IsObject()
  billetes?: { [denominacion: number]: number };

  @IsOptional()
  @IsObject()
  monedas?: { [denominacion: number]: number };
}

// Q13: Geolocalización para trazabilidad forense
export class GeolocalizacionDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number; // Precisión en metros

  @IsOptional()
  @IsString()
  timestamp?: string; // ISO timestamp de cuando se capturó
}

export class AbrirCajaDto {
  @IsString()
  @IsOptional()
  cajero_id?: string;

  @IsNumber()
  @IsNotEmpty()
  monto_inicio: number;

  @IsString()
  @IsOptional()
  moneda?: string;

  @IsString()
  @IsOptional()
  dispositivo?: string;

  // Campos opcionales para autorización de supervisor
  // Requeridos cuando monto_inicio está fuera del rango configurado

  @IsOptional()
  @IsUUID()
  supervisor_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(10, {
    message: 'La razón de autorización debe tener al menos 10 caracteres',
  })
  razon_autorizacion?: string;

  // Campos opcionales para arqueo de denominaciones
  // Si se proporciona, se validará que el total coincida con monto_inicio

  @IsOptional()
  @ValidateNested()
  @Type(() => DenominacionesDto)
  denominaciones_apertura?: DenominacionesDto;

  // Q13: Campos de trazabilidad forense
  // Capturados automáticamente por el frontend o proporcionados manualmente

  @IsOptional()
  @IsString()
  ip_address?: string; // Se puede extraer del request en el controller

  @IsOptional()
  @ValidateNested()
  @Type(() => GeolocalizacionDto)
  geolocalizacion?: GeolocalizacionDto;

  @IsOptional()
  @IsString()
  foto_apertura?: string; // URL de la foto del conteo inicial

  @IsOptional()
  @IsString()
  user_agent?: string; // Se puede extraer del request en el controller
}
