"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.middleware = middleware;
const auth_helpers_nextjs_1 = require("@supabase/auth-helpers-nextjs");
const server_1 = require("next/server");
async function middleware(req) {
    const res = server_1.NextResponse.next();
    // Check if Supabase environment variables are configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        console.warn('Supabase environment variables not configured. Authentication middleware disabled.');
        return res;
    }
    const supabase = (0, auth_helpers_nextjs_1.createMiddlewareClient)({ req, res });
    // Check if user is authenticated
    const { data: { session }, } = await supabase.auth.getSession();
    const isAuthPage = req.nextUrl.pathname.startsWith('/login');
    const isDashboardPage = req.nextUrl.pathname.startsWith('/dashboard');
    // If user is not authenticated and trying to access dashboard
    if (!session && isDashboardPage) {
        const redirectUrl = new URL('/login', req.url);
        redirectUrl.searchParams.set('redirectTo', req.nextUrl.pathname);
        return server_1.NextResponse.redirect(redirectUrl);
    }
    // If user is authenticated and trying to access login page
    if (session && isAuthPage) {
        const redirectTo = req.nextUrl.searchParams.get('redirectTo') || '/dashboard';
        return server_1.NextResponse.redirect(new URL(redirectTo, req.url));
    }
    return res;
}
exports.config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
