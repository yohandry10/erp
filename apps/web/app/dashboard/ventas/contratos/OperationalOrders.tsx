"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi } from "@/hooks/use-api";
import { usePermission } from "@/hooks/use-permission";
import { Campo, control } from "./ContractForm";
import { cantidad, Contrato, fecha } from "./types";

type Candidate = {
  id: string;
  numero: string;
  fingerprint: string;
  detalle: Array<{
    id: string;
    producto_id: string;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
  }>;
};
type Linked = {
  id: string;
  pedido_id: string;
  numero: string;
  estado: string;
  pedido_estado: string;
  lineas: Array<{
    id: string;
    descripcion: string;
    cantidad: number;
    cantidad_despachada: number;
    cantidad_facturada: number;
    entrega_id: string;
  }>;
};
type Props = {
  contrato: Contrato;
  busy: boolean;
  manage: boolean;
  onSubmit: (path: string, payload: object) => void;
};
export function OperationalOrders({ contrato, busy, manage, onSubmit }: Props) {
  const permission = usePermission("ventas", "ver", "pedidos");
  const editing = usePermission("ventas", "editar", "pedidos");
  const { get } = useApi({ throwOnError: true, showErrorToast: false });
  const [links, setLinks] = useState<Linked[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"list" | "link" | "unlink">("list");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [candidates, setCandidates] = useState<
    Array<{ id: string; numero: string }>
  >([]);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [unlink, setUnlink] = useState<Linked | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);
  const base = `/api/ventas/contratos/${contrato.id}/pedidos`;
  useEffect(() => {
    if (!permission.hasPermission) return;
    let valid = true;
    setLoading(true);
    setError("");
    void get(base)
      .then((r) => {
        if (valid) {
          setLinks(r.data);
          setMode("list");
        }
      })
      .catch((e: Error) => {
        if (valid) setError(e.message);
      })
      .finally(() => {
        if (valid) setLoading(false);
      });
    return () => {
      valid = false;
    };
  }, [get, base, permission.hasPermission, contrato.historial.length]);
  const find = async (nextPage: number) => {
    const current = ++seq.current;
    setSearching(true);
    setError("");
    setCandidate(null);
    try {
      const response = await get(`${base}/candidatos`, {
        params: { busqueda: search, pagina: nextPage },
      });
      if (current === seq.current) {
        setCandidates(response.data);
        setPage(nextPage);
      }
    } catch (e) {
      if (current === seq.current) setError((e as Error).message);
    } finally {
      if (current === seq.current) setSearching(false);
    }
  };
  const choose = async (id: string) => {
    const current = ++seq.current;
    setSearching(true);
    setError("");
    setCandidate(null);
    setMapping({});
    try {
      const response = await get(`${base}/candidatos/${id}`);
      if (current === seq.current) setCandidate(response.data);
    } catch (e) {
      if (current === seq.current) setError((e as Error).message);
    } finally {
      if (current === seq.current) setSearching(false);
    }
  };
  if (permission.loading || !permission.hasPermission) return null;
  return (
    <section
      className="space-y-4 border-t border-border pt-5"
      aria-label="Pedidos operativos del contrato"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Pedidos operativos</h3>
        {manage &&
          editing.hasPermission &&
          contrato.estado === "ACTIVO" &&
          mode === "list" && (
            <Button
              variant="outline"
              disabled={busy || loading || Boolean(error)}
              onClick={() => {
                setMode("link");
                setReason("");
                setCandidate(null);
                setCandidates([]);
                setMapping({});
              }}
            >
              Vincular pedido
            </Button>
          )}
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">
        Cada línea del pedido se asigna completa a una programación. La
        confirmación, reserva, despacho y cancelación se gestionan desde
        Pedidos.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="text-sm">
          Cargando pedidos vinculados…
        </p>
      ) : (
        !error &&
        links.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aún no hay pedidos vinculados.
          </p>
        )
      )}
      {mode === "link" && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              candidate &&
              candidate.detalle.length &&
              candidate.detalle.every((d) => mapping[d.id])
            )
              onSubmit(`${base}/${candidate.id}/vincular`, {
                fingerprint: candidate.fingerprint,
                motivo: reason,
                lineas: candidate.detalle.map((d) => ({
                  pedido_detalle_id: d.id,
                  entrega_id: mapping[d.id],
                })),
              });
          }}
        >
          <fieldset disabled={busy || searching} className="space-y-4">
            <Campo label="Buscar pedido pendiente por número">
              <div className="flex gap-2">
                <Input
                  aria-label="Buscar pedido pendiente por número"
                  value={search}
                  maxLength={120}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void find(1)}
                >
                  Buscar pedidos
                </Button>
              </div>
            </Campo>
            <p className="text-xs text-muted-foreground">
              Se muestran pedidos pendientes del mismo cliente y moneda, sin
              vínculo vigente.
            </p>
            <Campo label="Pedido pendiente">
              <select
                aria-label="Pedido pendiente"
                className={control}
                value={candidate?.id || ""}
                onChange={(e) => {
                  if (e.target.value) void choose(e.target.value);
                }}
              >
                <option value="">Seleccionar pedido…</option>
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.numero}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || searching || page === 1}
                onClick={() => void find(page - 1)}
              >
                Pedidos anteriores
              </Button>
              <span className="text-xs">Página {page}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || searching || candidates.length < 25}
                onClick={() => void find(page + 1)}
              >
                Más pedidos
              </Button>
            </div>
            {candidate?.detalle.map((d, index) => {
              const options = contrato.entregas
                .filter((e) => e.estado === "PROGRAMADA")
                .map((e) => {
                  const order = contrato.ordenes.find(
                    (o) =>
                      o.estado === "ACTIVA" &&
                      o.lineas.some((l) => l.id === e.orden_linea_id),
                  );
                  const ol = order?.lineas.find(
                    (l) => l.id === e.orden_linea_id,
                  );
                  const cl = contrato.lineas.find(
                    (l) => l.id === ol?.contrato_linea_id,
                  );
                  const used = links
                    .filter(
                      (v) =>
                        v.estado === "VINCULADO" &&
                        v.pedido_estado.toUpperCase() !== "CANCELADO",
                    )
                    .flatMap((v) => v.lineas)
                    .filter((l) => l.entrega_id === e.id)
                    .reduce((sum, l) => sum + Number(l.cantidad), 0);
                  return {
                    ...e,
                    order,
                    ol,
                    cl,
                    remaining: Number(e.cantidad) - used,
                  };
                })
                .filter(
                  (e) =>
                    e.cl?.producto_id === d.producto_id &&
                    Number(e.ol?.precio_unitario) ===
                      Number(d.precio_unitario) &&
                    e.remaining >= Number(d.cantidad),
                );
              return (
                <div
                  key={d.id}
                  className="space-y-2 border-t border-border pt-3"
                >
                  <p className="text-sm font-medium">
                    {d.descripcion} · {cantidad(d.cantidad)} ·{" "}
                    {d.precio_unitario} {contrato.moneda}
                  </p>
                  <Campo label={`Programación de la línea ${index + 1}`}>
                    <select
                      aria-label={`Programación de la línea ${index + 1}`}
                      className={control}
                      required
                      value={mapping[d.id] || ""}
                      onChange={(e) =>
                        setMapping({ ...mapping, [d.id]: e.target.value })
                      }
                    >
                      <option value="">Seleccionar programación…</option>
                      {options.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.order?.numero} · {fecha(e.fecha_programada)} ·{" "}
                          {cantidad(e.remaining)} disponibles · {e.destino}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  {!options.length && (
                    <p className="text-sm text-destructive">
                      No hay programación con saldo, producto y precio
                      compatibles para esta línea.
                    </p>
                  )}
                </div>
              );
            })}
            <Campo label="Motivo del vínculo">
              <textarea
                aria-label="Motivo del vínculo"
                className={control}
                required
                minLength={5}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Campo>
          </fieldset>
          {searching && (
            <p role="status" className="text-sm">
              Consultando pedidos…
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={
                busy || searching || !candidate || !candidate.detalle.length
              }
            >
              Confirmar vínculo
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                ++seq.current;
                setSearching(false);
                setMode("list");
              }}
            >
              Cancelar vínculo
            </Button>
          </div>
        </form>
      )}
      {mode === "unlink" && unlink && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(`${base}/${unlink.pedido_id}/desvincular`, {
              motivo: reason,
            });
          }}
        >
          <p className="text-sm font-medium">Desvincular {unlink.numero}</p>
          <Campo label="Motivo de desvinculación">
            <textarea
              aria-label="Motivo de desvinculación"
              className={control}
              required
              minLength={5}
              maxLength={1000}
              disabled={busy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Campo>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} type="submit">
              Confirmar desvinculación
            </Button>
            <Button
              type="button"
              disabled={busy}
              variant="outline"
              onClick={() => setMode("list")}
            >
              Conservar vínculo
            </Button>
          </div>
        </form>
      )}
      <ul className="divide-y divide-border">
        {links.map((v) => (
          <li key={v.id} className="space-y-2 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                className="font-medium underline underline-offset-4"
                href={`/dashboard/ventas/pedidos/${v.pedido_id}`}
              >
                {v.numero}
              </Link>
              <span>
                {v.estado === "DESVINCULADO"
                  ? "Desvinculado"
                  : v.pedido_estado.toUpperCase() === "CANCELADO"
                    ? "Pedido cancelado · saldo liberado"
                    : v.pedido_estado}
              </span>
            </div>
            <ul className="space-y-1">
              {v.lineas.map((l) => {
                const delivery = contrato.entregas.find(
                  (e) => e.id === l.entrega_id,
                );
                const order = contrato.ordenes.find((o) =>
                  o.lineas.some((ol) => ol.id === delivery?.orden_linea_id),
                );
                return (
                  <li key={l.id} className="space-y-1">
                    <p>
                      {l.descripcion}: {cantidad(l.cantidad)}{" "}
                      {v.estado === "DESVINCULADO"
                        ? "asignadas originalmente"
                        : `vinculadas · ${cantidad(l.cantidad_despachada)} despachadas · ${cantidad(l.cantidad_facturada)} facturadas`}
                    </p>
                    {delivery && (
                      <p className="text-xs text-muted-foreground">
                        {order?.numero} · {fecha(delivery.fecha_programada)} ·{" "}
                        {delivery.destino}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            {manage &&
              editing.hasPermission &&
              mode === "list" &&
              v.estado === "VINCULADO" &&
              v.pedido_estado.toUpperCase() === "PENDIENTE" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setUnlink(v);
                    setReason("");
                    setMode("unlink");
                  }}
                >
                  Desvincular {v.numero}
                </Button>
              )}
          </li>
        ))}
      </ul>
    </section>
  );
}
