/** Catálogo51: la operación debe sobrevivir creación, snapshot y PDF. */
export function sunatOperation(value: any): string {
  return String(value?.tipo_operacion ?? value?.tipoOperacion
    ?? value?.metadata?.sunat_tipo_operacion ?? '0101').trim();
}
