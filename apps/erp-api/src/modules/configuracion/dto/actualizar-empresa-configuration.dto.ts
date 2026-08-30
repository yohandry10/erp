import {
  IsBoolean,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Body de `PUT /api/configuration/empresa`.
 *
 * Declara los 62 campos que el controlador lee, ni uno más: con
 * `forbidNonWhitelisted` activo, cualquier campo no declarado devolvería 400 y
 * lo que hoy funciona dejaría de funcionar. `logoUrl` se conserva sólo para
 * devolver el error explícito que dirige al endpoint multipart dedicado; este
 * PUT nunca persiste el logo.
 *
 * Los nombres conviven en camelCase y snake_case porque así viajan hoy; el
 * handler los traduce a columnas. Normalizarlos sería cambiar el contrato.
 *
 * Los secretos de OSE y DIAN se validan como texto y nada más: su verificación
 * real es el propio flujo de configuración, no una expresión regular aquí.
 */
export class ActualizarEmpresaConfigurationDto {
  // Identidad y domicilio fiscal
  @IsOptional() @IsString() @MaxLength(20) ruc?: string;
  @IsOptional() @IsString() @MaxLength(300) razonSocial?: string;
  @IsOptional() @IsString() @MaxLength(300) nombreComercial?: string;
  @IsOptional() @IsString() @MaxLength(500) direccion?: string;
  @IsOptional() @IsString() @MaxLength(20) ubigeo?: string;
  @IsOptional() @IsString() @MaxLength(150) departamento?: string;
  @IsOptional() @IsString() @MaxLength(150) provincia?: string;
  @IsOptional() @IsString() @MaxLength(150) distrito?: string;
  @IsOptional() @IsString() @MaxLength(60) telefono?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(300) sitioWeb?: string;
  @IsOptional() @IsString() @MaxLength(300) representanteLegal?: string;
  @IsOptional() @IsString() @MaxLength(20) dniRepresentante?: string;
  @IsOptional() @IsString() @MaxLength(100) regimen?: string;
  @IsOptional() @IsString() @MaxLength(300) actividadEconomica?: string;
  @IsOptional() @IsString() @MaxLength(1000) logoUrl?: string;
  @IsOptional() @IsString() @MaxLength(60) tipo_empresa?: string;

  // País operativo
  @IsOptional() @IsString() @MaxLength(5) pais?: string;
  @IsOptional() @IsInt() @Min(1) pais_id?: number;

  // Facturación y logística
  @IsOptional() @IsNumber() @Min(0) @Max(100) igvPorcentaje?: number;
  @IsOptional() @IsBoolean() usar_flujo_logistica?: boolean;
  @IsOptional() @IsBoolean() gre_obligatorio?: boolean;
  @IsOptional() @IsBoolean() gre_automatico_habilitado?: boolean;
  @IsOptional() @IsNumber() @Min(0) umbral_gre_automatico?: number;
  @IsOptional() @IsString() @MaxLength(40) emisionCpeModo?: string;

  // OSE (Perú)
  @IsOptional() @IsBoolean() oseActivo?: boolean;
  @IsOptional() @IsString() @MaxLength(500) oseUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) oseStatusUrl?: string;
  @IsOptional() @IsString() @MaxLength(200) oseUsername?: string;
  @IsOptional() @IsString() @MaxLength(500) osePassword?: string;
  @IsOptional() @IsString() @MaxLength(40) oseAuthTipo?: string;
  @IsOptional() @IsString() @MaxLength(200) oseApiHeader?: string;
  @IsOptional() @IsString() @MaxLength(1000) oseApiKey?: string;
  @IsOptional() @IsString() @MaxLength(2000) oseBearerToken?: string;

  // ARCA (Argentina)
  @IsOptional() @IsBoolean() arca_activo?: boolean;
  @IsOptional() @IsString() @IsIn(['homologacion', 'produccion'])
  @MaxLength(40) arca_environment?: string;
  @IsOptional() @IsInt() @Min(1) @Max(99998) arca_punto_venta?: number;
  @IsOptional() @IsString() @MaxLength(20) arca_cuit_representada?: string;
  @IsOptional() @IsString() @IsIn(['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO'])
  @MaxLength(40) arca_condicion_iva?: string;
  @IsOptional() @IsString() @IsIn([
    'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    'https://wsaa.afip.gov.ar/ws/services/LoginCms',
  ]) @MaxLength(500) arca_wsaa_url?: string;
  @IsOptional() @IsString() @IsIn([
    'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
    'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  ]) @MaxLength(500) arca_wsfe_url?: string;
  @IsOptional() @IsString() @MaxLength(150) provincia_fiscal?: string;
  @IsOptional() @IsString() @MaxLength(40) ingresos_brutos?: string;
  @IsOptional() @IsString() @MaxLength(20) fecha_inicio_actividades?: string;

  // DIAN (Colombia)
  @IsOptional() @IsBoolean() dianActivo?: boolean;
  @IsOptional() @IsString() @MaxLength(40) dianEnvironment?: string;
  @IsOptional() @IsString() @MaxLength(500) dianUrl?: string;
  @IsOptional() @IsString() @MaxLength(200) dianUsuario?: string;
  @IsOptional() @IsString() @MaxLength(500) dianPassword?: string;
  @IsOptional() @IsString() @MaxLength(200) dianSoftwareId?: string;
  @IsOptional() @IsString() @MaxLength(200) dianSoftwarePin?: string;
  @IsOptional() @IsString() @MaxLength(200) dianTestSetId?: string;
  @IsOptional() @IsString() @MaxLength(60) dianRegimenFiscal?: string;
  @IsOptional() @IsString() @MaxLength(60) dian_regimen_fiscal?: string;
  @IsOptional() @IsString() @MaxLength(60) dianTipoContribuyente?: string;
  @IsOptional() @IsString() @MaxLength(60) dian_tipo_contribuyente?: string;
  @IsOptional() @IsString() @MaxLength(60) dianResolucionNumero?: string;
  @IsOptional() @IsString() @MaxLength(20) dianResolucionPrefijo?: string;
  @IsOptional() @IsInt() @Min(0) dianResolucionDesde?: number;
  @IsOptional() @IsInt() @Min(0) dianResolucionHasta?: number;
  @IsOptional() @IsString() @MaxLength(20) dianResolucionFechaInicio?: string;
  @IsOptional() @IsString() @MaxLength(20) dianResolucionFechaFin?: string;
}
