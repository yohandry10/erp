// Nunca cargar .env ni .env.local: podían conservar credenciales de DEV y
// hacer que una ejecución aparentemente válida operase sobre la base equivocada.
// Jest establece NODE_ENV=test y no debe leer secretos reales.
export const apiEnvFilePath = process.env.NODE_ENV === 'test'
  ? []
  : ['apps/erp-api/.env.production', '.env.production'];
