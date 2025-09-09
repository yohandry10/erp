"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = HomePage;
const auth_helpers_nextjs_1 = require("@supabase/auth-helpers-nextjs");
const headers_1 = require("next/headers");
const navigation_1 = require("next/navigation");
async function HomePage() {
    let session = null;
    // Only create Supabase client if environment variables are configured
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        const supabase = (0, auth_helpers_nextjs_1.createServerComponentClient)({ cookies: headers_1.cookies });
        const { data } = await supabase.auth.getSession();
        session = data.session;
    }
    if (session) {
        (0, navigation_1.redirect)('/dashboard');
    }
    else {
        (0, navigation_1.redirect)('/login');
    }
}
