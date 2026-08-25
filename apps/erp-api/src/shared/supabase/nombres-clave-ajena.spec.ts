import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Las consultas de PostgREST pueden nombrar la clave ajena para desambiguar el
 * embed:
 *
 *     .from('recepciones').select('orden:ordenes_compra!recepciones_orden_id_fkey_runtime(...)')
 *
 * Ese nombre es una dependencia real contra el esquema, y no se parece a una:
 * vive dentro de una cadena de texto, así que ni el compilador ni nadie avisa si
 * la restricción se renombra o se retira. Pasó: la migración 515 retiró claves
 * ajenas duplicadas conservando la de nombre canónico, siete consultas nombraban
 * la retirada, y producción respondió «Could not find a relationship ... in the
 * schema cache» con el listado de recepciones caído.
 *
 * Quien comprueba que esos nombres existen en la base es el verificador
 * `supabase/verify/516__nombres_de_clave_ajena_que_el_codigo_pide.sql`, que lleva
 * la lista escrita porque no puede leer TypeScript. Esta prueba es la otra mitad:
 * regenera la lista desde el código y falla si no coinciden, para que la del
 * verificador no se quede vieja en silencio.
 */

const RAIZ_API = resolve(__dirname, '..', '..');
const VERIFICADOR = resolve(
  RAIZ_API,
  '..',
  '..',
  '..',
  'supabase',
  'verify',
  '516__nombres_de_clave_ajena_que_el_codigo_pide.sql',
);

function ficherosTs(directorio: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(directorio)) {
    const ruta = join(directorio, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...ficherosTs(ruta));
    } else if (entrada.endsWith('.ts')) {
      salida.push(ruta);
    }
  }
  return salida;
}

function nombresEnElCodigo(): Set<string> {
  const nombres = new Set<string>();
  for (const fichero of ficherosTs(RAIZ_API)) {
    const fuente = readFileSync(fichero, 'utf8');
    for (const coincidencia of fuente.matchAll(/!([a-z][a-z0-9_]{6,})/g)) {
      const nombre = coincidencia[1];
      if (nombre === 'inner' || nombre === 'left') continue;
      if (!nombre.startsWith('fk_') && !nombre.includes('_fkey')) continue;
      nombres.add(nombre);
    }
  }
  return nombres;
}

function nombresEnElVerificador(): Set<string> {
  const sql = readFileSync(VERIFICADOR, 'utf8');
  const nombres = new Set<string>();
  for (const coincidencia of sql.matchAll(/^\s*\('([a-z0-9_]+)'\)[,;]?\s*$/gm)) {
    nombres.add(coincidencia[1]);
  }
  return nombres;
}

describe('nombres de clave ajena que el código pide a PostgREST', () => {
  it('todos están en la lista que el verificador 516 comprueba contra la base', () => {
    const enCodigo = [...nombresEnElCodigo()].sort();
    const enVerificador = nombresEnElVerificador();

    const sinVigilar = enCodigo.filter((n) => !enVerificador.has(n));

    expect({ sinVigilar }).toEqual({ sinVigilar: [] });
  });

  it('la lista del verificador no arrastra nombres que ya nadie usa', () => {
    const enCodigo = nombresEnElCodigo();
    const sobrantes = [...nombresEnElVerificador()]
      .filter((n) => !enCodigo.has(n))
      // El control positivo del propio verificador no está en el código a propósito.
      .filter((n) => !n.includes('control_positivo'))
      .sort();

    expect({ sobrantes }).toEqual({ sobrantes: [] });
  });

  it('el extractor encuentra algo: si dejara de encontrar, las dos pruebas pasarían sin mirar nada', () => {
    expect(nombresEnElCodigo().size).toBeGreaterThan(20);
    expect(nombresEnElVerificador().size).toBeGreaterThan(20);
  });
});
