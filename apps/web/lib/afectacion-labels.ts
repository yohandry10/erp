/**
 * Cómo se nombra en cada país una operación que no paga el impuesto.
 *
 * En Perú una venta sin IGV es "exonerada" cuando el bien está en el Apéndice I
 * de la Ley del IGV, e "inafecta" cuando queda fuera del ámbito del impuesto.
 * "Exento" no existe en el vocabulario de SUNAT: es el término argentino, y
 * Colombia usa "excluido". Mostrar "exento" a un contador peruano lo obliga a
 * traducir para saber qué casilla le toca.
 */
export function etiquetaSinImpuesto(paisCodigo?: string): string {
  switch ((paisCodigo || "PE").toUpperCase()) {
    case "AR":
      return "Exento";
    case "CO":
      return "Excluido";
    default:
      return "Exonerado";
  }
}

/** Afectación 30: la operación queda fuera del ámbito del impuesto. */
export function etiquetaNoGravado(paisCodigo?: string): string {
  return (paisCodigo || "PE").toUpperCase() === "PE" ? "Inafecto" : "No gravado";
}
