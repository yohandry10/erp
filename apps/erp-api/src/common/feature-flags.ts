// HARDENING: banderas de características para controlar módulos incompletos en producción.
export const FEATURE_RRHH_ENABLED = process.env.FEATURE_RRHH_ENABLED === 'true';
export const FEATURE_POS_ENABLED = process.env.FEATURE_POS_ENABLED === 'true';

export const isProduction = (): boolean => process.env.NODE_ENV === 'production';
