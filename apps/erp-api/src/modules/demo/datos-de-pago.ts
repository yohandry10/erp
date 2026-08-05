/**
 * Datos a los que el cliente transfiere para activar su cuenta.
 *
 * Van por variables de entorno con los valores reales como respaldo: así el
 * sistema funciona recién clonado y a la vez se pueden cambiar sin tocar código
 * el día que cambie la cuenta.
 */
export interface DatosDePago {
  titular: string;
  banco: string;
  cuenta: string;
  cci: string;
  moneda: string;
  whatsapp: string;
  whatsappUrl: string;
  email: string;
}

/** El número tal cual lo marca un peruano; para wa.me hace falta el 51 delante. */
const WHATSAPP_LOCAL = process.env.PAGO_WHATSAPP || '901963051';

export function obtenerDatosDePago(referencia?: {
  razonSocial?: string;
  ruc?: string;
  monto?: number;
}): DatosDePago {
  // El mensaje llega escrito para que el comprobante no aparezca huérfano: con
  // la razón social y el RUC delante se sabe a qué solicitud corresponde.
  const partes = ['Hola, acabo de solicitar mi cuenta en el ERP.'];
  if (referencia?.razonSocial) partes.push(`Empresa: ${referencia.razonSocial}.`);
  if (referencia?.ruc) partes.push(`RUC: ${referencia.ruc}.`);
  if (referencia?.monto) partes.push(`Monto transferido: S/ ${referencia.monto.toFixed(2)}.`);
  partes.push('Adjunto el comprobante de la transferencia.');

  return {
    titular: process.env.PAGO_TITULAR || 'NEXTELCO SACS',
    banco: process.env.PAGO_BANCO || 'Interbank',
    cuenta: process.env.PAGO_CUENTA || '376-3008499815',
    cci: process.env.PAGO_CCI || '003-376-003008499815-19',
    moneda: process.env.PAGO_MONEDA || 'Cuenta Corriente Soles',
    whatsapp: WHATSAPP_LOCAL,
    whatsappUrl: `https://wa.me/51${WHATSAPP_LOCAL.replace(/\D/g, '')}?text=${encodeURIComponent(partes.join(' '))}`,
    email: process.env.PAGO_EMAIL || 'operaciones@nextelco.cloud',
  };
}
