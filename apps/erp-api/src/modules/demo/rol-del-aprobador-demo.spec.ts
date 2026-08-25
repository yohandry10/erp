import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROL_DEL_APROBADOR_DEMO } from './demo.service';

/**
 * La demo se siembra con dos usuarios. El segundo existe para el flujo de
 * aprobación de una orden de compra, que exige que quien aprueba no sea quien
 * la creó.
 *
 * Durante meses ese segundo usuario se enlazó al rol `ADMIN`, así que la demo
 * nacía con **dos administradores completos**. El efecto se ve al venderla: un
 * cliente en periodo de prueba entra con la segunda cuenta para comprobar que
 * los roles separan, ve exactamente lo mismo que con la primera y concluye que
 * no separan nada. La segregación la da que el aprobador sea otra persona, no
 * que tenga más poderes.
 *
 * Esta prueba fija las dos mitades: el rol elegido y que el código lo use.
 */

const FUENTE = readFileSync(join(__dirname, 'demo.service.ts'), 'utf8');

describe('rol del segundo usuario de la demo', () => {
  it('no es ADMIN: la demo no puede nacer con dos administradores', () => {
    expect(ROL_DEL_APROBADOR_DEMO).not.toBe('ADMIN');
    expect(ROL_DEL_APROBADOR_DEMO).not.toBe('ADMIN_DEMO');
  });

  it('es COMPRAS, que es el rol con `compras.ordenes.aprobar` y poco más', () => {
    expect(ROL_DEL_APROBADOR_DEMO).toBe('COMPRAS');
  });

  it('el enlace del usuario usa la constante y no un nombre escrito a mano', () => {
    // Si alguien vuelve a poner .eq("nombre", "ADMIN") la constante seguiría
    // valiendo COMPRAS y las dos pruebas de arriba pasarían sin enterarse.
    const enlace = FUENTE.slice(FUENTE.indexOf('aprobador rol'));
    expect(enlace.length).toBeGreaterThan(0);
    expect(FUENTE).toContain('.eq("nombre", ROL_DEL_APROBADOR_DEMO)');
    expect(FUENTE).not.toContain('.eq("nombre", "ADMIN")');
  });
});
