import { leerConsultaCompleta } from './consulta-completa';

describe('fuentes fiscales paginadas', () => {
  it('conserva la fila 1001 y consulta el final vacío si el corte es exacto', async () => {
    for (const cantidad of [1000, 1001, 2000]) {
      const filas = Array.from({ length: cantidad }, (_, id) => ({ id }));
      const range = jest.fn((desde, hasta) => Promise.resolve({ data: filas.slice(desde, hasta + 1), error: null }));
      const result = await leerConsultaCompleta(() => ({ range }));
      expect(result).toEqual({ data: filas, error: null });
      expect(range).toHaveBeenCalledTimes(Math.floor(cantidad / 1000) + 1);
    }
  });

  it('rechaza todo el resultado si una página posterior no se puede leer', async () => {
    const error = { message: 'almacenamiento temporalmente indisponible' };
    const range = jest.fn().mockResolvedValueOnce({ data: Array(1000).fill({}), error: null })
      .mockResolvedValueOnce({ data: null, error });
    expect(await leerConsultaCompleta(() => ({ range }))).toEqual({ data: null, error });
  });
});
