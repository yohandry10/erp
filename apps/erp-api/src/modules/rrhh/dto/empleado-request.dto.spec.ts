import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ActualizarEmpleadoDto, CrearEmpleadoDto } from './empleado-request.dto';

/**
 * El riesgo de tipar este body no es dejar pasar basura: `RrhhService` ya
 * filtraba por `CAMPOS_EMPLEADO_PERMITIDOS`. El riesgo es el contrario, que un
 * campo que el formulario envía hoy no esté declarado y el alta pase a 400 por
 * `forbidNonWhitelisted`. Por eso la prueba principal es el formulario completo.
 */
const OPCIONES = { whitelist: true, forbidNonWhitelisted: true };

function validar(cls: any, payload: Record<string, unknown>) {
  return validateSync(plainToInstance(cls, payload), OPCIONES);
}

// Copia literal de lo que EmpleadoModal manda, incluidos los bloques de
// Argentina y Colombia que el mismo formulario rellena según el país.
const empleadoDeLaPantalla = {
  nombres: 'Ana',
  apellidos: 'Torres',
  tipo_documento: 'DNI',
  numero_documento: '45678912',
  fecha_nacimiento: '1990-04-12',
  genero: 'F',
  direccion: 'Av. Siempre Viva 123',
  telefono: '999888777',
  email: 'ana@empresa.com',
  puesto: 'Analista',
  id_departamento: 'dep-1',
  fecha_ingreso: '2026-01-05',
  estado: 'activo',
  tiene_hijos: true,
  cantidad_hijos: 2,
  obra_social_codigo: '108805',
  sindicato_codigo: 'SIN-1',
  situacion_revista_codigo: '01',
  modalidad_contratacion_codigo: '008',
  eps_codigo: 'EPS001',
  fondo_pension_codigo: 'FP001',
  arl_codigo: 'ARL001',
  caja_compensacion_codigo: 'CCF001',
};

describe('DTOs del body de empleado', () => {
  it('acepta el formulario completo tal y como llega hoy', () => {
    expect(validar(CrearEmpleadoDto, empleadoDeLaPantalla)).toHaveLength(0);
  });

  it('acepta el cuil que el formulario añade en Argentina', () => {
    expect(
      validar(CrearEmpleadoDto, { ...empleadoDeLaPantalla, cuil: '20456789123' }),
    ).toHaveLength(0);
  });

  it('acepta correo vacío, que es como el formulario expresa "sin correo"', () => {
    // Validar el formato sobre "" convertiría en 400 un alta legítima: el
    // servicio descarta las cadenas vacías antes de escribir.
    expect(validar(CrearEmpleadoDto, { ...empleadoDeLaPantalla, email: '' })).toHaveLength(0);
  });

  it('rechaza un correo con formato inválido', () => {
    const errores = validar(CrearEmpleadoDto, { ...empleadoDeLaPantalla, email: 'ana@@x' });
    expect(errores.map((e) => e.property)).toContain('email');
  });

  it('exige nombres y apellidos al crear', () => {
    const { nombres, apellidos, ...sinNombre } = empleadoDeLaPantalla;
    expect(nombres && apellidos).toBeTruthy();
    const propiedades = validar(CrearEmpleadoDto, sinNombre).map((e) => e.property);
    expect(propiedades).toContain('nombres');
    expect(propiedades).toContain('apellidos');
  });

  it('no exige nombres al editar, porque la edición es parcial', () => {
    expect(validar(ActualizarEmpleadoDto, { telefono: '999000111' })).toHaveLength(0);
  });

  it('rechaza una cantidad de hijos negativa', () => {
    // De aquí sale el derecho a la asignación familiar: un valor absurdo no
    // debe llegar al motor de planilla.
    const errores = validar(CrearEmpleadoDto, { ...empleadoDeLaPantalla, cantidad_hijos: -1 });
    expect(errores.map((e) => e.property)).toContain('cantidad_hijos');
  });

  it('rechaza columnas que no pertenecen al empleado', () => {
    const errores = validar(CrearEmpleadoDto, { ...empleadoDeLaPantalla, tenant_id: 'otro' });
    expect(errores.map((e) => e.property)).toContain('tenant_id');
  });
});
