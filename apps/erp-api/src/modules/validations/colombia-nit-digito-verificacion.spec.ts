import { ColombiaValidationService } from './colombia-validation.service';

/**
 * Dígito de verificación del NIT colombiano, contra NIT reales.
 *
 * Los pesos de la DIAN se aplican del dígito más a la derecha hacia la
 * izquierda empezando por 3. Estaban en orden inverso —el último dígito pesaba
 * 71—, de modo que el verificador salía mal y sólo coincidía por casualidad:
 * de estos cuatro NIT acertaba uno.
 *
 * Se comprueba con contribuyentes reales y públicos en vez de con valores
 * inventados: un dígito de verificación sólo se puede validar contra la
 * respuesta que da la autoridad, no contra la propia fórmula.
 */
describe('NIT colombiano: dígito de verificación', () => {
  const servicio = new ColombiaValidationService();

  // NIT públicos y su DV oficial.
  const conocidos: Array<[string, string, string]> = [
    ['890903938', '8', 'Bancolombia'],
    ['899999068', '1', 'Ecopetrol'],
    ['800197268', '4', 'DIAN'],
    ['830053812', '2', 'Claro'],
  ];

  it.each(conocidos)('acepta %s-%s (%s)', (base, dv) => {
    expect(servicio.validateNIT(`${base}-${dv}`).isValid).toBe(true);
  });

  it.each(conocidos)('rechaza %s con un dígito equivocado', (base, dv) => {
    const otro = String((Number(dv) + 1) % 10);
    expect(servicio.validateNIT(`${base}-${otro}`).isValid).toBe(false);
  });

  it('no exige dígito de verificación cuando no se envía', () => {
    // El formato sin DV es válido: SUNAT y DIAN aceptan ambas escrituras.
    expect(servicio.validateNIT('890903938').isValid).toBe(true);
  });
});
