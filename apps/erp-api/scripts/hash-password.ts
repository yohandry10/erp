import * as bcrypt from 'bcrypt';

async function hashPassword(password: string) {
  const saltRounds = 12;
  const hash = await bcrypt.hash(password, saltRounds);
  console.log('\n=================================');
  console.log('Hash:', hash);
  console.log('=================================\n');
  console.log('SQL para actualizar usuario:');
  console.log(`UPDATE usuarios_sistema SET password_hash = '${hash}' WHERE email = 'admin@example.com';`);
  console.log('\n');
}

const password = process.argv[2]?.trim();
if (!password) {
  throw new Error('Uso: npx ts-node scripts/hash-password.ts <password>');
}

hashPassword(password);
