"use client";

import { useState, useEffect } from "react";
import { sumReportMoney } from '@/lib/finanzas/report-read-contract';
import { AlertTriangle, X, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { useLocalizedMoney } from "@/hooks/use-localized-money";
import { parseDateLocal } from '@/lib/date-utils'

interface VencimientoItem {
  id: string;
  numero_documento: string;
  proveedor_razon_social: string;
  fecha_vencimiento: string;
  saldo: number;
  moneda: string;
  dias_restantes: number;
}

interface VencimientosAlertProps {
  diasAdelante?: number;
  proveedorId?: string;
  data: VencimientoItem[] | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
  onCuentaClick?: (cuentaId: string) => void;
}

export default function VencimientosAlert({
  diasAdelante = 7,
  proveedorId,
  data,
  loading,
  error,
  retry,
  onCuentaClick,
}: VencimientosAlertProps) {
  const { country, formatCurrency } = useLocalizedMoney();
  const vencimientos = data ?? [];
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
    setExpanded(false);
  }, [proveedorId, data]);

  const formatDate = (dateString: string) => {
    return parseDateLocal(dateString).toLocaleDateString(country.locale || "es-PE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  const getAlertColor = (diasRestantes: number) => {
    if (diasRestantes < 0)
      return { bg: "#fee2e2", border: "#ef4444", text: "#991b1b" };
    if (diasRestantes <= 3)
      return { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" };
    return { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" };
  };

  if (loading) return <p role="status" className="text-sm text-muted-foreground">Consultando próximos vencimientos...</p>;
  if (error) return <div className="rounded-xl border border-border p-4">
    <p role="alert">No se pudieron consultar los próximos vencimientos.</p>
    <button type="button" onClick={retry} className="mt-2 rounded border px-4 py-2">Reintentar vencimientos</button>
  </div>;
  if (dismissed || vencimientos.length === 0) {
    return null;
  }

  const vencidosCount = vencimientos.filter((v) => v.dias_restantes < 0).length;
  const proximosCount = vencimientos.filter(
    (v) => v.dias_restantes >= 0,
  ).length;
  const totalSaldo = [...new Set(vencimientos.map(v => v.moneda))].map(moneda =>
    formatCurrency(sumReportMoney(vencimientos.filter(v => v.moneda === moneda).map(v => v.saldo)), moneda)
  ).join(' · ');

  const alertColor =
    vencidosCount > 0
      ? { bg: "#fee2e2", border: "#ef4444", text: "#991b1b", icon: "#ef4444" }
      : { bg: "#fef3c7", border: "#f59e0b", text: "#92400e", icon: "#f59e0b" };

  return (
    <div className="rounded-xl p-4 mb-6 shadow">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-[1]">
          <AlertTriangle size={24} className="shrink-0" />
          <div className="flex-[1]">
            <h3 className="text-base font-bold m-0 mb-1">
              {vencidosCount > 0
                ? `⚠️ ${vencidosCount} cuenta${vencidosCount > 1 ? "s" : ""} vencida${vencidosCount > 1 ? "s" : ""}`
                : `📅 ${proximosCount} cuenta${proximosCount > 1 ? "s" : ""} por vencer`}
            </h3>
            <p className="text-[0.875rem] m-0 opacity-[0.9]">
              {vencidosCount > 0 && proximosCount > 0
                ? `${vencidosCount} vencida${vencidosCount > 1 ? "s" : ""} y ${proximosCount} próxima${proximosCount > 1 ? "s" : ""} a vencer`
                : vencidosCount > 0
                  ? `Requiere${vencidosCount > 1 ? "n" : ""} atención inmediata`
                  : `Vence${proximosCount > 1 ? "n" : ""} en los próximos ${diasAdelante} días`}
              {" • "}
              <strong>
                {totalSaldo}
              </strong>{" "}
              total
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="py-2 px-4 rounded-lg bg-card cursor-pointer text-[0.875rem] font-semibold flex items-center gap-2 transition"
          >
            {expanded ? (
              <>
                Ocultar <ChevronUp size={16} />
              </>
            ) : (
              <>
                Ver detalles <ChevronDown size={16} />
              </>
            )}
          </button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Cerrar alerta de vencimientos"
            title="Cerrar alerta de vencimientos"
            className="p-2 rounded-lg border-0 bg-transparent cursor-pointer flex items-center transition opacity-[0.7]"
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.background = "rgba(0,0,0,0.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "0.7";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-4 pt-4">
          <div className="grid gap-3 max-h-[400px] overflow-y-auto">
            {vencimientos.map((vencimiento) => {
              const itemColor = getAlertColor(vencimiento.dias_restantes);
              const isOverdue = vencimiento.dias_restantes < 0;

              return (
                <div
                  key={vencimiento.id}
                  className="bg-card rounded-lg py-3 px-4 flex items-center justify-between gap-4 transition"
                  onClick={() => onCuentaClick?.(vencimiento.id)}
                  onMouseEnter={(e) => {
                    if (onCuentaClick) {
                      e.currentTarget.style.transform = "translateX(4px)";
                      e.currentTarget.style.boxShadow =
                        "0 2px 8px rgba(0,0,0,0.1)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (onCuentaClick) {
                      e.currentTarget.style.transform = "translateX(0)";
                      e.currentTarget.style.boxShadow = "none";
                    }
                  }}
                >
                  <div className="flex items-center gap-3 flex-[1]">
                    <Clock size={20} className="shrink-0" />
                    <div className="flex-[1]">
                      <div className="text-[0.875rem] font-semibold text-foreground mb-1">
                        {vencimiento.numero_documento}
                        <span className="ml-2 text-xs font-medium text-muted-foreground">
                          • {vencimiento.proveedor_razon_social}
                        </span>
                      </div>
                      <div className="text-xs font-semibold">
                        {isOverdue
                          ? `⚠️ Vencido hace ${Math.abs(vencimiento.dias_restantes)} día${Math.abs(vencimiento.dias_restantes) > 1 ? "s" : ""}`
                          : vencimiento.dias_restantes === 0
                            ? "🔴 Vence HOY"
                            : `Vence en ${vencimiento.dias_restantes} día${vencimiento.dias_restantes > 1 ? "s" : ""}`}
                        {" • "}
                        {formatDate(vencimiento.fecha_vencimiento)}
                      </div>
                    </div>
                  </div>
                  <div className="text-[0.875rem] font-bold text-right shrink-0">
                    {formatCurrency(vencimiento.saldo, vencimiento.moneda)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
