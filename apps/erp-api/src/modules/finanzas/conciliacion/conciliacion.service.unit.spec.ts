import { validate } from 'class-validator';
import {
  CerrarConciliacionDto,
  CrearConciliacionDto,
  ImportarCsvDto,
  MarcarItemDto,
} from './dto';

describe('DTO de conciliación 457', () => {
  it.each([
    new CrearConciliacionDto(),
    new ImportarCsvDto(),
    new MarcarItemDto(),
    new CerrarConciliacionDto(),
  ])('requiere clave estable en %s', async (dto) => {
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'idempotency_key')).toBe(true);
  });

  it('rechaza aceptar una diferencia dentro del match manual', async () => {
    const dto = Object.assign(new MarcarItemDto(), {
      idempotency_key: 'manual-match-1',
      movimiento_sistema_id: '11111111-1111-4111-8111-111111111111',
      movimiento_extracto_id: '22222222-2222-4222-8222-222222222222',
      aceptar_diferencia: true,
      diferencia: 0.01,
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['aceptar_diferencia', 'diferencia']),
    );
  });
});
