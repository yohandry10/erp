"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/use-api";
import { useCountryContext } from "@/hooks/use-country-context";
import { Package, Plus, Edit, Trash2, Search, Filter } from "lucide-react";

type Producto = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  categoria?: string;
  precio_venta: number;
  precio_compra: number;
  stock_actual: number;
  stock?: number;
  stock_minimo: number;
  stock_reservado: number;
  codigo_barras?: string;
  impuesto: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

type Filters = {
  search: string;
  categoria: string;
  estado: "TODOS" | "ACTIVO" | "INACTIVO";
  soloCriticos: boolean;
};

export default function ProductosPage() {
  const router = useRouter();
  const { get, del } = useApi();
  const country = useCountryContext();
  const formatMoney = (value: number) =>
    new Intl.NumberFormat(country.locale || "es-PE", {
      style: "currency",
      currency: country.moneda || "PEN",
    }).format(value);
  const [loading, setLoading] = useState(true);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    categoria: "",
    estado: "ACTIVO",
    soloCriticos: false,
  });

  const loadProductos = useCallback(async () => {
    setLoading(true);
    try {
      const response = await get("/inventario/productos");
      if (response?.success && Array.isArray(response.data)) {
        setProductos(response.data);
      }
    } catch (error) {
      console.error("Error cargando productos:", error);
      alert("Error al cargar productos");
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    loadProductos();
  }, [loadProductos]);

  const handleDelete = async (id: string, nombre: string) => {
    if (!confirm(`¿Está seguro de eliminar el producto "${nombre}"?`)) return;

    try {
      const response = await del(`/inventario/productos/${id}`);
      if (response?.success) {
        alert("✅ Producto eliminado exitosamente");
        loadProductos();
      } else {
        throw new Error(response?.message || "Error al eliminar");
      }
    } catch (error: any) {
      console.error("Error eliminando producto:", error);
      alert(`❌ Error: ${error.message}`);
    }
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
        <Link
          href="/dashboard/inventario/productos/nuevo"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          <Plus size={20} />
          Nuevo Producto
        </Link>
      </div>

      {/* Filtros */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} />
          <h3 className="m-0 font-semibold">Filtros</h3>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4">
          <div>
            <label className="block mb-2 text-[0.875rem]">
              <Search size={16} className="mr-1" />
              Buscar
            </label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              placeholder="Código, nombre o código de barras"
              className="w-[100%]"
            />
          </div>
          <div>
            <label className="block mb-2 text-[0.875rem]">Categoría</label>
            <select
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
            <label className="block mb-2 text-[0.875rem]">Estado</label>
            <select
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
            Productos ({productosFiltrados.length})
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
                        <div>
                          <strong>{producto.nombre}</strong>
                          {producto.descripcion && (
                            <div className="text-[0.875rem] text-[var(--primary-600)]">
                              {producto.descripcion.substring(0, 50)}
                              {producto.descripcion.length > 50 && "..."}
                            </div>
                          )}
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
                          {Number(disponible).toFixed(2)}
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
                          <button
                            onClick={() =>
                              router.push(
                                `/dashboard/inventario/productos/${producto.id}/editar`,
                              )
                            }
                            className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-accent"
                            title="Editar"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() =>
                              handleDelete(producto.id, producto.nombre)
                            }
                            className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-background text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
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
