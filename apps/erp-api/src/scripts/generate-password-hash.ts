/**
 * Script para generar hash bcrypt de contraseñas
 * Uso: npx ts-node src/scripts/generate-password-hash.ts
 */

import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;
const password = '6559234.Yoandri1';

async function generateHash() {
  console.log('=========================================');
  console.log('GENERANDO HASH BCRYPT');
  console.log('=========================================');
  console.log('');
  console.log('Contraseña:', password);
  console.log('Salt Rounds:', SALT_ROUNDS);
  console.log('');
  console.log('Generando hash...');
  
  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    
    console.log('');
    console.log('✅ Hash generado exitosamente:');
    console.log('');
    console.log(hash);
    console.log('');
    console.log('=========================================');
    console.log('');
    console.log('Copia este hash y úsalo en el script SQL');
    console.log('');
    
    // Verificar que el hash funciona
    const isValid = await bcrypt.compare(password, hash);
    console.log('Verificación:', isValid ? '✅ Hash válido' : '❌ Hash inválido');
    console.log('');
    
    return hash;
  } catch (error) {
    console.error('❌ Error generando hash:', error.message);
    process.exit(1);
  }
}

generateHash();
