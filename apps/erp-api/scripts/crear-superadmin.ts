/**
 * Crea o restablece la cuenta de super-administrador.
 *
 * Existe porque la instalación no trae ninguna: `is_super_admin` es una columna
 * que nadie pone a true en ningún seed ni migración, así que el panel de
 * superadmin queda inalcanzable hasta que alguien crea la cuenta a mano. Y sin
 * ella no se pueden aprobar las conversiones de demo a cuenta real.
 *
 * La contraseña se pide por consola y nunca se pasa como argumento: los
 * argumentos quedan en el historial del shell y en la lista de procesos.
 *
 *   pnpm --filter @erp-suite/erp-api exec ts-node scripts/crear-superadmin.ts
 *
 * Si el correo ya existe, restablece su contraseña y lo marca como superadmin
 * en vez de duplicarlo.
 */
import * as bcrypt from 'bcrypt';
import * as readline from 'node:readline';
import { Writable } from 'node:stream';
import { createClient } from '@supabase/supabase-js';
import { config as cargarEnv } from 'dotenv';
import * as path from 'node:path';

const RONDAS_BCRYPT = 12;

function preguntar(texto: string, oculto = false): Promise<string> {
  // Con `oculto` se traga el eco para que la contraseña no quede en pantalla.
  let silenciar = false;
  const salida = new Writable({
    write(fragmento, _codificacion, siguiente) {
      if (!silenciar) process.stdout.write(fragmento);
      siguiente();
    },
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: salida,
    terminal: true,
  });

  return new Promise((resolver) => {
    rl.question(texto, (respuesta) => {
      if (oculto) process.stdout.write('\n');
      rl.close();
      resolver(respuesta.trim());
    });
    silenciar = oculto;
  });
}

async function principal(): Promise<void> {
  const raiz = path.resolve(__dirname, '..');
  for (const archivo of ['.env.local', '.env']) {
    cargarEnv({ path: path.join(raiz, archivo) });
  }

  const url = process.env.SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) {
    throw new Error(
      'Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. Apunte el .env al entorno donde quiere crear el superadmin.',
    );
  }

  console.log(`\nBase de datos: ${url}\n`);

  const email = (await preguntar('Correo del superadmin: ')).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('El correo no es válido');
  }

  const password = await preguntar('Contraseña (no se muestra): ', true);
  if (password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres');
  }
  if (password.length < 12 || !/[^0-9]/.test(password)) {
    // No se bloquea —la cuenta es del dueño del sistema— pero se dice: esta
    // clave abre todos los tenants, no uno.
    console.warn('\n⚠ Contraseña débil para una cuenta que atraviesa todos los tenants.');
    console.warn('  Conviene 12+ caracteres con letras y símbolos antes de producción.\n');
  }
  const repetida = await preguntar('Repita la contraseña: ', true);
  if (password !== repetida) {
    throw new Error('Las contraseñas no coinciden');
  }

  const cliente = createClient(url, clave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const hash = await bcrypt.hash(password, RONDAS_BCRYPT);

  const { data: existente } = await cliente
    .from('usuarios_sistema')
    .select('id, email, is_super_admin')
    .eq('email', email)
    .maybeSingle();

  if (existente?.id) {
    const { error } = await cliente
      .from('usuarios_sistema')
      .update({
        password_hash: hash,
        is_super_admin: true,
        activo: true,
        is_demo_user: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existente.id);

    if (error) throw new Error(`No se pudo restablecer: ${error.message}`);
    console.log(`\n✔ Contraseña restablecida y permisos de superadmin confirmados para ${email}\n`);
    return;
  }

  // tenant_id nulo a proposito: el superadmin no pertenece a ningun tenant, los
  // atraviesa todos.
  const { error } = await cliente.from('usuarios_sistema').insert({
    email,
    password_hash: hash,
    nombre: 'Super Administrador',
    is_super_admin: true,
    activo: true,
    is_demo_user: false,
    tenant_id: null,
  });

  if (error) throw new Error(`No se pudo crear: ${error.message}`);
  console.log(`\n✔ Superadmin creado: ${email}\n`);
}

principal().catch((error) => {
  console.error(`\n✖ ${error.message}\n`);
  process.exit(1);
});
