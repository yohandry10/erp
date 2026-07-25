"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api-fetch";
import { AlertTriangle, Clock3, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DemoStatus {
  is_demo: boolean;
  is_expired: boolean;
  dias_restantes: number;
  can_extend: boolean;
}

export function DemoBanner() {
  const router = useRouter();
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDemoStatus();
  }, []);

  const fetchDemoStatus = async () => {
    try {
      const response = await fetchApi("/api/demo/status");

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      // El banner es informativo: una caída transitoria no debe convertir una
      // pantalla operativa en un falso error fatal de consola.
      console.warn("Demo status unavailable:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExtend = async () => {
    try {
      const response = await fetchApi("/api/demo/extend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dias_extension: 7 }),
      });

      if (response.ok) {
        await fetchDemoStatus();
      }
    } catch (error) {
      console.warn("Demo extension unavailable:", error);
    }
  };

  const handleConvert = () => {
    router.push("/demo/convert");
  };

  if (loading || !status || !status.is_demo || dismissed) {
    return null;
  }

  const getMessage = () => {
    if (status.is_expired) {
      return "Tu demo ha expirado";
    }
    if (status.dias_restantes === 1) {
      return "Tu demo expira mañana";
    }
    return `Modo demo · Expira en ${status.dias_restantes} días`;
  };

  const isWarning = !status.is_expired && status.dias_restantes <= 3;
  const StatusIcon = status.is_expired ? AlertTriangle : Clock3;

  return (
    <div
      data-testid="demo-banner"
      className={cn(
        "mt-3 flex flex-col gap-3 rounded-2xl border px-4 py-3 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between",
        status.is_expired
          ? "border-red-300/30 bg-gradient-to-r from-red-700 to-red-500 shadow-red-950/15"
          : isWarning
            ? "border-amber-200/40 bg-gradient-to-r from-amber-700 to-amber-500 shadow-amber-950/15"
            : "border-blue-300/30 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 shadow-blue-950/15",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-foreground/15" aria-hidden="true">
          <StatusIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 text-sm font-semibold leading-5">{getMessage()}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        {status.can_extend && !status.is_expired && (
          <button
            type="button"
            onClick={handleExtend}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-primary-foreground/30 bg-primary-foreground/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/80"
          >
            Extender 7 días
          </button>
        )}

        <button
          type="button"
          onClick={handleConvert}
          data-testid="demo-convert-button"
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-[hsl(var(--brand-contrast-surface)/0.8)] bg-[hsl(var(--brand-contrast-surface))] px-3 py-2 text-sm font-bold text-[hsl(var(--brand-contrast-foreground))] shadow-sm transition hover:bg-[hsl(var(--brand-contrast-surface)/0.94)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-contrast-surface))] sm:flex-none"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Convertir a cuenta real
        </button>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-transparent text-white/90 transition hover:border-primary-foreground/20 hover:bg-primary-foreground/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/80"
          aria-label="Ocultar aviso de cuenta demo"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
