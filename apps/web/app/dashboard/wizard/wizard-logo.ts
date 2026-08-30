import type { WizardConfiguration } from './types'

/**
 * El archivo y su vista previa viven sólo en memoria del navegador. La
 * configuración principal nunca debe persistir un File serializado ni una URL
 * de logo; el archivo se envía después por el endpoint multipart de Storage.
 */
export function configurationWithoutLocalLogo(
  configuration: WizardConfiguration,
): Omit<WizardConfiguration, 'logoFile' | 'logoBase64' | 'logoUrl'> {
  const {
    logoFile: _logoFile,
    logoBase64: _logoBase64,
    logoUrl: _logoUrl,
    ...persistable
  } = configuration

  return persistable
}
