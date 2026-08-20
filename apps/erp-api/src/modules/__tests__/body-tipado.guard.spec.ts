import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Impide que vuelva a aparecer un `@Body()` sin DTO.
 *
 * El `ValidationPipe` global sólo valida cuando el parámetro declara una clase:
 * con `any` —o con un tipo estructural en línea, que TypeScript borra en
 * runtime— el body entra sin comprobar nada, y lo único que lo frena es la
 * disciplina de cada handler. Eran 27 rutas así, entre ellas el alta de usuario
 * y la emisión de comprobantes.
 *
 * El guardián no exige que el DTO sea bueno, sólo que exista: sin él, el pipe
 * no tiene nada que validar.
 */
describe('contrato de bodies tipados', () => {
  const raiz = join(__dirname, '..', '..', '..');

  function buscar(patron: string): string[] {
    try {
      return execFileSync('git', ['grep', '-n', '-E', patron, '--', 'src/**/*.controller.ts'], {
        cwd: raiz,
        encoding: 'utf8',
      })
        .split('\n')
        .filter(Boolean);
    } catch (error: any) {
      // git grep sale con 1 cuando no hay coincidencias: ese es el caso bueno.
      if (error.status === 1) return [];
      throw error;
    }
  }

  it('ningún @Body() se declara como any', () => {
    expect(buscar('@Body\\([^)]*\\)[^:]*:\\s*any')).toEqual([]);
  });

  it('ningún @Body() usa un tipo estructural en línea', () => {
    // `@Body() dto: { a: string }` compila pero en runtime es Object: el pipe
    // no puede construir un esquema y deja pasar cualquier cosa.
    expect(buscar('@Body\\([^)]*\\)[^:]*:\\s*\\{')).toEqual([]);
  });
});
