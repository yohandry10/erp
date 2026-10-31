"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { usePermission } from "@/hooks/use-permission";
import { Button } from "@/components/ui/button";

type Origin = {
  id: string;
  contrato_id: string;
  contrato_numero: string;
  estado: string;
  lineas: Array<{
    id: string;
    descripcion: string;
    cantidad: number;
    oc_numero: string;
    fecha_programada: string;
    destino: string;
  }>;
};
export function SupplyOrderOrigin({
  pedidoId,
  estado,
}: {
  pedidoId: string;
  estado: string;
}) {
  const permission = usePermission("ventas", "ver", "contratos");
  const { get } = useApi({ throwOnError: true, showErrorToast: false });
  const [data, setData] = useState<Origin[]>([]);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!permission.hasPermission) return;
    let valid = true;
    setError("");
    setData([]);
    void get(`/api/ventas/contratos/origen-pedido/${pedidoId}`)
      .then((r) => {
        if (valid) setData(r.data);
      })
      .catch((e: Error) => {
        if (valid) setError(e.message);
      });
    return () => {
      valid = false;
    };
  }, [get, pedidoId, estado, permission.hasPermission, version]);
  if (!permission.hasPermission || (!error && !data.length)) return null;
  return (
    <section
      aria-label="Origen contractual del pedido"
      className="space-y-3 rounded-md border border-border bg-background p-4 text-foreground"
    >
      <h2 className="font-semibold">Origen contractual</h2>
      {error && (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={reload}>
            Reintentar origen contractual
          </Button>
        </div>
      )}
      {data.map((v) => (
        <div key={v.id} className="space-y-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <Link
              className="font-medium underline underline-offset-4"
              href={`/dashboard/ventas/contratos/?contrato=${v.contrato_id}`}
            >
              Contrato {v.contrato_numero}
            </Link>
            <span>
              {v.estado === "DESVINCULADO"
                ? "Desvinculado"
                : estado.toUpperCase() === "CANCELADO"
                  ? "Pedido cancelado · saldo liberado"
                  : "Vinculado"}
            </span>
          </div>
          <ul className="space-y-1">
            {v.lineas.map((l) => (
              <li key={l.id} className="break-words">
                {l.oc_numero} ·{" "}
                {l.fecha_programada.slice(0, 10).split("-").reverse().join("/")}{" "}
                · {l.descripcion}:{" "}
                {Number(l.cantidad).toLocaleString("es-PE", {
                  maximumFractionDigits: 4,
                })}{" "}
                · {l.destino}
              </li>
            ))}
          </ul>
          {v.estado === "VINCULADO" && estado.toUpperCase() === "PENDIENTE" && (
            <p className="text-muted-foreground">
              Para cambiar sus líneas, desvincule primero el pedido desde el
              contrato. Confirme y despache desde su flujo habitual.
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
