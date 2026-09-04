"use client";

import Sidebar from "../../components/layout/sidebar";
import { useEffect, useLayoutEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { EmpresaConfigProvider } from "@/hooks/use-empresa-config";
import { useAuth } from "@/contexts/AuthContext";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { CentroAyuda } from "@/components/help";
import { OnboardingProvider } from "@/components/onboarding";
import { DashboardThemeToggle } from "@/components/ui/dashboard-theme-toggle";
import { useCountryContext } from "@/hooks/use-country-context";
import { NotificationBell } from "@/components/notifications";
import { OfflineStatusBadge } from "@/components/offline/OfflineStatusBadge";
import { useDashboardTheme } from "@/hooks/use-dashboard-theme";
import { jurisdictionRedirectFor } from "@/lib/jurisdiction-routes";

// useLayoutEffect corre antes del paint en el cliente; en SSR no se ejecuta.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, loading: authLoading } = useAuth();
  const country = useCountryContext();
  const { theme: dashboardTheme, toggleTheme } = useDashboardTheme();
  const esSuperadminSinTenant = Boolean(
    session?.user?.is_super_admin && !session.user.tenant_id,
  );
  const jurisdictionRedirect = country.loading || country.requiresSetup
    ? null
    : jurisdictionRedirectFor(pathname, country.paisCodigo);

  // El script del layout raíz solo fija el tema en cargas completas. En navegación
  // cliente (p.ej. login → dashboard) <html> queda sin data-erp-theme y los tokens
  // caen al :root claro → flash blanco. Este layout effect lo fija antes del paint
  // en cada montaje del dashboard, cerrando ese hueco.
  useIsomorphicLayoutEffect(() => {
    document.documentElement.dataset.erpTheme = dashboardTheme;
  }, [dashboardTheme]);

  useEffect(() => {
    document.documentElement.dataset.erpHydrated = "true";
    return () => {
      delete document.documentElement.dataset.erpHydrated;
    };
  }, []);

  // ✅ SOLUCIÓN: Usar AuthContext en lugar de verificación manual
  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!session) {
      router.replace("/login");
      return;
    }

    // El superadmin no tiene tenant, así que el dashboard de empresa no tiene
    // nada que mostrarle: sin configuración fiscal acabaría en el asistente de
    // alta con todas las llamadas devolviendo 401. Su sitio es su propio panel.
    if (esSuperadminSinTenant) {
      router.replace("/superadmin/dashboard");
    }
  }, [session, authLoading, esSuperadminSinTenant, router]);

  useEffect(() => {
    if (authLoading || !session) {
      return;
    }

    if (country.loading) {
      return;
    }

    // El asistente de alta configura UN tenant; el superadmin no tiene ninguno.
    // Sin esta salida gana la carrera contra el efecto de arriba y el
    // superadmin acaba en un formulario de alta que no es el suyo.
    if (esSuperadminSinTenant) {
      return;
    }

    const isWizardRoute = pathname?.startsWith("/dashboard/wizard");
    if (country.requiresSetup && !isWizardRoute) {
      router.replace("/dashboard/wizard");
    }
  }, [
    authLoading,
    session,
    country.loading,
    country.requiresSetup,
    esSuperadminSinTenant,
    pathname,
    router,
  ]);

  useEffect(() => {
    if (!authLoading && session && jurisdictionRedirect) {
      router.replace(jurisdictionRedirect);
    }
  }, [authLoading, jurisdictionRedirect, router, session]);

  if (!authLoading && !session) {
    return null;
  }

  // No renderizar módulos con los valores fiscales por defecto mientras se
  // resuelve el país del tenant. Esto evita que una demo AR/CO muestre por un
  // instante moneda PEN o etiquetas SUNAT antes de hidratar su configuración.
  if (authLoading || (session && country.loading)) {
    return (
      <div
        data-erp-theme={dashboardTheme}
        className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground"
      >
        <div className="rounded-2xl border border-border bg-card px-6 py-5 text-center shadow-xl">
          <p className="text-sm font-semibold">Preparando configuración fiscal del tenant…</p>
          <p className="mt-1 text-xs text-muted-foreground">País, moneda y reglas tributarias</p>
        </div>
      </div>
    );
  }

  const isWizardRoute = pathname?.startsWith("/dashboard/wizard");
  if (
    !authLoading &&
    session &&
    !esSuperadminSinTenant &&
    !country.loading &&
    country.requiresSetup &&
    !isWizardRoute
  ) {
    return null;
  }

  // No se pinta ni un frame de la jurisdicción equivocada mientras Next
  // reemplaza una URL directa o un marcador histórico.
  if (jurisdictionRedirect) return null;

  return (
    <EmpresaConfigProvider>
      <OnboardingProvider>
        <div
          data-erp-theme={dashboardTheme}
          className="group/dashboard relative flex min-h-screen flex-col overflow-hidden"
        >
          <div className="relative flex flex-1 overflow-hidden">
            <Sidebar />
            <main
              className="relative ml-0 min-h-full max-w-[100vw] flex-1 overflow-auto bg-gradient-to-br from-background via-muted/50 to-background p-4 transition-[margin-left,background-color] duration-300 ease-out group-data-[erp-theme=light]/dashboard:from-slate-50 group-data-[erp-theme=light]/dashboard:via-slate-100 group-data-[erp-theme=light]/dashboard:to-slate-200 md:ml-[240px] md:max-w-[calc(100vw-240px)] md:p-6 lg:ml-[280px] lg:max-w-[calc(100vw-280px)] lg:p-8"
              data-theme={dashboardTheme}
            >
              <div
                data-testid="dashboard-utility-bar"
                className="relative z-[900] -mx-4 -mt-4 mb-5 border-b border-border/70 bg-background/90 px-4 py-3 pl-16 shadow-sm backdrop-blur-xl md:-mx-6 md:-mt-6 md:px-6 md:pl-6 lg:-mx-8 lg:-mt-8 lg:px-8"
              >
                <div className="flex min-h-11 items-center justify-end gap-2">
                <OfflineStatusBadge />
                <NotificationBell className="shrink-0" />
                <DashboardThemeToggle
                  theme={dashboardTheme}
                  onToggle={toggleTheme}
                  className="static"
                />
                </div>
                <DemoBanner />
              </div>
              {children}
            </main>
          </div>

          {/* Centro de ayuda contextual: botón flotante, se abre solo si se pide */}
          <CentroAyuda />
        </div>
      </OnboardingProvider>
    </EmpresaConfigProvider>
  );
}
