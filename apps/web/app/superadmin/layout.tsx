"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardThemeToggle } from "@/components/ui/dashboard-theme-toggle";
import { NotificationBell } from "@/components/notifications";
import { useDashboardTheme } from "@/hooks/use-dashboard-theme";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isSuperAdmin, tenant, loading: tenantLoading } = useTenant();
  const { signOut } = useAuth();
  const { theme: dashboardTheme, toggleTheme } = useDashboardTheme();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  };

  // Guard: redirect non-superadmin users
  useEffect(() => {
    if (!tenantLoading && !isSuperAdmin) {
      router.push("/dashboard");
    }
  }, [isSuperAdmin, tenantLoading, router]);

  // Don't render content until we verify superadmin status
  if (tenantLoading) {
    return null;
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div
      data-erp-theme={dashboardTheme}
      className="group/dashboard min-h-screen overflow-auto bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground group-data-[erp-theme=light]/dashboard:from-slate-50 group-data-[erp-theme=light]/dashboard:via-slate-100 group-data-[erp-theme=light]/dashboard:to-slate-200 md:p-6 lg:p-8"
    >
      <div className="fixed right-5 top-5 z-50 flex items-center gap-2">
        {/* Las notificaciones son de un tenant y el superadmin no tiene ninguno:
            la campana pedía /notifications/unread, recibía 401 y sacaba un
            "No autorizado para consultar este recurso" en su propio panel. */}
        {tenant ? <NotificationBell /> : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleSignOut}
          disabled={signingOut}
          aria-label="Cerrar Sesión"
        >
          <LogOut className="h-4 w-4" />
          {signingOut ? "Cerrando..." : "Cerrar Sesión"}
        </Button>
        <DashboardThemeToggle
          theme={dashboardTheme}
          onToggle={toggleTheme}
          className="static"
        />
      </div>
      {children}
    </div>
  );
}
