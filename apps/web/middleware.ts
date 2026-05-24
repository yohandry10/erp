import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Validación local del JWT con jose. Antes este middleware hacía fetch a
// ${API_BASE_URL}/api/auth/profile en CADA request a /dashboard/* y /login,
// agregando ~1.4s de roundtrip a Supabase por navegación. Ahora verificamos
// firma + expiración localmente: <5ms.
//
// Tradeoff: una sesión revocada server-side (logout desde otro dispositivo,
// expulsión administrativa) puede seguir cargando páginas SSR hasta que el
// JWT expire (8h, ver apps/erp-api/src/modules/auth/auth.module.ts). Los
// endpoints del backend siguen llamando a validateSession() en cada request
// de mutación, así que ninguna acción sensible se ejecuta con sesión muerta.

const JWT_SECRET = process.env.JWT_SECRET;
const encoder = new TextEncoder();
// Encodeamos el secret una sola vez al cargar el módulo.
const secretKey = JWT_SECRET ? encoder.encode(JWT_SECRET) : null;

async function hasValidJwt(request: NextRequest): Promise<boolean> {
  if (!secretKey) {
    // Falta config — no podemos validar. Fail-closed: tratamos como no auth
    // para forzar al login. En dev/local esto loggea para no romper en silencio.
    console.error('[middleware] JWT_SECRET no está configurado en apps/web/.env.local');
    return false;
  }

  const accessToken = request.cookies.get('access_token')?.value;
  if (!accessToken) return false;

  try {
    const { payload } = await jwtVerify(accessToken, secretKey, {
      algorithms: ['HS256'],
    });
    // El backend incluye tenant_id en el payload; sin él el JWT no es útil para
    // este sistema multi-tenant aunque la firma sea válida.
    if (!payload.tenant_id) return false;
    return true;
  } catch {
    // jose lanza si firma inválida, expirado, o malformado. Cualquiera de los
    // tres significa "no autenticado".
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const protectedRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/superadmin');
  const loginRoute = pathname === '/login';

  if (!protectedRoute && !loginRoute) {
    return NextResponse.next();
  }

  const authenticated = await hasValidJwt(request);

  if (!authenticated && protectedRoute) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
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
