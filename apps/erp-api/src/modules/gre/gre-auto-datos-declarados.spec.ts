import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * La GRE automática no puede completar por su cuenta lo que se declara a SUNAT.
 *
 * El servicio derivaba el peso bruto del importe de la venta —«1 kg por cada
 * S/ 100»— y fijaba la fecha de traslado en «mañana». Ninguno de los dos sale de
 * un dato real: `productos` no tiene columna de peso, así que no había de dónde
 * deducirlo. El camino legado además componía el destinatario como
 * `Cliente <uuid>`, de modo que el documento habría viajado con un identificador
 * interno en lugar de un nombre.
 *
 * Estaba latente: de las treinta guías emitidas en producción ninguna salió por
 * ahí, y el único contribuyente con la creación automática activa es una demo.
 * Pero se dispara en cuanto alguien real la habilite.
 *
 * Estas comprobaciones son sobre el texto del servicio a propósito: lo que hay
 * que impedir es que la fabricación **vuelva** a aparecer, y eso no lo detecta
 * una prueba de comportamiento sobre el camino que hoy ya falla cerrado.
 */
describe('GRE automática: nada declarado se inventa', () => {
  const raiz = join(__dirname, '..', '..', '..', '..', '..');
  const servicio = 'apps/erp-api/src/modules/gre/gre.service.ts';

  function buscar(patron: string): string[] {
    try {
      return execFileSync('git', ['grep', '-n', '-E', patron, '--', servicio], {
        cwd: raiz,
        encoding: 'utf8',
      })
        .split('\n')
        .filter(Boolean);
    } catch (error: any) {
      if (error.status === 1) return [];
      throw error;
    }
  }

  it('no deriva el peso del importe de la venta', () => {
    expect(buscar('calcularPesoEstimado|pesoEstimado')).toEqual([]);
  });

  it('no fija la fecha de traslado sumando horas al reloj', () => {
    expect(buscar('fechaTraslado: new Date\\(Date\\.now')).toEqual([]);
  });

  it('no usa el identificador del cliente como destinatario', () => {
    expect(buscar('destinatario: `Cliente \\$\\{')).toEqual([]);
  });

  it('el validador exige el peso y la fecha, no sólo el destinatario', () => {
    const validador = buscar("missing\\.push\\('");
    const textos = validador.join(' ');
    expect(textos).toContain('destinatario real');
    expect(textos).toContain('peso bruto declarado');
    expect(textos).toContain('fecha de inicio de traslado');
  });

  it('los dos caminos automáticos pasan por el validador', () => {
    // El legado nacía sin ninguna comprobación; el nuevo ya la tenía.
    expect(buscar('assertAutoGreSaleDataValida\\(').length).toBeGreaterThanOrEqual(3);
  });
});
