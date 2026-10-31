"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/use-api";
import { ArrowLeft, Package, Save } from "lucide-react";
import { useCountryContext } from "@/hooks/use-country-context";
import {
  etiquetaNoGravado,
  etiquetaSinImpuesto,
} from "@/lib/afectacion-labels";
import { ProductImageField } from "@/components/ProductImageField";
import { uploadProductImage } from "@/lib/product-images";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/use-permission";
import { ProtectedComponent } from "@/components/auth/ProtectedComponent";
import { ProductCreateIntent, ProductCreatePayload, productCreateIntentKey, readProductCreateIntent,
  confirmProductCreated, preserveProductImage, recoveredProductImage, productImageIntentKey,
  confirmCreatedProductImage } from "@/lib/product-create-operation";

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
  const { get, post, apiCall } = useApi({ requireLive: true, throwOnError: true, showErrorToast: false, retries: 0 });
  const { session, loading: authLoading } = useAuth();
  const { hasPermission, loading: permissionLoading } = usePermission('inventario', 'create', 'productos');
  const tenantId = session?.user?.tenant_id || '', actorId = session?.user?.id || '';
  const scopeIdentity = `${tenantId}:${actorId}`;
  const activeScope = useRef(scopeIdentity); activeScope.current = scopeIdentity;
  const epoch = useRef(0), inflight = useRef(false);
  const [intentReady, setIntentReady] = useState('');
  const [pendingIntent, setPendingIntent] = useState<ProductCreateIntent | null>(null);
  const [recoveryError, setRecoveryError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const scopeReady = !authLoading && intentReady === scopeIdentity && !!tenantId && !!actorId;
  const visibleIntent = scopeReady && pendingIntent?.tenantId === tenantId && pendingIntent?.actorId === actorId ? pendingIntent : null;
  const country = useCountryContext();
  // El backend exige almacen_id para poder abrir el stock fisico. El formulario
  // nunca lo pedia, asi que cualquier alta con stock inicial fallaba.
  const [almacenes, setAlmacenes] = useState<
    Array<{ id: string; nombre: string; codigo?: string }>
  >([]);
  const [categoriasConfig, setCategoriasConfig] = useState<CategoriaConfig[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [atributosExtra, setAtributosExtra] = useState<Record<string, string>>({});
  const [productImage, setProductImage] = useState<File | null>(null);
  const [costoCeroConfirmado, setCostoCeroConfirmado] = useState(false);
  const [formData, setFormData] = useState({
    codigo: "",
    nombre: "",
    marca: "",
    unidadMedida: "NIU",
    descripcion: "",
    categoria: "",
    precioVenta: "",
    precioCompra: "",
    stock: "",
    stockMinimo: "",
    codigoBarras: "",
    afectacionIgv: "10",
    almacenId: "",
    esServicio: false,
    controlaStock: true,
  });

  const impuestoNombre = country.paisCodigo === "PE" ? "IGV" : "IVA";
  // La tasa del producto no se elige: la fija la empresa y la afectacion decide
  // si se aplica. Se calcula aqui para exhibirla y para guardarla coherente.
  const tasaEfectiva =
    formData.afectacionIgv === "10"
      ? Math.round(country.impuestoRate * 10000) / 100
      : 0;

  useEffect(() => {
    epoch.current++; inflight.current = false;
    setIntentReady(''); setPendingIntent(null); setRecoveryError(''); setSubmitError(null); setIsLoading(false);
    setErrors({}); setAtributosExtra({}); setProductImage(null); setCostoCeroConfirmado(false);
    setAlmacenes([]); setCategoriasConfig([]); setCatalogError(''); setCatalogLoading(true);
    setFormData({ codigo: '', nombre: '', marca: '', unidadMedida: 'NIU', descripcion: '', categoria: '',
      precioVenta: '', precioCompra: '', stock: '', stockMinimo: '', codigoBarras: '', afectacionIgv: '10',
      almacenId: '', esServicio: false, controlaStock: true });
    if (authLoading || !tenantId || !actorId) return;
    try {
      const scope = { tenantId, actorId };
      setPendingIntent(readProductCreateIntent(localStorage.getItem(productCreateIntentKey(scope)), scope));
      setIntentReady(scopeIdentity);
    } catch {
      setIntentReady(scopeIdentity);
      setRecoveryError('No se pudo recuperar el producto pendiente. Sus datos se conservan para revisar el resultado.');
    }
    return () => { epoch.current++ };
  }, [tenantId, actorId, scopeIdentity, authLoading]);

  useEffect(() => {
    if (!scopeReady || pendingIntent || recoveryError) return;
    let vigente = true;
    const requestedScope = scopeIdentity;
    (async () => {
      try {
        setCatalogLoading(true); setCatalogError(''); setAlmacenes([]); setCategoriasConfig([]);
        const [almResp, catResp] = await Promise.all([
          get("/inventario/almacenes"),
          get("/inventario/categorias"),
        ]);
        if (!vigente || activeScope.current !== requestedScope) return;
        const complete = (r: any) => r?.success === true && !r.offline && !r.cached && !r.queued && !r.pending
          && Array.isArray(r.data) && r.data.every((row: any) => row && typeof row.id === 'string'
            && /^[0-9a-f-]{36}$/i.test(row.id) && typeof row.nombre === 'string' && !!row.nombre.trim()
            && row.tenant_id === tenantId && row.activo === true);
        if (!complete(almResp) || !complete(catResp)) throw new Error('Los catálogos no están confirmados. Reintenta su carga con conexión.');
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
        if (vigente && activeScope.current === requestedScope) {
          setAlmacenes([]);
          setCategoriasConfig([]);
          setCatalogError('No se pudieron confirmar los almacenes y categorías. Reintenta su carga con conexión.');
        }
      } finally {
        if (vigente && activeScope.current === requestedScope) setCatalogLoading(false);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [get, tenantId, scopeIdentity, scopeReady, pendingIntent, recoveryError, catalogRetry]);

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    const precioVenta = Number(formData.precioVenta);
    const precioCompra =
      formData.precioCompra === "" ? 0 : Number(formData.precioCompra);
    const stock = formData.stock === "" ? 0 : Number(formData.stock);
    const stockMinimo =
      formData.stockMinimo === "" ? 0 : Number(formData.stockMinimo);

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
    if ((formData.esServicio || !formData.controlaStock) && stock > 0) {
      nextErrors.stock = "Los servicios y productos sin control de stock requieren stock inicial cero";
    }
    if (Number.isNaN(stockMinimo) || stockMinimo < 0) {
      nextErrors.stockMinimo = "El stock mínimo no puede ser negativo";
    }
    if (stock > 0 && !formData.almacenId) {
      nextErrors.almacenId =
        "Elige el almacén donde entra el stock inicial";
    }
    if (stock > 0 && precioCompra === 0 && !costoCeroConfirmado) {
      nextErrors.precioCompra = "Confirma el costo cero del stock inicial o registra su costo de adquisición";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (inflight.current || !scopeReady || recoveryError || !hasPermission || permissionLoading || (!pendingIntent && (catalogLoading || catalogError))) return;
    setSubmitError(null);
    if (!pendingIntent && !validateForm()) {
      return;
    }
    inflight.current = true;
    const submittedScope = activeScope.current, submittedEpoch = ++epoch.current;
    const current = () => activeScope.current === submittedScope && epoch.current === submittedEpoch;
    setIsLoading(true);
    try {
      const payload = {
        codigo: formData.codigo.trim(),
        nombre: formData.nombre.trim(),
        marca: formData.marca.trim() || undefined,
        unidad_medida: formData.unidadMedida,
        descripcion: formData.descripcion.trim() || undefined,
        categoria: formData.categoria,
        precio_venta: Number(formData.precioVenta),
        precio_compra: formData.precioCompra === "" ? 0 : Number(formData.precioCompra),
        ...(Number(formData.stock) > 0 && Number(formData.precioCompra) === 0
          ? { costo_cero_confirmado: costoCeroConfirmado } : {}),
        stock_inicial: formData.stock === "" ? 0 : Number(formData.stock),
        stock_minimo: formData.stockMinimo === "" ? 0 : Number(formData.stockMinimo),
        stock_reservado: 0,
        almacen_id: formData.esServicio || !formData.controlaStock ? null : formData.almacenId || null,
        es_servicio: formData.esServicio,
        controla_stock: !formData.esServicio && formData.controlaStock,
        codigo_barras: formData.codigoBarras.trim() || undefined,
        impuesto: tasaEfectiva,
        afectacion_igv: formData.afectacionIgv,
        atributos_extra: Object.keys(atributosExtra).length > 0 ? atributosExtra : undefined,
      };
      const scope = { tenantId, actorId }, key = productCreateIntentKey(scope);
      const previous = localStorage.getItem(key), stored = readProductCreateIntent(previous, scope);
      const candidate: ProductCreateIntent = pendingIntent || { version: 1, ...scope, createdAt: new Date().toISOString(), stage: 'CREATE',
        payload: JSON.parse(JSON.stringify({ ...payload, idempotency_key: `inventory-product-create:${crypto.randomUUID()}` })) as ProductCreatePayload,
        ...(productImage ? { image: await preserveProductImage(productImage) } : {}) };
      if (!current()) return;
      let serialized = JSON.stringify(candidate), intent = readProductCreateIntent(serialized, scope);
      if (!intent || stored && JSON.stringify(stored) !== serialized) throw new Error('Hay otro producto pendiente. Sus datos se conservan.');
      const file = intent.image ? await recoveredProductImage(intent) : null;
      if (!current()) return;
      const persist = (value: ProductCreateIntent, expected: string | null) => {
        if (localStorage.getItem(key) !== expected) throw new Error('El producto pendiente cambió. Sus datos se conservan.');
        // Intención durable: datos de negocio e ids de empresa y usuario, sin token ni contraseña.
        // codeql[js/clear-text-storage-of-sensitive-data]
        const raw = JSON.stringify(value); localStorage.setItem(key, raw);
        if (localStorage.getItem(key) !== raw) throw new Error('No se pudo conservar el producto antes del envío.');
        setPendingIntent(value); return raw;
      };
      serialized = persist(intent, previous);
      if (intent.stage === 'CREATE') {
        const response = await post('/inventario/productos', intent.payload);
        if (!current()) return;
        const created = confirmProductCreated(response, scope, intent);
        if (intent.image) {
          intent = { ...intent, stage: 'IMAGE', created: { id: created.id, operationId: created.operation_id, fingerprint: created.creation_fingerprint } };
          serialized = persist(intent, serialized);
        }
      }
      if (intent.stage === 'IMAGE') {
        const response = await uploadProductImage(apiCall, intent.created!.id, file!, productImageIntentKey(intent));
        if (!current()) return;
        confirmCreatedProductImage(response, scope, intent);
      }
      if (localStorage.getItem(key) !== serialized) throw new Error('El producto pendiente cambió. Sus datos se conservan.');
      localStorage.removeItem(key);
      if (localStorage.getItem(key) !== null) throw new Error('No se pudo retirar el producto confirmado. Reintenta para confirmar su resultado.');
      setPendingIntent(null); alert('✅ Producto creado exitosamente'); router.push('/dashboard/inventario/productos');
    } catch (error: any) {
      if (current()) setSubmitError(error.message || 'No se pudo confirmar el producto; sus datos se conservan.');
    } finally {
      if (current()) { setIsLoading(false); inflight.current = false; }
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name } = e.target;
    const value = e.target instanceof HTMLInputElement && e.target.type === 'checkbox'
      ? e.target.checked : e.target.value;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      if ((name === 'esServicio' && value === true) || (name === 'unidadMedida' && value === 'ZZ')) {
        next.esServicio = true;
        next.controlaStock = false;
      }
      return next;
    });
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

  const back = <button onClick={() => router.push('/dashboard/inventario/productos')}>Volver a Productos</button>;
  if (scopeReady && recoveryError) return <div data-testid="product-create-recovery-error" role="alert" className="space-y-4 p-6">{recoveryError}{back}</div>;
  if (!scopeReady) return <p role="status" className="p-6">Confirmando sesión y producto pendiente...</p>;
  if (visibleIntent) return <div data-testid="product-create-pending" className="space-y-4 p-6">
    <h1>Producto pendiente de confirmación</h1><p>{visibleIntent.payload.codigo} — {visibleIntent.payload.nombre}</p>
    <p>{visibleIntent.payload.es_servicio ? 'Servicio' : 'Producto físico'} · {visibleIntent.payload.controla_stock ? 'Con control de stock' : 'Sin control de stock'} · Stock inicial: {visibleIntent.payload.stock_inicial}</p>
    <p>{visibleIntent.stage === 'IMAGE' ? 'El alta está confirmada; falta confirmar la imagen.' : 'Reintenta para confirmar el alta con los datos conservados.'}</p>
    {visibleIntent.image && <p>Imagen conservada: {visibleIntent.image.name} ({visibleIntent.image.size} bytes)</p>}
    {submitError && <p role="alert">{submitError}</p>}
    <ProtectedComponent modulo="inventario" accion="create" recurso="productos"><button onClick={handleSubmit} disabled={isLoading} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{isLoading ? 'Procesando...' : 'Reintentar producto pendiente'}</button></ProtectedComponent>{back}
  </div>;
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

      <ProtectedComponent modulo="inventario" accion="create" recurso="productos" fallback={<p>No tienes permiso para crear productos.</p>}>
      <form onSubmit={handleSubmit} noValidate className={camposClass}>
        {catalogError && <div role="alert">{catalogError}<button type="button" onClick={() => setCatalogRetry(v => v + 1)}>Reintentar catálogos</button></div>}
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
            <label htmlFor="nuevo-marca">Marca</label>
            <input id="nuevo-marca"
              type="text"
              name="marca"
              value={formData.marca}
              onChange={handleChange}
              maxLength={120}
              placeholder="Ej: Acme"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Se usa en listas de precios y comisiones comerciales por marca.
            </p>
          </div>

          <div className="mt-4">
            <label htmlFor="nuevo-unidad-medida">Unidad de medida</label>
            <select
              id="nuevo-unidad-medida"
              name="unidadMedida"
              value={formData.unidadMedida}
              onChange={handleChange}
            >
              <option value="NIU">Unidad (NIU)</option>
              <option value="KGM">Kilogramo (KGM)</option>
              <option value="LTR">Litro (LTR)</option>
              <option value="MTR">Metro (MTR)</option>
              <option value="ZZ">Servicio (ZZ)</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              No podrá cambiarse después de registrar movimientos de kardex.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <label htmlFor="nuevo-es-servicio" className="flex items-center gap-2">
              <input id="nuevo-es-servicio" name="esServicio" type="checkbox" checked={formData.esServicio} onChange={handleChange} />
              Es un servicio
            </label>
            <label htmlFor="nuevo-controla-stock" className="flex items-center gap-2">
              <input id="nuevo-controla-stock" name="controlaStock" type="checkbox" checked={formData.controlaStock} disabled={formData.esServicio} onChange={handleChange} />
              Controlar stock
            </label>
            <p className="text-xs text-muted-foreground">Los servicios y productos sin control de stock no generan movimientos de inventario y requieren stock inicial cero.</p>
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
              disabled={catalogLoading}
              aria-invalid={Boolean(errors.categoria)}
              aria-describedby={
                errors.categoria ? "producto-categoria-error" : undefined
              }
            >
              <option value="">
                {catalogLoading
                  ? 'Cargando categorías...'
                  : categoriasConfig.length === 0
                    ? 'No hay categorías configuradas'
                    : 'Seleccione una categoría'}
              </option>
              {categoriasConfig.map((cat) => (
                <option key={cat.id} value={cat.nombre}>
                  {cat.nombre}
                </option>
              ))}
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

        <div className="mb-8">
          <ProductImageField
            file={productImage}
            disabled={isLoading || catalogLoading || !!catalogError}
            onFileChange={(file) => {
              setProductImage(file);
              if (submitError) setSubmitError(null);
            }}
          />
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
                onChange={(event) => { setCostoCeroConfirmado(false); handleChange(event); }}
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
              {Number(formData.stock) > 0 && Number(formData.precioCompra) === 0 && (
                <label htmlFor="nuevo-costo-cero-confirmado" className="mt-3 flex items-start gap-2">
                  <input id="nuevo-costo-cero-confirmado" type="checkbox"
                    checked={costoCeroConfirmado}
                    onChange={(event) => setCostoCeroConfirmado(event.target.checked)} />
                  Confirmo que el stock inicial tiene costo cero
                </label>
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
              {/* Era un campo editable que no lo leia nadie: la venta, el ticket y
                  el precio exhibido toman siempre la tasa del tenant
                  (`empresas.igv_porcentaje`, la del asistente inicial) y deciden
                  si se cobra por la afectacion. Escribir 0 aqui no eximia al
                  producto de nada, asi que se muestra el resultado en vez de
                  ofrecer una palanca que no mueve nada. */}
              <label htmlFor="nuevo-impuesto">{impuestoNombre} que se cobrara</label>
              <output
                id="nuevo-impuesto"
                className="block w-[100%] rounded-md border border-border bg-muted/40 p-2 text-sm text-muted-foreground"
              >
                {tasaEfectiva === 0
                  ? `No se cobra ${impuestoNombre}`
                  : `${tasaEfectiva}% sobre el precio de venta`}
              </output>
              <p className="mt-1 text-xs text-muted-foreground">
                Sale de la afectación y de la tasa configurada para la empresa.
              </p>
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
                disabled={catalogLoading}
                aria-invalid={Boolean(errors.almacenId)}
                aria-describedby={
                  errors.almacenId ? "producto-almacen-error" : undefined
                }
              >
                <option value="">
                  {catalogLoading ? 'Cargando almacenes...' : 'Sin stock inicial'}
                </option>
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
                step="0.000001"
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
                step="0.000001"
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
            disabled={isLoading || catalogLoading || !!catalogError}
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
      </ProtectedComponent>
    </div>
  );
}
