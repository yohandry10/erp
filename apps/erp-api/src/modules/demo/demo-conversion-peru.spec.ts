/**
 * Al pasar de demo a cuenta real, el tenant se queda con lo que sembró el demo
 * salvo que alguien lo limpie. Colombia tiene su RPC de preparación; Perú no
 * tenía nada, así que el cliente convertido heredaba el certificado de
 * demostración y las credenciales SOL de pruebas de SUNAT junto a su RUC real.
 *
 * Aquí se fija qué debe quedar borrado, que es lo que decide si ese cliente
 * puede facturar de verdad o se queda emitiendo contra beta sin saberlo.
 */
import { camposALimpiarEnConversionReal } from './demo-conversion-cleanup';

describe('Conversión demo → cuenta real (Perú)', () => {
  const limpieza = camposALimpiarEnConversionReal();

  it('borra el certificado de demostración', () => {
    // El PFX del demo lleva el RUC del demo. Conservarlo junto al RUC real del
    // cliente es la receta para que SUNAT rechace todo sin explicar por qué.
    expect(limpieza).toHaveProperty('certificado_pfx', null);
    expect(limpieza).toHaveProperty('certificado_password', null);
  });

  it('borra las credenciales SOL de pruebas', () => {
    // "20123456786MODDATOS" lleva incrustado el RUC del demo: con el RUC real
    // del cliente, SUNAT las rechaza por no corresponder.
    expect(limpieza).toHaveProperty('sunat_username', null);
    expect(limpieza).toHaveProperty('sunat_password', null);
  });

  it('marca la configuración como incompleta para que el sistema la pida', () => {
    expect(limpieza).toHaveProperty('configuracion_completa', false);
  });

  it('deja el entorno en homologación, no lo asciende solo', () => {
    // SUNAT exige homologar antes de producción: ascender en la conversión
    // pondría al cliente a emitir en real sin haber pasado las pruebas.
    expect(limpieza.sunat_environment).toBe('homologacion');
  });

  it('no toca los datos que el cliente acaba de dar', () => {
    // El RUC, la razón social y el teléfono llegan del formulario de conversión;
    // si la limpieza los incluyera, los borraría justo después de guardarlos.
    expect(limpieza).not.toHaveProperty('ruc');
    expect(limpieza).not.toHaveProperty('razon_social');
    expect(limpieza).not.toHaveProperty('telefono');
  });
});
