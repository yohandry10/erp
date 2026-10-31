"use client";

import { requestConfirmation } from '@/lib/confirm-action'
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
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/use-permission";
import { ProtectedComponent } from "@/components/auth/ProtectedComponent";
import { preserveProductImage, recoveredProductImage } from "@/lib/product-create-operation";
import { ProductUpdateIntent, ProductSnapshot, productUpdateIntentKey, readProductUpdateIntent,
  confirmProductUpdateSource, confirmProductUpdated, confirmUpdatedProductImage } from "@/lib/product-update-operation";

// Ni las etiquetas ni los campos tenian estilo propio: el navegador los pintaba
// en linea y el texto de cada label quedaba pegado a su input.
const camposClass =
  '[&_label]:mb-1.5 [&_label]:block [&_label]:text-sm [&_label]:font-medium [&_label]:text-foreground/85 [&_input:not([type=checkbox])]:w-full [&_select]:w-full [&_textarea]:w-full [&_input:not([type=checkbox])]:rounded-lg [&_select]:rounded-lg [&_textarea]:rounded-lg [&_input:not([type=checkbox])]:px-3 [&_select]:px-3 [&_textarea]:px-3 [&_input:not([type=checkbox])]:py-2.5 [&_select]:py-2.5 [&_textarea]:py-2.5 [&_input]:text-sm [&_select]:text-sm [&_textarea]:text-sm [&_input:focus-visible]:border-primary [&_select:focus-visible]:border-primary [&_textarea:focus-visible]:border-primary [&_input:focus-visible]:outline-none [&_select:focus-visible]:outline-none [&_textarea:focus-visible]:outline-none';

export default function EditarProductoPage() {
  const router = useRouter();
  const params = useParams();
  const { get, put, apiCall } = useApi({ requireLive: true, throwOnError: true, showErrorToast: false, retries: 0 });
  const country = useCountryContext();
  const productoId = params.id as string | undefined;
  const { session, loading: authLoading } = useAuth();
  const { hasPermission, loading: permissionLoading } = usePermission('inventario','update','productos');
  const tenantId=session?.user?.tenant_id||'', actorId=session?.user?.id||'';
  const scopeIdentity=`${tenantId}:${actorId}:${productoId||''}`;
  const activeScope=useRef(scopeIdentity);activeScope.current=scopeIdentity;
  const epoch=useRef(0),inflight=useRef(false);
  const [intentReady,setIntentReady]=useState('');
  const [pendingIntent,setPendingIntent]=useState<ProductUpdateIntent|null>(null);
  const [original,setOriginal]=useState<ProductSnapshot|null>(null);
  const [recoveryError,setRecoveryError]=useState('');
  const [sourceError,setSourceError]=useState('');
  const [operationError,setOperationError]=useState('');
  const scopeReady=!authLoading&&intentReady===scopeIdentity&&!!tenantId&&!!actorId&&!!productoId;
  const visibleIntent=scopeReady&&pendingIntent?.tenantId===tenantId&&pendingIntent?.actorId===actorId&&pendingIntent?.productId===productoId?pendingIntent:null;
  const [isLoading, setIsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [categorias, setCategorias] = useState<Array<{ id: string; nombre: string }>>([]);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [removeCurrentImage, setRemoveCurrentImage] = useState(false);
  const [originalUnit, setOriginalUnit] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    codigo: "",
    nombre: "",
    marca: "",
    unidadMedida: "",
    descripcion: "",
    categoria: "",
    precioVenta: "",
    precioCompra: "",
    stockMinimo: "",
    codigoBarras: "",
    afectacionIgv: "10",
    esServicio: false,
    controlaStock: true,
  });

  const impuestoNombre = country.paisCodigo === "PE" ? "IGV" : "IVA";
  // Derivada, no elegida: la tasa la fija la empresa y la afectacion decide si
  // se aplica.
  const tasaEfectiva =
    formData.afectacionIgv === "10"
      ? Math.round(country.impuestoRate * 10000) / 100
      : 0;

  useEffect(()=>{
    epoch.current++;inflight.current=false;setIntentReady('');setPendingIntent(null);setOriginal(null);
    setIsLoading(false);setLoading(true);setRecoveryError('');setSourceError('');setOperationError('');setCategorias([]);
    setCurrentImageUrl(null);setOriginalUnit(null);setProductImage(null);setRemoveCurrentImage(false);
    setFormData({codigo:'',nombre:'',marca:'',unidadMedida:'',descripcion:'',categoria:'',precioVenta:'',precioCompra:'',stockMinimo:'',codigoBarras:'',afectacionIgv:'10',esServicio:false,controlaStock:true});
    if(authLoading||!tenantId||!actorId||!productoId)return;
    try{const scope={tenantId,actorId,productId:productoId};setPendingIntent(readProductUpdateIntent(localStorage.getItem(productUpdateIntentKey(scope)),scope));setIntentReady(scopeIdentity)}
    catch{setIntentReady(scopeIdentity);setRecoveryError('No se pudo recuperar el cambio pendiente. Sus datos se conservan para revisar el resultado.')}
    return()=>{epoch.current++};
  },[tenantId,actorId,productoId,scopeIdentity,authLoading]);

  const loadProducto = useCallback(async () => {
    if (!scopeReady || !productoId || pendingIntent || recoveryError) return;
    const requestedScope=activeScope.current,requestedEpoch=++epoch.current;
    const current=()=>activeScope.current===requestedScope&&epoch.current===requestedEpoch;
    setLoading(true);
    setSourceError('');setOriginal(null);setCategorias([]);
    try {
      const [response, categoriasResponse] = await Promise.all([
        get(`/inventario/productos/${productoId}`),
        get("/inventario/categorias"),
      ]);
      if(!current())return;
      const p=confirmProductUpdateSource(response,{tenantId,actorId,productId:productoId});
      if(categoriasResponse?.success!==true||categoriasResponse.offline||categoriasResponse.cached||categoriasResponse.queued||categoriasResponse.pending||!Array.isArray(categoriasResponse.data)||!categoriasResponse.data.every((c:any)=>c&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.id||'')&&c.tenant_id===tenantId&&typeof c.nombre==='string'&&!!c.nombre.trim()&&c.activo===true))throw new Error('Catálogos no confirmados');
      if (categoriasResponse?.success && Array.isArray(categoriasResponse.data)) {
        setCategorias(
          categoriasResponse.data.map((categoria: any) => ({
            id: String(categoria.id),
            nombre: String(categoria.nombre ?? ""),
          })),
        );
      }
      if (response?.success && response.data) {
        setOriginal(p);
        const loadedUnit = typeof p.unidad_medida === "string" && p.unidad_medida.trim()
          ? p.unidad_medida.trim().toUpperCase()
          : "";
        setCurrentImageUrl(p.imagen_url || null);
        setOriginalUnit(loadedUnit || null);
        setFormData({
          codigo: p.codigo || "",
          nombre: p.nombre || "",
          marca: p.marca || "",
          unidadMedida: loadedUnit,
          descripcion: p.descripcion || "",
          categoria: p.categoria || "",
          precioVenta: p.precio_venta?.toString() || "",
          precioCompra: p.precio_compra?.toString() || "",
          stockMinimo: p.stock_minimo?.toString() || "",
          codigoBarras: p.codigo_barras || "",
          afectacionIgv: String(p.afectacion_igv || "10"),
          esServicio: p.es_servicio === true,
          controlaStock: p.es_servicio !== true && p.controla_stock !== false,
        });
      }
    } catch (error) {
      if(current()){setOriginal(null);setCategorias([]);setSourceError('No se pudo confirmar el producto y sus categorías. Reintenta la carga con conexión.')}
    } finally {
      if(current())setLoading(false);
    }
  }, [get, productoId, tenantId, actorId, scopeReady, pendingIntent, recoveryError]);

  useEffect(() => {
    loadProducto();
  }, [loadProducto]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(inflight.current||!scopeReady||!productoId||recoveryError||!hasPermission||permissionLoading||(!pendingIntent&&(!original||sourceError||loading)))return;
    setOperationError('');

    if (!pendingIntent && (!formData.codigo.trim() || !formData.nombre.trim() || !formData.categoria)) {
      setOperationError('Por favor complete los campos obligatorios');
      return;
    }

    if (!pendingIntent && !originalUnit && formData.unidadMedida) {
      const confirmed = (await requestConfirmation(`Este producto histórico no tiene unidad registrada. Asignar ${formData.unidadMedida} regularizará su Kardex de forma auditable y la unidad ya no podrá cambiar cuando existan movimientos. ¿Desea continuar?`));
      if (!confirmed) return;
    }

    inflight.current=true;const submittedScope=activeScope.current,submittedEpoch=++epoch.current;
    const current=()=>activeScope.current===submittedScope&&epoch.current===submittedEpoch;
    setIsLoading(true);
    try {
      const payload = {
        codigo: formData.codigo.trim(),
        nombre: formData.nombre.trim(),
        // En edición, la cadena vacía es intencional: el writer la convierte
        // en NULL y permite quitar una marca anterior.
        marca: formData.marca.trim(),
        ...(formData.unidadMedida
          ? { unidad_medida: formData.unidadMedida }
          : {}),
        descripcion: formData.descripcion.trim() || undefined,
        categoria: formData.categoria,
        precio_venta: Number(formData.precioVenta),
        precio_compra: formData.precioCompra === "" ? 0 : Number(formData.precioCompra),
        stock_minimo: formData.stockMinimo === "" ? 0 : Number(formData.stockMinimo),
        codigo_barras: formData.codigoBarras.trim() || undefined,
        impuesto: tasaEfectiva,
        afectacion_igv: formData.afectacionIgv,
        es_servicio: formData.esServicio,
        controla_stock: !formData.esServicio && formData.controlaStock,
      };
      const scope={tenantId,actorId,productId:productoId},key=productUpdateIntentKey(scope);
      const previous=localStorage.getItem(key),stored=readProductUpdateIntent(previous,scope);
      const candidate:ProductUpdateIntent=pendingIntent||{...scope,version:1,createdAt:new Date().toISOString(),stage:'UPDATE',
        payload:JSON.parse(JSON.stringify({...payload,idempotency_key:`inventory-product-update:${productoId}:${crypto.randomUUID()}`})),
        original:original!,removeImage:removeCurrentImage&&!!currentImageUrl,imageKey:`inventory-product-image-${productImage?'upload':'delete'}:${productoId}:${crypto.randomUUID()}`,
        ...(productImage?{image:await preserveProductImage(productImage)}:{})};
      if(!current())return;
      let serialized=JSON.stringify(candidate),intent=readProductUpdateIntent(serialized,scope);
      if(!intent||stored&&JSON.stringify(stored)!==serialized)throw new Error('Hay otro cambio pendiente del producto. Sus datos se conservan.');
      const file=intent.image?await recoveredProductImage(intent):null;if(!current())return;
      const persist=(value:ProductUpdateIntent,expected:string|null)=>{
        if(localStorage.getItem(key)!==expected)throw new Error('El cambio pendiente del producto cambió. Sus datos se conservan.');
        // Intención durable: datos de negocio e ids de empresa y usuario, sin token ni contraseña.
        // codeql[js/clear-text-storage-of-sensitive-data]
        const raw=JSON.stringify(value);localStorage.setItem(key,raw);
        if(localStorage.getItem(key)!==raw)throw new Error('No se pudo conservar el cambio antes del envío.');
        setPendingIntent(value);return raw;
      };
      serialized=persist(intent,previous);
      if(intent.stage==='UPDATE'){
        const response=await put(`/inventario/productos/${productoId}`,intent.payload);if(!current())return;
        const next=confirmProductUpdated(response,scope,intent);
        if(next.stage!=='UPDATE'){serialized=persist(next,serialized);intent=next}
      }
      if(intent.stage!=='UPDATE'){
        const response=intent.stage==='IMAGE_UPLOAD'?await uploadProductImage(apiCall,productoId,file!,intent.imageKey):await deleteProductImage(apiCall,productoId,intent.imageKey);
        if(!current())return;confirmUpdatedProductImage(response,scope,intent);
      }
      if(localStorage.getItem(key)!==serialized)throw new Error('El cambio pendiente del producto cambió. Sus datos se conservan.');
      localStorage.removeItem(key);if(localStorage.getItem(key)!==null)throw new Error('No se pudo retirar el cambio confirmado. Reintenta para confirmar su resultado.');
      setPendingIntent(null);alert('✅ Producto actualizado exitosamente');router.push('/dashboard/inventario/productos');
    } catch (error: any) {
      if(current())setOperationError(error.message||'No se pudo confirmar el cambio; sus datos se conservan.');
    } finally {
      if(current()){setIsLoading(false);inflight.current=false}
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
  };

  const back=<button onClick={()=>router.push('/dashboard/inventario/productos')}>Volver a Productos</button>;
  if(scopeReady&&recoveryError)return <div data-testid="product-update-recovery-error" role="alert" className="space-y-4 p-6">{recoveryError}{back}</div>;
  if(visibleIntent)return <div data-testid="product-update-pending" className="space-y-4 p-6">
    <h1>Cambio de producto pendiente de confirmación</h1><p>{visibleIntent.payload.codigo} — {visibleIntent.payload.nombre}</p><p>Marca: {visibleIntent.payload.marca||'Sin marca'}</p>
    <p>{visibleIntent.stage==='UPDATE'?'Reintenta para confirmar el cambio con los datos conservados.':visibleIntent.stage==='IMAGE_UPLOAD'?'El cambio está confirmado; falta confirmar la nueva imagen.':'El cambio está confirmado; falta confirmar la retirada de la imagen.'}</p>
    {visibleIntent.image&&<p>Imagen conservada: {visibleIntent.image.name} ({visibleIntent.image.size} bytes)</p>}{operationError&&<p role="alert">{operationError}</p>}
    <ProtectedComponent modulo="inventario" accion="update" recurso="productos"><button onClick={handleSubmit} disabled={isLoading} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{isLoading?'Procesando...':'Reintentar cambio pendiente'}</button></ProtectedComponent>{back}
  </div>;
  if(scopeReady&&sourceError)return <div data-testid="product-update-source-error" role="alert" className="space-y-4 p-6">{sourceError}<button onClick={loadProducto}>Reintentar producto y categorías</button>{back}</div>;
  if (!scopeReady || loading) {
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

      <ProtectedComponent modulo="inventario" accion="update" recurso="productos" fallback={<p>No tienes permiso para editar productos.</p>}>
      <form onSubmit={handleSubmit} noValidate className={camposClass}>
        {operationError&&<p role="alert">{operationError}</p>}
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
            <label htmlFor="editar-unidad-medida">Unidad de medida</label>
            <select
              id="editar-unidad-medida"
              name="unidadMedida"
              value={formData.unidadMedida}
              onChange={handleChange}
            >
              {!originalUnit && (
                <option value="">Sin regularizar (producto histórico)</option>
              )}
              <option value="NIU">Unidad (NIU)</option>
              <option value="KGM">Kilogramo (KGM)</option>
              <option value="LTR">Litro (LTR)</option>
              <option value="MTR">Metro (MTR)</option>
              <option value="ZZ">Servicio (ZZ)</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {originalUnit
                ? "Si el producto ya tiene Kardex, el sistema preservará su unidad histórica."
                : "Sin regularizar no se presume NIU. Elegir una unidad requiere confirmación y reclasifica explícitamente su Kardex histórico."}
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <label htmlFor="editar-es-servicio" className="flex items-center gap-2">
              <input id="editar-es-servicio" name="esServicio" type="checkbox" checked={formData.esServicio} onChange={handleChange} />
              Es un servicio
            </label>
            <label htmlFor="editar-controla-stock" className="flex items-center gap-2">
              <input id="editar-controla-stock" name="controlaStock" type="checkbox" checked={formData.controlaStock} disabled={formData.esServicio} onChange={handleChange} />
              Controlar stock
            </label>
            <p className="text-xs text-muted-foreground">Los servicios no controlan stock. El sistema rechaza desactivar su control si el producto conserva existencias o reservas.</p>
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
            }}
            onRemoveCurrent={() => {
              setProductImage(null);
              setRemoveCurrentImage(true);
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
              {/* No lo leia nadie: la venta y el ticket toman la tasa del tenant
                  y la afectacion decide si se cobra. Poner 0 aqui no eximia al
                  producto, asi que se muestra el resultado en vez de una palanca
                  que no mueve nada. */}
              <label htmlFor="editar-impuesto">{impuestoNombre} que se cobrara</label>
              <output
                id="editar-impuesto"
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
                step="0.000001"
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
      </ProtectedComponent>
    </div>
  );
}
