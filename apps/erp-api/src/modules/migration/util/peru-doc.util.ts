/**
 * Valida formato y dígito verificador SUNAT para RUC peruano.
 * Devuelve null si OK, o string con razón de error.
 */
export function validateRuc(ruc: string): string | null {
  if (!/^\d{11}$/.test(ruc)) return 'RUC debe tener 11 dígitos numéricos';
  const prefijo = ruc.substring(0, 2);
  if (!['10', '15', '17', '20'].includes(prefijo)) {
    return `Prefijo RUC inválido (${prefijo}). Debe iniciar con 10, 15, 17 o 20`;
  }
  const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digitos = ruc.split('').map(Number);
  const suma = factores.reduce((acc, f, i) => acc + f * digitos[i], 0);
  const resto = 11 - (suma % 11);
  const dv = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  if (dv !== digitos[10]) return 'RUC inválido: dígito verificador no coincide';
  return null;
}

export function validateDni(dni: string): string | null {
  if (!/^\d{8}$/.test(dni)) return 'DNI debe tener 8 dígitos numéricos';
  return null;
}

export function validateDocumento(tipo: string, numero: string): string | null {
  const t = String(tipo || '').toUpperCase().trim();
  const n = String(numero || '').trim();
  if (t === 'RUC') return validateRuc(n);
  if (t === 'DNI') return validateDni(n);
  if (t === 'CE' || t === 'PAS' || t === 'CEX' || t === 'PASAPORTE') {
    if (!n || n.length < 4 || n.length > 20) return 'Documento inválido (4-20 caracteres)';
    return null;
  }
  return `Tipo de documento no soportado: ${tipo}`;
}

export function toSafeIntegerDocumento(documento: string): number | null {
  if (!/^\d+$/.test(documento)) return null;
  const parsed = Number(documento);
  return Number.isSafeInteger(parsed) && parsed <= 2147483647 ? parsed : null;
}
