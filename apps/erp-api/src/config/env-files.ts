import * as path from 'path';

// Nunca cargar .env ni .env.local: podían conservar credenciales de DEV y
// hacer que una ejecución aparentemente válida operase sobre la base equivocada.
// Jest establece NODE_ENV=test y no debe leer secretos reales.
//
// pnpm cambia process.cwd() al directorio del paquete cuando se ejecuta
// `pnpm --filter erp-api start`. Por eso incluimos tanto la raíz actual como la
// raíz del workspace vista desde apps/erp-api. Todas las rutas son explícitas y
// sólo apuntan a .env.production.
export function resolveApiEnvFilePath(
  cwd = process.cwd(),
  nodeEnv = process.env.NODE_ENV,
): string[] {
  if (nodeEnv === 'test') return [];

  return [
    path.resolve(cwd, 'apps/erp-api/.env.production'),
    path.resolve(cwd, '.env.production'),
    path.resolve(cwd, '../../.env.production'),
  ];
}

export const apiEnvFilePath = resolveApiEnvFilePath();
