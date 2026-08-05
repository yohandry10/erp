"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/use-api";
import { ArrowLeft, Package, Save } from "lucide-react";
import { useCountryContext } from "@/hooks/use-country-context";
import {
  etiquetaNoGravado,
  etiquetaSinImpuesto,
} from "@/lib/afectacion-labels";

type CampoExtra = {
  key: string;
  label: string;
  tipo: 'text' | 'number' | 'date' | 'select';
  requerido: boolean;
  opciones?: string[];
};

type CategoriaConfig = {
  id: string;
  nombre: string;
  codigo: string | null;
  campos_extra: CampoExtra[];
};

// Ni las etiquetas ni los campos tenian estilo propio: el navegador los pintaba
// en linea y el texto de cada label quedaba pegado a su input.
const camposClass =
  '[&_label]:mb-1.5 [&_label]:block [&_label]:text-sm [&_label]:font-medium [&_label]:text-foreground/85 [&_input:not([type=checkbox])]:w-full [&_select]:w-full [&_textarea]:w-full [&_input:not([type=checkbox])]:rounded-lg [&_select]:rounded-lg [&_textarea]:rounded-lg [&_input:not([type=checkbox])]:px-3 [&_select]:px-3 [&_textarea]:px-3 [&_input:not([type=checkbox])]:py-2.5 [&_select]:py-2.5 [&_textarea]:py-2.5 [&_input]:text-sm [&_select]:text-sm [&_textarea]:text-sm [&_input:focus-visible]:border-primary [&_select:focus-visible]:border-primary [&_textarea:focus-visible]:border-primary [&_input:focus-visible]:outline-none [&_select:focus-visible]:outline-none [&_textarea:focus-visible]:outline-none';

export default function NuevoProductoPage() {
  const router = useRouter();
  const { get, post } = useApi();
  const country = useCountryContext();
  // El backend exige almacen_id para poder abrir el stock fisico. El formulario
  // nunca lo pedia, asi que cualquier alta con stock inicial fallaba.
  const [almacenes, setAlmacenes] = useState<
    Array<{ id: string; nombre: string; codigo?: string }>
  >([]);
  const [categoriasConfig, setCategoriasConfig] = useState<CategoriaConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [atributosExtra, setAtributosExtra] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    codigo: "",
    nombre: "",
    descripcion: "",
    categoria: "",
    precioVenta: "",
    precioCompra: "",
    stock: "",
    stockMinimo: "",
    codigoBarras: "",
    impuesto: "18",
    afectacionIgv: "10",
    almacenId: "",
  });

  const impuestoNombre = country.paisCodigo === "PE" ? "IGV" : "IVA";

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const [almResp, catResp] = await Promise.all([
          get("/inventario/almacenes"),
          get("/inventario/categorias"),
        ]);
        if (!vigente) return;
        if (almResp?.success && Array.isArray(almResp.data)) {
          setAlmacenes(almResp.data);
          if (almResp.data.length > 0) {
            setFormData((prev) =>
              prev.almacenId ? prev : { ...prev, almacenId: almResp.data[0].id },
            );
          }
        }
        if (catResp?.success && Array.isArray(catResp.data)) {
          setCategoriasConfig(
            catResp.data.map((c: any) => ({
              id: c.id,
              nombre: c.nombre ?? '',
              codigo: c.codigo ?? null,
              campos_extra: Array.isArray(c.campos_extra) ? c.campos_extra : [],
            })),
          );
        }
      } catch {
        if (vigente) {
          setAlmacenes([]);
          setCategoriasConfig([]);
        }
      }
    })();
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (country.loading) return;
    setFormData((prev) => ({
      ...prev,
      impuesto: String(Math.round(country.impuestoRate * 10000) / 100),
    }));
  }, [country.loading, country.impuestoRate]);

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    const precioVenta = Number(formData.precioVenta);
    const precioCompra =
      formData.precioCompra === "" ? 0 : Number(formData.precioCompra);
    const stock = formData.stock === "" ? 0 : Number(formData.stock);
    const stockMinimo =
      formData.stockMinimo === "" ? 0 : Number(formData.stockMinimo);
    const impuesto = formData.impuesto === "" ? 0 : Number(formData.impuesto);

    if (!formData.codigo.trim()) nextErrors.codigo = "El código es requerido";
    if (!formData.nombre.trim()) nextErrors.nombre = "El nombre es requerido";
    if (!formData.categoria) nextErrors.categoria = "La categoría es requerida";
    if (
      !formData.precioVenta ||
      Number.isNaN(precioVenta) ||
      precioVenta <= 0
    ) {
      nextErrors.precioVenta = "El precio de venta debe ser mayor a 0";
    }
    if (Number.isNaN(precioCompra) || precioCompra < 0) {
      nextErrors.precioCompra = "El precio de compra no puede ser negativo";
    }
    if (Number.isNaN(stock) || stock < 0) {
      nextErrors.stock = "El stock inicial no puede ser negativo";
    }
    if (Number.isNaN(stockMinimo) || stockMinimo < 0) {
      nextErrors.stockMinimo = "El stock mínimo no puede ser negativo";
    }
    if (Number.isNaN(impuesto) || impuesto < 0 || impuesto > 100) {
      nextErrors.impuesto = "El impuesto debe estar entre 0 y 100";
    }
    if (stock > 0 && !formData.almacenId) {
      nextErrors.almacenId =
        "Elige el almacén donde entra el stock inicial";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSubmitError(null);
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await post("/inventario/productos", {
        ...formData,
        almacen_id: formData.almacenId || null,
        atributos_extra: Object.keys(atributosExtra).length > 0 ? atributosExtra : undefined,
      });

      if (response?.success) {
        alert("✅ Producto creado exitosamente");
        router.push("/dashboard/inventario/productos");
      } else {
        throw new Error(response?.message || "Error al crear producto");
      }
    } catch (error: any) {
      console.error("Error:", error);
      setSubmitError(error.message || "Error al crear producto");
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
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Al cambiar la categoría, limpiar atributos extra
    if (name === 'categoria') {
      setAtributosExtra({});
    }
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    if (submitError) setSubmitError(null);
  };

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
            Nuevo Producto
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Complete la información del nuevo producto
          </p>
        </div>
      </div>

      <div className="text-white py-4 px-6 rounded-xl mb-8 flex items-center gap-4">
        <div className="text-[2rem]">ℹ️</div>
        <div>
          <h3 className="font-semibold mb-1">Información Importante</h3>
          <p className="text-[0.875rem] opacity-[0.95]">
            Los campos marcados con <span className="text-[#fbbf24]">*</span>{" "}
            son obligatorios.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className={camposClass}>
        {(submitError || Object.keys(errors).length > 0) && (
          <div
            role="alert"
            className="bg-[#fef2f2] border text-destructive py-[0.875rem] px-4 rounded-lg mb-4 text-[0.875rem]"
          >
            {submitError ||
              "Revise los campos marcados antes de crear el producto."}
          </div>
        )}
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-8">
          <h2 className="m-0 text-lg font-bold text-foreground">Información Básica</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="nuevo-codigo">
                Código <span className="text-[var(--red-500)]">*</span>
              </label>
              <input id="nuevo-codigo"
                type="text"
                name="codigo"
                value={formData.codigo}
                onChange={handleChange}
                aria-invalid={Boolean(errors.codigo)}
                aria-describedby={
                  errors.codigo ? "producto-codigo-error" : undefined
                }
                placeholder="Ej: PROD001"
              />
              {errors.codigo && (
                <p
                  id="producto-codigo-error"
                  className="text-red-500 text-xs mt-1"
                >
                  {errors.codigo}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="nuevo-codigo-barras">Código de Barras</label>
              <input id="nuevo-codigo-barras"
                type="text"
                name="codigoBarras"
                value={formData.codigoBarras}
                onChange={handleChange}
                placeholder="Ej: 7501234567890"
              />
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="nuevo-nombre">
              Nombre <span className="text-[var(--red-500)]">*</span>
            </label>
            <input id="nuevo-nombre"
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              aria-invalid={Boolean(errors.nombre)}
              aria-describedby={
                errors.nombre ? "producto-nombre-error" : undefined
              }
              placeholder="Nombre del producto"
            />
            {errors.nombre && (
              <p
                id="producto-nombre-error"
                className="text-red-500 text-xs mt-1"
              >
                {errors.nombre}
              </p>
            )}
          </div>

          <div className="mt-4">
            <label htmlFor="nuevo-descripcion">Descripción</label>
            <textarea id="nuevo-descripcion"
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              rows={3}
              placeholder="Descripción detallada del producto"
            />
          </div>

          <div className="mt-4">
            <label htmlFor="nuevo-categoria">
              Categoría <span className="text-[var(--red-500)]">*</span>
            </label>
            <select id="nuevo-categoria"
              name="categoria"
              value={formData.categoria}
              onChange={handleChange}
              aria-invalid={Boolean(errors.categoria)}
              aria-describedby={
                errors.categoria ? "producto-categoria-error" : undefined
              }
            >
              <option value="">Seleccione una categoría</option>
              {categoriasConfig.length > 0
                ? categoriasConfig.map((cat) => (
                    <option key={cat.id} value={cat.nombre}>
                      {cat.nombre}
                    </option>
                  ))
                : (
                  <>
                    <option value="ELECTRONICA">Electrónica</option>
                    <option value="ALIMENTOS">Alimentos</option>
                    <option value="ROPA">Ropa</option>
                    <option value="FARMACIA">Farmacia</option>
                    <option value="HOGAR">Hogar</option>
                    <option value="OFICINA">Oficina</option>
                    <option value="OTROS">Otros</option>
                  </>
                )
              }
            </select>
            {errors.categoria && (
              <p
                id="producto-categoria-error"
                className="text-red-500 text-xs mt-1"
              >
                {errors.categoria}
              </p>
            )}
          </div>
        </div>

        {/* Campos dinámicos según categoría */}
        {(() => {
          const catConfig = categoriasConfig.find(
            (c) => c.nombre === formData.categoria,
          );
          if (!catConfig || catConfig.campos_extra.length === 0) return null;
          return (
            <div className="relative rounded-2xl border border-primary/20 bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-8 mt-4">
              <h2 className="m-0 text-lg font-bold text-foreground">
                Atributos de {catConfig.nombre}
              </h2>
              <p className="text-sm text-muted-foreground mb-3">
                Campos específicos para productos de esta categoría.
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {catConfig.campos_extra.map((campo) => (
                  <div key={campo.key}>
                    <label htmlFor={`attr-${campo.key}`}>
                      {campo.label}
                      {campo.requerido && (
                        <span className="text-[var(--red-500)]"> *</span>
                      )}
                    </label>
                    {campo.tipo === 'select' && campo.opciones ? (
                      <select
                        id={`attr-${campo.key}`}
                        value={atributosExtra[campo.key] ?? ''}
                        onChange={(e) =>
                          setAtributosExtra((prev) => ({
                            ...prev,
                            [campo.key]: e.target.value,
                          }))
                        }
                      >
                        <option value="">Seleccione...</option>
                        {campo.opciones.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`attr-${campo.key}`}
                        type={campo.tipo === 'number' ? 'number' : campo.tipo === 'date' ? 'date' : 'text'}
                        value={atributosExtra[campo.key] ?? ''}
                        onChange={(e) =>
                          setAtributosExtra((prev) => ({
                            ...prev,
                            [campo.key]: e.target.value,
                          }))
                        }
                        placeholder={campo.label}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-8">
          <h2 className="m-0 text-lg font-bold text-foreground">Precios e Impuestos</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="nuevo-precio-compra">Precio de Compra ({country.moneda || 'PEN'})</label>
              <input id="nuevo-precio-compra"
                type="number"
                name="precioCompra"
                value={formData.precioCompra}
                onChange={handleChange}
                step="0.01"
                min="0"
                aria-invalid={Boolean(errors.precioCompra)}
                aria-describedby={
                  errors.precioCompra
                    ? "producto-precio-compra-error"
                    : undefined
                }
                placeholder="0.00"
              />
              {errors.precioCompra && (
                <p
                  id="producto-precio-compra-error"
                  className="text-red-500 text-xs mt-1"
                >
                  {errors.precioCompra}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="nuevo-precio-venta">
                Precio de Venta ({country.moneda || 'PEN'}) <span className="text-[var(--red-500)]">*</span>
              </label>
              <input id="nuevo-precio-venta"
                type="number"
                name="precioVenta"
                value={formData.precioVenta}
                onChange={handleChange}
                step="0.01"
                min="0"
                aria-invalid={Boolean(errors.precioVenta)}
                aria-describedby={
                  errors.precioVenta ? "producto-precio-venta-error" : undefined
                }
                placeholder="0.00"
              />
              {errors.precioVenta && (
                <p
                  id="producto-precio-venta-error"
                  className="text-red-500 text-xs mt-1"
                >
                  {errors.precioVenta}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="nuevo-impuesto">{country.paisCodigo === 'PE' ? 'IGV' : 'IVA'} (%)</label>
              <input id="nuevo-impuesto"
                type="number"
                name="impuesto"
                value={formData.impuesto}
                onChange={handleChange}
                step="0.01"
                min="0"
                max="100"
                aria-invalid={Boolean(errors.impuesto)}
                aria-describedby={
                  errors.impuesto ? "producto-impuesto-error" : undefined
                }
                placeholder={String(Math.round(country.impuestoRate * 10000) / 100)}
              />
              {errors.impuesto && (
                <p
                  id="producto-impuesto-error"
                  className="text-red-500 text-xs mt-1"
                >
                  {errors.impuesto}
                </p>
              )}
            </div>
            <div>
              {/* Sin este campo todo producto nacia gravado y no habia forma de
                  registrar los del Apendice I de la Ley del IGV: al venderlos se
                  cobraba un impuesto que no corresponde. */}
              <label htmlFor="nuevo-afectacion">
                Afectación {impuestoNombre}
              </label>
              <select
                id="nuevo-afectacion"
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
              <p className="mt-1 text-xs text-muted-foreground">
                Decide si el producto paga {impuestoNombre} y en qué casilla se
                declara.
                {country.paisCodigo === "PE" &&
                  " Los alimentos del Apéndice I de la Ley del IGV (papa, arroz, leche fresca) van como exonerados."}
              </p>
            </div>
          </div>
        </div>

        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-8">
          <h2 className="m-0 text-lg font-bold text-foreground">Inventario</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="nuevo-almacen">Almacén</label>
              <select
                id="nuevo-almacen"
                name="almacenId"
                value={formData.almacenId}
                onChange={handleChange}
                aria-invalid={Boolean(errors.almacenId)}
                aria-describedby={
                  errors.almacenId ? "producto-almacen-error" : undefined
                }
              >
                <option value="">Sin stock inicial</option>
                {almacenes.map((almacen) => (
                  <option key={almacen.id} value={almacen.id}>
                    {almacen.codigo ? `${almacen.codigo} · ` : ""}
                    {almacen.nombre}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Dónde entra el stock inicial. El kardex necesita saberlo.
              </p>
              {errors.almacenId && (
                <p
                  id="producto-almacen-error"
                  className="text-red-500 text-xs mt-1"
                >
                  {errors.almacenId}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="nuevo-stock">Stock Inicial</label>
              <input id="nuevo-stock"
                type="number"
                name="stock"
                value={formData.stock}
                onChange={handleChange}
                min="0"
                aria-invalid={Boolean(errors.stock)}
                aria-describedby={
                  errors.stock ? "producto-stock-error" : undefined
                }
                placeholder="0"
              />
              {errors.stock && (
                <p
                  id="producto-stock-error"
                  className="text-red-500 text-xs mt-1"
                >
                  {errors.stock}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="nuevo-stock-minimo">Stock Mínimo</label>
              <input id="nuevo-stock-minimo"
                type="number"
                name="stockMinimo"
                value={formData.stockMinimo}
                onChange={handleChange}
                min="0"
                aria-invalid={Boolean(errors.stockMinimo)}
                aria-describedby={
                  errors.stockMinimo ? "producto-stock-minimo-error" : undefined
                }
                placeholder="0"
              />
              {errors.stockMinimo && (
                <p
                  id="producto-stock-minimo-error"
                  className="text-red-500 text-xs mt-1"
                >
                  {errors.stockMinimo}
                </p>
              )}
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
                Crear Producto
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
