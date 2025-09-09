const { execSync } = require('child_process');
const { generateSecret } = require('./generate-secrets');

/**
 * Configura variables de entorno en Vercel automáticamente
 */
function setupVercelEnv() {
  console.log('🚀 Configurando variables de entorno en Vercel...');
  
  const secrets = {
    JWT_SECRET: generateSecret(32),
    JWT_REFRESH_SECRET: generateSecret(32),
    ENCRYPTION_KEY: generateSecret(32),
    SESSION_SECRET: generateSecret(32),
    CSRF_SECRET: generateSecret(32),
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    HASH_SALT_ROUNDS: '12',
    NODE_ENV: 'production'
  };

  console.log('\n📝 Variables que se configurarán:');
  for (const [key, value] of Object.entries(secrets)) {
    console.log(`${key}=${key.includes('SECRET') || key.includes('KEY') ? '[HIDDEN]' : value}`);
  }

  const confirm = require('readline-sync').question('\n¿Continuar? (y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('❌ Cancelado');
    return;
  }

  try {
    for (const [key, value] of Object.entries(secrets)) {
      console.log(`Configurando ${key}...`);
      execSync(`echo "${value}" | vercel env add ${key} production`, { stdio: 'inherit' });
    }
    
    console.log('\n✅ Variables de entorno configuradas en Vercel');
    console.log('🔄 Redeploy tu aplicación para aplicar los cambios');
  } catch (error) {
    console.error('❌ Error configurando variables:', error.message);
  }
}

if (require.main === module) {
  setupVercelEnv();
}

module.exports = { setupVercelEnv };