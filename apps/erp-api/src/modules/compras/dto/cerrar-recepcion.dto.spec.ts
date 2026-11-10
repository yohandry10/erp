import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CerrarRecepcionDto } from './cerrar-recepcion.dto';
const fx = { moneda: 'USD', moneda_base: 'PEN', tipo_cambio: '3.7', referencia: 'Constancia de cambio' };
const errors = (v: unknown) => validateSync(plainToInstance(CerrarRecepcionDto, v), { whitelist: true, forbidNonWhitelisted: true });
describe('Cierre de recepción con conversión explícita', () => {
  it.each([{}, { observaciones: 'Cierre PEN' }, { observaciones: 'Cierre USD', valuacion: fx }])('acepta el contrato %j', body => {
    expect(errors(body)).toHaveLength(0);
  });
  it.each([
    { ...fx, tipo_cambio: 3.7 }, { ...fx, tipo_cambio: '1e2' }, { ...fx, tipo_cambio: '-1' }, { ...fx, tipo_cambio: '3.1234567' },
    { ...fx, moneda: 'usd' }, { ...fx, moneda_base: 'XX' }, { ...fx, referencia: 'c' }, { ...fx, tasa_actual: true },
  ])('rechaza campos que no conservan un decimal y scope exactos %j', valuacion => {
    expect(errors({ valuacion })).not.toHaveLength(0);
  });
});
