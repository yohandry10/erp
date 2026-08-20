import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Bodies de apertura y cierre de caja del POS, y de la carga de certificado.
 *
 * Venían con el tipo declarado en línea, que TypeScript borra al compilar: en
 * runtime el pipe no tenía esquema y el body entraba sin validar. Aquí se
 * conservan los mismos campos.
 *
 * `supervisor_id` y `razon_autorizacion` se declaran porque el handler los
 * inspecciona para rechazar la petición: la autorización de supervisor tiene su
 * propio flujo. Si no estuvieran declarados, el pipe los borraría antes y esa
 * comprobación dejaría de dispararse.
 */
export class AbrirCajaPosDto {
  @IsNumber() @Min(0) monto_inicial!: number;
  @IsOptional() @IsString() @MaxLength(80) caja_id?: string;
  @IsOptional() @IsString() @MaxLength(120) dispositivo?: string;
  @IsOptional() @IsString() @MaxLength(10) moneda?: string;
  @IsOptional() @IsString() @MaxLength(80) supervisor_id?: string;
  @IsOptional() @IsString() @MaxLength(500) razon_autorizacion?: string;
  @IsOptional() @IsObject() denominaciones_apertura?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(60) ip_address?: string;
  @IsOptional() @IsObject() geolocalizacion?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(2000) foto_apertura?: string;
  @IsOptional() @IsString() @MaxLength(500) user_agent?: string;
}

export class CerrarCajaPosDto {
  @IsNumber() @Min(0) monto_contado!: number;
  @IsOptional() @IsString() @MaxLength(2000) notas?: string;
  @IsOptional() @IsString() @MaxLength(80) caja_id?: string;

  /** Dos grafías del mismo dato; el handler acepta cualquiera de las dos. */
  @IsOptional() @IsString() @MaxLength(80) sesion_id?: string;
  @IsOptional() @IsString() @MaxLength(80) sesionId?: string;
}

export class ConfigurarCertificadoPosDto {
  @IsString() @IsNotEmpty() certificado_base64!: string;
  @IsString() @IsNotEmpty() @MaxLength(500) password!: string;
}
