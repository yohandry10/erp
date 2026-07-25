"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTenant } from "@/contexts/TenantContext";
import { DashboardThemeToggle } from "@/components/ui/dashboard-theme-toggle";
import { NotificationBell } from "@/components/notifications";
import { useDashboardTheme } from "@/hooks/use-dashboard-theme";

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isSuperAdmin, loading: tenantLoading } = useTenant();
  const { theme: dashboardTheme, toggleTheme } = useDashboardTheme();

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
        <NotificationBell />
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
