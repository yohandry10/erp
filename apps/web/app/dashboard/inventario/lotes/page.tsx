"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApi } from "@/hooks/use-api";
import { usePermission } from "@/hooks/use-permission";
import { useTenant } from "@/contexts/TenantContext";
import { PolicyForm, ReassignForm, RegularizeForm } from "./LotForms";
import {
  AlmacenLotes,
  DetalleLotes,
  LotePorVencer,
  MovimientoLote,
  ProductoLote,
  ReservaDocumento,
  accionesLote,
  agruparReservas,
  cantidad,
  control,
  estadoLote,
  fecha,
  fechaHora,
  tipoMovimiento,
  ubicacionTexto,
} from "./types";

const base = "/api/inventario/lotes";
const LIMITE = 25;
type Vista = "producto" | "vencer";
type Editor =
  | { tipo: "ninguno" }
  | { tipo: "politica" }
  | { tipo: "regularizar"; almacenId: string }
  | { tipo: "reasignar"; almacenId: string; documento: ReservaDocumento };
type Operacion = { path: string; payload: object; method: "POST" | "PUT"; key: string; aviso: string };

export default function LotesPage() {
  const { get, post, put } = useApi({ throwOnError: true, showErrorToast: false });
  const { tenant } = useTenant();
  const lectura = usePermission("inventario", "read", "lotes");
  const gestion = usePermission("inventario", "manage", "lotes");
  const [vista, setVista] = useState<Vista>("producto");
  const [productos, setProductos] = useState<ProductoLote[]>([]);
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [detail, setDetail] = useState<DetalleLotes | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [movimientos, setMovimientos] = useState<MovimientoLote[]>([]);
  const [movPagina, setMovPagina] = useState(1);
  const [movMas, setMovMas] = useState(false);
  const [movLote, setMovLote] = useState<{ id: string; codigo: string } | null>(null);
  const [movLoading, setMovLoading] = useState(false);
  const [movError, setMovError] = useState("");
  const [vencer, setVencer] = useState<LotePorVencer[]>([]);
  const [dias, setDias] = useState(90);
  const [vencerLoading, setVencerLoading] = useState(false);
  const [vencerError, setVencerError] = useState("");
  const [editor, setEditor] = useState<Editor>({ tipo: "ninguno" });
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Operacion | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const activeWrite = useRef(false);
  const listSeq = useRef(0);
  const detailSeq = useRef(0);
  const movSeq = useRef(0);
  const selected = useRef<string | null>(null);
  const tenantRef = useRef(tenant?.id);
  tenantRef.current = tenant?.id;

  const loadProductos = useCallback(async () => {
    const seq = ++listSeq.current;
    setListLoading(true);
    setListError("");
    try {
      const r = await get(`${base}/productos`, { params: { pagina, limite: LIMITE, busqueda: filtro } });
      if (seq === listSeq.current) setProductos(r.data.items);
    } catch (err: unknown) {
      if (seq === listSeq.current) setListError(err instanceof Error ? err.message : "No se pudo cargar los productos.");
    } finally {
      if (seq === listSeq.current) setListLoading(false);
    }
  }, [get, pagina, filtro]);

  const loadMovimientos = useCallback(
    async (productoId: string, lote: { id: string } | null, page: number) => {
      const seq = ++movSeq.current;
      setMovLoading(true);
      setMovError("");
      try {
        const r = await get(`${base}/productos/${productoId}/movimientos`, {
          params: { pagina: page, limite: LIMITE, ...(lote ? { lote_id: lote.id } : {}) },
        });
        if (seq !== movSeq.current) return;
        const items: MovimientoLote[] = r.data.items;
        setMovimientos((actual) => (page === 1 ? items : [...actual, ...items]));
        setMovMas(items.length === LIMITE);
        setMovPagina(page);
      } catch (err: unknown) {
        if (seq === movSeq.current) setMovError(err instanceof Error ? err.message : "No se pudo cargar los movimientos.");
      } finally {
        if (seq === movSeq.current) setMovLoading(false);
      }
    },
    [get],
  );

  const abrir = useCallback(
    async (id: string) => {
      selected.current = id;
      const seq = ++detailSeq.current;
      setDetailLoading(true);
      setDetailError("");
      setDetail((actual) => (actual?.producto.id === id ? actual : null));
      try {
        const r = await get(`${base}/productos/${id}`, { params: { dias: 90 } });
        if (seq === detailSeq.current) setDetail(r.data);
      } catch (err: unknown) {
        if (seq === detailSeq.current) setDetailError(err instanceof Error ? err.message : "No se pudo cargar el producto.");
      } finally {
        if (seq === detailSeq.current) setDetailLoading(false);
      }
    },
    [get],
  );

  const loadVencer = useCallback(async () => {
    setVencerLoading(true);
    setVencerError("");
    try {
      const r = await get(`${base}/por-vencer`, { params: { dias, limite: 200 } });
      setVencer(r.data.items);
    } catch (err: unknown) {
      setVencerError(err instanceof Error ? err.message : "No se pudo cargar los lotes por vencer.");
    } finally {
      setVencerLoading(false);
    }
  }, [get, dias]);

  useEffect(() => {
    ++listSeq.current;
    ++detailSeq.current;
    ++movSeq.current;
    selected.current = null;
    setDetail(null);
    setEditor({ tipo: "ninguno" });
    setPending(null);
    setError("");
    setAviso("");
    setProductos([]);
    setPagina(1);
    setBusqueda("");
    setFiltro("");
  }, [tenant?.id]);
  useEffect(() => {
    if (!lectura.loading && lectura.hasPermission) void loadProductos();
  }, [lectura.loading, lectura.hasPermission, loadProductos]);
  useEffect(() => {
    if (!lectura.loading && lectura.hasPermission && vista === "vencer") void loadVencer();
  }, [lectura.loading, lectura.hasPermission, vista, loadVencer]);
  useEffect(() => {
    if (!detail) return;
    void loadMovimientos(detail.producto.id, movLote, 1);
  }, [detail?.producto.id, movLote, loadMovimientos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (lectura.loading || !lectura.hasPermission || !tenant?.id) return;
    const id = new URLSearchParams(window.location.search).get("producto");
    if (id && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) void abrir(id);
  }, [lectura.loading, lectura.hasPermission, tenant?.id, abrir]);

  const operar = async (operacion: Operacion) => {
    if (activeWrite.current) return;
    activeWrite.current = true;
    setSaving(true);
    setError("");
    setAviso("");
    const operationTenant = tenantRef.current;
    try {
      const r = await (operacion.method === "PUT" ? put : post)(operacion.path, operacion.payload, {
        headers: { "Idempotency-Key": operacion.key },
      });
      if (tenantRef.current !== operationTenant) return;
      if (!r?.data?.id) throw new Error("No se pudo confirmar la operación. Reintente con los mismos datos.");
      setPending(null);
      setEditor({ tipo: "ninguno" });
      setAviso(r.data.idempotent ? `${operacion.aviso} (ya estaba registrada)` : operacion.aviso);
      if (selected.current) await Promise.all([abrir(selected.current), loadProductos()]);
    } catch (err: unknown) {
      if (tenantRef.current !== operationTenant) return;
      const failure = err as { message?: string; status?: number; data?: { statusCode?: number } };
      // Un rechazo confirmado permite corregir; sin respuesta se conserva la
      // solicitud con su clave para recuperar el resultado.
      const status = Number(failure.status || failure.data?.statusCode);
      setPending(status >= 400 && status < 500 ? null : operacion);
      setError(failure.message || "No se pudo confirmar la operación.");
    } finally {
      activeWrite.current = false;
      setSaving(false);
    }
  };
  const enviar = (path: string, payload: object, aviso: string, method: "POST" | "PUT" = "POST") =>
    void operar({ path, payload, method, aviso, key: `lotes:${crypto.randomUUID()}` });
  const blocked = saving || Boolean(pending);
  const abrirProducto = (id: string) => {
    setEditor({ tipo: "ninguno" });
    setMovLote(null);
    setAviso("");
    setError("");
    setVista("producto");
    void abrir(id);
  };
  const volver = () => {
    ++detailSeq.current;
    selected.current = null;
    setDetail(null);
    setDetailError("");
    setDetailLoading(false);
    setEditor({ tipo: "ninguno" });
  };

  if (lectura.loading)
    return (
      <p role="status" className="p-6">
        Comprobando acceso a lotes…
      </p>
    );
  if (!lectura.hasPermission)
    return (
      <p role="alert" className="p-6">
        No tiene permiso para consultar lotes y vencimientos.
      </p>
    );

  const politica = detail?.politica;
  const almacenes = (detail?.almacenes ?? []).filter(
    (a) => Number(a.stock_actual) > 0 || a.saldos.length > 0 || a.reservas.length > 0,
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Lotes y vencimientos</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Saldos por lote, ubicación y vencimiento, con las reservas de cada pedido y el stock que aún no tiene lote.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div role="tablist" aria-label="Vista" className="inline-flex rounded-md border border-border p-0.5">
            {(
              [
                ["producto", "Por producto"],
                ["vencer", "Por vencer"],
              ] as const
            ).map(([valor, label]) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={vista === valor}
                className={`min-h-9 rounded px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${vista === valor ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setVista(valor)}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            disabled={blocked}
            onClick={() => {
              if (vista === "vencer") void loadVencer();
              else {
                void loadProductos();
                if (selected.current) void abrir(selected.current);
              }
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
        </div>
      </header>

      {aviso && (
        <p role="status" className="rounded-md border border-border bg-muted p-3 text-sm">
          {aviso}
        </p>
      )}
      {error && (
        <div role="alert" className="space-y-2 rounded-md border border-destructive p-3 text-sm text-destructive">
          <p>{error}</p>
          {pending && (
            <>
              <p>La operación aún no está confirmada. Reintente para recuperar el resultado antes de registrar otra.</p>
              <Button variant="outline" disabled={saving} onClick={() => void operar(pending)}>
                Reintentar operación
              </Button>
            </>
          )}
        </div>
      )}

      {vista === "vencer" ? (
        <section className="space-y-4" aria-label="Lotes por vencer">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Horizonte
              <select className={`${control} w-48`} value={dias} onChange={(e) => setDias(Number(e.target.value))}>
                {[30, 60, 90, 180, 365].map((d) => (
                  <option key={d} value={d}>
                    Próximos {d} días
                  </option>
                ))}
              </select>
            </label>
            <p className="pb-2 text-sm text-muted-foreground">Incluye lotes vencidos con stock.</p>
          </div>
          {vencerError && (
            <p role="alert" className="text-sm text-destructive">
              {vencerError} Pulse Actualizar para reintentar.
            </p>
          )}
          {vencerLoading ? (
            <p role="status" className="py-6 text-sm text-muted-foreground">
              Cargando lotes…
            </p>
          ) : !vencerError && !vencer.length ? (
            <div className="py-8">
              <h2 className="font-medium">Sin lotes en este horizonte</h2>
              <p className="mt-2 text-sm text-muted-foreground">Ningún lote con stock vence en los próximos {dias} días.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th scope="col" className="p-2">Vence</th>
                    <th scope="col" className="p-2">Producto</th>
                    <th scope="col" className="p-2">Lote</th>
                    <th scope="col" className="p-2 text-right">Stock</th>
                    <th scope="col" className="p-2 text-right">Reservado</th>
                  </tr>
                </thead>
                <tbody>
                  {vencer.map((l) => (
                    <tr key={l.lote_id} className="border-b border-border">
                      <td className="p-2">
                        {fecha(l.fecha_vencimiento)}
                        <span className={`block text-xs ${estadoLote[l.estado].className}`}>{estadoLote[l.estado].label}</span>
                      </td>
                      <td className="p-2">
                        <button
                          type="button"
                          className="text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => abrirProducto(l.producto_id)}
                        >
                          <span className="block font-medium">{l.producto_codigo}</span>
                          {l.producto_nombre}
                        </button>
                      </td>
                      <td className="p-2 font-medium">{l.lote}</td>
                      <td className="p-2 text-right">{cantidad(l.stock_actual)}</td>
                      <td className="p-2 text-right">{cantidad(l.stock_reservado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[310px_minmax(0,1fr)]">
          <aside
            className={`space-y-4 ${detail || detailLoading || detailError ? "hidden lg:block" : ""}`}
            aria-label="Productos con stock"
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
                aria-label="Buscar producto por código o nombre"
                placeholder="Código o nombre"
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
            {listLoading ? (
              <p role="status" className="py-6 text-sm text-muted-foreground">
                Cargando productos…
              </p>
            ) : !listError && !productos.length ? (
              <div className="py-8">
                <h2 className="font-medium">{filtro ? "Sin coincidencias" : "Aún no hay productos con stock"}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {filtro ? "Cambie el código o nombre buscado." : "Los productos de inventario aparecerán aquí."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {productos.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={blocked}
                      aria-current={detail?.producto.id === p.id ? "true" : undefined}
                      className={`w-full px-3 py-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${detail?.producto.id === p.id ? "bg-muted" : ""}`}
                      onClick={() => abrirProducto(p.id)}
                    >
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{p.codigo}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.controla_lote ? "Controla lote" : "Sin control de lote"}
                        </span>
                      </span>
                      <span className="mt-1 block break-words text-sm">{p.nombre}</span>
                      <span className="mt-2 block text-xs tabular-nums text-muted-foreground">
                        Stock {cantidad(p.stock_actual)} {p.unidad_medida ?? ""}
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
                disabled={blocked || listLoading || pagina === 1}
                onClick={() => setPagina((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>Página {pagina}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Página siguiente"
                disabled={blocked || listLoading || productos.length < LIMITE}
                onClick={() => setPagina((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </aside>

          <section className="min-w-0 space-y-8" aria-label="Lotes del producto">
            {(detail || detailLoading || detailError) && (
              <Button variant="ghost" className="lg:hidden" disabled={blocked} onClick={volver}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver a productos
              </Button>
            )}
            {!detail && !detailLoading && !detailError && (
              <div className="hidden py-8 lg:block">
                <h2 className="font-medium">Seleccione un producto</h2>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                  Verá sus lotes por almacén, las reservas de cada pedido, el stock sin lote pendiente de regularizar y su
                  kardex por lote.
                </p>
              </div>
            )}
            {detailLoading && <p role="status">Cargando lotes del producto…</p>}
            {detailError && (
              <div role="alert" className="space-y-2 text-sm text-destructive">
                <p>{detailError}</p>
                <Button variant="outline" onClick={() => selected.current && void abrir(selected.current)}>
                  Reintentar consulta
                </Button>
              </div>
            )}
            {!detailLoading && !detailError && detail && politica && (
              <>
                <header className="space-y-1 border-b border-border pb-5">
                  <h2 className="text-xl font-semibold">
                    {detail.producto.codigo} · {detail.producto.nombre}
                  </h2>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    Stock físico {cantidad(detail.producto.stock_actual)} {detail.producto.unidad_medida ?? ""} · Reservado{" "}
                    {cantidad(detail.producto.stock_reservado)}
                  </p>
                </header>

                <section className="space-y-3" aria-labelledby="politica-lote">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 id="politica-lote" className="font-semibold">
                      Control de lote
                    </h3>
                    {gestion.hasPermission && editor.tipo === "ninguno" && (
                      <Button variant="outline" disabled={blocked} onClick={() => setEditor({ tipo: "politica" })}>
                        {politica.controla_lote ? "Cambiar política" : "Activar control de lote"}
                      </Button>
                    )}
                  </div>
                  {editor.tipo === "politica" ? (
                    <PolicyForm
                      politica={politica}
                      busy={blocked}
                      onCancel={() => setEditor({ tipo: "ninguno" })}
                      onSubmit={(payload) =>
                        enviar(`${base}/productos/${detail.producto.id}/politica`, payload, "Política de lote actualizada", "PUT")
                      }
                    />
                  ) : politica.controla_lote ? (
                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-muted-foreground">Estado</dt>
                        <dd className="font-medium">Activo</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Vencimiento</dt>
                        <dd className="font-medium">{politica.requiere_vencimiento ? "Obligatorio" : "Opcional"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Vida útil mínima</dt>
                        <dd className="font-medium tabular-nums">
                          {politica.dias_minimos_vida_util} días al reservar o despachar
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      Este producto no distingue lotes: su stock se controla solo por almacén. Al activar el control,
                      recepciones y ajustes exigirán lote y el stock actual quedará sin lote hasta regularizarlo.
                    </p>
                  )}
                </section>

                {politica.controla_lote &&
                  (almacenes.length ? (
                    almacenes.map((a) => (
                      <AlmacenSeccion
                        key={a.almacen_id}
                        almacen={a}
                        puedeGestionar={gestion.hasPermission}
                        blocked={blocked}
                        editor={editor}
                        requiereVencimiento={politica.requiere_vencimiento}
                        onEditor={(e) => {
                          setError("");
                          setAviso("");
                          setEditor(e);
                        }}
                        onVerLote={(lote) => setMovLote(lote)}
                        onRegularizar={(payload) =>
                          enviar(`${base}/productos/${detail.producto.id}/regularizaciones`, payload, "Stock sin lote regularizado")
                        }
                        onReasignar={(payload) =>
                          enviar(`${base}/productos/${detail.producto.id}/reservas/reasignar`, payload, "Reserva reasignada entre lotes")
                        }
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">El producto no tiene stock ni reservas en ningún almacén.</p>
                  ))}

                {politica.controla_lote && (
                  <section className="space-y-3" aria-labelledby="kardex-lote">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 id="kardex-lote" className="font-semibold">
                        Kardex por lote{movLote ? ` · ${movLote.codigo}` : ""}
                      </h3>
                      {movLote && (
                        <Button variant="ghost" onClick={() => setMovLote(null)}>
                          Ver todos los lotes
                        </Button>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Entradas, salidas y regularizaciones con saldo corrido por lote y almacén. Las reservas no cambian el
                      saldo físico.
                    </p>
                    {movError && (
                      <div role="alert" className="space-y-2 text-sm text-destructive">
                        <p>{movError}</p>
                        <Button variant="outline" onClick={() => void loadMovimientos(detail.producto.id, movLote, movPagina)}>
                          Reintentar
                        </Button>
                      </div>
                    )}
                    {!movimientos.length && !movLoading && !movError ? (
                      <p className="text-sm text-muted-foreground">Aún no hay movimientos por lote.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-sm tabular-nums">
                          <thead>
                            <tr className="border-b border-border text-left">
                              <th scope="col" className="p-2">Fecha</th>
                              <th scope="col" className="p-2">Movimiento</th>
                              <th scope="col" className="p-2">Lote</th>
                              <th scope="col" className="p-2">Almacén</th>
                              <th scope="col" className="p-2 text-right">Cantidad</th>
                              <th scope="col" className="p-2 text-right">Saldo del lote</th>
                            </tr>
                          </thead>
                          <tbody>
                            {movimientos.map((m) => {
                              const signo = m.tipo === "SALIDA" ? -1 : m.tipo === "ENTRADA" || m.tipo === "REGULARIZACION" ? 1 : 0;
                              return (
                                <tr key={m.id} className="border-b border-border align-top">
                                  <td className="p-2 whitespace-nowrap">{fechaHora(m.created_at)}</td>
                                  <td className="p-2">
                                    <span className="font-medium">
                                      {tipoMovimiento[m.tipo]}
                                      {m.consume_reserva ? " de reserva" : ""}
                                    </span>
                                    <span className="block max-w-xs break-words text-xs text-muted-foreground">
                                      {m.notas || m.referencia_tipo || "—"}
                                    </span>
                                  </td>
                                  <td className="p-2">
                                    {m.lote}
                                    <span className="block text-xs text-muted-foreground">{fecha(m.fecha_vencimiento)}</span>
                                  </td>
                                  <td className="p-2">
                                    {m.almacen_nombre}
                                    <span className="block text-xs text-muted-foreground">{m.ubicacion_codigo ?? "Sin ubicación"}</span>
                                  </td>
                                  <td className="p-2 text-right">
                                    {signo === 0 ? (
                                      <span className="text-muted-foreground">({cantidad(m.cantidad)})</span>
                                    ) : (
                                      `${signo < 0 ? "−" : "+"}${cantidad(m.cantidad)}`
                                    )}
                                  </td>
                                  <td className="p-2 text-right font-medium">{cantidad(m.saldo_lote)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {movLoading && (
                      <p role="status" className="text-sm text-muted-foreground">
                        Cargando movimientos…
                      </p>
                    )}
                    {movMas && !movLoading && (
                      <Button variant="outline" onClick={() => void loadMovimientos(detail.producto.id, movLote, movPagina + 1)}>
                        Cargar más
                      </Button>
                    )}
                  </section>
                )}

                {detail.operaciones.length > 0 && (
                  <section className="space-y-3" aria-labelledby="historial-lote">
                    <h3 id="historial-lote" className="font-semibold">
                      Decisiones registradas
                    </h3>
                    <ol className="divide-y divide-border border-y border-border text-sm">
                      {detail.operaciones.map((o) => (
                        <li key={o.id} className="flex flex-wrap justify-between gap-2 py-3">
                          <span>
                            <span className="font-medium">{accionesLote[o.accion]}</span>
                            {o.motivo && <span className="block text-muted-foreground">{o.motivo}</span>}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {o.actor_nombre || "Usuario"} · {fechaHora(o.created_at)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function AlmacenSeccion({
  almacen,
  puedeGestionar,
  blocked,
  editor,
  requiereVencimiento,
  onEditor,
  onVerLote,
  onRegularizar,
  onReasignar,
}: {
  almacen: AlmacenLotes;
  puedeGestionar: boolean;
  blocked: boolean;
  editor: Editor;
  requiereVencimiento: boolean;
  onEditor: (editor: Editor) => void;
  onVerLote: (lote: { id: string; codigo: string }) => void;
  onRegularizar: (payload: object) => void;
  onReasignar: (payload: object) => void;
}) {
  const documentos = agruparReservas(almacen.reservas);
  const libre = editor.tipo === "ninguno";
  const cerrar = () => onEditor({ tipo: "ninguno" });
  return (
    <section className="space-y-4 border-t border-border pt-5" aria-labelledby={`almacen-${almacen.almacen_id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 id={`almacen-${almacen.almacen_id}`} className="font-semibold">
          {almacen.almacen_nombre}
        </h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm tabular-nums sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Físico</dt>
            <dd className="font-medium">{cantidad(almacen.stock_actual)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">En lotes</dt>
            <dd className="font-medium">{cantidad(almacen.stock_lotes)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Reservado</dt>
            <dd className="font-medium">{cantidad(almacen.reservado_lotes)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sin lote</dt>
            <dd
              className={`font-medium ${Number(almacen.stock_sin_lote) > 0 ? "text-amber-400 group-data-[erp-theme=light]/dashboard:text-amber-700" : ""}`}
            >
              {cantidad(almacen.stock_sin_lote)}
            </dd>
          </div>
        </dl>
      </div>

      {Number(almacen.stock_sin_lote) > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="max-w-2xl text-muted-foreground">
            {cantidad(almacen.stock_sin_lote)} unidades entraron sin evidencia de lote. No se reservan ni despachan hasta
            asignarlas a un lote.
          </p>
          {puedeGestionar && libre && (
            <Button variant="outline" disabled={blocked} onClick={() => onEditor({ tipo: "regularizar", almacenId: almacen.almacen_id })}>
              Regularizar
            </Button>
          )}
        </div>
      )}
      {editor.tipo === "regularizar" && editor.almacenId === almacen.almacen_id && (
        <RegularizeForm
          almacen={almacen}
          requiereVencimiento={requiereVencimiento}
          busy={blocked}
          onCancel={cerrar}
          onSubmit={onRegularizar}
        />
      )}

      {almacen.saldos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay saldos por lote en este almacén.</p>
      ) : (
        <>
          <ul className="space-y-3 sm:hidden">
            {almacen.saldos.map((s) => (
              <li key={`${s.lote_id}:${s.ubicacion_id ?? ""}`} className="border-b border-border pb-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <button
                    type="button"
                    className="font-semibold underline-offset-4 hover:underline"
                    onClick={() => onVerLote({ id: s.lote_id, codigo: s.lote })}
                  >
                    {s.lote}
                  </button>
                  <span className={`text-xs ${estadoLote[s.estado].className}`}>{estadoLote[s.estado].label}</span>
                </div>
                <p className="text-muted-foreground">
                  Vence {fecha(s.fecha_vencimiento)} · {ubicacionTexto(s)}
                </p>
                <dl className="mt-1 grid grid-cols-3 gap-2 tabular-nums">
                  <div>
                    <dt className="text-xs text-muted-foreground">Stock</dt>
                    <dd>{cantidad(s.stock_actual)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Reservado</dt>
                    <dd>{cantidad(s.stock_reservado)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Disponible</dt>
                    <dd className="font-medium">{cantidad(s.disponible)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="p-2">Lote</th>
                  <th scope="col" className="p-2">Vence</th>
                  <th scope="col" className="p-2">Ubicación</th>
                  <th scope="col" className="p-2 text-right">Stock</th>
                  <th scope="col" className="p-2 text-right">Reservado</th>
                  <th scope="col" className="p-2 text-right">Disponible</th>
                </tr>
              </thead>
              <tbody>
                {almacen.saldos.map((s) => (
                  <tr key={`${s.lote_id}:${s.ubicacion_id ?? ""}`} className="border-b border-border">
                    <td className="p-2">
                      <button
                        type="button"
                        className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Ver kardex del lote ${s.lote}`}
                        onClick={() => onVerLote({ id: s.lote_id, codigo: s.lote })}
                      >
                        {s.lote}
                      </button>
                    </td>
                    <td className="p-2">
                      {fecha(s.fecha_vencimiento)}
                      <span className={`block text-xs ${estadoLote[s.estado].className}`}>{estadoLote[s.estado].label}</span>
                    </td>
                    <td className="p-2">{ubicacionTexto(s)}</td>
                    <td className="p-2 text-right">{cantidad(s.stock_actual)}</td>
                    <td className="p-2 text-right">{cantidad(s.stock_reservado)}</td>
                    <td className="p-2 text-right font-medium">{cantidad(s.disponible)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Reservas por documento</h4>
        {!documentos.length ? (
          <p className="text-sm text-muted-foreground">No hay reservas vigentes en este almacén.</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {documentos.map((d) => (
              <li key={d.referencia_id} className="space-y-3 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {d.pedido_numero ? `Pedido ${d.pedido_numero}` : `Documento ${d.referencia_id.slice(0, 8)}`}
                    </p>
                    <p className="text-muted-foreground">
                      {d.cliente_nombre ? `${d.cliente_nombre} · ` : ""}
                      {cantidad(d.total)} reservados
                    </p>
                  </div>
                  {puedeGestionar && libre && (
                    <Button
                      variant="outline"
                      disabled={blocked}
                      onClick={() => onEditor({ tipo: "reasignar", almacenId: almacen.almacen_id, documento: d })}
                    >
                      Reasignar lotes
                    </Button>
                  )}
                </div>
                <ul className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums">
                  {d.lineas.map((l) => (
                    <li key={`${l.lote_id}:${l.ubicacion_id ?? ""}`}>
                      {l.lote} · vence {fecha(l.fecha_vencimiento)} · {cantidad(l.cantidad)}
                    </li>
                  ))}
                </ul>
                {editor.tipo === "reasignar" &&
                  editor.almacenId === almacen.almacen_id &&
                  editor.documento.referencia_id === d.referencia_id && (
                    <ReassignForm almacen={almacen} documento={d} busy={blocked} onCancel={cerrar} onSubmit={onReasignar} />
                  )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
