import { ContabilidadLibrosController } from './contabilidad-libros.controller';
import { PleExportService } from '../services/ple-export.service';

/**
 * El endpoint de exportacion PLE no tenia ninguna prueba: es el unico camino por
 * el que el contador baja los libros, y sus tres decisiones —libro desconocido,
 * error del servicio y exportacion parcial— son las que deciden si se entera de
 * lo que pasa o se queda mirando una pantalla muda.
 */
describe('ContabilidadLibrosController · exportación PLE', () => {
  const montar = (ple: Partial<PleExportService>) =>
    new ContabilidadLibrosController(
      null as any,
      null as any,
      ple as PleExportService,
    );

  it('devuelve el archivo del libro pedido', async () => {
    const archivo = { filename: 'LE...140100.TXT', content: '20260800|...|' };
    const controller = montar({
      exportarRegistroVentas: jest.fn(async () => archivo),
    });

    const res = await controller.exportarPle('registro-ventas', '2026', '8');

    expect(res.success).toBe(true);
    expect(res.data).toEqual([archivo]);
  });

  it('no inventa un libro que no existe', async () => {
    const controller = montar({});

    const res = await controller.exportarPle('libro-inventado', '2026', '8');

    expect(res.success).toBe(false);
    expect(res.message).toContain('libro-inventado');
    expect(res.data).toBeNull();
  });

  it('deja pasar el motivo real del fallo, no uno generico', async () => {
    // "RUC de empresa requerido" le dice al contador que le falta configurar;
    // un texto generico lo dejaria adivinando.
    const controller = montar({
      exportarRegistroCompras: jest.fn(async () => {
        throw new Error('RUC de empresa requerido para exportación PLE SUNAT');
      }),
    });

    const res = await controller.exportarPle('registro-compras', '2026', '8');

    expect(res.success).toBe(false);
    expect(res.message).toContain('RUC de empresa requerido');
  });

  it('entrega los libros que si salieron y nombra el que fallo', async () => {
    const buenos = [
      { filename: 'ventas.TXT', content: 'x' },
      { filename: 'compras.TXT', content: 'y' },
    ];
    const controller = montar({
      exportarTodosPLE: jest.fn(async () => ({
        archivos: buenos,
        fallidos: ['Libro Mayor 6.1: relación ambigua'],
      })),
    });

    const res = await controller.exportarPle('todos', '2026', '8');

    // Sigue siendo success: cuatro libros valen mas que ninguno. Pero el que
    // falto se dice, no se esconde.
    expect(res.success).toBe(true);
    expect(res.data).toEqual(buenos);
    expect(res.message).toContain('Libro Mayor 6.1');
  });

  it('no ensucia el mensaje cuando salen todos', async () => {
    const controller = montar({
      exportarTodosPLE: jest.fn(async () => ({
        archivos: [{ filename: 'a.TXT', content: '' }],
        fallidos: [],
      })),
    });

    const res = await controller.exportarPle('todos', '2026', '8');

    expect(res.success).toBe(true);
    expect(res.message).toBeUndefined();
  });

  it('pasa el periodo tal cual lo pidio el usuario', async () => {
    const exportar = jest.fn(async () => ({ filename: 'a.TXT', content: '' }));
    const controller = montar({ exportarLibroDiario: exportar });

    await controller.exportarPle('libro-diario', '2025', '12');

    expect(exportar).toHaveBeenCalledWith(2025, 12);
  });
});
