// HARDENING: banderas de características para controlar módulos incompletos en producción.
// Se leen en runtime porque ConfigModule carga `.env` después de que algunos guards
// pueden haber sido importados por Nest/Jest.
export const isFeatureFlagEnabled = (envName: string, defaultEnabled = false): boolean => {
  const value = process.env[envName];

  if (value === undefined || value === '') {
    return defaultEnabled;
  }

  return value.toLowerCase() === 'true';
};

// POS y RRHH forman parte del producto operativo y del contrato de datos del
// demo. Quedan habilitados por defecto y conservan un kill switch explícito
// (`FEATURE_*_ENABLED=false`) para incidentes.
export const isRrhhEnabled = (): boolean => isFeatureFlagEnabled('FEATURE_RRHH_ENABLED', true);
export const isPosEnabled = (): boolean => isFeatureFlagEnabled('FEATURE_POS_ENABLED', true);
export const isInventarioEnabled = (): boolean =>
  isFeatureFlagEnabled('FEATURE_INVENTARIO_ENABLED', true);

export const isProduction = (): boolean => process.env.NODE_ENV === 'production';
