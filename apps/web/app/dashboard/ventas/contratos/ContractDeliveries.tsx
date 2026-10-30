"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi } from "@/hooks/use-api";
import { Campo, control } from "./ContractForm";
import { cantidad, Contrato, fecha } from "./types";

type Programacion = {
  entrega_id: string;
  estado: "PROGRAMADA" | "ANULADA";
  fecha_programada: string;
  destino: string;
  oc_numero: string;
  codigo_producto: string;
  descripcion: string;
  unidad_medida: string;
  cantidad_programada: number;
  cantidad_despachada: number;
  cantidad_recibida: number;
  cantidad_aceptada: number;
  cantidad_rechazada: number;
};
type LoteDespacho = {
  lote_id: string | null;
  lote: string | null;
  fecha_vencimiento: string | null;
  cantidad: number;
  cantidad_recibida: number;
};
type Despacho = {
  despacho_id: string;
  pedido_id: string;
  pedido_numero: string;
  entrega_id: string;
  producto_nombre: string;
  producto_codigo: string;
  fecha_despacho: string;
  cantidad: number;
  cantidad_recibida: number;
  lotes: LoteDespacho[];
};
type Recepcion = {
  id: string;
  numero: number;
  pedido_numero: string;
  fecha_recepcion: string;
  receptor_nombre: string;
  receptor_cargo: string | null;
  guia_referencia: string | null;
  pecosa_numero: string | null;
  conformidad_numero: string | null;
  incidencias: string | null;
  estado: "REGISTRADA" | "ANULADA";
  version: number;
  motivo_anulacion: string | null;
  actor_nombre: string | null;
  lineas: Array<{
    despacho_id: string;
    producto_nombre: string;
    lote: string | null;
    cantidad_recibida: number;
    cantidad_aceptada: number;
    cantidad_rechazada: number;
    motivo_rechazo: string | null;
  }>;
};
type Ejecucion = { programaciones: Programacion[]; despachos: Despacho[]; recepciones: Recepcion[] };
type Props = {
  contrato: Contrato;
  busy: boolean;
  conform: boolean;
  onSubmit: (path: string, payload: object | FormData) => void;
};
type Fila = { recibida: string; rechazada: string; motivo: string };

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const decimal = (v: string) => /^\d+(\.\d{1,4})?$/.test(v.trim());
const pendiente = (total: number, usado: number) => Number((Number(total) - Number(usado)).toFixed(4));
const clave = (d: Despacho, l: LoteDespacho) => `${d.despacho_id}:${l.lote_id ?? ""}`;

export function ContractDeliveries({ contrato, busy, conform, onSubmit }: Props) {
  const { get } = useApi({ throwOnError: true, showErrorToast: false });
  const [data, setData] = useState<Ejecucion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [pedidoForm, setPedidoForm] = useState<string | null>(null);
  const [anular, setAnular] = useState<Recepcion | null>(null);
  const base = `/api/ventas/contratos/${contrato.id}`;
  useEffect(() => {
    let valid = true;
    setLoading(true);
    setError("");
    void get(`${base}/ejecucion`)
      .then((r) => {
        if (!valid) return;
        const d = r?.data ?? {};
        if (![d.programaciones, d.despachos, d.recepciones].every(Array.isArray))
          throw new Error("La ejecución del contrato llegó incompleta.");
        setData(d);
        setPedidoForm(null);
        setAnular(null);
      })
      .catch((e: Error) => valid && setError(e.message))
      .finally(() => valid && setLoading(false));
    return () => {
      valid = false;
    };
    // El expediente se vuelve a consultar después de cada operación.
  }, [get, base, contrato, reload]);

  const pedidos = useMemo(() => {
    const grupos = new Map<string, { pedido_id: string; numero: string; despachos: Despacho[] }>();
    for (const d of data?.despachos ?? []) {
      const g = grupos.get(d.pedido_id) ?? { pedido_id: d.pedido_id, numero: d.pedido_numero, despachos: [] };
      g.despachos.push(d);
      grupos.set(d.pedido_id, g);
    }
    return [...grupos.values()];
  }, [data]);
  const programaciones = (data?.programaciones ?? []).filter(
    (p) => p.estado === "PROGRAMADA" || Number(p.cantidad_despachada) > 0,
  );

  return (
    <section className="space-y-5 border-t border-border pt-5" aria-label="Entregas y conformidades">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Entregas y conformidades</h3>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Lo despachado sólo cuenta como cumplido cuando el cliente lo acepta en una recepción registrada. Marcar el
            seguimiento como entregado no acredita conformidad.
          </p>
        </div>
        <Button variant="outline" disabled={busy || loading} onClick={() => setReload((n) => n + 1)}>
          Actualizar
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error} Pulse Actualizar para volver a consultar.
        </p>
      )}
      {loading && !data ? (
        <p role="status" className="text-sm">
          Cargando ejecución del contrato…
        </p>
      ) : (
        data && (
          <>
            {!programaciones.length ? (
              <p className="text-sm text-muted-foreground">Aún no hay entregas programadas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm tabular-nums">
                  <caption className="sr-only">Cumplimiento por entrega programada</caption>
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="p-2">Entrega y producto</th>
                      <th scope="col" className="p-2 text-right">Programado</th>
                      <th scope="col" className="p-2 text-right">Despachado</th>
                      <th scope="col" className="p-2 text-right">Recibido</th>
                      <th scope="col" className="p-2 text-right">Aceptado</th>
                      <th scope="col" className="p-2 text-right">Rechazado</th>
                      <th scope="col" className="p-2 text-right">Por aceptar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {programaciones.map((p) => {
                      const porAceptar = Math.max(pendiente(p.cantidad_programada, p.cantidad_aceptada), 0);
                      return (
                        <tr key={p.entrega_id} className="border-b border-border align-top">
                          <td className="p-2">
                            <span className="font-medium">
                              {fecha(p.fecha_programada)} · {p.codigo_producto}
                            </span>
                            <span className="block">{p.descripcion}</span>
                            <span className="block text-xs text-muted-foreground">
                              {p.oc_numero} · {p.destino}
                              {p.estado === "ANULADA" ? " · anulada" : ""}
                            </span>
                          </td>
                          <td className="p-2 text-right">{cantidad(p.cantidad_programada)}</td>
                          <td className="p-2 text-right">{cantidad(p.cantidad_despachada)}</td>
                          <td className="p-2 text-right">{cantidad(p.cantidad_recibida)}</td>
                          <td className="p-2 text-right font-medium">{cantidad(p.cantidad_aceptada)}</td>
                          <td className={`p-2 text-right ${Number(p.cantidad_rechazada) > 0 ? "text-destructive" : ""}`}>
                            {cantidad(p.cantidad_rechazada)}
                          </td>
                          <td className="p-2 text-right font-medium">{cantidad(porAceptar)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Despachos de pedidos vinculados</h4>
              {!pedidos.length ? (
                <p className="text-sm text-muted-foreground">
                  Aún no hay despachos. Los despachos parciales de logística aparecen aquí con sus lotes.
                </p>
              ) : (
                <ul className="divide-y divide-border border-y border-border">
                  {pedidos.map((g) => {
                    const porRecibir = g.despachos.some((d) => d.lotes.some((l) => pendiente(l.cantidad, l.cantidad_recibida) > 0));
                    return (
                      <li key={g.pedido_id} className="space-y-3 py-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="font-medium">Pedido {g.numero}</p>
                          {conform && porRecibir && pedidoForm !== g.pedido_id && (
                            <Button variant="outline" disabled={busy} onClick={() => setPedidoForm(g.pedido_id)}>
                              Registrar recepción
                            </Button>
                          )}
                        </div>
                        <ul className="space-y-1 tabular-nums">
                          {g.despachos.map((d) => (
                            <li key={d.despacho_id}>
                              <span className="font-medium">{d.producto_codigo}</span> · despachado {fecha(d.fecha_despacho)} ·{" "}
                              {d.lotes
                                .map((l) =>
                                  `${l.lote ? `lote ${l.lote}` : "sin lote"}: ${cantidad(l.cantidad)} (recibido ${cantidad(l.cantidad_recibida)})`,
                                )
                                .join(" · ")}
                            </li>
                          ))}
                        </ul>
                        {pedidoForm === g.pedido_id && (
                          <RecepcionForm
                            pedidoId={g.pedido_id}
                            despachos={g.despachos}
                            busy={busy}
                            onCancel={() => setPedidoForm(null)}
                            onSubmit={(payload) => onSubmit(`${base}/recepciones`, payload)}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Recepciones registradas</h4>
              {!data.recepciones.length ? (
                <p className="text-sm text-muted-foreground">Aún no hay recepciones del cliente.</p>
              ) : (
                <ol className="divide-y divide-border border-y border-border">
                  {data.recepciones.map((r) => (
                    <li key={r.id} className="space-y-2 py-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            Recepción {r.numero} · Pedido {r.pedido_numero} · {fecha(r.fecha_recepcion)}
                            {r.estado === "ANULADA" ? " · Anulada" : ""}
                          </p>
                          <p className="text-muted-foreground">
                            Recibió {r.receptor_nombre}
                            {r.receptor_cargo ? ` (${r.receptor_cargo})` : ""}
                            {[
                              r.guia_referencia && `Guía ${r.guia_referencia}`,
                              r.pecosa_numero && `PECOSA ${r.pecosa_numero}`,
                              r.conformidad_numero && `Conformidad ${r.conformidad_numero}`,
                            ]
                              .filter(Boolean)
                              .map((t) => ` · ${t}`)
                              .join("")}
                          </p>
                        </div>
                        {conform && r.estado === "REGISTRADA" && anular?.id !== r.id && (
                          <div className="flex flex-wrap gap-2">
                            <AdjuntoRecepcion
                              disabled={busy}
                              numero={r.numero}
                              onFile={(file) => {
                                const body = new FormData();
                                body.append("file", file);
                                onSubmit(`${base}/recepciones/${r.id}/adjuntos`, body);
                              }}
                            />
                            <Button variant="ghost" disabled={busy} onClick={() => setAnular(r)}>
                              Anular
                            </Button>
                          </div>
                        )}
                      </div>
                      <ul className="space-y-0.5 tabular-nums">
                        {r.lineas.map((l) => (
                          <li key={`${l.despacho_id}:${l.lote ?? ""}`}>
                            {l.producto_nombre}
                            {l.lote ? ` · lote ${l.lote}` : ""} · recibido {cantidad(l.cantidad_recibida)} · aceptado{" "}
                            {cantidad(l.cantidad_aceptada)}
                            {Number(l.cantidad_rechazada) > 0 && (
                              <span className="text-destructive">
                                {" "}
                                · rechazado {cantidad(l.cantidad_rechazada)}: {l.motivo_rechazo}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      {r.incidencias && <p className="text-muted-foreground">Incidencias: {r.incidencias}</p>}
                      {r.motivo_anulacion && <p className="text-muted-foreground">Motivo de anulación: {r.motivo_anulacion}</p>}
                      {anular?.id === r.id && (
                        <AnularForm
                          busy={busy}
                          onCancel={() => setAnular(null)}
                          onSubmit={(motivo) =>
                            onSubmit(`${base}/recepciones/${r.id}/anular`, { version: r.version, motivo })
                          }
                        />
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )
      )}
    </section>
  );
}

function RecepcionForm({
  pedidoId,
  despachos,
  busy,
  onCancel,
  onSubmit,
}: {
  pedidoId: string;
  despachos: Despacho[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: object) => void;
}) {
  const filas = despachos.flatMap((d) =>
    d.lotes
      .filter((l) => pendiente(l.cantidad, l.cantidad_recibida) > 0)
      .map((l) => ({ d, l, max: pendiente(l.cantidad, l.cantidad_recibida) })),
  );
  const [valores, setValores] = useState<Record<string, Fila>>(() =>
    Object.fromEntries(filas.map(({ d, l, max }) => [clave(d, l), { recibida: String(max), rechazada: "0", motivo: "" }])),
  );
  const [cabecera, setCabecera] = useState({
    fecha_recepcion: hoy(),
    receptor_nombre: "",
    receptor_cargo: "",
    receptor_documento: "",
    guia_referencia: "",
    pecosa_numero: "",
    conformidad_numero: "",
    incidencias: "",
  });
  const [error, setError] = useState("");
  const set = (k: string, campo: keyof Fila, v: string) =>
    setValores((actual) => ({ ...actual, [k]: { ...actual[k], [campo]: v } }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const lineas = [];
    for (const { d, l, max } of filas) {
      const v = valores[clave(d, l)];
      if (!v.recibida.trim() || Number(v.recibida) === 0) continue;
      if (!decimal(v.recibida) || !decimal(v.rechazada || "0")) {
        setError("Use cantidades positivas con hasta 4 decimales.");
        return;
      }
      const recibida = Number(v.recibida);
      const rechazada = Number(v.rechazada || 0);
      if (recibida > max) {
        setError(`${d.producto_codigo}${l.lote ? ` lote ${l.lote}` : ""}: solo quedan ${cantidad(max)} por recibir.`);
        return;
      }
      if (rechazada > recibida) {
        setError("Lo rechazado no puede superar lo recibido.");
        return;
      }
      if (rechazada > 0 && v.motivo.trim().length < 5) {
        setError("Indique el motivo de cada rechazo (mínimo 5 caracteres).");
        return;
      }
      lineas.push({
        despacho_id: d.despacho_id,
        ...(l.lote_id ? { lote_id: l.lote_id } : {}),
        cantidad_recibida: recibida,
        cantidad_aceptada: Number((recibida - rechazada).toFixed(4)),
        cantidad_rechazada: rechazada,
        ...(rechazada > 0 ? { motivo_rechazo: v.motivo.trim() } : {}),
      });
    }
    if (!lineas.length) {
      setError("Indique al menos una cantidad recibida.");
      return;
    }
    if (cabecera.receptor_nombre.trim().length < 3) {
      setError("Indique el nombre de quien recibió.");
      return;
    }
    setError("");
    const opcionales = Object.fromEntries(
      Object.entries(cabecera).filter(([k, v]) => !["fecha_recepcion", "receptor_nombre"].includes(k) && v.trim()),
    );
    onSubmit({
      pedido_id: pedidoId,
      fecha_recepcion: cabecera.fecha_recepcion,
      receptor_nombre: cabecera.receptor_nombre.trim(),
      ...opcionales,
      lineas,
    });
  };
  const campo = (k: keyof typeof cabecera, label: string, max: number, type = "text") => (
    <Campo label={label}>
      {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
      <input
        className={control}
        type={type}
        maxLength={max}
        value={cabecera[k]}
        onChange={(e) => setCabecera((c) => ({ ...c, [k]: e.target.value }))}
      />
    </Campo>
  );
  return (
    <form onSubmit={submit} className="space-y-4 rounded-md border border-border p-4" aria-label="Registrar recepción del cliente">
      <fieldset disabled={busy} className="space-y-4">
        <legend className="font-semibold">Recepción del cliente</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {campo("fecha_recepcion", "Fecha de recepción", 10, "date")}
          {campo("receptor_nombre", "Recibió", 160)}
          {campo("receptor_cargo", "Cargo de quien recibió", 120)}
          {campo("receptor_documento", "Documento de quien recibió", 20)}
          {campo("guia_referencia", "Guía de remisión", 60)}
          {campo("pecosa_numero", "PECOSA", 60)}
          {campo("conformidad_numero", "Número de conformidad", 60)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="p-2">Producto y lote</th>
                <th scope="col" className="p-2 text-right">Por recibir</th>
                <th scope="col" className="w-32 p-2 text-right">Recibido</th>
                <th scope="col" className="w-32 p-2 text-right">Rechazado</th>
                <th scope="col" className="p-2">Motivo del rechazo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ d, l, max }) => {
                const k = clave(d, l);
                const etiqueta = `${d.producto_codigo}${l.lote ? ` lote ${l.lote}` : ""}`;
                return (
                  <tr key={k} className="border-b border-border align-top">
                    <td className="p-2">
                      <span className="font-medium">{d.producto_codigo}</span>
                      <span className="block text-xs text-muted-foreground">
                        {l.lote ? `Lote ${l.lote} · vence ${fecha(l.fecha_vencimiento ?? "")}` : "Sin lote"}
                      </span>
                    </td>
                    <td className="p-2 text-right">{cantidad(max)}</td>
                    <td className="p-2">
                      <input aria-label={`Recibido de ${etiqueta}`} className={`${control} text-right`} inputMode="decimal"
                        value={valores[k].recibida} onChange={(e) => set(k, "recibida", e.target.value)} />
                    </td>
                    <td className="p-2">
                      <input aria-label={`Rechazado de ${etiqueta}`} className={`${control} text-right`} inputMode="decimal"
                        value={valores[k].rechazada} onChange={(e) => set(k, "rechazada", e.target.value)} />
                    </td>
                    <td className="p-2">
                      <input aria-label={`Motivo del rechazo de ${etiqueta}`} className={control} maxLength={1000}
                        disabled={!Number(valores[k].rechazada)} value={valores[k].motivo}
                        onChange={(e) => set(k, "motivo", e.target.value)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Campo label="Incidencias">
          {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
          <textarea className={`${control} min-h-16`} maxLength={2000} value={cabecera.incidencias}
            onChange={(e) => setCabecera((c) => ({ ...c, incidencias: e.target.value }))} />
        </Campo>
      </fieldset>
      <p className="text-xs text-muted-foreground">Lo aceptado es lo recibido menos lo rechazado. Lo rechazado queda pendiente de reposición.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>Registrar recepción</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}

function AnularForm({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState("");
  return (
    <form
      className="space-y-3 rounded-md border border-border p-3"
      aria-label="Anular recepción"
      onSubmit={(e) => {
        e.preventDefault();
        if (motivo.trim().length >= 5) onSubmit(motivo.trim());
      }}
    >
      <Campo label="Motivo de la anulación">
        {/* etiqueta-por-composicion: Campo envuelve estos controles en <label> */}
        <Input value={motivo} maxLength={1000} disabled={busy} onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" disabled={busy || motivo.trim().length < 5}>
          Confirmar anulación
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}

function AdjuntoRecepcion({ disabled, numero, onFile }: { disabled: boolean; numero: number; onFile: (file: File) => void }) {
  const [error, setError] = useState("");
  return (
    <label className={`inline-flex min-h-10 cursor-pointer items-center rounded-md border border-input px-3 text-sm hover:bg-muted ${disabled ? "pointer-events-none opacity-60" : ""}`}>
      Adjuntar documento
      <input
        type="file"
        className="sr-only"
        aria-label={`Adjuntar guía, PECOSA o conformidad a la recepción ${numero}`}
        accept=".pdf,.docx,.png,.jpg,.jpeg"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size <= 0 || file.size > 10485760) {
            setError("El archivo debe tener contenido y no superar 10 MB.");
            return;
          }
          setError("");
          onFile(file);
        }}
      />
      {error && <span role="alert" className="ml-2 text-destructive">{error}</span>}
    </label>
  );
}
