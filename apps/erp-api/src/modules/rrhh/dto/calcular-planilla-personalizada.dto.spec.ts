import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CalcularPlanillaPersonalizadaDto } from './calcular-planilla-personalizada.dto';

/**
 * Regresión del transporte de los recargos colombianos.
 *
 * El motor colombiano siempre supo liquidar el recargo nocturno y el dominical o
 * festivo; lo que fallaba era llegar hasta él. La pantalla los capturaba y los
 * sumaba al neto que mostraba, pero el DTO no los declaraba, y el
 * `ValidationPipe` global corre con `whitelist` y `forbidNonWhitelisted`: enviarlos
 * habría devuelto 400 y no enviarlos los hacía desaparecer en silencio. El
 * trabajador aprobaba un neto en pantalla y cobraba otro.
 *
 * Esta prueba cubre el tramo que fallaba —que el contrato los acepte y los
 * conserve—; el cálculo en sí lo cubre `planillas-colombia-recargos.spec.ts`.
 */

const empleadoBase = {
  empleado_id: '11111111-1111-4111-8111-111111111111',
  dias_trabajados: 30,
  horas_extras_25: 0,
  horas_extras_35: 0,
  tardanzas_minutos: 0,
  faltas: 0,
};

const construir = (extra: Record<string, unknown> = {}) =>
  plainToInstance(CalcularPlanillaPersonalizadaDto, {
    empleados: [{ ...empleadoBase, ...extra }],
  });

describe('CalcularPlanillaPersonalizadaDto — recargos colombianos', () => {
  it('acepta el recargo nocturno y el dominical/festivo', async () => {
    const dto = construir({ horas_recargo_nocturno: 10, horas_dominicales_festivas: 8 });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('conserva los valores en vez de descartarlos', async () => {
    const dto = construir({ horas_recargo_nocturno: 10, horas_dominicales_festivas: 8 });
    expect(dto.empleados[0].horas_recargo_nocturno).toBe(10);
    expect(dto.empleados[0].horas_dominicales_festivas).toBe(8);
  });

  it('siguen siendo opcionales: los demás países no los envían', async () => {
    const dto = construir();
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.empleados[0].horas_recargo_nocturno).toBeUndefined();
  });

  it('convierte el número que llega como texto del formulario', async () => {
    const dto = construir({ horas_recargo_nocturno: '10' });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.empleados[0].horas_recargo_nocturno).toBe(10);
  });

  it('rechaza horas negativas', async () => {
    const dto = construir({ horas_recargo_nocturno: -1 });
    const errores = await validate(dto);
    expect(errores.length).toBeGreaterThan(0);
  });

  it('rechaza un valor no numérico', async () => {
    const dto = construir({ horas_dominicales_festivas: 'muchas' });
    const errores = await validate(dto);
    expect(errores.length).toBeGreaterThan(0);
  });
});
