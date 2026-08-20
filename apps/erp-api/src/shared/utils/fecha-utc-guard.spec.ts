import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Guardián contra la reintroducción de fechas UTC en lógica de negocio.
 *
 * La migración 370 arregló esto del lado de la base y documentó el efecto: con el
 * servidor en UTC, pasadas las 19:00 de Lima el sistema ya cree estar en la fecha
 * siguiente. Una cuenta se marca vencida cinco horas antes y un documento nace con
 * la fecha del día siguiente, empujado al periodo tributario equivocado. Todo lo
 * que se calculaba en Node seguía en UTC, así que el arreglo de la base convivía
 * con la aplicación contradiciéndola.
 *
 * `new Date().toISOString().split('T')[0]` es el patrón exacto que lo produce. Se
 * permite sólo donde la fecha no decide ni se persiste: nombres de archivo, y el
 * servicio contable que no está conectado a nada.
 */

// Dos variantes, y la segunda es la que se escapó primero. `new Date()` sin
// argumento fecha «hoy» en UTC; `new Date(valor)` convierte un timestamptz ya
// guardado y lo presenta en UTC. Las dos muestran el día equivocado al sur de
// Greenwich, y la segunda se detectó en producción: a las 20:15 de Lima el
// listado de CPE mostraba una factura fechada al día siguiente.
const PATRON = String.raw`new Date(.*)\.toISOString()\.split('T')\[0\]`;

/**
 * Excepciones justificadas. Cualquier archivo nuevo que aparezca aquí debe
 * revisarse: si la fecha decide algo o se guarda, usa `fecha-tenant.util`.
 */
const PERMITIDOS = new Map<string, string>([
  [
    'modules/finanzas/bancos/bancos.service.ts',
    'nombre del archivo CSV exportado; no decide ni se persiste',
  ],
  [
    'modules/reports.controller.ts',
    'nombre del archivo XLSX exportado; no decide ni se persiste',
  ],
  [
    'modules/contabilidad/services/centros-costo.service.ts',
    'inicio de año por defecto de un reporte; el fin sí usa la fecha del tenant',
  ],
  [
    'modules/rrhh/planillas.service.ts',
    'respaldo inalcanzable: el periodo se valida como YYYY-MM antes de llegar aquí',
  ],
]);

describe('fechas UTC en lógica de negocio', () => {
  it('sólo permanecen en los sitios donde la fecha no decide ni se guarda', () => {
    const raiz = path.resolve(__dirname, '../..');

    let salida = '';
    try {
      // execFileSync sin shell: el patrón viaja como argumento, así que ni las
      // comillas ni los corchetes dependen del intérprete de cada sistema.
      salida = execFileSync(
        'git',
        ['grep', '-l', '-e', PATRON, '--', 'src'],
        { cwd: path.resolve(raiz, '..'), encoding: 'utf8' },
      );
    } catch (error: any) {
      // `git grep` sale con 1 cuando no hay coincidencias: es el caso ideal.
      if (error?.status === 1) salida = '';
      else throw error;
    }

    const encontrados = salida
      .split('\n')
      .map((linea) => linea.trim())
      .filter(Boolean)
      .map((linea) => linea.replace(/^src\//, ''))
      .filter((archivo) => !archivo.endsWith('.spec.ts'));

    const noPermitidos = encontrados.filter((archivo) => !PERMITIDOS.has(archivo));

    expect(noPermitidos).toEqual([]);
  });

  it('la lista de excepciones no crece sin justificación', () => {
    // Si esto falla es porque se añadió una excepción: cada entrada debe explicar
    // por qué esa fecha no necesita la zona del tenant.
    expect(PERMITIDOS.size).toBe(4);
    for (const [, motivo] of PERMITIDOS) {
      expect(motivo.length).toBeGreaterThan(20);
    }
  });
});
