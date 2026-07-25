"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useApi } from "@/hooks/use-api";
import { ArrowLeft, Package, Save } from "lucide-react";

export default function EditarProductoPage() {
  const router = useRouter();
  const params = useParams();
  const { get, put } = useApi();
  const productoId = params.id as string | undefined;
  const [isLoading, setIsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    codigo: "",
    nombre: "",
    descripcion: "",
    categoria: "",
    precioVenta: "",
    precioCompra: "",
    stockMinimo: "",
    codigoBarras: "",
    impuesto: "18",
    activo: true,
  });

  const loadProducto = useCallback(async () => {
    if (!productoId) return;

    setLoading(true);
    try {
      const response = await get(`/inventario/productos/${productoId}`);
      if (response?.success && response.data) {
        const p = response.data;
        setFormData({
          codigo: p.codigo || "",
          nombre: p.nombre || "",
          descripcion: p.descripcion || "",
          categoria: p.categoria || "",
          precioVenta: p.precio_venta?.toString() || "",
          precioCompra: p.precio_compra?.toString() || "",
          stockMinimo: p.stock_minimo?.toString() || "",
          codigoBarras: p.codigo_barras || "",
          impuesto: p.impuesto?.toString() || "18",
          activo: p.activo !== false,
        });
      }
    } catch (error) {
      console.error("Error cargando producto:", error);
      alert("Error al cargar el producto");
    } finally {
      setLoading(false);
    }
  }, [get, productoId]);

  useEffect(() => {
    loadProducto();
  }, [loadProducto]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.codigo || !formData.nombre || !formData.categoria) {
      alert("Por favor complete los campos obligatorios");
      return;
    }

    setIsLoading(true);
    try {
      const response = await put(
        `/inventario/productos/${params.id}`,
        formData,
      );

      if (response?.success) {
        alert("✅ Producto actualizado exitosamente");
        router.push("/dashboard/inventario/productos");
      } else {
        throw new Error(response?.message || "Error al actualizar producto");
      }
    } catch (error: any) {
      console.error("Error:", error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="flex min-h-48 items-center justify-center">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p>Cargando producto...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <button
            onClick={() => router.push("/dashboard/inventario/productos")}
            className="inline-flex items-center gap-2 text-muted-foreground text-[0.875rem] mb-2 border-0 cursor-pointer py-1 px-0"
          >
            <ArrowLeft size={16} />
            Volver a Productos
          </button>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground flex items-center gap-3">
            <Package size={32} />
            Editar Producto
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Modifique la información del producto
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-8">
          <h2 className="m-0 text-lg font-bold text-foreground">Información Básica</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label>
                Código <span className="text-[var(--red-500)]">*</span>
              </label>
              <input
                type="text"
                name="codigo"
                value={formData.codigo}
                onChange={handleChange}
                required
                placeholder="Ej: PROD001"
              />
            </div>
            <div>
              <label>Código de Barras</label>
              <input
                type="text"
                name="codigoBarras"
                value={formData.codigoBarras}
                onChange={handleChange}
                placeholder="Ej: 7501234567890"
              />
            </div>
          </div>

          <div className="mt-4">
            <label>
              Nombre <span className="text-[var(--red-500)]">*</span>
            </label>
            <input
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              required
              placeholder="Nombre del producto"
            />
          </div>

          <div className="mt-4">
            <label>Descripción</label>
            <textarea
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              rows={3}
              placeholder="Descripción detallada del producto"
            />
          </div>

          <div className="mt-4">
            <label>
              Categoría <span className="text-[var(--red-500)]">*</span>
            </label>
            <select
              name="categoria"
              value={formData.categoria}
              onChange={handleChange}
              required
            >
              <option value="">Seleccione una categoría</option>
              <option value="ELECTRONICA">Electrónica</option>
              <option value="ALIMENTOS">Alimentos</option>
              <option value="ROPA">Ropa</option>
              <option value="HOGAR">Hogar</option>
              <option value="OFICINA">Oficina</option>
              <option value="OTROS">Otros</option>
            </select>
          </div>

          <div className="mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="activo"
                checked={formData.activo}
                onChange={handleChange}
              />
              <span>Producto activo</span>
            </label>
          </div>
        </div>

        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-8">
          <h2 className="m-0 text-lg font-bold text-foreground">Precios e Impuestos</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label>Precio de Compra</label>
              <input
                type="number"
                name="precioCompra"
                value={formData.precioCompra}
                onChange={handleChange}
                step="0.01"
                min="0"
                placeholder="0.00"
              />
            </div>
            <div>
              <label>
                Precio de Venta <span className="text-[var(--red-500)]">*</span>
              </label>
              <input
                type="number"
                name="precioVenta"
                value={formData.precioVenta}
                onChange={handleChange}
                step="0.01"
                min="0"
                required
                placeholder="0.00"
              />
            </div>
            <div>
              <label>Impuesto (%)</label>
              <input
                type="number"
                name="impuesto"
                value={formData.impuesto}
                onChange={handleChange}
                step="0.01"
                min="0"
                max="100"
                placeholder="18"
              />
            </div>
          </div>
        </div>

        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-8">
          <h2 className="m-0 text-lg font-bold text-foreground">Inventario</h2>
          <div className="bg-[var(--amber-50)] border p-4 mb-4">
            <p className="m-0 text-[0.875rem] text-[var(--amber-700)]">
              ⚠️ El stock actual no se puede modificar desde aquí. Use
              movimientos de inventario para ajustar el stock.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label>Stock Mínimo</label>
              <input
                type="number"
                name="stockMinimo"
                value={formData.stockMinimo}
                onChange={handleChange}
                min="0"
                placeholder="0"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-4 justify-end">
          <button
            type="button"
            onClick={() => router.push("/dashboard/inventario/productos")}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold leading-5 text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            disabled={isLoading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary w-4 h-4"></div>
                Guardando...
              </>
            ) : (
              <>
                <Save size={20} />
                Guardar Cambios
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
