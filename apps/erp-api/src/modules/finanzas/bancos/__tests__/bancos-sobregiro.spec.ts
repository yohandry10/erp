import { validate } from 'class-validator';
import { CrearCuentaBancariaDto, CrearMovimientoBancarioDto } from '../dto';

describe('DTO bancario 457', () => {
  it('requiere mapeo contable al crear la cuenta bancaria', async () => {
    const dto = Object.assign(new CrearCuentaBancariaDto(), {
      nombre: 'Operaciones', banco: 'BCP', numero_cuenta: '123',
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'cuenta_contable_id')).toBe(true);
  });

  it('requiere contracuenta, moneda, categoría y clave en todo movimiento manual', async () => {
    const dto = Object.assign(new CrearMovimientoBancarioDto(), {
      cuenta_bancaria_id: '11111111-1111-4111-8111-111111111111',
      tipo: 'CARGO', monto: 10, fecha: '2026-08-09', descripcion: 'Comisión',
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining([
      'cuenta_contrapartida_id', 'moneda', 'categoria', 'idempotency_key',
    ]));
  });
});
