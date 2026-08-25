import { readFileSync } from 'fs';
import { join } from 'path';
import { CUENTAS_OPERATIVAS_RUNTIME } from './plan-cuentas.service';

/**
 * `obtenerCuentasPorCodigos` es todo-o-nada: si un generador de asientos pide
 * una cuenta que el contribuyente no tiene y que tampoco esta en
 * `CUENTAS_OPERATIVAS_RUNTIME`, lanza y la operacion se queda sin contabilizar.
 *
 * El catalogo es la red que evita eso, y se queda corto en silencio: nadie se
 * entera hasta que un contribuyente concreto ejecuta un flujo concreto. Esta
 * prueba lee los codigos que los generadores piden de verdad y comprueba que el
 * catalogo los cubre.
 */
describe('el catalogo de cuentas cubre lo que piden los generadores', () => {
  const fuente = readFileSync(
    join(__dirname, 'asientos-generator.service.ts'),
    'utf8',
  );

  const codigosExigidos = (): string[] => {
    const codigos = new Set<string>();

    // `const codigos = ['4699'];` y `['68', '39']`
    for (const bloque of fuente.matchAll(/codigos(?:\s*=\s*|,\s*)\[([^\]]*)\]/g)) {
      for (const literal of bloque[1].matchAll(/'(\d{2,5})'/g)) codigos.add(literal[1]);
    }
    // `codigos.push('676')`
    for (const push of fuente.matchAll(/codigos\.push\('(\d{2,5})'\)/g)) codigos.add(push[1]);
    // `obtenerCuentasPorCodigos(tenantId, ['68', '39'])`
    for (const call of fuente.matchAll(/obtenerCuentasPorCodigos\([^)]*\[([^\]]*)\]/g)) {
      for (const literal of call[1].matchAll(/'(\d{2,5})'/g)) codigos.add(literal[1]);
    }
    return [...codigos].sort();
  };

  it('encuentra codigos en el generador, o la prueba no mide nada', () => {
    expect(codigosExigidos().length).toBeGreaterThan(10);
  });

  it('no exige ninguna cuenta que el catalogo no pueda crear', () => {
    const catalogo = new Set(Object.keys(CUENTAS_OPERATIVAS_RUNTIME));
    const sinCubrir = codigosExigidos().filter((codigo) => !catalogo.has(codigo));

    expect(sinCubrir).toEqual([]);
  });
});
