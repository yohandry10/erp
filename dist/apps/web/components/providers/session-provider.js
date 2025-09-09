'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSession = void 0;
exports.SessionProvider = SessionProvider;
const react_1 = require("react");
const auth_helpers_nextjs_1 = require("@supabase/auth-helpers-nextjs");
const SessionContext = (0, react_1.createContext)({
    session: null,
    loading: true,
    error: null,
});
function SessionProvider({ children, session: initialSession, }) {
    const [session, setSession] = (0, react_1.useState)(initialSession);
    const [loading, setLoading] = (0, react_1.useState)(!initialSession);
    const [error, setError] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        try {
            const supabase = (0, auth_helpers_nextjs_1.createClientComponentClient)();
            const { data: { subscription }, } = supabase.auth.onAuthStateChange((event, session) => {
                setSession(session);
                setLoading(false);
                setError(null);
            });
            return () => subscription.unsubscribe();
        }
        catch (err) {
            console.error('Error initializing auth:', err);
            setError('Error de conexión con el sistema de autenticación');
            setLoading(false);
        }
    }, []);
    return (<SessionContext.Provider value={{ session, loading, error }}>
      {children}
    </SessionContext.Provider>);
}
const useSession = () => {
    const context = (0, react_1.useContext)(SessionContext);
    if (context === undefined) {
        throw new Error('useSession must be used within a SessionProvider');
    }
    return context;
};
exports.useSession = useSession;
