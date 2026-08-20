import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { EVENTOS_SIN_SUSCRIPTOR, esEventoSinSuscriptor } from './eventos-sin-suscriptor';

/**
 * Las dos mitades del contrato tienen que comprobarse juntas, porque cada una
 * sola invita a romper la otra:
 *
 * - Los eventos declarados no deben ensuciar la cola de dead-letter.
 * - Todo lo demás debe seguir fallando cerrado si le falta el handler. Es la
 *   propiedad que impide que una integración se caiga en silencio.
 */
describe('eventos de outbox sin suscriptor', () => {
  it('declara los dos hitos de la migración 464', () => {
    expect(esEventoSinSuscriptor('demo.lista')).toBe(true);
    expect(esEventoSinSuscriptor('configuracion.wizard.completado')).toBe(true);
  });

  it('no exime a ningún evento de negocio', () => {
    for (const evento of [
      'documento.fiscal.generado',
      'comprobante.creado',
      'venta.procesada',
      'planilla.calculada',
      'email.send',
    ]) {
      expect(esEventoSinSuscriptor(evento)).toBe(false);
    }
  });

  it('tolera espacios y valores vacíos sin eximir de más', () => {
    expect(esEventoSinSuscriptor('  demo.lista  ')).toBe(true);
    expect(esEventoSinSuscriptor('')).toBe(false);
    expect(esEventoSinSuscriptor(undefined as unknown as string)).toBe(false);
  });

  it('cada evento declarado se emite de verdad desde alguna migración', () => {
    // Si un evento deja de emitirse, su excepción sobra y debe retirarse: una
    // lista de exenciones que nadie revisa acaba tapando defectos reales.
    const raiz = join(__dirname, '..', '..', '..', '..', '..');
    for (const evento of EVENTOS_SIN_SUSCRIPTOR) {
      const salida = execFileSync('git', ['grep', '-l', `'${evento}'`, '--', 'supabase/migrations'], {
        cwd: raiz,
        encoding: 'utf8',
      });
      expect(salida.trim().length).toBeGreaterThan(0);
    }
  });

  it('el worker consulta la lista antes de despachar', () => {
    const raiz = join(__dirname, '..', '..', '..', '..', '..');
    const worker = execFileSync(
      'git',
      ['grep', '-n', 'esEventoSinSuscriptor', '--', 'apps/erp-api/src/shared/outbox/outbox-worker.service.ts'],
      { cwd: raiz, encoding: 'utf8' },
    );
    expect(worker).toContain('esEventoSinSuscriptor(event.event_type)');
  });
});
