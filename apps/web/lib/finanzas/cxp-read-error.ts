export function cxpReadError(error: any): { error: string; retryable: boolean } {
  if (error?.status === 403) return { error: 'No tienes permiso para consultar esta cuenta por pagar. Solicita acceso al administrador de tu empresa.', retryable: false };
  if (error?.status === 404) return { error: 'No se encontró esta cuenta por pagar en tu empresa. Vuelve al listado y selecciona un documento disponible.', retryable: false };
  if (error?.status === 401) return { error: 'Tu sesión no permite consultar esta cuenta por pagar. Vuelve a iniciar sesión.', retryable: false };
  return { error: 'No se pudo consultar la información completa de la cuenta por pagar. Reintenta para recuperar los datos actuales.', retryable: true };
}
