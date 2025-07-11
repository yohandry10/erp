/** @type {import('next').NextConfig} */
const nextConfig = {
  // Removed deprecated appDir from experimental (it's now default in Next.js 15)
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
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
  // Removing problematic rewrites that cause conflicts
}

module.exports = nextConfig 