import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ServiceUnavailableException } from '@nestjs/common';
import { perfilPaisDelTenant } from './pais-del-tenant';
import { ACTIVE_COUNTRY_CODES, ACTIVE_COUNTRY_PROFILES } from '../paises/initial-country';

/**
 * Ningún contribuyente es peruano por descarte.
 *
 * «¿De qué país es este tenant?» tenía cuatro respuestas independientes
 * —`fiscal-adapter`, `cpe-helper`, `pdf-generator` y `proveedores`— y las cuatro
 * contestaban Perú cuando no lo sabían. `fiscal-adapter` además cacheaba esa
 * respuesta, así que un fallo momentáneo de lectura dejaba al contribuyente
 * convertido en peruano durante toda la vida del proceso.
 *
 * El país decide el documento de identidad, la autoridad, el impuesto, la moneda
 * y el formato del comprobante. Equivocarse produce un documento con buen
 * aspecto y reglas de otro país, que es la peor forma de fallar en algo que va
 * firmado a una administración tributaria.
 */
describe('perfilPaisDelTenant', () => {
  const cliente = (respuesta: { data?: unknown; error?: unknown }) => ({
    from: () => {
      const cadena: any = {
        select: () => cadena,
        eq: () => cadena,
        maybeSingle: async () => ({ data: respuesta.data ?? null, error: respuesta.error ?? null }),
      };
      return cadena;
    },
  });

  it('resuelve por pais_id', async () => {
    const perfil = await perfilPaisDelTenant(cliente({ data: { pais_id: 5 } }), 't');
    expect(perfil.codigo).toBe('AR');
    expect(perfil.autoridadFiscal).toBe('ARCA');
    expect(perfil.moneda).toBe('ARS');
  });

  it('resuelve por código ISO cuando la fila sólo trae `pais`', async () => {
    const perfil = await perfilPaisDelTenant(cliente({ data: { pais: 'co' } }), 't');
    expect(perfil.codigo).toBe('CO');
    expect(perfil.autoridadFiscal).toBe('DIAN');
  });

  it('no supone Perú cuando la empresa no tiene configuración', async () => {
    await expect(perfilPaisDelTenant(cliente({ data: null }), 't')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('no supone Perú cuando el país no está soportado', async () => {
    await expect(perfilPaisDelTenant(cliente({ data: { pais: 'CL' } }), 't')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('no supone Perú cuando la lectura falla', async () => {
    await expect(
      perfilPaisDelTenant(cliente({ error: { message: 'timeout' } }), 't'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

/**
 * Las tablas de autoridad fiscal estaban repetidas en `cpe-helper`,
 * `pdf-format-helper`, el `switch` de `fiscal-adapter` y un ternario del pie del
 * PDF. Derivaron: tres de las cuatro se habían quedado sin Argentina mientras
 * listaban Chile, México y Ecuador, que no son países soportados. Un comprobante
 * argentino imprimía «Autoridad Fiscal».
 */
describe('autoridad fiscal', () => {
  it('cubre los tres países soportados', () => {
    expect(ACTIVE_COUNTRY_CODES.map((c) => ACTIVE_COUNTRY_PROFILES[c].autoridadFiscal).sort()).toEqual(
      ['ARCA', 'DIAN', 'SUNAT'],
    );
  });

  it('ya no quedan tablas de autoridades paralelas en el módulo cpe', () => {
    // `git grep` sale con código 1 cuando no encuentra nada, que aquí es el caso
    // bueno: hay que distinguirlo de un fallo real en lugar de dejar que la
    // excepción tumbe la prueba (o, peor, que la deje pasar sin haber medido).
    const buscar = (patron: string, ruta: string): string[] => {
      try {
        const salida = execFileSync('git', ['grep', '-l', '-E', '-e', patron, '--', ruta], {
          cwd: join(__dirname, '..', '..', '..'),
          encoding: 'utf8',
        });
        return salida.split(/\r?\n/).filter(Boolean);
      } catch (error: any) {
        if (error?.status === 1) return [];
        throw error;
      }
    };

    // Control: el buscador encuentra algo que sí existe. Sin esto no sabríamos si
    // la lista vacía significa «limpio» o «la búsqueda no funciona».
    expect(buscar('autoridadFiscal', 'src/modules/cpe')).not.toHaveLength(0);

    expect(buscar("'(SII|SAT|SRI)'", 'src/modules/cpe')).toEqual([]);
  });
});
