"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { parseDateLocal } from '@/lib/date-utils'
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/use-api";
import { useEmpresaConfig } from "@/hooks/use-empresa-config";
import { PedidoVenta } from "@/types/ventas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Truck, RefreshCw, Eye } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ConfirmarDespachoButton } from "@/components/ventas/ConfirmarDespachoButton";
import { LogisticsDisabledState } from "../LogisticsDisabledState";
import { useCountryContext } from "@/hooks/use-country-context";

export default function ListoDespachoPage() {
  const router = useRouter();
  const { get } = useApi({ throwOnError: true, showErrorToast: false, retries: 0 });
  const { user } = useTenant();
  const scope = `${user?.tenant_id ?? ""}:${user?.id ?? ""}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const requestRef = useRef(0);
  const { loading: configLoading, isFlujologistica } = useEmpresaConfig();
  const country = useCountryContext();

  const [ordenes, setOrdenes] = useState<PedidoVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);

  const loadOrdenes = useCallback(async () => {
    if (!isFlujologistica || !user?.tenant_id || !user.id) return;
    const request = ++requestRef.current;
    try {
      setLoading(true);
      setOrdenes([]);
      setError(null);
      setLoadedScope(null);
      const response = await get("/inventario/logistica/listo-despacho");
      if (request !== requestRef.current || scopeRef.current !== scope) return;
      const data = response?.success === true ? response.data : response;
      if (!Array.isArray(data) || data.some(orden => !orden?.id || !Array.isArray(orden.detalle)
        || orden.detalle.some((line: any) => !line.id || typeof line.despachable !== "boolean"
          || !Number.isFinite(Number(line.cantidad)) || !Number.isFinite(Number(line.cantidad_despachada))))) {
        throw new Error("La respuesta de las órdenes está incompleta. Reintenta la consulta.");
      }
      setOrdenes(data);
      setLoadedScope(scope);
    } catch (cause) {
      if (request !== requestRef.current || scopeRef.current !== scope) return;
      setOrdenes([]);
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar las órdenes listas para despacho.");
    } finally {
      if (request === requestRef.current && scopeRef.current === scope) setLoading(false);
    }
  }, [get, isFlujologistica, scope, user?.tenant_id, user?.id]);

  useEffect(() => {
    loadOrdenes();
    return () => { requestRef.current++; };
  }, [loadOrdenes]);

  const handleVerDetalle = (pedidoId: string) => {
    router.push(`/dashboard/ventas/pedidos/${pedidoId}`);
  };

  const formatFecha = (fecha: string) => {
    try {
      return format(parseDateLocal(fecha), "dd/MM/yyyy", { locale: es });
    } catch {
      return fecha;
    }
  };

  const formatMonto = (monto: number) => {
    return new Intl.NumberFormat(country.locale || "es-PE", {
      style: "currency",
      currency: country.moneda || "PEN",
    }).format(monto);
  };

  if (configLoading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="flex min-h-48 items-center justify-center">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p>Cargando configuración...</p>
        </div>
      </div>
    );
  }

  if (!isFlujologistica) {
    return (
      <LogisticsDisabledState
        icon={Truck}
        title="Activa logística para despachar pedidos"
        description="Esta pantalla muestra pedidos preparados y listos para salir de almacén. Para usarla, activa el flujo logístico una sola vez; después el sistema habilitará preparación, despacho y facturación en el orden correcto."
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Órdenes Listas para Despacho</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Confirma el despacho de pedidos preparados
          </p>
        </div>
        <Button onClick={loadOrdenes} variant="outline" disabled={loading}>
          <RefreshCw />
          Actualizar
        </Button>
      </div>

      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
        {error ? (
          <div role="alert" className="space-y-3 p-6 text-center">
            <p className="text-destructive">{error}</p>
            <Button type="button" onClick={loadOrdenes} disabled={loading}>Reintentar</Button>
          </div>
        ) : loading || loadedScope !== scope ? (
          <div className="flex min-h-48 items-center justify-center">
            <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
            <p>Cargando órdenes...</p>
          </div>
        ) : ordenes.length === 0 ? (
          <div className="px-4 py-10 text-center text-muted-foreground">
            <Truck />
            <h3>No hay órdenes listas para despacho</h3>
            <p>Las órdenes aparecerán aquí cuando estén preparadas</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>N° Pedido</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Ítems</th>
                <th>Total</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ordenes.map((orden) => (
                <tr key={orden.id}>
                  <td>
                    <div>
                      <strong>{orden.numero}</strong>
                      <Badge className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400 dark:text-emerald-300">{orden.estado === "DESPACHO_PARCIAL" ? "Despacho parcial" : "Listo Despacho"}</Badge>
                    </div>
                  </td>
                  <td>
                    <div>
                      <div>{orden.cliente?.razon_social || "N/A"}</div>
                      <small>{orden.cliente?.documento_numero || ""}</small>
                    </div>
                  </td>
                  <td>
                    {formatFecha((orden as any).fecha || orden.created_at)}
                  </td>
                  <td>{orden.detalle?.length || 0}</td>
                  <td>
                    <strong>{formatMonto(orden.total)}</strong>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleVerDetalle(orden.id)}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold leading-5 text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                      >
                        <Eye />
                        Ver
                      </Button>
                      <ConfirmarDespachoButton
                        pedidoId={orden.id}
                        pedidoNumero={orden.numero}
                        detalle={orden.detalle}
                        onSuccess={loadOrdenes}
                        onRejected={loadOrdenes}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && !error && loadedScope === scope && ordenes.length > 0 && (
        <div className="mt-2 text-[0.8125rem] text-muted-foreground">
          {ordenes.length}{" "}
          {ordenes.length === 1 ? "orden lista" : "órdenes listas"} para
          despacho
        </div>
      )}
    </div>
  );
}
