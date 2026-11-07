import { ContabilidadLibrosController } from './contabilidad-libros.controller';

describe('PLE: selector cerrado a los libros declarados', () => {
  const books = [
    ['registro-ventas', 'exportarRegistroVentas'],
    ['registro-compras', 'exportarRegistroCompras'],
    ['libro-diario', 'exportarLibroDiario'],
    ['libro-mayor', 'exportarLibroMayor'],
    ['balance-comprobacion', 'exportarBalanceComprobacion'],
  ];
  let exporters: Record<string, jest.Mock>;
  let controller: ContabilidadLibrosController;
  beforeEach(() => {
    exporters = Object.fromEntries(books.map(([, method]) => [method, jest.fn().mockResolvedValue({ filename: method + '.txt', content: 'original' })]));
    exporters.exportarTodosPLE = jest.fn().mockResolvedValue({ archivos: [{ filename: 'ventas.txt', content: 'original' }], fallidos: ['compras no disponible'] });
    controller = new ContabilidadLibrosController({} as any, {} as any, exporters as any);
  });

  it.each(['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'desconocido'])(
    'rechaza %s como libro desconocido, sin devolver un archivo inventado', async book => {
      expect(await controller.exportarPle(book, '2026', '11')).toEqual({
        success: false, message: `Libro PLE no reconocido: ${book}`, data: null,
      });
      for (const exporter of Object.values(exporters)) expect(exporter).not.toHaveBeenCalled();
    },
  );
  it.each(books)('conserva el libro %s y sus argumentos originales', async (book, method) => {
    expect(await controller.exportarPle(book, '2026', '11')).toEqual({ success: true, data: [{ filename: method + '.txt', content: 'original' }] });
    expect(exporters[method]).toHaveBeenCalledWith(2026, 11);
    expect(Object.values(exporters).filter(fn => fn.mock.calls.length)).toHaveLength(1);
  });
  it('conserva la advertencia de un lote con libros fallidos', async () => {
    expect(await controller.exportarPle('todos', '2026', '11')).toEqual({
      success: true, data: [{ filename: 'ventas.txt', content: 'original' }], message: 'No se pudieron generar: compras no disponible',
    });
    expect(exporters.exportarTodosPLE).toHaveBeenCalledWith(2026, 11);
  });
});
