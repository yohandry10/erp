import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  
  // Check if user is authenticated using custom auth (token in cookie or header)
  const token = req.cookies.get('access_token')?.value || 
                req.headers.get('authorization')?.replace('Bearer ', '')

  const isAuthPage = req.nextUrl.pathname.startsWith('/login')
  const isDashboardPage = req.nextUrl.pathname.startsWith('/dashboard')

  // If user is not authenticated and trying to access dashboard
  if (!token && isDashboardPage) {
    const redirectUrl = new URL('/login', req.url)
    redirectUrl.searchParams.set('redirectTo', req.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // If user is authenticated and trying to access login page
  if (token && isAuthPage) {
    const redirectTo = req.nextUrl.searchParams.get('redirectTo') || '/dashboard'
    return NextResponse.redirect(new URL(redirectTo, req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
} 