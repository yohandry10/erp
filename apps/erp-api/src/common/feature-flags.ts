// HARDENING: banderas de características para controlar módulos incompletos en producción.
console.log('🔍 FEATURE_POS_ENABLED env:', process.env.FEATURE_POS_ENABLED);
export const FEATURE_RRHH_ENABLED = process.env.FEATURE_RRHH_ENABLED === 'true';
export const FEATURE_POS_ENABLED = process.env.FEATURE_POS_ENABLED === 'true';
console.log('🔍 FEATURE_POS_ENABLED value:', FEATURE_POS_ENABLED);
export const FEATURE_INVENTARIO_ENABLED =
  process.env.FEATURE_INVENTARIO_ENABLED === undefined
    ? true
    : process.env.FEATURE_INVENTARIO_ENABLED === 'true';

export const isProduction = (): boolean => process.env.NODE_ENV === 'production';
