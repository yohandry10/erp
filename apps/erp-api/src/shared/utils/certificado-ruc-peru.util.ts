/**
 * Titularidad del certificado digital frente al RUC emisor.
 *
 * SUNAT firma cada comprobante con el certificado del contribuyente y rechaza
 * los que no le pertenecen. Un certificado puede cargar bien y estar vigente y
 * aun asi ser inservible por estar emitido a otro titular — el caso tipico es
 * subir el certificado de persona natural del representante en lugar del de la
 * empresa. Se aisla en un modulo puro para poder fijarlo con pruebas.
 */

import { validarRucPeru } from './documento-identidad-peru.util';

export interface ResultadoTitularidadCertificado {
  /** true solo si el RUC emisor aparece como titular del certificado. */
  coincide: boolean;
  /** RUCs validos hallados en el subject, para poder decirle al usuario cual trajo. */
  rucsEnCertificado: string[];
  /** Motivo del rechazo, redactado para mostrarse tal cual. */
  error?: string;
}

/**
 * Extrae los RUC del subject del certificado.
 *
 * El RUC no viene en un campo fijo: segun la ECEP aparece en `serialNumber`, en
 * `organizationIdentifier` (formato ETSI `PENIF-20601234567`) o dentro del
 * `commonName`. Por eso se buscan secuencias de once digitos en todo el subject
 * y se conservan solo las que son un RUC valido, lo que descarta series y
 * numeros de documento que casualmente midan once digitos.
 */
export function extraerRucsDeSubject(subject: string | null | undefined): string[] {
  const texto = String(subject ?? '');
  // (?<!\d) y (?!\d) evitan capturar once digitos dentro de un numero mas largo.
  const candidatos = texto.match(/(?<!\d)\d{11}(?!\d)/g) ?? [];

  const validos = candidatos.filter((candidato) => validarRucPeru(candidato).valido);

  return [...new Set(validos)];
}

/**
 * Comprueba que el certificado pertenezca al RUC con el que se va a emitir.
 */
export function verificarTitularidadCertificado(
  subject: string | null | undefined,
  rucEmisor: string | null | undefined,
): ResultadoTitularidadCertificado {
  const ruc = String(rucEmisor ?? '').trim();
  const rucsEnCertificado = extraerRucsDeSubject(subject);

  if (!ruc) {
    return {
      coincide: false,
      rucsEnCertificado,
      error:
        'Configura primero el RUC de la empresa: sin el no se puede comprobar que el certificado le pertenezca.',
    };
  }

  if (!validarRucPeru(ruc).valido) {
    return {
      coincide: false,
      rucsEnCertificado,
      error: `El RUC de la empresa (${ruc}) no es valido, asi que no se puede contrastar con el certificado.`,
    };
  }

  if (rucsEnCertificado.length === 0) {
    return {
      coincide: false,
      rucsEnCertificado,
      error:
        'El certificado no declara ningun RUC. SUNAT exige un certificado tributario emitido a nombre del contribuyente; el de persona natural sin RUC no sirve para emitir.',
    };
  }

  if (!rucsEnCertificado.includes(ruc)) {
    const hallados = rucsEnCertificado.join(', ');
    return {
      coincide: false,
      rucsEnCertificado,
      error: `El certificado esta emitido a ${hallados}, pero la empresa factura con ${ruc}. Necesitas el certificado de ese RUC.`,
    };
  }

  return { coincide: true, rucsEnCertificado };
}
