import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProgramacionPagosQueryDto } from '../finanzas/tesoreria/dto/programacion-pagos-query.dto';
import { UserFiltersDto } from '../usuarios/dto/user-filters.dto';

describe('API/UI DTO contract guards', () => {
  it('convierte page/limit de query string a numeros reales', async () => {
    const dto = plainToInstance(ProgramacionPagosQueryDto, {
      page: '2',
      limit: '25',
      fecha_desde: '2026-05-01',
      fecha_hasta: '2026-05-31',
    });

    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(25);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza fechas no ISO en filtros de tesoreria', async () => {
    const dto = plainToInstance(ProgramacionPagosQueryDto, {
      fecha_desde: '31/05/2026',
      page: '1',
      limit: '25',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'fecha_desde')).toBe(true);
  });

  it('rechaza estados fuera del enum en filtros de usuarios', async () => {
    const dto = plainToInstance(UserFiltersDto, {
      estado: 'false',
      page: '1',
      limit: '10',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'estado')).toBe(true);
  });
});
