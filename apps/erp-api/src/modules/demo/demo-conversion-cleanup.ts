/**
 * Fixtures del demo que no pueden sobrevivir a la conversión a cuenta real.
 *
 * El seed del demo deja en `empresa_config` un certificado de demostración
 * (`certs/demo.pfx`, emitido al RUC del demo) y las credenciales SOL de pruebas
 * de SUNAT (`20123456786MODDATOS` / `MODDATOS`). Al convertir, el RUC y la razón
 * social pasaban a ser los del cliente pero esos fixtures se quedaban: el tenant
 * acababa con el RUC real y las credenciales de otro, emitiendo contra beta sin
 * que nada lo dijera.
 *
 * Colombia ya se preparaba con `prepare_colombia_real_onboarding`. Perú no tenía
 * equivalente, y este es el suyo.
 *
 * Se devuelve un objeto plano en vez de ejecutar el UPDATE aquí para que la
 * limpieza viaje en la misma sentencia que escribe los datos del cliente: en dos
 * sentencias, un fallo entre medias dejaría la cuenta ya marcada como real pero
 * todavía con las credenciales del demo.
 */
export function camposALimpiarEnConversionReal(): Record<string, unknown> {
  return {
    certificado_pfx: null,
    certificado_password: null,
    sunat_username: null,
    sunat_password: null,
    // El certificado del cliente aún no existe, así que tampoco puede haber un
    // RUC esperado ni una confirmación de discrepancia heredada del demo.
    sunat_cert_expected_ruc: null,
    sunat_cert_ruc_mismatch_confirmed: false,
    sunat_cert_ruc_mismatch_reason: null,
    // SUNAT exige homologar antes de producción: la conversión no asciende el
    // entorno, solo deja de mentir sobre lo que hay configurado.
    sunat_environment: 'homologacion',
    configuracion_completa: false,
  };
}
