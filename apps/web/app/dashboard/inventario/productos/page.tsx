"use client";

import { requestConfirmation } from '@/lib/confirm-action'
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/use-api";
import { useAuth } from '@/contexts/AuthContext';
import { usePermission } from '@/hooks/use-permission';
import { productDeactivateIntentKey, newProductDeactivateIntent, readProductDeactivateIntent, readProductDeactivateCandidate, readProductDeactivateCatalog, confirmProductDeactivated, type ProductDeactivateIntent } from '@/lib/product-deactivate-operation';
import type { ProductSnapshot } from '@/lib/product-update-operation';
import { useCountryContext } from "@/hooks/use-country-context";
import { Package, Plus, Edit, Trash2, Search, Filter } from "lucide-react";

type Producto = ProductSnapshot;

type Filters = {
  search: string;
  categoria: string;
  estado: "TODOS" | "ACTIVO" | "INACTIVO";
  soloCriticos: boolean;
};

export default function ProductosPage() {
  const { session } = useAuth();
  return <ProductosWorkspace key={`${session?.user?.tenant_id || ''}:${session?.user?.id || ''}`} />;
}

function ProductosWorkspace() {
  const { session, loading: authLoading } = useAuth();
  const tenantId = session?.user?.tenant_id || '', actorId = session?.user?.id || '';
  const scopeIdentity = `${tenantId}:${actorId}`;
  const createPermission = usePermission('inventario', 'create', 'productos');
  const updatePermission = usePermission('inventario', 'update', 'productos');
  const deletePermission = usePermission('inventario', 'delete', 'productos');
  const canCreate = createPermission.hasPermission && !createPermission.loading;
  const canUpdate = updatePermission.hasPermission && !updatePermission.loading;
  const canDelete = deletePermission.hasPermission && !deletePermission.loading;
  const deleteAllowed = useRef(canDelete); deleteAllowed.current = canDelete;
  const activeScope = useRef(scopeIdentity); activeScope.current = scopeIdentity;
  const writeEpoch = useRef(0), inFlight = useRef(false), pendingRaw = useRef<string | null>(null);
  const [intentReady, setIntentReady] = useState('');
  const [pendingIntent, setPendingIntent] = useState<ProductDeactivateIntent | null>(null);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [operationNotice, setOperationNotice] = useState('');
  const scopeReady = !authLoading && !!tenantId && !!actorId && intentReady === scopeIdentity;
  const visibleIntent = scopeReady && pendingIntent?.tenantId === tenantId && pendingIntent?.actorId === actorId ? pendingIntent : null;
  useEffect(() => {
    writeEpoch.current += 1; inFlight.current = false; pendingRaw.current = null;
    setPendingIntent(null); setIntentReady(''); setRecoveryBlocked(false); setDeactivating(false); setOperationError(''); setOperationNotice('');
    if (authLoading || !tenantId || !actorId) return;
    try {
      const raw = window.localStorage.getItem(productDeactivateIntentKey({ tenantId, actorId }));
      if (raw !== null) { const intent = readProductDeactivateIntent(raw, { tenantId, actorId }); pendingRaw.current = raw; setPendingIntent(intent); }
      setIntentReady(scopeIdentity);
    } catch (err) { setRecoveryBlocked(true); setOperationError(err instanceof Error ? err.message : 'No se pudo recuperar la baja pendiente. Se conserva sin reemplazarla.'); }
    return () => { writeEpoch.current += 1; };
  }, [tenantId, actorId, authLoading, scopeIdentity]);
  const router = useRouter();
  const { get, del } = useApi({ requireLive: true, throwOnError: true, showErrorToast: false, retries: 0 });
  const country = useCountryContext();
  const formatMoney = (value: number) =>
    new Intl.NumberFormat(country.locale || "es-PE", {
      style: "currency",
      currency: country.moneda || "PEN",
    }).format(value);
  const [loading, setLoading] = useState(true);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loadError, setLoadError] = useState(false);
  const loadSequence = useRef(0);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    categoria: "",
    estado: "ACTIVO",
    soloCriticos: false,
  });

  const loadProductos = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setProductos([]);
    setLoadError(false);
    setLoading(true);
    try {
      const [activeResponse, inactiveResponse] = await Promise.all([
        get("/inventario/productos", { params: { estado: 'ACTIVO' } }),
        get("/inventario/productos", { params: { estado: 'INACTIVO' } }),
      ]);
      const activeRows = readProductDeactivateCatalog(activeResponse, { tenantId, actorId });
      const inactiveRows = readProductDeactivateCatalog(inactiveResponse, { tenantId, actorId });
      if (activeRows.some(row => !row.activo) || inactiveRows.some(row => row.activo)) throw new Error('El catálogo no coincide con el estado consultado');
      const rows = readProductDeactivateCatalog({ success: true, data: [...activeRows, ...inactiveRows] }, { tenantId, actorId });
      if (sequence !== loadSequence.current) return;
      setProductos(rows);
    } catch (error) {
      if (sequence !== loadSequence.current) return;
      setLoadError(true);
      console.error("Error cargando productos:", error);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [get, tenantId, actorId]);

  useEffect(() => {
    loadProductos();
    return () => { loadSequence.current += 1; };
  }, [loadProductos]);

  const writerBlocked = !scopeReady || recoveryBlocked || deactivating || !!visibleIntent;
  const handleDelete = async (selected?: Producto) => {
    if (!canDelete || !scopeReady || recoveryBlocked || inFlight.current || loading || loadError) return;
    if (!visibleIntent && (!selected || !(await requestConfirmation(`¿Dar de baja el producto "${selected.nombre}"? Se conservarán sus datos e historial.`)))) return;
    const run = writeEpoch.current;
    const current = () => run === writeEpoch.current && activeScope.current === scopeIdentity && deleteAllowed.current;
    const scope = { tenantId, actorId }, key = productDeactivateIntentKey(scope);
    inFlight.current = true; setDeactivating(true); setOperationError(''); setOperationNotice('');
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== pendingRaw.current) throw new Error('La baja pendiente cambió en otra ventana. Se conserva; recargue para revisarla.');
      let intent = raw === null ? null : readProductDeactivateIntent(raw, scope);
      if (!intent) {
        if (!selected) return;
        const response = await get(`/inventario/productos/${selected.id}`);
        const candidate = readProductDeactivateCandidate(response, scope, selected.id, selected);
        if (!current()) return;
        intent = newProductDeactivateIntent(candidate, scope);
        if (window.localStorage.getItem(key) !== null) throw new Error('Otra ventana guardó una baja pendiente. Se conserva sin reemplazarla.');
        const nextRaw = JSON.stringify(intent); readProductDeactivateIntent(nextRaw, scope);
        window.localStorage.setItem(key, nextRaw);
        if (window.localStorage.getItem(key) !== nextRaw) throw new Error('No se pudo guardar y verificar la baja pendiente. No se envió.');
        pendingRaw.current = nextRaw; setPendingIntent(intent);
      }
      if (!current()) return;
      if (window.localStorage.getItem(key) !== pendingRaw.current) throw new Error('La baja pendiente cambió en otra ventana. Se conserva sin reemplazarla.');
      const response = await del(`/inventario/productos/${intent.snapshot.id}`, { headers: { 'Idempotency-Key': intent.idempotencyKey } });
      if (!current()) return;
      const row = confirmProductDeactivated(response, intent);
      if (window.localStorage.getItem(key) !== pendingRaw.current) throw new Error('La baja pendiente cambió en otra ventana. Se conserva sin retirarla.');
      window.localStorage.removeItem(key);
      if (window.localStorage.getItem(key) !== null) throw new Error('La baja se confirmó, pero no se pudo retirar la intención. Reintente su recuperación.');
      pendingRaw.current = null; setPendingIntent(null);
      setOperationNotice(`Producto "${row.nombre}" dado de baja. Su historial se conserva.`);
      await loadProductos();
    } catch (err) { if (current()) setOperationError(err instanceof Error ? err.message : 'No se pudo confirmar la baja. Se conserva para reintentar.'); }
    finally { if (current()) { inFlight.current = false; setDeactivating(false); } }
  };

  const categorias = Array.from(
    new Set(productos.map((p) => p.categoria).filter(Boolean)),
  );

  const productosFiltrados = productos.filter((p) => {
    if (
      filters.estado !== "TODOS" &&
      p.activo !== (filters.estado === "ACTIVO")
    )
      return false;
    if (filters.categoria && p.categoria !== filters.categoria) return false;
    if (
      filters.soloCriticos &&
      (p.stock_actual || p.stock || 0) > p.stock_minimo
    )
      return false;
    if (filters.search) {
      const term = filters.search.toLowerCase();
      return (
        p.nombre.toLowerCase().includes(term) ||
        p.marca?.toLowerCase().includes(term) ||
        p.codigo?.toLowerCase().includes(term) ||
        p.codigo_barras?.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const stockDisponible = (p: Producto) =>
    (p.stock_actual || p.stock || 0) - (p.stock_reservado || 0);

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground flex items-center gap-3">
            <Package size={32} />
            Gestión de Productos
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Administra el catálogo de productos del inventario
          </p>
        </div>
        {canCreate && !writerBlocked && !loadError && !loading && <Link
          href="/dashboard/inventario/productos/nuevo"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          <Plus size={20} />
          Nuevo Producto
        </Link>}
      </div>

      {operationError && <div role="alert" className="mb-4 rounded-lg border border-destructive p-4 text-destructive">{operationError}</div>}
      {operationNotice && <div role="status" className="mb-4 rounded-lg border border-border p-4">{operationNotice}</div>}
      {visibleIntent && <div data-testid="product-deactivate-pending" className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Baja de producto pendiente de confirmar</h2>
        <p>{visibleIntent.snapshot.codigo} — {visibleIntent.snapshot.nombre}</p>
        <p>Se conservarán los datos y el historial del producto. Stock {visibleIntent.snapshot.stock_actual}; reservado {visibleIntent.snapshot.stock_reservado}.</p>
        <p>No se envía automáticamente. Reintente con conexión para confirmar la misma baja.</p>
        {canDelete && <button type="button" disabled={deactivating || loading || loadError || recoveryBlocked} onClick={() => handleDelete()} className="mt-3 rounded-lg border px-4 py-2 disabled:opacity-50">{deactivating ? 'Confirmando baja…' : 'Reintentar baja pendiente'}</button>}
      </div>}

      {/* Filtros */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} />
          <h3 className="m-0 font-semibold">Filtros</h3>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4">
          <div>
            <label htmlFor="productos-buscar" className="block mb-2 text-[0.875rem]">
              <Search size={16} className="mr-1" />
              Buscar
            </label>
            <input id="productos-buscar"
              type="text"
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              placeholder="Código, nombre, marca o código de barras"
              className="w-[100%]"
            />
          </div>
          <div>
            <label htmlFor="productos-categoria" className="block mb-2 text-[0.875rem]">Categoría</label>
            <select id="productos-categoria"
              value={filters.categoria}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, categoria: e.target.value }))
              }
              className="w-[100%]"
            >
              <option value="">Todas</option>
              {categorias.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="productos-estado" className="block mb-2 text-[0.875rem]">Estado</label>
            <select id="productos-estado"
              value={filters.estado}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  estado: e.target.value as any,
                }))
              }
              className="w-[100%]"
            >
              <option value="TODOS">Todos</option>
              <option value="ACTIVO">Activos</option>
              <option value="INACTIVO">Inactivos</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.soloCriticos}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    soloCriticos: e.target.checked,
                  }))
                }
              />
              <span className="text-[0.875rem]">Solo stock crítico</span>
            </label>
          </div>
        </div>
      </div>

      {/* Tabla de productos */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="m-0 text-lg font-bold text-foreground">
            {loadError ? 'Productos no disponibles' : `Productos (${productosFiltrados.length})`}
          </h2>
          <button onClick={loadProductos} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold leading-5 text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50">
            Actualizar
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center">
            <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
            <p>Cargando productos...</p>
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-lg border border-destructive p-4 text-destructive">
            <p>No se pudo cargar el catálogo de productos. Reintente para consultar o editar.</p>
            <button type="button" onClick={loadProductos} className="mt-3 rounded-lg border px-4 py-2">Reintentar</button>
          </div>
        ) : productosFiltrados.length === 0 ? (
          <div className="text-center p-12 text-[var(--primary-500)]">
            <Package size={48} className="opacity-[0.5] mb-4" />
            <p>No se encontraron productos</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Precio Venta</th>
                  <th>Stock Actual</th>
                  <th>Stock Disponible</th>
                  <th>Stock Mínimo</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productosFiltrados.map((producto) => {
                  const disponible = stockDisponible(producto);
                  const stockActual =
                    producto.stock_actual || producto.stock || 0;
                  const reservado = producto.stock_reservado || 0;
                  const sinStock = disponible <= 0;
                  const critico =
                    producto.stock_minimo > 0 &&
                    disponible <= producto.stock_minimo;

                  const badgeStyle = {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.35rem 0.6rem",
                    borderRadius: "999px",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    color: sinStock
                      ? "#991b1b"
                      : critico
                        ? "#92400e"
                        : "#065f46",
                    background: sinStock
                      ? "rgba(239, 68, 68, 0.15)"
                      : critico
                        ? "rgba(245, 158, 11, 0.15)"
                        : "rgba(16, 185, 129, 0.12)",
                    border: `1px solid ${sinStock ? "rgba(239, 68, 68, 0.35)" : critico ? "rgba(245, 158, 11, 0.35)" : "rgba(16, 185, 129, 0.35)"}`,
                  } as const;

                  return (
                    <tr key={producto.id}>
                      <td>
                        <strong>{producto.codigo}</strong>
                        {producto.codigo_barras && (
                          <div className="text-xs text-[var(--primary-500)]">
                            {producto.codigo_barras}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="flex min-w-56 items-center gap-3">
                          <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/30">
                            {producto.imagen_url ? (
                              <Image
                                src={producto.imagen_url}
                                alt={`Imagen de ${producto.nombre}`}
                                fill
                                unoptimized
                                className="object-contain"
                              />
                            ) : (
                              <Package className="absolute inset-0 m-auto text-muted-foreground" size={22} />
                            )}
                          </div>
                          <div>
                            <strong>{producto.nombre}</strong>
                            {producto.marca && (
                              <div className="text-xs font-medium text-primary">
                                Marca: {producto.marca}
                              </div>
                            )}
                            {producto.descripcion && (
                              <div className="text-[0.875rem] text-[var(--primary-600)]">
                                {producto.descripcion.substring(0, 50)}
                                {producto.descripcion.length > 50 && "..."}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{producto.categoria || "—"}</td>
                      <td>
                        {formatMoney(Number(producto.precio_venta || 0))}
                        <div className="text-xs text-[var(--primary-500)]">
                          Compra: {formatMoney(Number(producto.precio_compra || 0))}
                        </div>
                      </td>
                      <td className="text-center">
                        <strong>{stockActual}</strong>
                      </td>
                      <td className="text-center">
                        <div>
                          {sinStock
                            ? "⚠️ Sin stock"
                            : critico
                              ? "⚠️ Crítico"
                              : "✅ Disponible"}{" "}
                          {Number(disponible).toLocaleString('es-PE', { maximumFractionDigits: 6 })}
                        </div>
                        {reservado > 0 && (
                          <div className="text-xs text-[var(--amber-600)] mt-[0.15rem]">
                            ({reservado} reservado)
                          </div>
                        )}
                      </td>
                      <td className="text-center">
                        {producto.stock_minimo || "—"}
                      </td>
                      <td>
                        <span
                          className={
                            producto.activo ? "inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400 dark:text-emerald-300" : "inline-flex items-center rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-bold text-destructive"
                          }
                        >
                          {producto.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-2">
                          {canUpdate && <button
                            disabled={writerBlocked}
                            onClick={() =>
                              router.push(
                                `/dashboard/inventario/productos/${producto.id}/editar`,
                              )
                            }
                            className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-accent"
                            title="Editar"
                          >
                            <Edit size={16} />
                          </button>}
                          {canDelete && producto.activo && <button
                            disabled={writerBlocked || producto.stock_actual !== 0 || producto.stock_reservado !== 0}
                            onClick={() =>
                              handleDelete(producto)
                            }
                            className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-background text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
                            title="Dar de baja"
                            aria-label={`Dar de baja ${producto.codigo}`}
                          >
                            <Trash2 size={16} />
                          </button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
