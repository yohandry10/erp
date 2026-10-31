"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi } from "@/hooks/use-api";
import { usePermission } from "@/hooks/use-permission";
import { useTenant } from "@/contexts/TenantContext";
import { Campo, ContractForm, control } from "./ContractForm";
import {
  AmendmentForm,
  CancelOrderForm,
  RevisionFields,
  RevisionChanges,
} from "./AmendmentForm";
import {
  acciones,
  cantidad,
  Contrato,
  Entrega,
  Orden,
  fecha,
  saldo,
} from "./types";

import { OperationalOrders } from "./OperationalOrders";
import { ContractAttachments } from "./ContractAttachments";
import { ContractDeliveries } from "./ContractDeliveries";
import { ContractStatement } from "./ContractStatement";
import { ContractPenalties } from "./ContractPenalties";

type Lista = { items: Contrato[]; total: number };
type Editor =
  | "ninguno"
  | "nuevo"
  | "editar"
  | "oc"
  | "entrega"
  | "activar"
  | "anular"
  | "reprogramar"
  | "anular-entrega"
  | "adenda"
  | "modificar-oc"
  | "anular-oc";
type Operacion = {
  path: string;
  payload: object | FormData;
  method: "POST" | "PUT";
  key: string;
};
const base = "/api/ventas/contratos";

export default function ContratosPage() {
  const { get, post, put, request } = useApi({
    throwOnError: true,
    showErrorToast: false,
  });
  const { tenant } = useTenant();
  const lectura = usePermission("ventas", "ver", "contratos");
  const gestion = usePermission("ventas", "gestionar", "contratos");
  const conformidad = usePermission("ventas", "conformar", "contratos");
  const penalidades = usePermission("ventas", "ver", "penalidades");
  const penalidadesGestion = usePermission("ventas", "gestionar", "penalidades");
  const penalidadesAprobacion = usePermission("ventas", "aprobar", "penalidades");
  const [lista, setLista] = useState<Lista>({ items: [], total: 0 });
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<Contrato | null>(null);
  const [editor, setEditor] = useState<Editor>("ninguno");
  const [ordenId, setOrdenId] = useState<string | null>(null);
  const [entrega, setEntrega] = useState<Entrega | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Operacion | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const activeWrite = useRef(false);
  const listSeq = useRef(0);
  const detailSeq = useRef(0);
  const selected = useRef<string | null>(null);
  const tenantRef = useRef(tenant?.id);
  tenantRef.current = tenant?.id;

  const load = useCallback(async () => {
    const seq = ++listSeq.current;
    setLoading(true);
    setListError("");
    try {
      const response = await get(base, {
        params: { pagina, limite: 25, busqueda: filtro },
      });
      if (seq === listSeq.current) setLista(response.data);
    } catch (err: unknown) {
      if (seq === listSeq.current)
        setListError(
          err instanceof Error ? err.message : "No se pudo cargar la lista.",
        );
    } finally {
      if (seq === listSeq.current) setLoading(false);
    }
  }, [get, pagina, filtro]);

  const abrir = useCallback(
    async (id: string) => {
      selected.current = id;
      const seq = ++detailSeq.current;
      setDetailLoading(true);
      setDetailError("");
      setDetail((current) => (current?.id === id ? current : null));
      try {
        const response = await get(`${base}/${id}`);
        if (seq === detailSeq.current) {
          setDetail(response.data);
          setEntrega((current) =>
            current
              ? response.data.entregas.find(
                  (item: Entrega) => item.id === current.id,
                ) || null
              : null,
          );
        }
      } catch (err: unknown) {
        if (seq === detailSeq.current)
          setDetailError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar el contrato.",
          );
      } finally {
        if (seq === detailSeq.current) setDetailLoading(false);
      }
    },
    [get],
  );

  useEffect(() => {
    ++listSeq.current;
    ++detailSeq.current;
    selected.current = null;
    setDetail(null);
    setEditor("ninguno");
    setPending(null);
    setError("");
    setAviso("");
    setLista({ items: [], total: 0 });
    setPagina(1);
    setBusqueda("");
    setFiltro("");
    return () => {
      ++listSeq.current;
      ++detailSeq.current;
    };
  }, [tenant?.id]);
  useEffect(() => {
    if (!lectura.loading && lectura.hasPermission) void load();
  }, [lectura.loading, lectura.hasPermission, load]);

  useEffect(() => {
    if (lectura.loading || !lectura.hasPermission || !tenant?.id) return;
    const id = new URLSearchParams(window.location.search).get("contrato");
    if (
      id &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        id,
      )
    )
      void abrir(id);
  }, [lectura.loading, lectura.hasPermission, tenant?.id, abrir]);

  const operar = async (operation: Operacion) => {
    if (activeWrite.current) return;
    activeWrite.current = true;
    setSaving(true);
    setError("");
    setAviso("");
    const operationTenant = tenantRef.current;
    try {
      const response =
        operation.payload instanceof FormData
          ? await request(operation.path, {
              method: "POST",
              body: operation.payload,
              headers: { "Idempotency-Key": operation.key },
            })
          : await (operation.method === "PUT" ? put : post)(
              operation.path,
              operation.payload,
              { headers: { "Idempotency-Key": operation.key } },
            );
      if (tenantRef.current !== operationTenant) return;
      if (!response?.data?.id || !response?.data?.contrato_id)
        throw new Error(
          "No se pudo confirmar la operación. Reintente con los mismos datos.",
        );
      setPending(null);
      setEditor("ninguno");
      setAviso(acciones[response.data.accion] || "Operación confirmada");
      await Promise.all([load(), abrir(response.data.contrato_id)]);
    } catch (err: unknown) {
      if (tenantRef.current !== operationTenant) return;
      const failure = err as {
        message?: string;
        status?: number;
        data?: { statusCode?: number };
      };
      // Un rechazo confirmado permite corregir el formulario. Sin confirmación,
      // se conserva la solicitud completa y su clave, no sólo los campos visibles.
      const status = Number(failure.status || failure.data?.statusCode);
      setPending(status >= 400 && status < 500 ? null : operation);
      setError(failure.message || "No se pudo confirmar la operación.");
    } finally {
      activeWrite.current = false;
      setSaving(false);
    }
  };
  const enviar = (
    path: string,
    payload: object | FormData,
    method: "POST" | "PUT" = "POST",
  ) => {
    void operar({
      path,
      payload,
      method,
      key: `suministro:${crypto.randomUUID()}`,
    });
  };
  const editar = (value: Editor, item?: Entrega) => {
    setError("");
    setAviso("");
    setEntrega(item || null);
    setEditor(value);
  };
  const blocked = saving || Boolean(pending);
  const ordenSeleccionada = detail?.ordenes.find((o) => o.id === ordenId);
  const mostrarLista = () => {
    ++detailSeq.current;
    selected.current = null;
    setDetail(null);
    setDetailLoading(false);
    setDetailError("");
    setEditor("ninguno");
    setError("");
  };

  if (lectura.loading)
    return (
      <p role="status" className="p-6">
        Comprobando acceso a contratos…
      </p>
    );
  if (!lectura.hasPermission)
    return (
      <p role="alert" className="p-6">
        No tiene permiso para consultar contratos de suministro.
      </p>
    );

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Contratos de suministro
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Organice las OC del cliente y sus entregas programadas por producto,
            cantidad, fecha y destino.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={loading || blocked}
            onClick={() => {
              void load();
              if (selected.current) void abrir(selected.current);
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
          {gestion.hasPermission && (
            <Button
              disabled={blocked}
              onClick={() => {
                selected.current = null;
                ++detailSeq.current;
                setDetailLoading(false);
                setDetailError("");
                setDetail(null);
                editar("nuevo");
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nuevo contrato
            </Button>
          )}
        </div>
      </header>
      {aviso && (
        <p
          role="status"
          className="rounded-md border border-border bg-muted p-3 text-sm"
        >
          {aviso}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-destructive p-3 text-sm text-destructive"
        >
          <p>{error}</p>
          {pending && (
            <>
              <p>
                La operación aún no está confirmada. Reintente para recuperar el
                resultado antes de registrar otra.
              </p>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => void operar(pending)}
              >
                Reintentar operación
              </Button>
            </>
          )}
        </div>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[310px_minmax(0,1fr)]">
        <aside
          className={`space-y-4 ${detail || editor !== "ninguno" || detailLoading || detailError ? "hidden lg:block" : ""}`}
          aria-label="Lista de contratos"
        >
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setPagina(1);
              setFiltro(busqueda);
            }}
          >
            <Input
              aria-label="Buscar contrato por número u objeto"
              maxLength={120}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              disabled={blocked}
            />
            <Button type="submit" variant="outline" disabled={blocked}>
              Buscar
            </Button>
          </form>
          {listError && (
            <p role="alert" className="text-sm text-destructive">
              {listError} Pulse Actualizar para reintentar.
            </p>
          )}
          {loading ? (
            <p role="status" className="py-6 text-sm text-muted-foreground">
              Cargando contratos…
            </p>
          ) : !listError && !lista.items.length ? (
            <div className="py-8">
              <h2 className="font-medium">
                {filtro ? "Sin coincidencias" : "Aún no hay contratos"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {filtro
                  ? "Cambie el número u objeto buscado."
                  : "Registre un contrato y revise sus productos antes de activarlo."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {lista.items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={blocked}
                    aria-current={detail?.id === c.id ? "true" : undefined}
                    className={`w-full px-3 py-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${detail?.id === c.id ? "bg-muted" : ""}`}
                    onClick={() => {
                      editar("ninguno");
                      void abrir(c.id);
                    }}
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{c.numero}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.estado === "BORRADOR"
                          ? "Borrador"
                          : c.estado === "ACTIVO"
                            ? "Activo"
                            : "Anulado"}
                      </span>
                    </span>
                    <span className="mt-1 block break-words text-sm">
                      {c.asunto}
                    </span>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {c.cliente_nombre} · {c.moneda}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-2 text-sm">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Página anterior"
              disabled={blocked || loading || pagina === 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>
              Página {pagina} · {lista.total} contratos
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Página siguiente"
              disabled={blocked || loading || pagina * 25 >= lista.total}
              onClick={() => setPagina((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </aside>
        <section
          className="min-w-0 space-y-6"
          aria-label="Expediente del contrato"
        >
          {(detail || editor !== "ninguno" || detailLoading || detailError) && (
            <Button
              variant="ghost"
              className="lg:hidden"
              disabled={blocked}
              onClick={mostrarLista}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a contratos
            </Button>
          )}
          {detailLoading && <p role="status">Cargando expediente…</p>}
          {detailError && (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>{detailError} Actualice el expediente antes de modificarlo.</p>
              <Button
                variant="outline"
                onClick={() => selected.current && void abrir(selected.current)}
              >
                Reintentar consulta
              </Button>
            </div>
          )}
          {editor === "nuevo" && (
            <ContractForm
              busy={blocked}
              onCancel={() => setEditor("ninguno")}
              onSubmit={(payload) => enviar(base, payload)}
            />
          )}
          {!detailLoading && !detailError && detail && (
            <>
              {editor === "editar" ? (
                <ContractForm
                  key={`${detail.id}:${detail.version}`}
                  initial={detail}
                  busy={blocked}
                  onCancel={() => setEditor("ninguno")}
                  onSubmit={(payload) =>
                    enviar(`${base}/${detail.id}`, payload, "PUT")
                  }
                />
              ) : (
                <>
                  <header className="space-y-4 border-b border-border pb-5">
                    <div>
                      <h2 className="text-xl font-semibold">
                        {detail.numero} · {detail.asunto}
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {detail.cliente_nombre} · {detail.moneda} ·{" "}
                        {fecha(detail.vigencia_desde)} al{" "}
                        {fecha(detail.vigencia_hasta)}
                      </p>
                      <p className="mt-1 text-sm">
                        Estado:{" "}
                        {detail.estado === "BORRADOR"
                          ? "Borrador"
                          : detail.estado === "ACTIVO"
                            ? "Activo"
                            : "Anulado"}
                      </p>
                    </div>
                    {gestion.hasPermission && editor === "ninguno" && (
                      <div className="flex flex-wrap gap-2">
                        {detail.estado === "BORRADOR" && (
                          <>
                            <Button
                              disabled={blocked}
                              onClick={() => editar("editar")}
                            >
                              Editar borrador
                            </Button>
                            <Button
                              variant="outline"
                              disabled={blocked}
                              onClick={() => editar("activar")}
                            >
                              Activar contrato
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={blocked}
                              onClick={() => editar("anular")}
                            >
                              Anular borrador
                            </Button>
                          </>
                        )}
                        {detail.estado === "ACTIVO" && (
                          <>
                            <Button
                              disabled={blocked}
                              onClick={() => editar("oc")}
                            >
                              Registrar OC del cliente
                            </Button>
                            <Button
                              variant="outline"
                              disabled={
                                blocked ||
                                !detail.ordenes.some(
                                  (o) => o.estado === "ACTIVA",
                                )
                              }
                              onClick={() => editar("entrega")}
                            >
                              Programar entrega
                            </Button>
                            <Button
                              variant="outline"
                              disabled={blocked}
                              onClick={() => editar("adenda")}
                            >
                              Registrar adenda
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                    {detail.observaciones && (
                      <p className="whitespace-pre-wrap text-sm">
                        {detail.observaciones}
                      </p>
                    )}
                  </header>
                  {editor === "adenda" && (
                    <AmendmentForm
                      key={`${detail.id}:${detail.version}`}
                      contrato={detail}
                      busy={blocked}
                      onCancel={() => setEditor("ninguno")}
                      onSubmit={(payload) =>
                        enviar(`${base}/${detail.id}/adendas`, payload)
                      }
                    />
                  )}
                  {editor === "modificar-oc" &&
                    ordenSeleccionada?.estado === "ACTIVA" && (
                      <OrdenForm
                        key={`${ordenSeleccionada.id}:${ordenSeleccionada.version}:${detail.version}`}
                        contrato={detail}
                        orden={ordenSeleccionada}
                        busy={blocked}
                        onCancel={() => setEditor("ninguno")}
                        onSubmit={(payload) =>
                          enviar(
                            `${base}/ordenes-cliente/${ordenSeleccionada.id}/modificar`,
                            payload,
                          )
                        }
                      />
                    )}
                  {editor === "anular-oc" &&
                    ordenSeleccionada?.estado === "ACTIVA" && (
                      <CancelOrderForm
                        key={`${ordenSeleccionada.id}:${ordenSeleccionada.version}`}
                        orden={ordenSeleccionada}
                        busy={blocked}
                        onCancel={() => setEditor("ninguno")}
                        onSubmit={(payload) =>
                          enviar(
                            `${base}/ordenes-cliente/${ordenSeleccionada.id}/anular`,
                            payload,
                          )
                        }
                      />
                    )}
                  {editor === "oc" && (
                    <OrdenForm
                      contrato={detail}
                      busy={blocked}
                      onCancel={() => setEditor("ninguno")}
                      onSubmit={(payload) =>
                        enviar(`${base}/${detail.id}/ordenes-cliente`, payload)
                      }
                    />
                  )}
                  {editor === "entrega" && (
                    <EntregaForm
                      contrato={detail}
                      busy={blocked}
                      onCancel={() => setEditor("ninguno")}
                      onSubmit={(payload) =>
                        enviar(`${base}/${detail.id}/entregas`, payload)
                      }
                    />
                  )}
                  {[
                    "activar",
                    "anular",
                    "reprogramar",
                    "anular-entrega",
                  ].includes(editor) && (
                    <DecisionForm
                      key={`${editor}:${entrega?.id || detail.id}`}
                      editor={editor}
                      contrato={detail}
                      entrega={entrega}
                      busy={blocked}
                      onCancel={() => setEditor("ninguno")}
                      onSubmit={(payload) => {
                        const path =
                          editor === "activar" || editor === "anular"
                            ? `${base}/${detail.id}/${editor === "activar" ? "activar" : "anular"}`
                            : `${base}/entregas/${entrega!.id}/${editor === "reprogramar" ? "reprogramar" : "anular"}`;
                        enviar(path, payload);
                      }}
                    />
                  )}
                  <section className="space-y-3">
                    <h3 className="font-semibold">Cantidades del contrato</h3>
                    <p className="text-sm text-muted-foreground">
                      Los saldos muestran cantidades pendientes de asignar a OC.
                      Los precios unitarios no incluyen impuestos.
                    </p>
                    <ul
                      className="divide-y divide-border border-y border-border sm:hidden"
                      aria-label="Cantidades por producto"
                    >
                      {detail.lineas.map((l) => (
                        <li key={l.id} className="space-y-3 py-4 text-sm">
                          <p className="font-medium">
                            {l.codigo_producto} · {l.descripcion}
                          </p>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 tabular-nums">
                            <dt className="text-muted-foreground">
                              Contratado ({l.unidad_medida})
                            </dt>
                            <dd className="text-right">
                              {cantidad(l.cantidad)}
                            </dd>
                            <dt className="text-muted-foreground">En OC</dt>
                            <dd className="text-right">
                              {cantidad(l.cantidad_en_oc)}
                            </dd>
                            <dt className="text-muted-foreground">
                              Sin asignar
                            </dt>
                            <dd className="text-right">
                              {cantidad(saldo(l.cantidad, l.cantidad_en_oc))}
                            </dd>
                            <dt className="text-muted-foreground">
                              Precio ({detail.moneda})
                            </dt>
                            <dd className="text-right">
                              {Number(l.precio_unitario).toLocaleString(
                                "es-PE",
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 6,
                                },
                              )}
                            </dd>
                          </dl>
                        </li>
                      ))}
                    </ul>
                    <div className="hidden overflow-x-auto sm:block">
                      <table className="w-full text-sm tabular-nums">
                        <thead>
                          <tr className="border-b border-border text-left">
                            <th scope="col" className="p-2">
                              Producto
                            </th>
                            <th scope="col" className="p-2 text-right">
                              Contratado
                            </th>
                            <th scope="col" className="p-2 text-right">
                              En OC
                            </th>
                            <th scope="col" className="p-2 text-right">
                              Sin asignar
                            </th>
                            <th scope="col" className="p-2 text-right">
                              Precio ({detail.moneda})
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.lineas.map((l) => (
                            <tr key={l.id} className="border-b border-border">
                              <td className="p-2">
                                <span className="block font-medium">
                                  {l.codigo_producto}
                                </span>
                                {l.descripcion}
                                <span className="block text-xs text-muted-foreground">
                                  {l.unidad_medida}
                                </span>
                              </td>
                              <td className="p-2 text-right">
                                {cantidad(l.cantidad)}
                              </td>
                              <td className="p-2 text-right">
                                {cantidad(l.cantidad_en_oc)}
                              </td>
                              <td className="p-2 text-right">
                                {cantidad(saldo(l.cantidad, l.cantidad_en_oc))}
                              </td>
                              <td className="p-2 text-right">
                                {Number(l.precio_unitario).toLocaleString(
                                  "es-PE",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 6,
                                  },
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <section className="space-y-3">
                    <h3 className="font-semibold">OC del cliente</h3>
                    {!detail.ordenes.length ? (
                      <p className="text-sm text-muted-foreground">
                        No hay OC registradas.
                      </p>
                    ) : (
                      detail.ordenes.map((o) => (
                        <div key={o.id} className="border-t border-border pt-3">
                          <h4 className="text-sm font-medium">
                            {o.numero} · {fecha(o.fecha_emision)} ·{" "}
                            {o.estado === "ANULADA" ? "Anulada" : "Activa"}
                          </h4>
                          <ul className="mt-2 space-y-1 text-sm">
                            {o.lineas.map((l) => (
                              <li
                                key={l.id}
                                className="flex flex-wrap justify-between gap-2"
                              >
                                <span>
                                  {
                                    detail.lineas.find(
                                      (cl) => cl.id === l.contrato_linea_id,
                                    )?.descripcion
                                  }
                                </span>
                                <span className="tabular-nums">
                                  {cantidad(l.cantidad)} en OC · Precio{" "}
                                  {Number(l.precio_unitario).toLocaleString(
                                    "es-PE",
                                    { maximumFractionDigits: 6 },
                                  )}{" "}
                                  {detail.moneda} ·{" "}
                                  {cantidad(
                                    o.estado === "ANULADA"
                                      ? 0
                                      : saldo(
                                          l.cantidad,
                                          l.cantidad_programada,
                                        ),
                                  )}{" "}
                                  por programar
                                </span>
                              </li>
                            ))}
                          </ul>
                          {gestion.hasPermission &&
                            detail.estado === "ACTIVO" &&
                            o.estado === "ACTIVA" &&
                            editor === "ninguno" && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={blocked}
                                  onClick={() => {
                                    setOrdenId(o.id);
                                    editar("modificar-oc");
                                  }}
                                >
                                  Modificar OC {o.numero}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={blocked}
                                  onClick={() => {
                                    setOrdenId(o.id);
                                    editar("anular-oc");
                                  }}
                                >
                                  Anular OC {o.numero}
                                </Button>
                              </div>
                            )}
                        </div>
                      ))
                    )}
                  </section>
                  <section className="space-y-3">
                    <h3 className="font-semibold">Cronograma de entregas</h3>
                    <p className="text-sm text-muted-foreground">
                      El despacho se registra en los pedidos vinculados. La
                      conformidad del cliente se registra en Entregas y conformidades.
                    </p>
                    {!detail.entregas.length ? (
                      <p className="text-sm text-muted-foreground">
                        No hay entregas programadas.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border border-y border-border">
                        {detail.entregas.map((e) => {
                          const order = detail.ordenes.find((o) =>
                            o.lineas.some((l) => l.id === e.orden_linea_id),
                          );
                          const line = order?.lineas.find(
                            (l) => l.id === e.orden_linea_id,
                          );
                          const product = detail.lineas.find(
                            (l) => l.id === line?.contrato_linea_id,
                          );
                          return (
                            <li key={e.id} className="space-y-2 py-4">
                              <div className="flex flex-wrap justify-between gap-2">
                                <span className="font-medium">
                                  {fecha(e.fecha_programada)} · {order?.numero}
                                </span>
                                <span className="text-sm">
                                  {e.estado === "ANULADA"
                                    ? "Anulada"
                                    : "Programada"}
                                </span>
                              </div>
                              <p className="text-sm">
                                {product?.descripcion} · {cantidad(e.cantidad)}{" "}
                                {product?.unidad_medida}
                              </p>
                              <p className="break-words text-sm">{e.destino}</p>
                              {e.fecha_original !== e.fecha_programada && (
                                <p className="text-xs text-muted-foreground">
                                  Fecha original: {fecha(e.fecha_original)}
                                </p>
                              )}
                              {gestion.hasPermission &&
                                e.estado === "PROGRAMADA" &&
                                editor === "ninguno" && (
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={blocked}
                                      onClick={() => editar("reprogramar", e)}
                                    >
                                      Reprogramar
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={blocked}
                                      onClick={() =>
                                        editar("anular-entrega", e)
                                      }
                                    >
                                      Anular programación
                                    </Button>
                                  </div>
                                )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                  <OperationalOrders
                    key={`orders:${tenant?.id}:${detail.id}`}
                    contrato={detail}
                    busy={blocked}
                    manage={gestion.hasPermission}
                    onSubmit={enviar}
                  />
                  <ContractDeliveries
                    key={`deliveries:${tenant?.id}:${detail.id}`}
                    contrato={detail}
                    busy={blocked}
                    conform={conformidad.hasPermission}
                    onSubmit={enviar}
                  />
                  <ContractStatement
                    key={`statement:${tenant?.id}:${detail.id}`}
                    contrato={detail}
                    busy={blocked}
                    manage={gestion.hasPermission}
                    onSubmit={enviar}
                  />
                  {penalidades.hasPermission && (
                    <ContractPenalties
                      key={`penalties:${tenant?.id}:${detail.id}`}
                      contrato={detail}
                      busy={blocked}
                      manage={penalidadesGestion.hasPermission}
                      approve={penalidadesAprobacion.hasPermission}
                      onSubmit={enviar}
                    />
                  )}
                  <ContractAttachments
                    key={`files:${tenant?.id}:${detail.id}`}
                    contrato={detail}
                    busy={blocked}
                    manage={gestion.hasPermission}
                    onSubmit={enviar}
                  />
                  <details className="border-t border-border pt-4">
                    <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Historial del contrato ({detail.historial.length})
                    </summary>
                    <ol className="mt-4 space-y-4">
                      {detail.historial.map((h) => (
                        <li key={h.id} className="space-y-1 text-sm">
                          <p className="font-medium">
                            {acciones[h.accion] || h.accion}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(h.created_at).toLocaleString("es-PE")} ·
                            {h.actor_nombre || "Usuario registrado"}
                          </p>
                          {h.referencia && <p>Documento: {h.referencia}</p>}
                          {h.motivo && <p>{h.motivo}</p>}
                          {["ADENDAR", "MODIFICAR_OC", "ANULAR_OC"].includes(
                            h.accion,
                          ) && (
                            <RevisionChanges
                              anterior={h.anterior}
                              actual={h.actual}
                            />
                          )}
                          {h.accion === "REPROGRAMAR" && (
                            <p>
                              Fecha:{" "}
                              {fecha(String(h.anterior?.fecha_programada))} →{" "}
                              {fecha(String(h.actual.fecha_programada))}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </details>
                </>
              )}
            </>
          )}
          {!detail &&
            !detailLoading &&
            !detailError &&
            editor === "ninguno" && (
              <p className="hidden py-12 text-sm text-muted-foreground lg:block">
                Seleccione un contrato para consultar sus productos, OC y
                cronograma.
              </p>
            )}
        </section>
      </div>
    </div>
  );
}

function OrdenForm({
  contrato,
  orden,
  busy,
  onSubmit,
  onCancel,
}: {
  contrato: Contrato;
  orden?: Orden;
  busy: boolean;
  onSubmit: (payload: object) => void;
  onCancel: () => void;
}) {
  const [numero, setNumero] = useState(orden?.numero || "");
  const [emision, setEmision] = useState(orden?.fecha_emision || "");
  const [referencia, setReferencia] = useState("");
  const [motivo, setMotivo] = useState("");
  const [cantidades, setCantidades] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      orden?.lineas.map((l) => [l.contrato_linea_id, String(l.cantidad)]) || [],
    ),
  );
  const [error, setError] = useState("");
  const disponible = (id: string, total: number, usado: number) =>
    saldo(total, usado) +
    Number(
      orden?.lineas.find((l) => l.contrato_linea_id === id)?.cantidad || 0,
    );
  const guardar = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const lineas = contrato.lineas
      .filter((l) => Number(cantidades[l.id]) > 0)
      .map((l) => ({
        contrato_linea_id: l.id,
        cantidad: Number(cantidades[l.id]),
      }));
    if (!lineas.length) {
      setError("Indique una cantidad en al menos una línea.");
      return;
    }
    onSubmit({
      numero,
      fecha_emision: emision,
      lineas,
      ...(orden ? { version: orden.version, referencia, motivo } : {}),
    });
  };
  return (
    <form onSubmit={guardar} className="space-y-4 border-b border-border pb-6">
      <h3 className="font-semibold">
        {orden ? `Modificar OC ${orden.numero}` : "Registrar OC del cliente"}
      </h3>
      {orden && (
        <p className="text-sm text-muted-foreground">
          Las líneas existentes conservan su precio. Mantenga las cantidades
          programadas y las líneas con entregas históricas.
        </p>
      )}
      <fieldset disabled={busy} className="space-y-4">
        {orden && (
          <RevisionFields
            referencia={referencia}
            motivo={motivo}
            onReferencia={setReferencia}
            onMotivo={setMotivo}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Número de OC">
            <Input
              aria-label="Número de OC"
              required
              maxLength={80}
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
            />
          </Campo>
          <Campo label="Fecha de emisión de OC">
            <Input
              aria-label="Fecha de emisión de OC"
              type="date"
              required
              min={contrato.vigencia_desde}
              max={
                orden
                  ? [
                      contrato.vigencia_hasta,
                      ...contrato.entregas
                        .filter(
                          (e) =>
                            e.estado === "PROGRAMADA" &&
                            orden.lineas.some((l) => l.id === e.orden_linea_id),
                        )
                        .map((e) => e.fecha_programada),
                    ].sort()[0]
                  : contrato.vigencia_hasta
              }
              value={emision}
              onChange={(e) => setEmision(e.target.value)}
            />
          </Campo>
        </div>
        {contrato.lineas.map((l) => (
          <Campo
            key={l.id}
            label={`${l.codigo_producto} · ${l.descripcion} (${cantidad(disponible(l.id, l.cantidad, l.cantidad_en_oc))} ${l.unidad_medida} disponibles)`}
          >
            <Input
              aria-label={`Cantidad OC ${l.codigo_producto}`}
              type="number"
              min="0"
              max={disponible(l.id, l.cantidad, l.cantidad_en_oc)}
              step="0.0001"
              value={cantidades[l.id] || ""}
              onChange={(e) =>
                setCantidades({ ...cantidades, [l.id]: e.target.value })
              }
            />
          </Campo>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <FormButtons
        busy={busy}
        onCancel={onCancel}
        label={orden ? "Confirmar modificación de OC" : "Registrar OC"}
      />
    </form>
  );
}

function EntregaForm({
  contrato,
  busy,
  onSubmit,
  onCancel,
}: {
  contrato: Contrato;
  busy: boolean;
  onSubmit: (payload: object) => void;
  onCancel: () => void;
}) {
  const [linea, setLinea] = useState("");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState("");
  const [destino, setDestino] = useState("");
  const opciones = contrato.ordenes
    .filter((o) => o.estado === "ACTIVA")
    .flatMap((o) =>
      o.lineas
        .filter((l) => saldo(l.cantidad, l.cantidad_programada) > 0)
        .map((l) => ({
          ...l,
          numero: o.numero,
          emision: o.fecha_emision,
          producto: contrato.lineas.find((cl) => cl.id === l.contrato_linea_id),
        })),
    );
  const elegida = opciones.find((l) => l.id === linea);
  return (
    <form
      className="space-y-4 border-b border-border pb-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (elegida)
          onSubmit({
            orden_linea_id: linea,
            cantidad: Number(qty),
            fecha_programada: date,
            destino,
          });
      }}
    >
      <h3 className="font-semibold">Programar entrega</h3>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Campo label="Línea de OC">
            <select
              aria-label="Línea de OC"
              required
              value={linea}
              className={control}
              onChange={(e) => {
                setLinea(e.target.value);
                setQty("");
              }}
            >
              <option value="">Seleccionar línea…</option>
              {opciones.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.numero} · {l.producto?.descripcion} ·{" "}
                  {cantidad(saldo(l.cantidad, l.cantidad_programada))} por
                  programar
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <Campo label="Cantidad a programar">
          <Input
            aria-label="Cantidad a programar"
            required
            type="number"
            step="0.0001"
            min="0.0001"
            max={
              elegida
                ? saldo(elegida.cantidad, elegida.cantidad_programada)
                : undefined
            }
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </Campo>
        <Campo label="Fecha programada">
          <Input
            aria-label="Fecha programada"
            required
            type="date"
            min={elegida?.emision || contrato.vigencia_desde}
            max={contrato.vigencia_hasta}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Campo>
        <div className="sm:col-span-2">
          <Campo label="Destino de entrega">
            <Input
              aria-label="Destino de entrega"
              required
              minLength={3}
              maxLength={300}
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
            />
          </Campo>
        </div>
      </fieldset>
      {!opciones.length && (
        <p className="text-sm text-muted-foreground">
          Todas las cantidades de las OC ya están programadas.
        </p>
      )}
      <FormButtons
        busy={busy || !opciones.length}
        onCancel={onCancel}
        label="Guardar entrega"
        cancelDisabled={busy}
      />
    </form>
  );
}

function DecisionForm({
  editor,
  contrato,
  entrega,
  busy,
  onSubmit,
  onCancel,
}: {
  editor: Editor;
  contrato: Contrato;
  entrega: Entrega | null;
  busy: boolean;
  onSubmit: (payload: object) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(entrega?.fecha_programada || "");
  const [destino, setDestino] = useState(entrega?.destino || "");
  const [motivo, setMotivo] = useState("");
  const label =
    editor === "activar"
      ? "Confirmar activación"
      : editor === "reprogramar"
        ? "Guardar reprogramación"
        : "Confirmar anulación";
  return (
    <form
      className="space-y-4 border-b border-border pb-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          version: entrega?.version || contrato.version,
          ...(editor === "activar" ? {} : { motivo }),
          ...(editor === "reprogramar"
            ? { fecha_programada: date, destino }
            : {}),
        });
      }}
    >
      <h3 className="font-semibold">{label}</h3>
      {editor === "activar" && (
        <p className="text-sm">
          Al activar se fijan los productos y cantidades del contrato. Revise el
          borrador antes de continuar.
        </p>
      )}
      <fieldset disabled={busy} className="space-y-4">
        {editor === "reprogramar" && (
          <>
            <Campo label="Nueva fecha de entrega">
              <Input
                aria-label="Nueva fecha de entrega"
                required
                type="date"
                min={contrato.vigencia_desde}
                max={contrato.vigencia_hasta}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Campo>
            <Campo label="Nuevo destino">
              <Input
                aria-label="Nuevo destino"
                required
                minLength={3}
                maxLength={300}
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
              />
            </Campo>
          </>
        )}
        {editor !== "activar" && (
          <Campo label="Motivo">
            <textarea
              aria-label="Motivo"
              required
              className={control}
              minLength={5}
              maxLength={1000}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </Campo>
        )}
      </fieldset>
      <FormButtons busy={busy} onCancel={onCancel} label={label} />
    </form>
  );
}

function FormButtons({
  busy,
  onCancel,
  label,
  cancelDisabled = busy,
}: {
  busy: boolean;
  onCancel: () => void;
  label: string;
  cancelDisabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy}>
        {busy ? "Espere…" : label}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={cancelDisabled}
        onClick={onCancel}
      >
        Cancelar
      </Button>
    </div>
  );
}
