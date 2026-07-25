import { contratoVigenteDe } from './planillas.service';

// El contrato que rige la relación laboral decide si el empleado entra a planilla y
// con qué régimen pensionario se le descuenta. Filtrar solo por 'vigente' dejaba fuera
// del pago a los contratos renovados o en periodo de prueba.
describe('contratoVigenteDe', () => {
  it('toma el contrato vigente', () => {
    const empleado = {
      contratos: [{ estado: 'vigente', regimen_pensionario: 'ONP' }],
    };
    expect(contratoVigenteDe(empleado)?.regimen_pensionario).toBe('ONP');
  });

  it('considera vigente un contrato renovado', () => {
    const empleado = {
      contratos: [{ estado: 'renovado', regimen_pensionario: 'ONP' }],
    };
    expect(contratoVigenteDe(empleado)).toBeDefined();
  });

  it('considera vigente un contrato en periodo de prueba', () => {
    const empleado = {
      contratos: [{ estado: 'en_periodo_prueba', regimen_pensionario: 'AFP' }],
    };
    expect(contratoVigenteDe(empleado)).toBeDefined();
  });

  it('ignora contratos finalizados aunque vengan primero en el arreglo', () => {
    const empleado = {
      contratos: [
        { estado: 'finalizado', regimen_pensionario: 'AFP' },
        { estado: 'vigente', regimen_pensionario: 'ONP' },
      ],
    };
    expect(contratoVigenteDe(empleado)?.regimen_pensionario).toBe('ONP');
  });

  it('no devuelve contrato si todos estan terminados', () => {
    const empleado = {
      contratos: [{ estado: 'terminado' }, { estado: 'anulado' }],
    };
    expect(contratoVigenteDe(empleado)).toBeUndefined();
  });

  it('tolera empleado sin contratos', () => {
    expect(contratoVigenteDe({})).toBeUndefined();
    expect(contratoVigenteDe(null)).toBeUndefined();
  });
});
