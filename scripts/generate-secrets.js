const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Genera secretos seguros para el sistema ERP
 */
function generateSecret(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

function generateSecrets() {
  const secrets = {
    JWT_SECRET: generateSecret(32),
    JWT_REFRESH_SECRET: generateSecret(32),
    ENCRYPTION_KEY: generateSecret(32),
    SESSION_SECRET: generateSecret(32),
    CSRF_SECRET: generateSecret(32),
    DB_ENCRYPTION_KEY: generateSecret(32),
  };

  console.log('🔐 Secretos generados para el sistema ERP:');
  console.log('==========================================');
  
  for (const [key, value] of Object.entries(secrets)) {
    console.log(`${key}=${value}`);
  }
  
  console.log('\n⚠️  IMPORTANTE:');
  console.log('1. Copia estos secretos a tu archivo .env');
  console.log('2. NO compartas estos secretos en repositorios públicos');
  console.log('3. Usa diferentes secretos para cada entorno (dev, staging, prod)');
  console.log('4. Rota los secretos regularmente en producción');
}

if (require.main === module) {
  generateSecrets();
}

module.exports = { generateSecret, generateSecrets };