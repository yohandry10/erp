// Reencripta certificados PFX usando CERT_ENCRYPTION_KEY (y opcional CERT_ENCRYPTION_KEY_OLD para migrar)
// Modo: node scripts/reencrypt-certs.ts (requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY)

const { createDecipheriv, createCipheriv, randomBytes } = require('crypto');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const KEY_NEW = process.env.CERT_ENCRYPTION_KEY;
const KEY_OLD = process.env.CERT_ENCRYPTION_KEY_OLD;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!KEY_NEW) {
  console.error('CERT_ENCRYPTION_KEY es obligatorio');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

function decrypt(encBase64, key) {
  const blob = Buffer.from(encBase64, 'base64');
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ciphertext = blob.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function encrypt(buf, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const ciphertext = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

async function main() {
  const { data, error } = await supabase
    .from('empresa_config')
    .select('id, tenant_id, pfx_encrypted, pfx_password_encrypted');

  if (error) {
    console.error('Error leyendo empresa_config:', error);
    process.exit(1);
  }

  for (const row of data || []) {
    if (!row.pfx_encrypted) continue;
    try {
      const decryptedPfx = KEY_OLD ? decrypt(row.pfx_encrypted, KEY_OLD) : decrypt(row.pfx_encrypted, KEY_NEW);
      const decryptedPwd = row.pfx_password_encrypted
        ? (KEY_OLD ? decrypt(row.pfx_password_encrypted, KEY_OLD) : decrypt(row.pfx_password_encrypted, KEY_NEW))
        : Buffer.from('');

      const rePfx = encrypt(decryptedPfx, KEY_NEW);
      const rePwd = row.pfx_password_encrypted ? encrypt(decryptedPwd, KEY_NEW) : null;

      const { error: updError } = await supabase
        .from('empresa_config')
        .update({ pfx_encrypted: rePfx, pfx_password_encrypted: rePwd })
        .eq('id', row.id);

      if (updError) {
        console.error(`❌ Error reencriptando tenant ${row.tenant_id}:`, updError);
      } else {
        console.log(`✅ Reencriptado tenant ${row.tenant_id}`);
      }
    } catch (err) {
      console.error(`❌ Error procesando tenant ${row.tenant_id}:`, err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
