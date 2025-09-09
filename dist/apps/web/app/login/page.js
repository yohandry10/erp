'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = LoginPage;
const react_1 = require("react");
const navigation_1 = require("next/navigation");
const auth_helpers_nextjs_1 = require("@supabase/auth-helpers-nextjs");
const button_1 = require("@/components/ui/button");
const input_1 = require("@/components/ui/input");
const label_1 = require("@/components/ui/label");
const card_1 = require("@/components/ui/card");
const use_toast_1 = require("@/components/ui/use-toast");
const lucide_react_1 = require("lucide-react");
const loginStyles = {
    container: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
        padding: '2rem',
    },
    card: {
        width: '100%',
        maxWidth: '28rem',
    },
    logoContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '2rem',
        gap: '0.75rem',
    },
    title: {
        fontSize: '2rem',
        textAlign: 'center',
        fontWeight: '800',
        background: 'var(--gradient-primary)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        margin: '0',
    },
    description: {
        textAlign: 'center',
        color: 'var(--primary-600)',
        marginBottom: '0',
    },
    content: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
    },
    formGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
    },
    footer: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
    },
    button: {
        width: '100%',
    },
    divider: {
        position: 'relative',
    },
    dividerLine: {
        position: 'absolute',
        inset: '0',
        display: 'flex',
        alignItems: 'center',
    },
    dividerSpan: {
        width: '100%',
        borderTop: '1px solid rgba(203, 213, 225, 0.5)',
    },
    dividerText: {
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        fontSize: '0.75rem',
        textTransform: 'uppercase',
    },
    dividerTextSpan: {
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        padding: '0 1rem',
        color: 'var(--primary-600)',
        fontWeight: '600',
    },
};
function LoginPage() {
    const [email, setEmail] = (0, react_1.useState)('');
    const [password, setPassword] = (0, react_1.useState)('');
    const [loading, setLoading] = (0, react_1.useState)(false);
    const router = (0, navigation_1.useRouter)();
    const supabase = (0, auth_helpers_nextjs_1.createClientComponentClient)();
    const { toast } = (0, use_toast_1.useToast)();
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) {
                toast({
                    variant: "destructive",
                    title: "Error de autenticación",
                    description: error.message,
                });
            }
            else {
                toast({
                    title: "Bienvenido",
                    description: "Has iniciado sesión correctamente",
                });
                router.push('/dashboard');
            }
        }
        catch (error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Ocurrió un error inesperado",
            });
        }
        finally {
            setLoading(false);
        }
    };
    const handleDemoLogin = async () => {
        setLoading(true);
        // Simulación de login demo
        setTimeout(() => {
            toast({
                title: "Modo Demo",
                description: "Accediendo al sistema en modo demostración",
            });
            router.push('/dashboard');
            setLoading(false);
        }, 1000);
    };
    return (<div style={loginStyles.container}>
      <card_1.Card style={loginStyles.card}>
        <card_1.CardHeader>
          <div style={loginStyles.logoContainer}>
            <lucide_react_1.Building2 style={{ height: '2rem', width: '2rem', color: 'var(--blue-600)' }}/>
          </div>
          <card_1.CardTitle style={loginStyles.title}>ERP Suite</card_1.CardTitle>
          <card_1.CardDescription style={loginStyles.description}>
            Ingresa tus credenciales para acceder al sistema
          </card_1.CardDescription>
        </card_1.CardHeader>

        <card_1.CardContent style={loginStyles.content}>
          <form onSubmit={handleLogin}>
            <div style={loginStyles.formGroup}>
              <label_1.Label htmlFor="email">Email</label_1.Label>
              <input_1.Input id="email" type="email" placeholder="tu@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} required/>
            </div>
            <div style={loginStyles.formGroup}>
              <label_1.Label htmlFor="password">Contraseña</label_1.Label>
              <input_1.Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required/>
            </div>
          </form>
        </card_1.CardContent>

        <card_1.CardFooter style={loginStyles.footer}>
          <button_1.Button onClick={handleLogin} disabled={loading} style={loginStyles.button}>
            {loading && <lucide_react_1.Loader2 style={{ marginRight: '0.5rem', height: '1rem', width: '1rem', animation: 'spin 1s linear infinite' }}/>}
            Iniciar Sesión
          </button_1.Button>

          <div style={loginStyles.divider}>
            <div style={loginStyles.dividerLine}>
              <span style={loginStyles.dividerSpan}/>
            </div>
            <div style={loginStyles.dividerText}>
              <span style={loginStyles.dividerTextSpan}>
                O continúa con
              </span>
            </div>
          </div>

          <button_1.Button variant="outline" onClick={handleDemoLogin} disabled={loading} style={loginStyles.button}>
            {loading && <lucide_react_1.Loader2 style={{ marginRight: '0.5rem', height: '1rem', width: '1rem', animation: 'spin 1s linear infinite' }}/>}
            Acceso Demo
          </button_1.Button>
        </card_1.CardFooter>
      </card_1.Card>
    </div>);
}
