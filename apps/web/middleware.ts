import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { hasPlausibleUnexpiredJwt } from './lib/middleware-auth';

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

async function hasValidJwt(request: NextRequest): Promise<boolean> {
  const accessToken = request.cookies.get('access_token')?.value;
  if (!accessToken) return false;

  if (secretKey) {
    try {
      const { payload } = await jwtVerify(accessToken, secretKey, {
        algorithms: ['HS256'],
      });
      if (!payload.tenant_id && payload.is_super_admin !== true) return false;
      return true;
    } catch {
      // Un secreto distinto entre Vercel y Render no implica token inválido.
      // Continuamos con la validación autoritativa del emisor.
    }
  }

  if (!API_BASE_URL) {
    console.error('[middleware] NEXT_PUBLIC_API_URL no está configurado');
    return false;
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
    if (response.ok) return true;
    // Una negativa autoritativa sí invalida la sesión. En cambio, 429/5xx son
    // fallos transitorios del proxy/Render y no deben expulsar al usuario del
    // shell; los endpoints de datos vuelven a validar token + sesión.
    if (response.status === 401 || response.status === 403) return false;
    if (response.status === 429 || response.status >= 500) {
      return hasPlausibleUnexpiredJwt(accessToken);
    }
    return false;
  } catch {
    // Un timeout de Render no equivale a credenciales inválidas. Solo dejamos
    // pasar el shell si el payload aún tiene usuario/tenant y no ha vencido.
    return hasPlausibleUnexpiredJwt(accessToken);
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
    normalizedPathname.startsWith('/superadmin');
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

  const authenticated = await hasValidJwt(request);

  if (!authenticated && protectedRoute) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', normalizedPathname);
    return NextResponse.redirect(loginUrl);
  }

  if (authenticated && loginRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/superadmin/:path*', '/login'],
};
