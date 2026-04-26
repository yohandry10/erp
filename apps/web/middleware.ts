import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  // ✅ SIMPLIFICADO: Solo agregar headers, no hacer redirecciones
  // Las redirecciones se manejan en los componentes client-side
  // Esto previene race conditions con localStorage y cookies
  
  const res = NextResponse.next()
  
  // Pasar el token si existe en las cookies al header para el backend
  const token = req.cookies.get('access_token')?.value
  
  if (token) {
    res.headers.set('x-auth-token', token)
  }

  return res
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
} 