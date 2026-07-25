'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchApi } from '@/lib/api-fetch';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  Check,
  Clipboard,
  CreditCard,
  FileText,
  Loader2,
  Package,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type DemoCredentials = {
  email: string;
  password: string;
};

const features = [
  {
    icon: BarChart3,
    title: 'Contabilidad automatizada',
    description: 'Asientos, balances y resultados con datos iniciales listos para revisar.',
  },
  {
    icon: FileText,
    title: 'Facturacion electronica',
    description: 'Facturas, boletas, notas y validaciones fiscales en modo demostracion.',
  },
  {
    icon: Package,
    title: 'Inventario y kardex',
    description: 'Almacenes, movimientos y stock de prueba para flujos operativos.',
  },
  {
    icon: CreditCard,
    title: 'POS multi-caja',
    description: 'Ventas rapidas, sesiones de caja y metodos de pago configurados.',
  },
  {
    icon: ShieldCheck,
    title: 'Seguridad por roles',
    description: 'Tenant aislado con usuario demo y permisos operativos.',
  },
  {
    icon: Users,
    title: 'RRHH',
    description: 'Empleados, asistencias y planillas para validar procesos diarios.',
  },
];

export default function DemoPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<DemoCredentials | null>(null);
  // window.location tras montar (no useSearchParams) para no requerir un
  // boundary de Suspense en el prerender ni causar mismatch de hidratación.
  const [demoExpirada, setDemoExpirada] = useState(false);
  useEffect(() => {
    setDemoExpirada(new URLSearchParams(window.location.search).get('expired') === '1');
  }, []);

  const handleStartDemo = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchApi('/api/demo/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dias_duracion: 14 }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Error creando demo');
      }

      const data = await response.json();

      await signIn(data.email, data.password);
      setCredentials({ email: data.email, password: data.password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la demo');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    // Tras crear el tenant demo aún falta configurar (RUC real, certificado,
    // configuración fiscal). Mandamos directo al wizard en vez de /dashboard
    // para que el usuario pueda completar la configuración. Antes esto saltaba
    // a /dashboard y, si el layout no redirigía por requiresSetup=false (porque
    // el seed ya pone empresa_config.pais='PE'), el usuario quedaba bloqueado
    // sin poder configurar el tenant.
    router.push('/dashboard/wizard');
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  if (credentials) {
    return (
      <main className="min-h-screen bg-muted/30 px-6 py-10 text-foreground">
        <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl flex-col justify-center">
          <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <BadgeCheck className="h-7 w-7" />
            </div>

            <h1 className="text-3xl font-bold tracking-normal">Demo creada</h1>
            <p className="mt-2 text-sm leading-6 text-foreground/80">
              La sesion demo ya esta iniciada. Conserva estas credenciales para volver a entrar.
            </p>

            <div className="mt-8 space-y-4 rounded-lg border border-blue-100 bg-blue-50 p-5">
              <CredentialRow label="Email" value={credentials.email} onCopy={copyToClipboard} />
              <CredentialRow label="Contrasena" value={credentials.password} onCopy={copyToClipboard} />
            </div>

            <button
              onClick={handleContinue}
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-background px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-muted"
            >
              Configurar mi empresa
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 text-foreground">
      <section className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:px-10">
        <div>
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground/80 shadow-sm">
            <Building2 className="h-4 w-4 text-blue-700" />
            ERP Suite Demo
          </div>

          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-normal text-foreground md:text-5xl">
            Prueba el ERP completo con una empresa demo operativa
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-foreground/80">
            Se crea un tenant aislado por 14 dias con usuario, datos iniciales y acceso a los modulos principales.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </div>

        <aside className="rounded-lg border border-border bg-card p-7 shadow-sm">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-blue-100 text-blue-700">
            <Check className="h-6 w-6" />
          </div>

          {demoExpirada && (
            <div className="mb-5 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
              Tu demo anterior expiró. Puedes crear una nueva empresa demo aquí, o convertir tu cuenta en una definitiva.
            </div>
          )}
          <h2 className="text-2xl font-bold tracking-normal">Listo para explorar</h2>
          <p className="mt-2 text-sm leading-6 text-foreground/80">
            Crearemos una empresa demo con credenciales temporales y dejaremos la sesion iniciada.
          </p>

          {error && (
            <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={handleStartDemo}
            disabled={loading}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creando empresa demo
              </>
            ) : (
              <>
                Iniciar demo ahora
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          <div className="mt-6 space-y-3 text-sm text-foreground/80">
            <Benefit text="No requiere registro previo" />
            <Benefit text="Acceso inmediato al dashboard" />
            <Benefit text="Datos de ejemplo incluidos" />
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Ya tienes una cuenta?{' '}
            <a href="/login" className="font-medium text-blue-700 hover:text-blue-800">
              Inicia sesion
            </a>
          </p>
        </aside>
      </section>
    </main>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-muted text-foreground/85">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-foreground/80">{description}</p>
    </article>
  );
}

function Benefit({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2">
      <Check className="h-4 w-4 text-emerald-600" />
      <span>{text}</span>
    </div>
  );
}

function CredentialRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground">
          {value}
        </code>
        <button
          type="button"
          onClick={() => onCopy(value)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-700 text-white transition hover:bg-blue-800"
          aria-label={`Copiar ${label}`}
        >
          <Clipboard className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
