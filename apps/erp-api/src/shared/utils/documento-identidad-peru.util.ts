/**
 * Validación de documentos de identidad peruanos (SUNAT, Catálogo 06).
 *
 * Se aísla en un módulo puro para poder fijarla con pruebas y reutilizarla desde
 * clientes, proveedores y cualquier alta que después alimente un comprobante: un
 * documento inválido guardado hoy es un CPE rechazado por SUNAT mañana.
 */

export type TipoDocumentoIdentidad = 'DNI' | 'RUC' | 'CE' | 'PASAPORTE';

export interface ResultadoValidacionDocumento {
  valido: boolean;
  /** Motivo del rechazo, listo para mostrarse al usuario. */
  error?: string;
}

/**
 * Dígito verificador del RUC según el módulo 11 que usa SUNAT.
 * Los factores se aplican a los diez primeros dígitos.
 */
export function digitoVerificadorRuc(ruc: string): number | null {
  if (!/^[0-9]{11}$/.test(ruc)) return null;

  const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digitos = ruc.split('').map(Number);
  const suma = factores.reduce((acc, factor, i) => acc + factor * digitos[i], 0);
  const resto = 11 - (suma % 11);

  return resto === 10 ? 0 : resto === 11 ? 1 : resto;
}

/** Prefijos de RUC que SUNAT tiene asignados. */
export const PREFIJOS_RUC_VALIDOS = ['10', '15', '17', '20'];

export function validarRucPeru(numero: string): ResultadoValidacionDocumento {
  const ruc = String(numero ?? '').trim();

  if (!/^[0-9]{11}$/.test(ruc)) {
    return { valido: false, error: 'El RUC debe tener exactamente 11 dígitos' };
  }

  const prefijo = ruc.substring(0, 2);
  if (!PREFIJOS_RUC_VALIDOS.includes(prefijo)) {
    return {
      valido: false,
      error: `Prefijo de RUC inválido: ${prefijo}. Debe iniciar con ${PREFIJOS_RUC_VALIDOS.join(', ')}`,
    };
  }

  if (digitoVerificadorRuc(ruc) !== Number(ruc[10])) {
    return { valido: false, error: 'RUC inválido: dígito verificador no coincide' };
  }

  return { valido: true };
}

/**
 * Valida el número según el tipo declarado. El carné de extranjería y el
 * pasaporte no tienen dígito verificador verificable localmente, así que sólo se
 * comprueba su forma.
 */
export function validarDocumentoIdentidad(
  tipo: string | null | undefined,
  numero: string | null | undefined,
): ResultadoValidacionDocumento {
  const valor = String(numero ?? '').trim();
  const tipoNormalizado = String(tipo ?? '').trim().toUpperCase();

  if (!valor) {
    return { valido: false, error: 'El número de documento es requerido' };
  }

  switch (tipoNormalizado) {
    case 'RUC':
      return validarRucPeru(valor);

    case 'DNI':
      return /^[0-9]{8}$/.test(valor)
        ? { valido: true }
        : { valido: false, error: 'El DNI debe tener exactamente 8 dígitos' };

    case 'CE':
      return /^[0-9A-Z]{8,12}$/.test(valor)
        ? { valido: true }
        : { valido: false, error: 'El carné de extranjería debe tener entre 8 y 12 caracteres alfanuméricos' };

    case 'PASAPORTE':
      return /^[0-9A-Z]{6,12}$/.test(valor)
        ? { valido: true }
        : { valido: false, error: 'El pasaporte debe tener entre 6 y 12 caracteres alfanuméricos' };

    default:
      return { valido: false, error: `Tipo de documento no reconocido: ${tipo}` };
  }
}
