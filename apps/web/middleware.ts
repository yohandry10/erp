import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Validación local del JWT con jose cuando Vercel y el API comparten secreto.
// En la topología actual Render genera su JWT_SECRET y Vercel tiene otro; en
// ese caso la firma local no puede ser autoritativa y se consulta al API.
//
// Tradeoff: una sesión revocada server-side (logout desde otro dispositivo,
// expulsión administrativa) puede seguir cargando páginas SSR hasta que el
// JWT expire (8h, ver apps/erp-api/src/modules/auth/auth.module.ts). Los
// endpoints del backend siguen llamando a validateSession() en cada request
// de mutación, así que ninguna acción sensible se ejecuta con sesión muerta.

const JWT_SECRET = process.env.JWT_SECRET;
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
const encoder = new TextEncoder();
// Encodeamos el secret una sola vez al cargar el módulo.
const secretKey = JWT_SECRET ? encoder.encode(JWT_SECRET) : null;

type JwtValidation = 'valid' | 'invalid' | 'unavailable';

async function validateJwt(request: NextRequest): Promise<JwtValidation> {
  const accessToken = request.cookies.get('access_token')?.value;
  if (!accessToken) return 'invalid';

  if (secretKey) {
    try {
      const { payload } = await jwtVerify(accessToken, secretKey, {
        algorithms: ['HS256'],
      });
      if (!payload.tenant_id && payload.is_super_admin !== true) return 'invalid';
      return 'valid';
    } catch {
      // Un secreto distinto entre Vercel y Render no implica token inválido.
      // Continuamos con la validación autoritativa del emisor.
    }
  }

  if (!API_BASE_URL) {
    console.error('[middleware] NEXT_PUBLIC_API_URL no está configurado');
    return 'unavailable';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/profile/`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (response.ok) return 'valid';

    // Sólo una respuesta autoritativa de autenticación invalida la cookie. Un
    // 429 o un 5xx significa que el verificador está temporalmente indisponible;
    // expulsar al usuario en ese caso transforma navegación rápida, una caída de
    // Render o un rate limit en un cierre de sesión falso. Los endpoints de datos
    // siguen protegidos por JwtAuthGuard, de modo que permitir renderizar el shell
    // no concede acceso a información ni a mutaciones.
    if (response.status === 401 || response.status === 403) return 'invalid';
    return 'unavailable';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timeout);
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const normalizedPathname = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
  const protectedRoute =
    normalizedPathname.startsWith('/dashboard') ||
    normalizedPathname.startsWith('/superadmin') ||
    normalizedPathname === '/demo/convert';
  const loginRoute = normalizedPathname === '/login';

  if (!protectedRoute && !loginRoute) {
    return NextResponse.next();
  }

  // Next precarga todos los links visibles del sidebar. Validar cada prefetch
  // contra Render crea decenas de /auth/profile simultáneos y termina agotando
  // el rate limit antes de la navegación real. El prefetch sólo obtiene el
  // shell estático; los datos siguen protegidos por el API y la navegación
  // efectiva vuelve a pasar por la validación autoritativa de abajo.
  const isPrefetch =
    request.headers.has('next-router-prefetch') ||
    request.headers.get('purpose')?.toLowerCase() === 'prefetch';
  if (isPrefetch) {
    if (protectedRoute && !request.cookies.has('access_token')) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', normalizedPathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  const validation = await validateJwt(request);

  if (validation === 'invalid' && protectedRoute) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', normalizedPathname);
    return NextResponse.redirect(loginUrl);
  }

  if (validation === 'valid' && loginRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/superadmin/:path*', '/demo/convert', '/login'],
};
