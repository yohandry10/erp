"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useApi } from "@/hooks/use-api";
import { ArrowLeft, Package, Save } from "lucide-react";
import { useCountryContext } from "@/hooks/use-country-context";
import {
  etiquetaNoGravado,
  etiquetaSinImpuesto,
} from "@/lib/afectacion-labels";
import { ProductImageField } from "@/components/ProductImageField";
import { deleteProductImage, uploadProductImage } from "@/lib/product-images";

// Ni las etiquetas ni los campos tenian estilo propio: el navegador los pintaba
// en linea y el texto de cada label quedaba pegado a su input.
const camposClass =
  '[&_label]:mb-1.5 [&_label]:block [&_label]:text-sm [&_label]:font-medium [&_label]:text-foreground/85 [&_input:not([type=checkbox])]:w-full [&_select]:w-full [&_textarea]:w-full [&_input:not([type=checkbox])]:rounded-lg [&_select]:rounded-lg [&_textarea]:rounded-lg [&_input:not([type=checkbox])]:px-3 [&_select]:px-3 [&_textarea]:px-3 [&_input:not([type=checkbox])]:py-2.5 [&_select]:py-2.5 [&_textarea]:py-2.5 [&_input]:text-sm [&_select]:text-sm [&_textarea]:text-sm [&_input:focus-visible]:border-primary [&_select:focus-visible]:border-primary [&_textarea:focus-visible]:border-primary [&_input:focus-visible]:outline-none [&_select:focus-visible]:outline-none [&_textarea:focus-visible]:outline-none';

export default function EditarProductoPage() {
  const router = useRouter();
  const params = useParams();
  const { get, put, apiCall } = useApi();
  const country = useCountryContext();
  const productoId = params.id as string | undefined;
  const intentRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const imageIntentRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const deleteImageIntentRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [categorias, setCategorias] = useState<Array<{ id: string; nombre: string }>>([]);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [removeCurrentImage, setRemoveCurrentImage] = useState(false);
  const [formData, setFormData] = useState({
    codigo: "",
    nombre: "",
    marca: "",
    descripcion: "",
    categoria: "",
    precioVenta: "",
    precioCompra: "",
    stockMinimo: "",
    codigoBarras: "",
    impuesto: "18",
    afectacionIgv: "10",
  });

  const impuestoNombre = country.paisCodigo === "PE" ? "IGV" : "IVA";

  const loadProducto = useCallback(async () => {
    if (!productoId) return;

    setLoading(true);
    try {
      const [response, categoriasResponse] = await Promise.all([
        get(`/inventario/productos/${productoId}`),
        get("/inventario/categorias"),
      ]);
      if (categoriasResponse?.success && Array.isArray(categoriasResponse.data)) {
        setCategorias(
          categoriasResponse.data.map((categoria: any) => ({
            id: String(categoria.id),
            nombre: String(categoria.nombre ?? ""),
          })),
        );
      }
      if (response?.success && response.data) {
        const p = response.data;
        setCurrentImageUrl(p.imagen_url || null);
        setFormData({
          codigo: p.codigo || "",
          nombre: p.nombre || "",
          marca: p.marca || "",
          descripcion: p.descripcion || "",
          categoria: p.categoria || "",
          precioVenta: p.precio_venta?.toString() || "",
          precioCompra: p.precio_compra?.toString() || "",
          stockMinimo: p.stock_minimo?.toString() || "",
          codigoBarras: p.codigo_barras || "",
          impuesto: p.impuesto?.toString() || String(Math.round(country.impuestoRate * 10000) / 100),
          afectacionIgv: String(p.afectacion_igv || "10"),
        });
      }
    } catch (error) {
      console.error("Error cargando producto:", error);
      alert("Error al cargar el producto");
    } finally {
      setLoading(false);
    }
  }, [country.impuestoRate, get, productoId]);

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
      const payload = {
        codigo: formData.codigo.trim(),
        nombre: formData.nombre.trim(),
        // En edición, la cadena vacía es intencional: el writer la convierte
        // en NULL y permite quitar una marca anterior.
        marca: formData.marca.trim(),
        descripcion: formData.descripcion.trim() || undefined,
        categoria: formData.categoria,
        precio_venta: Number(formData.precioVenta),
        precio_compra: formData.precioCompra === "" ? 0 : Number(formData.precioCompra),
        stock_minimo: formData.stockMinimo === "" ? 0 : Number(formData.stockMinimo),
        codigo_barras: formData.codigoBarras.trim() || undefined,
        impuesto: formData.impuesto === "" ? 0 : Number(formData.impuesto),
        afectacion_igv: formData.afectacionIgv,
      };
      const fingerprint = JSON.stringify(payload);
      if (intentRef.current?.fingerprint !== fingerprint) {
        intentRef.current = {
          fingerprint,
          key: `inventory-product-update:${productoId}:${crypto.randomUUID()}`,
        };
      }
      const response = await put(
        `/inventario/productos/${params.id}`,
        { ...payload, idempotency_key: intentRef.current.key },
      );

      if (response?.success) {
        if (productImage) {
          const imageFingerprint = [
            productImage.name,
            productImage.type,
            productImage.size,
            productImage.lastModified,
          ].join(":");
          if (imageIntentRef.current?.fingerprint !== imageFingerprint) {
            imageIntentRef.current = {
              fingerprint: imageFingerprint,
              key: `inventory-product-image-upload:${productoId}:${crypto.randomUUID()}`,
            };
          }
          await uploadProductImage(
            apiCall,
            productoId!,
            productImage,
            imageIntentRef.current.key,
          );
        } else if (removeCurrentImage && currentImageUrl) {
          deleteImageIntentRef.current ??=
            `inventory-product-image-delete:${productoId}:${crypto.randomUUID()}`;
          await deleteProductImage(
            apiCall,
            productoId!,
            deleteImageIntentRef.current,
          );
        }
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
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
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

      <form onSubmit={handleSubmit} className={camposClass}>
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-8">
          <h2 className="m-0 text-lg font-bold text-foreground">Información Básica</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="editar-codigo">
                Código <span className="text-[var(--red-500)]">*</span>
              </label>
              <input id="editar-codigo"
                type="text"
                name="codigo"
                value={formData.codigo}
                onChange={handleChange}
                required
                placeholder="Ej: PROD001"
              />
            </div>
            <div>
              <label htmlFor="editar-codigo-barras">Código de Barras</label>
              <input id="editar-codigo-barras"
                type="text"
                name="codigoBarras"
                value={formData.codigoBarras}
                onChange={handleChange}
                placeholder="Ej: 7501234567890"
              />
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="editar-nombre">
              Nombre <span className="text-[var(--red-500)]">*</span>
            </label>
            <input id="editar-nombre"
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              required
              placeholder="Nombre del producto"
            />
          </div>

          <div className="mt-4">
            <label htmlFor="editar-marca">Marca</label>
            <input id="editar-marca"
              type="text"
              name="marca"
              value={formData.marca}
              onChange={handleChange}
              maxLength={120}
              placeholder="Ej: Acme"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Las ventas futuras congelan esta marca al calcular la comisión.
            </p>
          </div>

          <div className="mt-4">
            <label htmlFor="editar-descripcion">Descripción</label>
            <textarea id="editar-descripcion"
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              rows={3}
              placeholder="Descripción detallada del producto"
            />
          </div>

          <div className="mt-4">
            <label htmlFor="editar-categoria">
              Categoría <span className="text-[var(--red-500)]">*</span>
            </label>
            <select id="editar-categoria"
              name="categoria"
              value={formData.categoria}
              onChange={handleChange}
              required
            >
              <option value="">Seleccione una categoría</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.nombre}>
                  {categoria.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-8">
          <ProductImageField
            currentUrl={currentImageUrl}
            file={productImage}
            removeCurrent={removeCurrentImage}
            disabled={isLoading}
            onFileChange={(file) => {
              setProductImage(file);
              setRemoveCurrentImage(false);
              imageIntentRef.current = null;
            }}
            onRemoveCurrent={() => {
              setProductImage(null);
              setRemoveCurrentImage(true);
              imageIntentRef.current = null;
              deleteImageIntentRef.current = null;
            }}
          />
        </div>

        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-8">
          <h2 className="m-0 text-lg font-bold text-foreground">Precios e Impuestos</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="editar-precio-compra">Precio de Compra ({country.moneda || 'PEN'})</label>
              <input id="editar-precio-compra"
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
              <label htmlFor="editar-precio-venta">
                Precio de Venta ({country.moneda || 'PEN'}) <span className="text-[var(--red-500)]">*</span>
              </label>
              <input id="editar-precio-venta"
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
              <label htmlFor="editar-impuesto">{country.paisCodigo === 'PE' ? 'IGV' : 'IVA'} (%)</label>
              <input id="editar-impuesto"
                type="number"
                name="impuesto"
                value={formData.impuesto}
                onChange={handleChange}
                step="0.01"
                min="0"
                max="100"
                placeholder={String(Math.round(country.impuestoRate * 10000) / 100)}
              />
            </div>
            <div>
              {/* Sin este campo no habia forma de corregir la afectacion de un
                  producto ya creado: quedaba gravado para siempre. */}
              <label htmlFor="editar-afectacion">
                Afectación {impuestoNombre}
              </label>
              <select
                id="editar-afectacion"
                name="afectacionIgv"
                value={formData.afectacionIgv}
                onChange={handleChange}
              >
                <option value="10">Gravado (paga {impuestoNombre})</option>
                <option value="20">
                  {etiquetaSinImpuesto(country.paisCodigo)} (sin {impuestoNombre})
                </option>
                <option value="30">
                  {etiquetaNoGravado(country.paisCodigo)} (sin {impuestoNombre})
                </option>
                <option value="40">Exportación</option>
              </select>
            </div>
          </div>
        </div>

        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-8">
          <h2 className="m-0 text-lg font-bold text-foreground">Inventario</h2>
          <div className="bg-[var(--amber-50)] border p-4 mb-4">
            <p className="m-0 text-[0.875rem] text-[var(--amber-700)]">
              ⚠️ El stock actual no se puede modificar desde aquí. Use
              movimientos de inventario para ajustar el stock.{' '}
              <button
                type="button"
                onClick={() => router.push('/dashboard/inventario/operaciones')}
                className="font-semibold underline"
              >
                Abrir ajustes y transferencias
              </button>
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="editar-stock-minimo">Stock Mínimo</label>
              <input id="editar-stock-minimo"
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
