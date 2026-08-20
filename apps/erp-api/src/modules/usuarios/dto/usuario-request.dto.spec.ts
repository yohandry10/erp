import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ActualizarUsuarioRequestDto,
  CrearUsuarioRequestDto,
} from './usuario-request.dto';

/**
 * Estas pruebas cubren las dos mitades del riesgo de tipar un body que antes era
 * `any`, y que se contradicen entre sí si no se comprueban juntas:
 *
 * 1. Que el DTO rechace lo que no debe pasar. Es la mejora.
 * 2. Que acepte exactamente lo que la pantalla ya envía. Con
 *    `forbidNonWhitelisted` activo en el pipe global, un campo legítimo que se
 *    olvidara de declarar convertiría un alta que hoy funciona en un 400.
 */
const OPCIONES = { whitelist: true, forbidNonWhitelisted: true };

function validar(cls: any, payload: Record<string, unknown>) {
  return validateSync(plainToInstance(cls, payload), OPCIONES);
}

describe('DTOs del body de usuario', () => {
  // Lo que UsuarioModal envía hoy al crear, campo por campo.
  const altaDeLaPantalla = {
    nombre: 'Ana Torres',
    email: 'ana@empresa.com',
    telefono: '999888777',
    rol_id: '52350b0c-0014-4ad1-9a1b-c1c7a754fe5b',
    estado: 'ACTIVO',
    idempotency_key: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    password: 'unaClaveLarga',
  };

  it('acepta el alta tal y como la envía la pantalla', () => {
    expect(validar(CrearUsuarioRequestDto, altaDeLaPantalla)).toHaveLength(0);
  });

  it('acepta estado en el alta aunque el controlador lo descarte', () => {
    // El formulario lo manda siempre. Si no estuviera declarado, crear un
    // usuario devolvería 400 en lugar de ignorarlo como hasta ahora.
    const { estado, ...sinEstado } = altaDeLaPantalla;
    expect(estado).toBe('ACTIVO');
    expect(validar(CrearUsuarioRequestDto, sinEstado)).toHaveLength(0);
  });

  it('rechaza el alta sin clave idempotente', () => {
    const { idempotency_key, ...sinClave } = altaDeLaPantalla;
    expect(idempotency_key).toBeDefined();
    const errores = validar(CrearUsuarioRequestDto, sinClave);
    expect(errores.map((e) => e.property)).toContain('idempotency_key');
  });

  it('rechaza un correo mal formado', () => {
    const errores = validar(CrearUsuarioRequestDto, {
      ...altaDeLaPantalla,
      email: 'ana(arroba)empresa',
    });
    expect(errores.map((e) => e.property)).toContain('email');
  });

  it('rechaza una contraseña más corta que el mínimo', () => {
    const errores = validar(CrearUsuarioRequestDto, { ...altaDeLaPantalla, password: 'corta' });
    expect(errores.map((e) => e.property)).toContain('password');
  });

  it('rechaza un rol que no es un UUID', () => {
    const errores = validar(CrearUsuarioRequestDto, { ...altaDeLaPantalla, rol_id: 'ADMIN' });
    expect(errores.map((e) => e.property)).toContain('rol_id');
  });

  it('rechaza escalar privilegios por el body', () => {
    // Antes llegaban como `any` y sólo los frenaba la selección de campos del
    // controlador. Ahora la petición ni siquiera entra.
    for (const campo of ['password_hash', 'password_reset_token', 'is_super_admin']) {
      const errores = validar(ActualizarUsuarioRequestDto, { nombre: 'Ana', [campo]: 'x' });
      expect(errores.map((e) => e.property)).toContain(campo);
    }
  });

  it('rechaza un estado fuera del enum', () => {
    const errores = validar(ActualizarUsuarioRequestDto, { estado: 'ELIMINADO' });
    expect(errores.map((e) => e.property)).toContain('estado');
  });

  it('acepta la edición tal y como la envía la pantalla', () => {
    expect(
      validar(ActualizarUsuarioRequestDto, {
        nombre: 'Ana Torres',
        email: 'ana@empresa.com',
        telefono: '999888777',
        rol_id: '52350b0c-0014-4ad1-9a1b-c1c7a754fe5b',
        estado: 'SUSPENDIDO',
      }),
    ).toHaveLength(0);
  });
});
