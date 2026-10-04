import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { filtrosConPeriodo, lecturaContableFallida, periodoContable } from './contabilidad-errors';

describe('contabilidad-errors', () => {
  it('una lectura fallida es 503, no un reporte vacío', () => {
    expect(lecturaContableFallida({ code: '42501', message: 'permission denied for table asientos_contables' }, 'el Libro Diario').getStatus()).toBe(503);
    expect(lecturaContableFallida(new Error('fetch failed'), 'el Libro Diario').getStatus()).toBe(503);
  });

  it('conserva las excepciones HTTP y distingue inexistente e identificador inválido', () => {
    const prohibido = new ForbiddenException();
    expect(lecturaContableFallida(prohibido, 'x')).toBe(prohibido);
    expect(lecturaContableFallida({ code: 'PGRST116' }, 'el asiento').getStatus()).toBe(404);
    expect(lecturaContableFallida({ code: '22P02' }, 'el asiento').getStatus()).toBe(400);
  });

  it('valida anio y mes juntos', () => {
    expect(periodoContable(undefined, undefined)).toBeNull();
    expect(periodoContable('2026', '10')).toEqual({ anio: 2026, mes: 10 });
    for (const [anio, mes] of [['2026', '13'], ['2026', '0'], ['2026', undefined], [undefined, '5'], ['dos', '5'], ['2026', '1.5']]) {
      expect(() => periodoContable(anio, mes)).toThrow(BadRequestException);
    }
  });

  it('traduce el período al rango del mes sin pisar fechas explícitas', () => {
    expect(filtrosConPeriodo({ anio: '2024', mes: '2' })).toMatchObject({ fechaDesde: '2024-02-01', fechaHasta: '2024-02-29' });
    expect(filtrosConPeriodo({ anio: '2026', mes: '10', fechaDesde: '2026-10-15' })).toMatchObject({ fechaDesde: '2026-10-15', fechaHasta: '2026-10-31' });
    expect(filtrosConPeriodo({ fechaDesde: '2026-01-01' })).toEqual({ fechaDesde: '2026-01-01' });
    expect(() => filtrosConPeriodo({ anio: '2026', mes: '13' })).toThrow(BadRequestException);
  });
});
