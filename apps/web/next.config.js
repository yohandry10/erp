/** @type {import('next').NextConfig} */
const path = require('path')
const prodProjectRef = 'wypnbcptofqdmoynlonq'

for (const [name, value] of Object.entries({
  SUPABASE_URL: process.env.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
})) {
  // Lista blanca, no lista negra: se bloquea todo host de Supabase que no sea
  // PROD, en vez de un unico proyecto conocido.
  const host = String(value || '').match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i)
  if (host && host[1] !== prodProjectRef) {
    throw new Error(`${name} apunta al proyecto ${host[1]}; este repositorio solo opera ${prodProjectRef}. El build fue bloqueado.`)
  }
}
if (process.env.DEPLOYMENT_ENV && process.env.DEPLOYMENT_ENV !== 'PROD') {
  throw new Error('El frontend sólo admite DEPLOYMENT_ENV=PROD.')
}
if (
  process.env.EXPECTED_SUPABASE_PROJECT_REF &&
  process.env.EXPECTED_SUPABASE_PROJECT_REF !== prodProjectRef
) {
  throw new Error(`El frontend sólo admite EXPECTED_SUPABASE_PROJECT_REF=${prodProjectRef}.`)
}
const isTauriBuild =
  process.env.NODE_ENV === 'production' &&
  (process.env.TAURI_BUILD === '1' || process.env.npm_lifecycle_event === 'build:tauri')
const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002').replace(/\/+$/, '')
const nextConfig = {
  // QA visual paralela usa un directorio aislado para que dos servidores Next
  // no corrompan el mismo manifiesto `.next` ni produzcan 404 intermitentes.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // Para Tauri necesitamos static export solo en build para producción
  output: isTauriBuild ? 'export' : undefined,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002',
    NEXT_PUBLIC_API_PROXY: process.env.NEXT_PUBLIC_API_PROXY,
    NEXT_PUBLIC_COOKIE_AUTH: process.env.NEXT_PUBLIC_COOKIE_AUTH,
    TAURI_PLATFORM: process.env.TAURI_PLATFORM,
    TAURI_ARCH: process.env.TAURI_ARCH,
    TAURI_FAMILY: process.env.TAURI_FAMILY,
    TAURI_PLATFORM_VERSION: process.env.TAURI_PLATFORM_VERSION,
    TAURI_PLATFORM_TYPE: process.env.TAURI_PLATFORM_TYPE,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  compiler: {
    reactRemoveProperties: false,
  },
  webpack: (config, { isServer }) => {
    // Ignore warnings for Supabase realtime dependencies
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    
    // Suppress critical dependency warnings for Supabase
    config.module.exprContextCritical = false;
    
    return config;
  },
  // Configuración específica para Tauri - corregida
  assetPrefix: process.env.NODE_ENV === 'production' && process.env.TAURI_BUILD ? '' : undefined,
  // El navegador y el middleware deben compartir la cookie de sesión. Vercel y
  // Render viven en dominios distintos, por lo que las llamadas directas al API
  // dejan la cookie en onrender.com y /dashboard no puede verla. Este rewrite
  // convierte /backend/* en un proxy mismo-origen sin afectar el build Tauri.
  ...(isTauriBuild
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: '/backend/:path*',
              destination: `${apiBaseUrl}/:path*`,
            },
          ]
        },
      }),
}

module.exports = nextConfig
