'use client'

import Image from 'next/image'
import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useApi } from '@/hooks/use-api'
import { ConfigStatusBanner } from '@/components/pos/config-status-banner'
import { usePosConfig } from '@/hooks/use-pos-config'
import { ConfigurationStatus } from '@/app/dashboard/hooks/useConfigurationStatus'
import { useAuth } from '@/contexts/AuthContext'
import { ProductGrid, ProductoPOS } from '@/components/pos/ProductGrid'
import { CashTenderPanel } from '@/components/pos/CashTenderPanel'
import {
  PosDocumentPreview,
  PosDocumentData,
  PosDocumentFormat,
  printPosDocument,
} from '@/components/pos/PosDocumentPreview'
import VentaExitosaModal from '@/components/pos/VentaExitosaModal'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'
import { useCountryContext } from '@/hooks/use-country-context'
import {
  AlertTriangle,
  Banknote,
  Barcode,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Eye,
  FileText,
  History,
  Loader2,
  Lock,
  Maximize2,
  Minus,
  Minimize2,
  PackageOpen,
  Percent,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShoppingCart,
  Trash2,
  UserRound,
  WalletCards,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ItemVenta {
  producto: ProductoPOS
  cantidad: number
  precio_unitario: number
  precio_original: number
  descuento_porcentaje: number
  descuento_monto: number
  subtotal: number
}

interface Descuento {
  tipo: 'PORCENTAJE' | 'MONTO_FIJO'
  valor: number
  descripcion: string
}

interface EstadoVenta {
  estado: 'EN_PROGRESO' | 'PENDIENTE_PAGO' | 'PAGADA' | 'CANCELADA' | 'DEVUELTA'
  fecha_estado: string
}

interface MetodoPago {
  id: string
  codigo: string
  nombre: string
  tipo: string
  requiere_referencia: boolean
  comision_porcentaje: number
}

interface Cliente {
  id: string
  tipo_documento: string
  numero_documento?: string | number | null
  documento_numero?: string | number | null
  ruc?: string | null
  codigo?: string | null
  nombres?: string
  apellidos?: string
  razon_social?: string
}

interface EstadoCaja {
  estado: 'ABIERTA' | 'CERRADA'
  montoInicial: number
  ventasEfectivo: number
  ventasTarjeta: number
  montoFinal: number
  cajaId?: string
  sesionId?: string
}

const posShellClass =
  'min-h-screen max-w-full p-3 text-foreground sm:p-4 lg:p-5'

const posHeaderClass =
  'mb-4 rounded-2xl border bg-card px-4 py-4 shadow-sm sm:px-5'

const posPanelClass =
  'rounded-2xl border bg-card text-card-foreground shadow-sm'

const posInputClass =
  'rounded-lg border border-input bg-background text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground'

const posPrimaryButtonClass =
  'rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50'

const getPosDocumentNumber = (sale: any) =>
  String(sale?.numero_ticket || sale?.numero_venta || '').trim()

const getPosDocumentLabel = (sale: any) => {
  const number = getPosDocumentNumber(sale).toUpperCase()
  const type = String(sale?.tipo_comprobante || sale?.tipo_documento || '').trim().toUpperCase()

  if (type === '03' || type.includes('BOLETA') || number.startsWith('B')) return 'Boleta de venta'
  if (type === '01' || type.includes('FACTURA') || number.startsWith('F')) return 'Factura de venta'
  return 'Ticket de venta'
}

const posSecondaryButtonClass =
  'rounded-lg border bg-background px-4 py-3 font-semibold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50'

export default function POSPage() {
  const posEnabled = process.env.NEXT_PUBLIC_FEATURE_POS_ENABLED !== 'false'

  const api = useApi()
  const posSaleApi = useApi({ retries: 1, timeoutMs: 30000 })
  const { user } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const country = useCountryContext()
  const paisCodigo = (country.paisCodigo || 'PE').toUpperCase()
  const isPeru = paisCodigo === 'PE'
  const aplicaLimiteItems = paisCodigo === 'PE' || paisCodigo === 'CO'
  const fiscalAuthority = country.servicioFiscal || 'SUNAT'
  const documentoFiscal = country.documentoFiscal || 'RUC'
  const currencySymbol = country.simboloMoneda || 'S/'
  const taxLabel = country.impuesto || 'IGV (18%)'
  const taxRate = country.impuestoRate ?? 0.18
  const taxName = paisCodigo === 'PE' ? 'IGV' : 'IVA'
  const locale = country.locale || 'es-PE'
  const consumerDocumentLabel =
    paisCodigo === 'AR' ? 'Factura B' : paisCodigo === 'CO' ? 'Factura electrónica' : 'Boleta'
  const businessDocumentLabel =
    paisCodigo === 'AR' ? 'Factura A' : paisCodigo === 'CO' ? 'Factura con NIT' : 'Factura'
  const getClienteDocumento = useCallback((cliente?: Cliente | null) => {
    return String(
      cliente?.numero_documento ??
      cliente?.documento_numero ??
      cliente?.ruc ??
      cliente?.codigo ??
      '',
    ).trim()
  }, [])

  // Estados principales
  const [productos, setProductos] = useState<ProductoPOS[]>([])
  const [carrito, setCarrito] = useState<ItemVenta[]>([])
  const [estadoCaja, setEstadoCaja] = useState<EstadoCaja | null>(null)
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [historialVentas, setHistorialVentas] = useState<any[]>([])
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<any>(null)
  const [configurationStatus, setConfigurationStatus] = useState<ConfigurationStatus | null>(null)

  // Estados de UI
  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<string>('')
  const [metodoPagoSeleccionado, setMetodoPagoSeleccionado] = useState<string>('')
  const [referenciaPago, setReferenciaPago] = useState('')
  const [montoRecibido, setMontoRecibido] = useState('')
  const [pagosMixtos, setPagosMixtos] = useState(false)
  const [pagos, setPagos] = useState<Array<{ metodo_pago_id: string; monto: string; referencia?: string }>>([])
  const [tipoComprobante, setTipoComprobante] = useState<'03' | '01'>('03') // 03=Boleta, 01=Factura

  // Nuevos estados para funcionalidades avanzadas
const [descuentoGlobal, setDescuentoGlobal] = useState<Descuento>({ tipo: 'PORCENTAJE', valor: 0, descripcion: '' })
const [modoVentaRapida, setModoVentaRapida] = useState(false)
const [ventaSinStock, setVentaSinStock] = useState(false)
  const [estadoVentaActual, setEstadoVentaActual] = useState<EstadoVenta>({ estado: 'EN_PROGRESO', fecha_estado: new Date().toISOString() })
  const [busquedaPorCodigoBarras, setBusquedaPorCodigoBarras] = useState('')

  // Estados de modales
  const [mostrarModalAbrirCaja, setMostrarModalAbrirCaja] = useState(false)
  const [mostrarModalCerrarCaja, setMostrarModalCerrarCaja] = useState(false)
  const [mostrarCheckout, setMostrarCheckout] = useState(false)
  const [mostrarHistorial, setMostrarHistorial] = useState(false)
  const [mostrarVentaExitosa, setMostrarVentaExitosa] = useState(false)
  const [ventaExitosaData, setVentaExitosaData] = useState<any>(null)
  const [procesandoVenta, setProcesandoVenta] = useState(false)
  const [modoCajaEnfocado, setModoCajaEnfocado] = useState(false)

  // Estados de formularios
  const [montoInicialInput, setMontoInicialInput] = useState('')
  const [montoContadoInput, setMontoContadoInput] = useState('')
  const [notasCierreInput, setNotasCierreInput] = useState('')
  const [isLoading, setIsLoading] = useState(true);
  const [empresaInfo, setEmpresaInfo] = useState<any | null>(null);
  const [detallesFactura, setDetallesFactura] = useState<any[]>([]);
  const [loadingFactura, setLoadingFactura] = useState<boolean>(false);
  const [greThreshold, setGreThreshold] = useState<number>(700);
  const [greEnabled, setGreEnabled] = useState<boolean>(false);
  const [cajaId, setCajaId] = useState<string | null>(null);
  const [sesionCajaId, setSesionCajaId] = useState<string | null>(null);
  const [datosInicializados, setDatosInicializados] = useState(false);
  const [hayCajasDisponibles, setHayCajasDisponibles] = useState(true);
  const [productoSeleccionado, setProductoSeleccionado] = useState<string | null>(null);
  const [currentIdempotencyKey, setCurrentIdempotencyKey] = useState<string | null>(null);
  const cargandoRef = useRef(false);
  const sesionGuardadaRef = useRef<string | null>(null);
  const busquedaInputRef = useRef<HTMLInputElement>(null)
  const codigoBarrasInputRef = useRef<HTMLInputElement>(null)
  const documentoImprimibleRef = useRef<HTMLDivElement>(null)

  const formatMoney = (value: any): string => {
    const num = Number(value);
    return Number.isFinite(num)
      ? num.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '0,00';
  };
  const formatCurrency = (value: any): string => `${currencySymbol} ${formatMoney(value)}`;

  useEffect(() => {
    const handlePosShortcut = (event: KeyboardEvent) => {
      if (event.key === 'F2') {
        event.preventDefault()
        busquedaInputRef.current?.focus()
        busquedaInputRef.current?.select()
        return
      }

      if (event.key === 'F4') {
        event.preventDefault()
        codigoBarrasInputRef.current?.focus()
        codigoBarrasInputRef.current?.select()
        return
      }

      if (event.key === 'F8' && carrito.length > 0 && clienteSeleccionado) {
        event.preventDefault()
        setMostrarCheckout(true)
        return
      }

      if (event.key === 'Escape' && modoCajaEnfocado && !mostrarCheckout) {
        setModoCajaEnfocado(false)
      }
    }

    window.addEventListener('keydown', handlePosShortcut)
    return () => window.removeEventListener('keydown', handlePosShortcut)
  }, [carrito.length, clienteSeleccionado, modoCajaEnfocado, mostrarCheckout])

  // Alertar si se intenta cerrar/recargar la pestaña con caja abierta
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Tienes una caja abierta. Cierra la caja antes de salir para evitar sesiones abiertas.';
    };

    if (estadoCaja?.estado === 'ABIERTA') {
      window.addEventListener('beforeunload', handler);
    }

    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [estadoCaja?.estado]);

  // Persistir la sesión de caja en localStorage para reanudar si el frontend recarga
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (estadoCaja?.estado === 'ABIERTA' && sesionCajaId) {
      localStorage.setItem('pos_sesion_caja_id', sesionCajaId);
    } else {
      localStorage.removeItem('pos_sesion_caja_id');
    }
  }, [estadoCaja?.estado, sesionCajaId]);

  const cargarDatos = useCallback(async () => {
    setIsLoading(true)
    try {
      const productosPromise = api.get('/api/pos/productos');
      const configPromise = api.get('/api/pos/configuration-status');
      const grePromise = api.get('/api/configuration/gre-thresholds');
      const clientesPromise = api.get('/api/pos/clientes');
      const metodosPagoPromise = api.get('/api/pos/metodos-pago');
      const empresaPromise = api.get('/api/pos/empresa-config');
      const ventasRecientesPromise = api.get('/api/pos/ventas-recientes');
      const cajasPromise = api.get('/cajas');
      const sesionPromise = api.get('/api/pos/sesion-caja');

      // Cargar productos (bloqueante para mostrar el POS)
      const productosResponse = await productosPromise;
      const productosData = productosResponse?.data || [];
      setProductos(productosData);

      // Obtener cajas y sesión abierta (prioritario para el estado de caja)
      try {
        const cajasRes = await cajasPromise;
        const cajas = cajasRes?.data || [];
        let sesionRes: any = null;
        try {
          sesionRes = await sesionPromise;
        } catch (sesionError) {
          console.error('❌ Error cargando sesión de caja:', sesionError);
        }

        if (cajas.length === 0) {
          console.warn('⚠️ No hay cajas configuradas para este tenant');
          setHayCajasDisponibles(false);
          setSesionCajaId(null);
          setEstadoCaja({
            estado: 'CERRADA',
            montoInicial: 0,
            ventasEfectivo: 0,
            ventasTarjeta: 0,
            montoFinal: 0,
          });
        } else {
          setHayCajasDisponibles(true);
          setCajaId((prev) => prev ?? cajas[0].id);

          // Buscar sesión activa solo del usuario autenticado para evitar tomar cajas de otro cajero
          const sesionActiva = sesionRes?.data || null;
          // Una sesión abierta sigue siéndolo aunque se haya abierto ayer: los
          // negocios que operan pasada la medianoche cruzan de día con la caja
          // abierta. Exigir que la apertura fuera hoy ocultaba la caja y su
          // efectivo, y empujaba al cajero a abrir otra, con lo que la anterior
          // se cerraba automáticamente sin arqueo.
          const sesionValida = sesionActiva
            && sesionActiva.estado === 'ABIERTA'
            && !sesionActiva.hora_cierre
            && !sesionActiva.fecha_cierre;

          const sesionGuardada = sesionGuardadaRef.current;

          if (sesionValida) {
            // Si había una sesión guardada y no coincide con la devuelta por el backend, limpiar storage
            if (sesionGuardada && sesionGuardada !== sesionActiva.id && typeof window !== 'undefined') {
              localStorage.removeItem('pos_sesion_caja_id');
            }
            const cajaActivaId = sesionActiva.caja_id || cajas[0].id;
            setCajaId(cajaActivaId);
            setSesionCajaId(sesionActiva.id);
            setEstadoCaja({
              estado: 'ABIERTA',
              montoInicial: sesionActiva.monto_inicio || sesionActiva.monto_inicial || sesionActiva.monto_esperado || 0,
              ventasEfectivo: 0,
              ventasTarjeta: 0,
              montoFinal: sesionActiva.monto_inicio || sesionActiva.monto_inicial || sesionActiva.monto_esperado || 0,
              cajaId: cajaActivaId,
              sesionId: sesionActiva.id,
            });
          } else {
            // Sesión no válida: limpiar storage y estado local
            if (typeof window !== 'undefined') {
              localStorage.removeItem('pos_sesion_caja_id');
            }
            setSesionCajaId(null);
            setEstadoCaja({
              estado: 'CERRADA',
              montoInicial: 0,
              ventasEfectivo: 0,
              ventasTarjeta: 0,
              montoFinal: 0,
            });
          }
        }
      } catch (cajaError) {
        console.error('❌ Error cargando cajas:', cajaError);
        setHayCajasDisponibles(false);
        setSesionCajaId(null);
        setEstadoCaja({
          estado: 'CERRADA',
          montoInicial: 0,
          ventasEfectivo: 0,
          ventasTarjeta: 0,
          montoFinal: 0,
        });
      }

      setDatosInicializados(true)
      setIsLoading(false)

      // Cargar información secundaria en segundo plano (no bloquea la UI)
      const [
        configResult,
        greResult,
        clientesResult,
        metodosPagoResult,
        empresaResult,
        ventasRecientesResult,
      ] = await Promise.allSettled([
        configPromise,
        grePromise,
        clientesPromise,
        metodosPagoPromise,
        empresaPromise,
        ventasRecientesPromise,
      ]);

      if (configResult.status === 'fulfilled') {
        const configResponse = configResult.value;
        if (configResponse?.success && configResponse?.data) {
          const configData = {
            ...configResponse.data,
            certificate: {
              ...configResponse.data.certificate,
              expiresAt: configResponse.data.certificate?.expiresAt
                ? new Date(configResponse.data.certificate.expiresAt)
                : undefined
            }
          };
          setConfigurationStatus(configData);
          if (!configResponse.data.isDemo && !configResponse.data.isComplete && process.env.NODE_ENV === 'development') {
            console.info('Configuración POS incompleta:', configResponse.data.missingItems);
          }
        }
      } else {
        console.error('❌ Error checking configuration status:', configResult.reason);
      }

      if (greResult.status === 'fulfilled') {
        const greConfigResponse = greResult.value;
        if (greConfigResponse?.success && greConfigResponse?.data) {
          setGreThreshold(greConfigResponse.data.umbralGREAutomatico || 700);
          setGreEnabled(greConfigResponse.data.greAutomaticoHabilitado === true);
        }
      } else {
        console.error('❌ Error fetching GRE config:', greResult.reason);
      }

      const clientesRes = clientesResult.status === 'fulfilled' ? clientesResult.value : null;
      if (clientesRes?.success) {
        setClientes(clientesRes.data || []);
      } else {
        console.warn('⚠️ No se pudieron cargar clientes POS');
        setClientes([]);
      }

      const metodosPagoRes = metodosPagoResult.status === 'fulfilled' ? metodosPagoResult.value : null;
      if (metodosPagoRes?.success) {
        setMetodosPago(metodosPagoRes.data || []);
      } else {
        console.warn('⚠️ No se pudieron cargar métodos de pago POS');
        setMetodosPago([]);
      }

      const empresaRes = empresaResult.status === 'fulfilled' ? empresaResult.value : null;
      if (empresaRes?.success) {
        setEmpresaInfo(empresaRes.data);
      } else {
        setEmpresaInfo(null);
      }

      const ventasRecientesRes = ventasRecientesResult.status === 'fulfilled' ? ventasRecientesResult.value : null;
      if (ventasRecientesRes?.success) {
        setHistorialVentas(ventasRecientesRes.data || []);
      } else {
        setHistorialVentas([]);
      }

    } catch (error) {
      console.error('❌ Error general cargando POS:', error)

      // Mostrar el error real al usuario
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      toast({
        variant: 'destructive',
        title: '❌ Error cargando POS',
        description: `${errorMessage}. Verifica la conexión y la vista 'vista_pos_productos'.`,
      });

      // Establecer valores por defecto en caso de error total
      setProductos([])
      setMetodosPago([])
      setClientes([])
      setEstadoCaja({ estado: 'CERRADA', montoInicial: 0, ventasEfectivo: 0, ventasTarjeta: 0, montoFinal: 0 })
      setHistorialVentas([])
      setDatosInicializados(true)
      setIsLoading(false)
    }
  }, [api, toast])

  useEffect(() => {
    // Solo cargar datos una vez al montar el componente
    // Usar ref para evitar doble carga en StrictMode
    if (!datosInicializados && !cargandoRef.current) {
      cargandoRef.current = true;

      // Rehidratar sesión almacenada (si la hay) para mostrar estado mientras valida con API
      if (typeof window !== 'undefined') {
        const sesionGuardada = localStorage.getItem('pos_sesion_caja_id');
        if (sesionGuardada) {
          sesionGuardadaRef.current = sesionGuardada;
          setSesionCajaId(sesionGuardada);
          setEstadoCaja((prev) => ({
            estado: 'ABIERTA',
            montoInicial: prev?.montoInicial || 0,
            ventasEfectivo: prev?.ventasEfectivo || 0,
            ventasTarjeta: prev?.ventasTarjeta || 0,
            montoFinal: prev?.montoFinal || 0,
            cajaId: prev?.cajaId,
            sesionId: sesionGuardada,
          }));
        }
      }

      cargarDatos();
    }
  }, [cargarDatos, datosInicializados]);

  const recargarHistorialVentas = async () => {
    try {
      const ventasRes = await api.get('/api/pos/ventas-recientes');
      if (!ventasRes?.success) {
        throw new Error(ventasRes?.message || 'Error cargando historial');
      }

      setHistorialVentas(ventasRes.data || []);
    } catch (error) {
      console.error('❌ Error recargando historial de ventas:', error);
      setHistorialVentas([]);
    }
  }

  const recargarProductos = async () => {
    try {
      const productosResponse = await api.get('/api/pos/productos');

      if (!productosResponse.success) {
        throw new Error(`API Error: ${productosResponse.message}`);
      }

      const productosData = productosResponse?.data || [];
      setProductos(productosData);

      // Mostrar éxito si se recargaron productos
      if (productosData.length > 0) {
        toast({
          title: '✅ Productos recargados',
          description: `${productosData.length} productos cargados correctamente.`,
        });
      }
    } catch (error) {
      console.error('❌ Error recargando productos:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      toast({
        variant: 'destructive',
        title: '❌ Error recargando productos',
        description: errorMessage,
      });
    }
  }

  const handleVerFactura = async (venta: any) => {
    if (!venta) return;

    setFacturaSeleccionada(venta);
    setLoadingFactura(true);
    setDetallesFactura([]);

    try {

      const itemsObservados = (() => {
        if (!venta.observaciones) return []
        try {
          const parsed = JSON.parse(venta.observaciones)
          return Array.isArray(parsed?.items) ? parsed.items : []
        } catch {
          return []
        }
      })()

      // Intentar obtener detalles desde API POS
      let detalles: any[] = [];
      const detallesResponse = await api.get(`/api/pos/detalles-venta/${venta.id}`);

      if (detallesResponse?.success && Array.isArray(detallesResponse.data) && detallesResponse.data.length > 0) {
        detalles = detallesResponse.data;
      } else {

        // Fallback: usar observaciones almacenadas en la venta
        if (venta.observaciones) {
          try {
            const observacionesData = JSON.parse(venta.observaciones);
            if (observacionesData.items && Array.isArray(observacionesData.items)) {
              detalles = observacionesData.items.map((item: any, index: number) => ({
                id: index + 1,
                venta_id: venta.id,
                codigo_producto: item.producto?.codigo || item.producto_id || 'N/A',
                nombre_producto: item.producto?.nombre || 'Producto',
                cantidad: item.cantidad || 1,
                precio_unitario: item.precio_unitario || 0,
                descuento: item.descuento_monto || 0,
                total_parcial: item.subtotal || 0,
              }));
            }
          } catch (parseError) {
            console.warn('⚠️ Error parseando observaciones:', parseError);
          }
        }

        // Último fallback: crear detalle básico
        if (detalles.length === 0) {
          detalles = [{
            id: 1,
            venta_id: venta.id,
            codigo_producto: 'N/A',
            nombre_producto: 'Ver detalles en backend',
            cantidad: 1,
            precio_unitario: venta.total || 0,
            descuento: 0,
            total_parcial: venta.total || 0,
          }];
        }
      }

      const detallesNormalizados = detalles.map((detalle: any, index: number) => {
        const productoCatalogo = productos.find((producto) =>
          String(producto.id) === String(detalle.producto_id || '') ||
          String(producto.codigo || '') === String(detalle.codigo_producto || detalle.codigo || ''),
        )
        const itemObservado = itemsObservados.find((item: any) =>
          String(item.producto_id || item.producto?.id || '') === String(detalle.producto_id || ''),
        ) || itemsObservados[index]
        const descripcion = [
          detalle.descripcion,
          detalle.nombre_producto,
          detalle.producto_nombre,
          itemObservado?.producto?.nombre,
          itemObservado?.nombre,
          productoCatalogo?.nombre,
        ].find((value) => typeof value === 'string' && value.trim().length > 0) || 'Producto sin descripción'
        const cantidad = Number(detalle.cantidad ?? 1)
        const precioUnitario = Number(detalle.precio_unitario ?? detalle.precio ?? 0)
        const totalLinea = Number(
          detalle.subtotal ??
          detalle.total_parcial ??
          detalle.total ??
          cantidad * precioUnitario,
        )

        return {
          ...detalle,
          codigo_producto: detalle.codigo_producto || detalle.codigo || itemObservado?.producto?.codigo || productoCatalogo?.codigo || '—',
          descripcion,
          nombre_producto: descripcion,
          cantidad,
          precio_unitario: precioUnitario,
          subtotal: totalLinea,
        }
      })

      setDetallesFactura(detallesNormalizados);

    } catch (error) {
      console.error("❌ Error general al cargar detalles de la factura:", error);
      setDetallesFactura([]);
    } finally {
      setLoadingFactura(false);
    }
  };

  // Función para aplicar descuentos a un item
  const aplicarDescuentoItem = (productoId: string, descuento: Descuento) => {
    setCarrito(carrito.map(item => {
      if (item.producto.id === productoId) {
        const descuentoMonto = descuento.tipo === 'PORCENTAJE'
          ? (item.precio_original * item.cantidad * descuento.valor / 100)
          : descuento.valor

        return {
          ...item,
          descuento_porcentaje: descuento.tipo === 'PORCENTAJE' ? descuento.valor : 0,
          descuento_monto: descuentoMonto,
          subtotal: Math.max(0, (item.precio_original * item.cantidad) - descuentoMonto)
        }
      }
      return item
    }))
  }

  // Función para obtener precio según tipo de cliente
  const obtenerPrecioProducto = (producto: ProductoPOS): number => {
    const cliente = clientes.find(c => c.id === clienteSeleccionado)

    // Lógica de precios especiales
    if (cliente?.tipo_documento === documentoFiscal && producto.precio_mayorista) {
      return producto.precio_mayorista // Precio mayorista para empresas
    }

    if (producto.precio_especial && Math.random() > 0.7) {
      return producto.precio_especial // Precio especial aleatorio (simula promociones)
    }

    return producto.precio_venta
  }

  const agregarAlCarrito = (producto: ProductoPOS) => {
    const stockDisponible = producto.stock_disponible ?? producto.stock_actual ?? 0
    const itemExistente = carrito.find(item => item.producto.id === producto.id)

    // Verificar stock disponible (excepto servicios)
    if (!producto.es_servicio && stockDisponible <= 0) {
      toast({
        variant: 'destructive',
        title: '❌ Sin stock',
        description: `${producto.nombre} no tiene stock disponible.`,
      })
      return
    }

    // Aviso de stock mínimo
    if (!producto.es_servicio && stockDisponible <= (producto.stock_minimo ?? 0)) {
      toast({
        title: '⚠️ Stock bajo',
        description: `${producto.nombre} tiene stock bajo (${stockDisponible}).`,
      })
    }

    if (aplicaLimiteItems) {
      // Validar límite de items SUNAT (max 999 items)
      const totalItems = carrito.reduce((sum, item) => sum + item.cantidad, 0)
      const nuevaCantidadTotal = itemExistente ? totalItems + 1 : totalItems + 1

      if (nuevaCantidadTotal > 999) {
        toast({
          variant: 'destructive',
          title: '❌ Límite de items excedido',
          description: `${fiscalAuthority} permite máximo 999 items. Actualmente tiene ${totalItems} items.`,
        })
        return
      }
    }

    const precioFinal = obtenerPrecioProducto(producto)

    if (itemExistente) {
      // Verificar que no exceda el stock
      if (!producto.es_servicio && itemExistente.cantidad >= stockDisponible) {
        toast({
          variant: 'destructive',
          title: '❌ Stock insuficiente',
          description: `Solo hay ${stockDisponible} unidades disponibles.`,
        })
        return
      }

      setCarrito(carrito.map(item =>
        item.producto.id === producto.id
          ? {
            ...item,
            cantidad: item.cantidad + 1,
            precio_unitario: producto.precio_venta,
            precio_original: producto.precio_venta,
            descuento_porcentaje: precioFinal < producto.precio_venta ? ((producto.precio_venta - precioFinal) / producto.precio_venta * 100) : 0,
            descuento_monto: precioFinal < producto.precio_venta ? ((producto.precio_venta - precioFinal) * (item.cantidad + 1)) : 0,
            subtotal: ((item.cantidad + 1) * producto.precio_venta) - (precioFinal < producto.precio_venta ? ((producto.precio_venta - precioFinal) * (item.cantidad + 1)) : 0)
          }
          : item
      ))
    } else {
      setCarrito([...carrito, {
        producto,
        cantidad: 1,
        precio_unitario: producto.precio_venta,
        precio_original: producto.precio_venta,
        descuento_porcentaje: precioFinal < producto.precio_venta ? ((producto.precio_venta - precioFinal) / producto.precio_venta * 100) : 0,
        descuento_monto: precioFinal < producto.precio_venta ? (producto.precio_venta - precioFinal) : 0,
        subtotal: precioFinal
      }])
    }

    // Limpiar selección después de agregar
    setProductoSeleccionado(null)

    // Toast de producto agregado - REMOVIDO para mejor UX
  }

  const actualizarCantidad = (productoId: string, nuevaCantidad: number) => {
    if (nuevaCantidad <= 0) {
      setCarrito(carrito.filter(item => item.producto.id !== productoId))
    } else {
      if (aplicaLimiteItems) {
        // Validar límite de items SUNAT (max 999 items)
        const itemActual = carrito.find(item => item.producto.id === productoId)
        const otrosItems = carrito.filter(item => item.producto.id !== productoId)
        const totalOtrosItems = otrosItems.reduce((sum, item) => sum + item.cantidad, 0)
        const nuevaCantidadTotal = totalOtrosItems + nuevaCantidad

        if (nuevaCantidadTotal > 999) {
          toast({
            variant: 'destructive',
            title: '❌ Límite de items excedido',
            description: `Con esta cantidad tendría ${nuevaCantidadTotal} items. Máximo permitido: 999.`,
          })
          return
        }
      }

      setCarrito(carrito.map(item => {
        if (item.producto.id !== productoId) return item

        const descuentoMonto = item.descuento_porcentaje > 0
          ? (item.precio_original * nuevaCantidad * item.descuento_porcentaje / 100)
          : item.descuento_monto > 0 && item.cantidad > 0
            ? (item.descuento_monto / item.cantidad) * nuevaCantidad
            : 0

        return {
          ...item,
          cantidad: nuevaCantidad,
          descuento_monto: descuentoMonto,
          subtotal: Math.max(0, (item.precio_original * nuevaCantidad) - descuentoMonto)
        }
      }))
    }
  }

  const aplicarDescuentoRapido = (productoId: string, porcentaje: number) => {
    aplicarDescuentoItem(productoId, { tipo: 'PORCENTAJE', valor: porcentaje, descripcion: `Descuento ${porcentaje}%` })
  }

  const eliminarDelCarrito = (productoId: string) => {
    setCarrito(carrito.filter(item => item.producto.id !== productoId));
  }

  const procesarVenta = async () => {
    if (procesandoVenta) {
      return
    }

    // 1. Validaciones iniciales
    if (carrito.length === 0) {
      toast({
        variant: 'destructive',
        title: '❌ Carrito vacío',
        description: 'Agregue productos antes de procesar la venta.',
      })
      return
    }

    if (!clienteSeleccionado || (!pagosMixtos && !metodoPagoSeleccionado)) {
      toast({
        variant: 'destructive',
        title: '❌ Datos incompletos',
        description: 'Seleccione cliente y método de pago o configure pagos mixtos.',
      })
      return
    }

    // Validar documento de cliente seleccionado
    const clienteActual = clientes.find(c => c.id === clienteSeleccionado)
    const documento = getClienteDocumento(clienteActual)
    if (!documento || documento.length < 8) {
      toast({
        variant: 'destructive',
        title: '❌ Documento inválido',
        description: 'Seleccione un cliente con documento válido (mínimo 8 dígitos).',
      })
      return
    }

    // Validar que Factura requiere documento fiscal
    if (tipoComprobante === '01' && clienteActual?.tipo_documento !== documentoFiscal) {
      toast({
        variant: 'destructive',
        title: `❌ Factura requiere ${documentoFiscal}`,
        description: `Para emitir Factura, el cliente debe tener ${documentoFiscal}.`,
      })
      return
    }

    // Validar que la caja esté abierta antes de cualquier operación
    if (!estadoCaja || estadoCaja.estado !== 'ABIERTA' || !sesionCajaId) {
      toast({
        title: '🔒 Caja cerrada',
        description: 'Debe abrir la caja antes de registrar ventas.',
      })
      setMostrarModalAbrirCaja(true)
      return
    }

    if (aplicaLimiteItems) {
      // 2. Validaciones SUNAT antes de procesar
      const totalItems = carrito.reduce((sum, item) => sum + item.cantidad, 0)
      if (totalItems > 999) {
        toast({
          variant: 'destructive',
          title: `❌ Validación ${fiscalAuthority} fallida`,
          description: `El documento tiene ${totalItems} items. Máximo permitido: 999.`,
        })
        return
      }
    }

    const totalVenta = calcularTotal()
    if (pagosMixtos) {
      if (pagos.length === 0) {
        toast({
          variant: 'destructive',
          title: '❌ Pagos incompletos',
          description: 'Agregue al menos un pago para continuar.',
        })
        return
      }

      for (const pago of pagos) {
        const monto = parseFloat(pago.monto)
        const metodo = metodosPago.find((m) => m.id === pago.metodo_pago_id)
        if (!pago.metodo_pago_id || !metodo) {
          toast({
            variant: 'destructive',
            title: '❌ Método de pago inválido',
            description: 'Seleccione un método de pago válido en cada línea.',
          })
          return
        }
        if (!Number.isFinite(monto) || monto <= 0) {
          toast({
            variant: 'destructive',
            title: '❌ Monto inválido',
            description: 'Ingrese un monto válido en cada pago.',
          })
          return
        }
        if (metodo.requiere_referencia && !(pago.referencia || '').trim()) {
          toast({
            variant: 'destructive',
            title: '❌ Referencia requerida',
            description: `El método ${metodo.nombre} requiere referencia.`,
          })
          return
        }
      }

      if (Math.abs(totalPagosMixtos - totalVenta) > 0.01) {
        toast({
          variant: 'destructive',
          title: '❌ Cuadre de pagos',
          description: `Los pagos (${formatCurrency(totalPagosMixtos)}) no cuadran con el total (${formatCurrency(totalVenta)}).`,
        })
        return
      }
    } else if (esPagoEfectivo && montoRecibidoNumero + 0.001 < totalVenta) {
      toast({
        variant: 'destructive',
        title: '❌ Efectivo insuficiente',
        description: `Falta recibir ${formatCurrency(totalVenta - montoRecibidoNumero)}.`,
      })
      return
    } else if (metodoPagoActual?.requiere_referencia && !(referenciaPago || '').trim()) {
      toast({
        variant: 'destructive',
        title: '❌ Referencia requerida',
        description: 'Ingrese la referencia del pago.',
      })
      return
    }

    if (isPeru) {
      // Advertencia operativa: no convierte esta venta en una GRE automática.
      const esBoletaSinRuc = clienteActual?.tipo_documento !== 'RUC'

      if (esBoletaSinRuc && totalVenta > 700) {
        toast({
          title: `⚠️ Advertencia ${fiscalAuthority}`,
          description: `Venta > ${currencySymbol} 700 sin RUC. Verifique el documento del receptor antes de emitir la boleta.`,
        })
      }
    }

    // Check configuration status before processing
    if (configurationStatus && !configurationStatus.isComplete) {
      toast({
        title: '⚠️ Configuración incompleta',
        description: 'La venta puede fallar. Revise la configuración.',
      })
    }

    let resultado: any = null;
    setProcesandoVenta(true)
    try {
      // 3. Cambiar estado a PENDIENTE_PAGO
      setEstadoVentaActual({ estado: 'PENDIENTE_PAGO', fecha_estado: new Date().toISOString() })

      // 4. Generar comprobante antes de enviar
      const comprobante = generarComprobante()

      // 5. Preparar datos mejorados para envío
      const clienteActual = clientes.find(c => c.id === clienteSeleccionado);

      if (!currentIdempotencyKey) {
        setCurrentIdempotencyKey(`${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
      }
      const idempotencyKey = currentIdempotencyKey || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      const ventaData: any = {
        idempotency_key: idempotencyKey,
        sesion_caja_id: sesionCajaId,
        cliente_id: clienteSeleccionado,
        cliente_nombre: clienteActual?.razon_social || `${clienteActual?.nombres || ''} ${clienteActual?.apellidos || ''}`.trim() || 'Cliente General',
        cliente_documento: getClienteDocumento(clienteActual) || '00000000',
        metodo_pago_id: pagosMixtos ? null : metodoPagoSeleccionado,
        referencia_pago: pagosMixtos ? null : referenciaPago,
        numero_comprobante: comprobante.numero,
        items: carrito.map(item => ({
          producto_id: item.producto.id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          precio_original: item.precio_original,
          descuento_porcentaje: item.descuento_porcentaje,
          descuento_monto: item.descuento_monto,
          subtotal: item.subtotal
        })),
        subtotal: calcularSubtotal(),
        descuentos: calcularDescuentoTotal(),
        descuento_global: {
          tipo: descuentoGlobal.tipo,
          valor: descuentoGlobal.valor,
        },
        impuestos: calcularImpuestos(),
        total: calcularTotal(),
        comprobante: {
          serie: comprobante.serie,
          correlativo: comprobante.correlativo,
          tipo: comprobante.tipo,
          numero: comprobante.numero,
        },
        modo_venta_rapida: modoVentaRapida,
        permite_venta_sin_stock: ventaSinStock
      }

      if (pagosMixtos) {
        ventaData.pagos = pagos.map((p) => ({
          metodo_pago_id: p.metodo_pago_id,
          monto: parseFloat(p.monto),
          referencia: (p.referencia || '').trim() || null,
        }))
      }

      // 5. Procesar venta en backend con 1 reintento en caso de error de red
      let resultado: any = null;

      const enviarVenta = async () => {
        const resp = await posSaleApi.post('/api/pos/venta', ventaData)
        return resp
      }

      try {
        resultado = await enviarVenta()
      } catch (apiError: any) {
        console.error('❌ Error de conexión API:', apiError)
        toast({
          variant: 'destructive',
          title: '❌ Error de red',
          description: 'Reintentando conexión...',
        })
        // Reintentar automáticamente una vez
        resultado = await enviarVenta()
      }

      // Verificar que se recibió una respuesta válida
      if (!resultado || resultado === null || resultado === undefined) {
        console.error('❌ No se recibió respuesta del backend. Resultado:', resultado)
        console.error('❌ La venta puede haberse procesado en el backend pero no recibimos confirmación')
        throw new Error('No se recibió respuesta del servidor. Verifica el historial de ventas para confirmar si se procesó.')
      }

      const ventaInfo = resultado?.data || resultado || {}
      const totalServidor = ventaInfo?.total ?? ventaInfo?.totales_servidor?.total
      const subtotalServidor = ventaInfo?.subtotal ?? ventaInfo?.totales_servidor?.subtotal
      const impuestosServidor = ventaInfo?.impuestos ?? ventaInfo?.totales_servidor?.impuestos

      if (resultado && (resultado.success === true || ventaInfo.venta_id)) {
        // 6. Cambiar estado a PAGADA
        setEstadoVentaActual({ estado: 'PAGADA', fecha_estado: new Date().toISOString() })

        // 7. Limpiar carrito y resetear formulario
        setCarrito([])
        setReferenciaPago('')
        setMontoRecibido('')
        if (pagosMixtos) {
          setPagos([])
          setPagosMixtos(false)
        }
        setDescuentoGlobal({ tipo: 'PORCENTAJE', valor: 0, descripcion: '' })
        setCurrentIdempotencyKey(null)

        const itemsActualizados = Array.isArray(ventaInfo?.items_actualizados) ? ventaInfo.items_actualizados : []
        if (itemsActualizados.length > 0) {
          setProductos((prev) => prev.map((producto) => {
            const actualizado = itemsActualizados.find((item: any) => item.producto_id === producto.id)
            if (!actualizado) return producto
            return {
              ...producto,
              stock_actual: actualizado.stock_actual ?? producto.stock_actual,
              stock_disponible: actualizado.stock_disponible ?? producto.stock_disponible,
            }
          }))
        }

        // 8. Mostrar confirmación inmediatamente; la recarga posterior no debe bloquear al cajero.
        const totalVenta = totalServidor ?? calcularTotal()

        setVentaExitosaData({
          venta_id: ventaInfo.venta_id,
          numero_ticket: ventaInfo.numero_ticket || comprobante.numero,
          total: totalVenta,
          subtotal: subtotalServidor ?? calcularSubtotal(),
          impuestos: impuestosServidor ?? calcularImpuestos(),
          tipo_comprobante: tipoComprobante,
          estado: ventaInfo.estado || 'PAGADA',
          factura_electronica: ventaInfo.factura_electronica || false,
          facturacion_pendiente: ventaInfo.facturacion_pendiente || ventaInfo.cpe_pendiente || false,
          cpe_id: ventaInfo.cpe_id,
          cliente_nombre: clienteActual?.razon_social || clienteActual?.nombres || 'Cliente General',
          fecha: new Date().toISOString(),
        })
        setMostrarCheckout(false)
        setMostrarVentaExitosa(true)

        recargarHistorialVentas().catch(err => console.warn('⚠️ Error recargando historial:', err))
        recargarProductos().catch(err => console.warn('⚠️ Error recargando productos:', err))

        // 9. Resetear estado para nueva venta (mantener caja abierta)
        setEstadoVentaActual({ estado: 'EN_PROGRESO', fecha_estado: new Date().toISOString() })
      } else {
        // Error del backend - mostrar error real
        console.error('❌ Error del backend COMPLETO:', resultado)
        if (resultado) {
          console.error('❌ Message:', resultado.message)
          console.error('❌ Error object:', resultado.error)
          console.error('❌ Debug info:', resultado.debug_info)
          throw new Error(`Backend ERROR: ${resultado.message || JSON.stringify(resultado)}`)
        } else {
          throw new Error('Backend devolvió respuesta vacía o inválida')
        }
      }
    } catch (error) {
      // Error en el proceso - cambiar estado a CANCELADA
      setEstadoVentaActual({ estado: 'CANCELADA', fecha_estado: new Date().toISOString() })
      setCurrentIdempotencyKey(null)

      console.error('❌ ERROR REAL procesando venta:', error)

      // Mostrar error detallado y real
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';

      // Crear mensaje de error más detallado
      let mensajeDetallado = `❌ ERROR REAL EN VENTA

MENSAJE: ${errorMessage}`;

      if (resultado && resultado.success === false) {
        mensajeDetallado += `

🔍 DETALLES DEL BACKEND:
- Message: ${resultado.message || 'No message'}
- Success: ${resultado.success}`;

        if (resultado.error) {
          mensajeDetallado += `

💥 ERROR TÉCNICO:
- Tipo: ${resultado.error.tipo || 'Unknown'}
- Mensaje: ${resultado.error.mensaje || 'No error message'}
- Código: ${resultado.error.codigo || 'No code'}
- Detalles: ${resultado.error.detalles || 'No details'}
- Sugerencia: ${resultado.error.sugerencia || 'No suggestion'}`;
        }

        if (resultado.debug_info) {
          mensajeDetallado += `

🐛 DEBUG INFO:
${JSON.stringify(resultado.debug_info, null, 2)}`;
        }
      }

      mensajeDetallado += `

🚨 LA VENTA NO SE GUARDÓ - REVISA EL ERROR Y CORRIGE LA BD`;

      console.error(mensajeDetallado)
      toast({
        variant: 'destructive',
        title: '❌ Error procesando venta',
        description: errorMessage,
      })
    } finally {
      setProcesandoVenta(false)
    }
  }

  const calcularSubtotal = () => {
    return carrito.reduce((sum, item) => sum + item.subtotal, 0)
  }

  // SUNAT, Catalogo 07: solo la base gravada paga IGV. Los codigos 2x son
  // exonerados, 3x inafectos y 40 exportacion; ante un codigo ausente o
  // desconocido se asume gravado, que es el caso mayoritario.
  const esBaseGravada = (item: ItemVenta) => {
    const codigo = String(item.producto?.afectacion_igv ?? '').trim()
    if (!codigo) return true
    return codigo.charAt(0) === '1'
  }

  // El descuento global reduce la base imponible, no el total ya con impuesto.
  const calcularDescuentoGlobalMonto = () => {
    const subtotal = calcularSubtotal()
    if (subtotal <= 0 || descuentoGlobal.valor <= 0) return 0

    return descuentoGlobal.tipo === 'PORCENTAJE'
      ? subtotal * Math.min(descuentoGlobal.valor, 100) / 100
      : Math.min(descuentoGlobal.valor, subtotal)
  }

  const calcularDescuentoTotal = () => {
    const descuentoItems = carrito.reduce((sum, item) => sum + item.descuento_monto, 0)
    return descuentoItems + calcularDescuentoGlobalMonto()
  }

  const calcularImpuestos = () => {
    const subtotal = calcularSubtotal()
    if (subtotal <= 0) return 0

    // El descuento global se prorratea, asi que reduce la base gravada en la
    // misma proporcion en la que reduce el subtotal.
    const factor = 1 - calcularDescuentoGlobalMonto() / subtotal
    const baseGravada = carrito
      .filter(esBaseGravada)
      .reduce((sum, item) => sum + item.subtotal, 0) * factor

    return Number((Math.max(0, baseGravada) * taxRate).toFixed(2))
  }

  const calcularTotal = () => {
    const base = calcularSubtotal() - calcularDescuentoGlobalMonto()
    return Math.max(0, Number((base + calcularImpuestos()).toFixed(2)))
  }

  // Bases por afectación del Catálogo 07, con el descuento global prorrateado.
  // La representación impresa debe separarlas: un ticket que sólo muestra
  // "Subtotal" e "IGV" oculta qué parte de la venta no está gravada.
  const calcularDesgloseAfectacion = () => {
    const subtotal = calcularSubtotal()
    const factor = subtotal > 0 ? 1 - calcularDescuentoGlobalMonto() / subtotal : 1
    const codigoDe = (item: ItemVenta) => String(item.producto?.afectacion_igv ?? '').trim()
    const acumular = (predicado: (item: ItemVenta) => boolean) =>
      Number((carrito.filter(predicado).reduce((suma, item) => suma + item.subtotal, 0) * factor).toFixed(2))

    return {
      gravadas: acumular(esBaseGravada),
      exoneradas: acumular((item) => codigoDe(item).charAt(0) === '2'),
      inafectas: acumular((item) => codigoDe(item).charAt(0) === '3'),
      exportacion: acumular((item) => codigoDe(item) === '40'),
    }
  }

  const totalPagosMixtos = pagos.reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0)

  const agregarPago = () => {
    setPagos([...pagos, { metodo_pago_id: '', monto: '', referencia: '' }])
  }

  const actualizarPago = (index: number, field: 'metodo_pago_id' | 'monto' | 'referencia', value: string) => {
    const next = pagos.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    setPagos(next)
  }

  const eliminarPago = (index: number) => {
    const next = pagos.filter((_, i) => i !== index)
    setPagos(next)
  }

  // Función para generar comprobante
  const generarComprobante = () => {
    const correlativo = String(Date.now()).slice(-8)
    // Serie según tipo de comprobante: B=Boleta, F=Factura
    const serie = tipoComprobante === '01' ? 'F001' : 'B001'

    const comprobante = {
      serie,
      correlativo,
      numero: `${serie}-${correlativo}`,
      tipo: tipoComprobante, // 01=Factura, 03=Boleta
      fecha: new Date().toISOString(),
      cliente: clientes.find(c => c.id === clienteSeleccionado),
      items: carrito,
      subtotal: calcularSubtotal(),
      descuentos: calcularDescuentoTotal(),
      impuestos: calcularImpuestos(),
      total: calcularTotal(),
      metodoPago: metodosPago.find(m => m.id === metodoPagoSeleccionado),
      estado: estadoVentaActual.estado
    }

    return comprobante
  }

  const abrirCaja = async () => {
    setMostrarModalAbrirCaja(true)
  }

  const confirmarAbrirCaja = async () => {
    const montoInicial = parseFloat(montoInicialInput)

    if (isNaN(montoInicial) || montoInicial < 0) {
      toast({
        variant: 'destructive',
        title: '❌ Monto inválido',
        description: 'Ingrese un monto inicial válido.',
      })
      return
    }

    try {
      if (!cajaId) {
        toast({
          variant: 'destructive',
          title: '❌ Sin caja configurada',
          description: 'No hay caja configurada. Cree una caja primero.',
        })
        return
      }

      const resultado = await api.post(`/cajas/${cajaId}/apertura`, {
        monto_inicio: montoInicial,
        cajero_id: user?.id || undefined,
      })

      if (resultado) {
        const sesion = resultado.data || resultado
        setCajaId(cajaId)
        setSesionCajaId(sesion.id)
        setEstadoCaja({
          estado: 'ABIERTA',
          montoInicial,
          ventasEfectivo: 0,
          ventasTarjeta: 0,
          montoFinal: montoInicial,
          cajaId,
          sesionId: sesion.id,
        })

        setMostrarModalAbrirCaja(false)
        setMontoInicialInput('')

        toast({
          title: 'Caja abierta',
          description: `Caja abierta con ${formatCurrency(montoInicial)}.`,
        })
      }
    } catch (error) {
      console.error('❌ Error abriendo caja:', error)
    }
  }

  const cerrarCaja = async () => {
    try {
      if (!cajaId || !sesionCajaId) {
        toast({
          variant: 'destructive',
          title: '❌ Sin sesión activa',
          description: 'No hay sesión de caja activa para cerrar.',
        })
        return
      }

      const saldoResponse = await api.get(`/cajas/saldo-esperado/${sesionCajaId}`)
      const saldoEsperado = Number(saldoResponse?.data?.saldo ?? saldoResponse?.saldo)

      if (Number.isFinite(saldoEsperado)) {
        setEstadoCaja((prev) => prev ? {
          ...prev,
          montoFinal: saldoEsperado,
          ventasEfectivo: saldoEsperado - prev.montoInicial,
        } : prev)
        setMontoContadoInput(formatMoney(saldoEsperado))
      }

      // Mostrar modal de cierre de caja con el saldo calculado por el backend.
      setMostrarModalCerrarCaja(true)
    } catch (error) {
      console.error('❌ Error preparando cierre de caja:', error)
      toast({
        variant: 'destructive',
        title: '❌ Error',
        description: 'Error preparando cierre de caja.',
      })
    }
  }

  const confirmarCerrarCaja = async () => {
    try {
      const montoFinal = parseFloat(montoContadoInput) || 0

      // La diferencia real la calcula el backend (esperado = inicial + ventas
      // en efectivo − retiros); calcularla aquí como contado − inicial ignoraba
      // las ventas y mostraba diferencias falsas al cajero.
      const resultado = await api.post(`/cajas/${cajaId}/cierre`, {
        sesion_id: sesionCajaId,
        monto_cierre: montoFinal,
        monto_contado: montoFinal,
        notas: 'Cierre manual desde POS'
      })

      if (resultado) {
        const sesionCerrada = (resultado as any)?.data ?? resultado
        const diferenciaReal = Number(sesionCerrada?.diferencia ?? NaN)
        setSesionCajaId(null)
        setEstadoCaja({
          estado: 'CERRADA',
          montoInicial: 0,
          ventasEfectivo: 0,
          ventasTarjeta: 0,
          montoFinal: 0,
          cajaId: cajaId || undefined,
        })

        toast({
          title: 'Caja cerrada',
          description: Number.isFinite(diferenciaReal)
            ? `Monto contado: ${formatCurrency(montoFinal)}. Diferencia: ${formatCurrency(diferenciaReal)}.`
            : `Monto contado: ${formatCurrency(montoFinal)}.`,
        })
      }
      setMostrarModalCerrarCaja(false)
      setMontoContadoInput('')
    } catch (error) {
      console.error('❌ Error cerrando caja:', error)
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido'
      toast({
        variant: 'destructive',
        title: '❌ Error cerrando caja',
        description: errorMsg,
      })
    }
  }

  // Catálogo que el POS puede vender: sin stock o sin precio el producto no llega
  // a la grilla. Los contadores por categoría se calculan sobre esto y no sobre el
  // catálogo completo, que prometía productos que la grilla ocultaba.
  const productosVendibles = (productos || []).filter((producto) => {
    const stockDisponible = producto.stock_disponible ?? producto.stock_actual ?? 0;
    const tieneStock = producto.es_servicio || stockDisponible > 0;
    return tieneStock && producto.precio_venta > 0;
  });

  // Búsqueda mejorada con múltiples criterios
  const productosFiltrados = productosVendibles.filter((producto) => {
    const termino = busqueda.toLowerCase().trim();
    const codigoBarras = busquedaPorCodigoBarras.toLowerCase().trim();

    // Búsqueda por código de barras específico
    if (codigoBarras && producto.codigo_barras) {
      return producto.codigo_barras.toLowerCase().includes(codigoBarras);
    }

    // Búsqueda general mejorada
    const coincideBusqueda =
      !termino ||
      producto.nombre.toLowerCase().includes(termino) ||
      producto.codigo.toLowerCase().includes(termino) ||
      (producto.codigo_barras &&
        producto.codigo_barras.toLowerCase().includes(termino)) ||
      (producto.descripcion &&
        producto.descripcion.toLowerCase().includes(termino)) ||
      (producto.marca && producto.marca.toLowerCase().includes(termino));

    const coincideCategoria =
      !categoriaFiltro || producto.categoria === categoriaFiltro;

    return coincideBusqueda && coincideCategoria;
  });

  const categorias = [...new Set(productosVendibles.map((p) => p.categoria))];
  const metodoPagoActual = metodosPago.find(
    (m) => m.id === metodoPagoSeleccionado
  );
  const clienteActual = clientes.find((c) => c.id === clienteSeleccionado);
  // El importe operativo debe coincidir exactamente con las dos cifras que ve y cobra el cajero.
  const totalVentaActual = Number(calcularTotal().toFixed(2))
  const esPagoEfectivo = Boolean(
    metodoPagoActual &&
    `${metodoPagoActual.codigo || ''} ${metodoPagoActual.nombre || ''}`.toUpperCase().includes('EFECT'),
  )
  const montoRecibidoNumero = Number(montoRecibido.replace(',', '.')) || 0
  const pagoEfectivoInsuficiente = !pagosMixtos && esPagoEfectivo && montoRecibidoNumero + 0.001 < totalVentaActual

  const seleccionarMetodoPago = (metodo: MetodoPago) => {
    setMetodoPagoSeleccionado(metodo.id)
    setReferenciaPago('')
    const esEfectivo = `${metodo.codigo || ''} ${metodo.nombre || ''}`.toUpperCase().includes('EFECT')
    setMontoRecibido(esEfectivo ? formatMoney(totalVentaActual) : '')
  }

  const mensajeAccionRapida = () => {
    const resumenPago = pagosMixtos
      ? pagos
        .map((p) => {
          const metodo = metodosPago.find((m) => m.id === p.metodo_pago_id)
          const nombre = metodo?.nombre || 'Método'
          return `${nombre}: ${formatCurrency(parseFloat(p.monto) || 0)}`
        })
        .join(' / ')
      : (metodoPagoActual?.nombre || 'Sin seleccionar')

    const lineas = carrito.slice(0, 5).map(
      (item) => `• ${item.producto.nombre} x${item.cantidad} - ${formatCurrency(item.subtotal)}`
    )
    const extra = carrito.length > 5 ? `… y ${carrito.length - 5} ítems más` : ''
    return [
      `Hola ${clienteActual?.razon_social || clienteActual?.nombres || clienteActual?.apellidos || 'cliente'},`,
      `Detalle de tu compra en Neon System:`,
      ...lineas,
      extra,
      `Total: ${formatCurrency(calcularTotal())}`,
      `Método de pago: ${resumenPago || 'Sin seleccionar'}`,
      `Gracias por tu preferencia.`
    ]
      .filter(Boolean)
      .join('\n')
  }

  const abrirVistaPreviaBorrador = () => {
    setDetallesFactura(carrito.map((item, index) => ({
      id: `borrador-${index}`,
      producto_id: item.producto.id,
      codigo_producto: item.producto.codigo,
      descripcion: item.producto.nombre,
      nombre_producto: item.producto.nombre,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.subtotal,
    })))
    setFacturaSeleccionada({
      es_borrador: true,
      numero_ticket: 'SIN EMITIR',
      tipo_comprobante: tipoComprobante,
      fecha: new Date().toISOString(),
      cliente_nombre: clienteActual?.razon_social || `${clienteActual?.nombres || ''} ${clienteActual?.apellidos || ''}`.trim() || 'Cliente sin seleccionar',
      cliente_documento: getClienteDocumento(clienteActual),
      metodo_pago_nombre: metodoPagoActual?.nombre || 'Por definir',
      subtotal: calcularSubtotal(),
      descuentos: calcularDescuentoTotal(),
      impuestos: calcularImpuestos(),
      total: calcularTotal(),
      ...calcularDesgloseAfectacion(),
    })
    setLoadingFactura(false)
  }

  // Mostrar loading mientras se cargan los datos iniciales
  if (isLoading || !datosInicializados) {
    return (
      <div className={posShellClass}>
        <div className="flex min-h-screen items-center justify-center">
          <div className={`${posPanelClass} w-full max-w-[460px] p-8 text-center`}>
            <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 text-primary">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
            <h2 className="mb-2 text-2xl font-semibold text-foreground">Cargando POS...</h2>
            <p className="text-muted-foreground">Verificando estado de caja</p>
          </div>
        </div>
      </div>
    )
  }

  if (!posEnabled) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">POS no disponible</h1>
        <p className="text-foreground/80 mt-2">
          El módulo POS está deshabilitado en este entorno.
        </p>
      </div>
    )
  }

  const formatoDocumentoSeleccionado: PosDocumentFormat = facturaSeleccionada &&
    getPosDocumentLabel(facturaSeleccionada).toLowerCase().includes('factura')
    ? 'a4'
    : 'thermal'

  const documentoSeleccionado: PosDocumentData | null = facturaSeleccionada
    ? {
        numero: getPosDocumentNumber(facturaSeleccionada) || 'Sin numeración',
        tipo: facturaSeleccionada.es_borrador
          ? `Borrador de ${getPosDocumentLabel(facturaSeleccionada)}`
          : getPosDocumentLabel(facturaSeleccionada),
        fecha: facturaSeleccionada.fecha || facturaSeleccionada.created_at,
        clienteNombre: facturaSeleccionada.cliente_nombre || 'Cliente General',
        clienteDocumento: String(facturaSeleccionada.cliente_documento || '').trim() || 'Sin documento',
        formaPago: facturaSeleccionada.metodo_pago_nombre || 'Contado',
        subtotal: Number(facturaSeleccionada.subtotal || 0),
        descuentos: Number(facturaSeleccionada.descuentos || 0),
        impuestos: Number(facturaSeleccionada.impuestos || 0),
        total: Number(facturaSeleccionada.total || 0),
        gravadas: Number(facturaSeleccionada.gravadas ?? facturaSeleccionada.total_gravadas ?? 0),
        exoneradas: Number(facturaSeleccionada.exoneradas ?? facturaSeleccionada.total_exoneradas ?? 0),
        inafectas: Number(facturaSeleccionada.inafectas ?? facturaSeleccionada.total_inafectas ?? 0),
        exportacion: Number(facturaSeleccionada.exportacion ?? facturaSeleccionada.total_exportacion ?? 0),
        items: detallesFactura.map((item: any, index: number) => ({
          id: item.id || index,
          codigo: item.codigo_producto || item.codigo || '—',
          descripcion: item.descripcion || item.nombre_producto || item.producto_nombre || 'Producto sin descripción',
          cantidad: Number(item.cantidad || 0),
          precioUnitario: Number(item.precio_unitario || 0),
          total: Number(item.subtotal ?? item.total_parcial ?? item.total ?? 0),
        })),
      }
    : null

  const empresaDocumento = {
    nombre: empresaInfo?.razon_social || empresaInfo?.nombre_comercial || 'Mi Empresa',
    ruc: empresaInfo?.ruc || '20000000001',
    direccion: empresaInfo?.direccion_fiscal || empresaInfo?.direccion,
    email: empresaInfo?.email,
    telefono: empresaInfo?.telefono,
    logoUrl: empresaInfo?.logo_url,
  }

  return (
    <>
      {!estadoCaja || estadoCaja.estado === 'CERRADA' ? (
        <div className={posShellClass}>
          <div className="flex min-h-screen flex-col items-center justify-center gap-6 py-8">
            <div className={`${posPanelClass} w-full max-w-[500px] p-8 text-center`}>
              <div className="mb-8">
                <div className="mx-auto mb-8 flex size-[112px] items-center justify-center rounded-3xl border border-cyan-400/25 bg-cyan-400/10 text-primary shadow-[0_22px_55px_rgba(8,145,178,0.18)]">
                  {hayCajasDisponibles ? <Lock className="h-14 w-14" /> : <AlertTriangle className="h-14 w-14" />}
                </div>
                <h2 className="mb-4 text-4xl font-bold text-foreground">
                  {hayCajasDisponibles ? 'CAJA CERRADA' : 'SIN CAJA CONFIGURADA'}
                </h2>
                <p className="mb-8 text-muted-foreground">
                  {hayCajasDisponibles
                    ? 'Para usar el sistema POS, primero debe abrir la caja registradora con el monto inicial'
                    : 'No hay cajas registradoras configuradas. Vaya a Configuración para crear una caja primero.'}
                </p>
                {hayCajasDisponibles ? (
                  <button
                    onClick={abrirCaja}
                    className="flex w-full items-center justify-center gap-3 rounded-xl border border-cyan-300/30 bg-blue-700 bg-gradient-to-br from-blue-700 to-cyan-700 px-8 py-6 text-lg font-bold text-white shadow-[0_20px_45px_rgba(37,99,235,0.26)] transition hover:brightness-110"
                  >
                    <CircleDollarSign className="h-5 w-5" />
                    Abrir Caja Registradora
                  </button>
                ) : (
                  <a
                    href="/dashboard/wizard"
                    className="flex w-full items-center justify-center gap-3 rounded-xl bg-blue-700 bg-gradient-to-br from-blue-700 to-cyan-700 px-8 py-6 text-center text-lg font-bold text-white no-underline shadow-lg transition hover:brightness-110"
                  >
                    <Settings className="h-5 w-5" />
                    Ir a Configuración
                  </a>
                )}
              </div>
            </div>

          {/* Panel de apertura dentro del mismo bloque centrado: como hermano del
              contenedor min-h-screen aparecia una pantalla mas abajo. */}
          {mostrarModalAbrirCaja && (
            <div className={`${posPanelClass} w-full max-w-[500px] p-6`}>
              <h3 className="mb-4 flex items-center gap-2 text-2xl font-semibold text-white">
                <CircleDollarSign className="h-6 w-6 text-primary" />
                Abrir Caja
              </h3>
              <label htmlFor="monto-inicial-caja" className="mb-2 block text-sm font-semibold text-muted-foreground">
                Monto inicial ({currencySymbol})
              </label>
              <input
                id="monto-inicial-caja"
                name="monto-inicial-caja"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                value={montoInicialInput}
                onChange={(e) => setMontoInicialInput(e.target.value)}
                placeholder="0.00"
                className={`${posInputClass} mb-4 w-full p-4 text-lg`}
                autoFocus
              />
              <div className="flex gap-4">
                <button
                  onClick={confirmarAbrirCaja}
                  className={`${posPrimaryButtonClass} flex flex-1 items-center justify-center gap-2 p-4`}
                >
                  <Check className="h-4 w-4" />
                  Confirmar
                </button>
                <button
                  onClick={() => setMostrarModalAbrirCaja(false)}
                  className={`${posSecondaryButtonClass} flex-1 p-4`}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
          </div>
        </div>
      ) : (
        <div className={`${posShellClass} ${modoCajaEnfocado ? 'fixed inset-0 z-[1100] overflow-y-auto bg-background' : 'bg-muted/30'}`}>
          {/* Cabecera operativa: contexto y acciones secundarias sin competir con el cobro. */}
          <div className={posHeaderClass}>
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <ShoppingCart className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">Punto de venta</h1>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 dark:text-emerald-300">
                      Caja {estadoCaja?.estado?.toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {productosFiltrados.length} productos disponibles · {carrito.length} {carrito.length === 1 ? 'línea' : 'líneas'} en la venta
                  </p>
                </div>
              </div>
              {/* Sin shrink-0 los botones comprimían el título hasta dejarlo en
                  "P..." teniendo espacio libre; con wrap bajan de línea. */}
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant={modoCajaEnfocado ? 'secondary' : 'outline'}
                  size="sm"
                  className="gap-2"
                  onClick={() => setModoCajaEnfocado((current) => !current)}
                  aria-pressed={modoCajaEnfocado}
                  aria-label={modoCajaEnfocado ? 'Salir de modo caja' : 'Modo caja'}
                  title={modoCajaEnfocado ? 'Salir del modo caja (Esc)' : 'Ocultar el resto del ERP y concentrarse en la venta'}
                >
                  {modoCajaEnfocado ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  <span className="hidden md:inline">{modoCajaEnfocado ? 'Salir de modo caja' : 'Modo caja'}</span>
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={recargarProductos} aria-label="Sincronizar">
                  <RefreshCw className="h-4 w-4" />
                  <span className="hidden sm:inline">Sincronizar</span>
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setMostrarHistorial(true)} aria-label="Ventas del día">
                  <History className="h-4 w-4" />
                  <span className="hidden sm:inline">Ventas del día</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="gap-2" aria-label="Operación de caja">
                      <WalletCards className="h-4 w-4" />
                      <span className="hidden sm:inline">Caja</span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 border bg-background p-1.5 shadow-xl">
                    <DropdownMenuLabel>
                      <span className="block">Operación de caja</span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">Turno actualmente abierto</span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => router.push('/dashboard/cajas#cortes')} className="gap-3 rounded-md px-3 py-2.5">
                      <FileText className="h-4 w-4 shrink-0" />
                      <span>
                        <span className="block font-medium">Ver cortes</span>
                        <span className="block text-xs text-muted-foreground">Consulta cierres y diferencias</span>
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={cerrarCaja} className="gap-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-destructive focus:bg-destructive/10 focus:text-destructive">
                      <Lock className="h-4 w-4 shrink-0" />
                      <span>
                        <span className="block font-medium">Cerrar caja</span>
                        <span className="block text-xs text-destructive/80">Finaliza el turno actual</span>
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Configuration Warning Banner */}
          {!configurationStatus?.isDemo && (
            <ConfigStatusBanner
              onOpenWizard={() => window.location.href = '/dashboard/wizard'}
              configurationStatus={configurationStatus}
            />
          )}

          {/* Certificate Expiring Warning */}
          {configurationStatus &&
            !configurationStatus.isDemo &&
            configurationStatus.certificate.isValid &&
            configurationStatus.certificate.expiresAt && (
              (() => {
                const daysUntilExpiration = Math.floor(
                  (new Date(configurationStatus.certificate.expiresAt).getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24)
                );
                return daysUntilExpiration < 30 && daysUntilExpiration > 0 ? (
                  <div className="mb-6 flex items-center gap-4 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-6 py-4 text-primary">
                    <AlertTriangle className="h-7 w-7 text-primary" />
                    <div className="flex-1">
                      <h3 className="m-0 text-lg font-bold">
                        Certificado Próximo a Vencer
                      </h3>
                      <p className="m-0 mt-2">
                        Su certificado digital vence en {daysUntilExpiration} días. Renuévelo pronto para evitar
                        interrupciones.
                      </p>
                    </div>
                  </div>
                ) : null;
              })()
            )}

          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,400px)] 2xl:grid-cols-[minmax(0,1fr)_420px]">
            {/* Panel Izquierdo - Productos */}
            <div className="flex min-w-0 flex-col gap-3">
              {/* Filtros y Búsqueda */}
              <div className={`${posPanelClass} p-3 sm:p-4`}>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_210px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <label htmlFor="pos-busqueda" className="sr-only">Buscar productos</label>
                    <input
                      ref={busquedaInputRef}
                      id="pos-busqueda"
                      name="pos-busqueda"
                      type="text"
                      placeholder="Buscar por nombre, código o código de barras"
                      value={busqueda}
                      list="pos-busqueda-options"
                      onChange={(e) => setBusqueda(e.target.value)}
                      className={`${posInputClass} h-11 w-full py-2 pl-10 pr-3 text-sm`}
                    />
                    <datalist id="pos-busqueda-options">
                      {(productos || []).slice(0, 50).map((p) => (
                        <option key={p.id} value={`${p.codigo} - ${p.nombre}`} />
                      ))}
                    </datalist>
                  </div>
                  <label htmlFor="pos-categoria" className="sr-only">Filtrar por categoría</label>
                  <select
                    id="pos-categoria"
                    name="pos-categoria"
                    value={categoriaFiltro}
                    onChange={(e) => setCategoriaFiltro(e.target.value)}
                    className={`${posInputClass} h-11 w-full px-3 text-sm`}
                  >
                    <option value="">Todas las categorías</option>
                    {categorias.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                {categorias.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Categorías rápidas">
                    <button
                      type="button"
                      onClick={() => setCategoriaFiltro('')}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${!categoriaFiltro ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
                    >
                      Todos · {productosVendibles.length}
                    </button>
                    {categorias.map((categoria) => (
                      <button
                        key={`categoria-rapida-${categoria}`}
                        type="button"
                        onClick={() => setCategoriaFiltro(categoria)}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${categoriaFiltro === categoria ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
                      >
                        {categoria} · {productosVendibles.filter((producto) => producto.categoria === categoria).length}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Panel de Herramientas Avanzadas */}
              <div className={`${posPanelClass} px-3 py-2.5 sm:px-4`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {/* Estado de Venta */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Estado</span>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                        estadoVentaActual.estado === 'EN_PROGRESO'
                          ? 'border border-cyan-300/25 bg-cyan-400/10 text-primary'
                          : estadoVentaActual.estado === 'PENDIENTE_PAGO'
                            ? 'border border-blue-300/25 bg-blue-400/10 text-primary dark:text-blue-200'
                            : estadoVentaActual.estado === 'PAGADA'
                              ? 'border border-cyan-300/25 bg-cyan-400/10 text-primary'
                              : 'border border-border/25 bg-slate-400/10 text-foreground'
                      }`}
                    >
                      {estadoVentaActual.estado.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Búsqueda por Código de Barras */}
                  <div className="relative flex items-center gap-2">
                    <Barcode className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
                    <label htmlFor="pos-codigo-barras" className="sr-only">Código de barras</label>
                    <input
                      ref={codigoBarrasInputRef}
                      id="pos-codigo-barras"
                      name="pos-codigo-barras"
                      type="text"
                      placeholder="Escanear código"
                      value={busquedaPorCodigoBarras}
                      onChange={(e) => setBusquedaPorCodigoBarras(e.target.value)}
                      className={`${posInputClass} h-9 w-[170px] py-2 pl-8 pr-2 text-sm`}
                    />
                  </div>

                  {/* Descuento Global */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Descuento</span>
                    <Percent className="h-4 w-4 text-muted-foreground" />
                    <label htmlFor="pos-descuento-tipo" className="sr-only">Tipo de descuento</label>
                    <select
                      id="pos-descuento-tipo"
                      name="pos-descuento-tipo"
                      value={descuentoGlobal.tipo}
                      onChange={(e) =>
                        setDescuentoGlobal({
                          ...descuentoGlobal,
                          tipo: e.target.value as 'PORCENTAJE' | 'MONTO_FIJO',
                        })
                      }
                      className={`${posInputClass} h-9 px-2 text-sm`}
                    >
                      <option value="PORCENTAJE">%</option>
                      <option value="MONTO_FIJO">{currencySymbol}</option>
                    </select>
                    <label htmlFor="pos-descuento-valor" className="sr-only">Valor del descuento</label>
                    <input
                      id="pos-descuento-valor"
                      name="pos-descuento-valor"
                      type="number"
                      value={descuentoGlobal.valor}
                      onChange={(e) =>
                        setDescuentoGlobal({
                          ...descuentoGlobal,
                          valor: parseFloat(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                      className={`${posInputClass} h-9 w-20 px-2 text-sm`}
                    />
                  </div>

                  {/* Switches de Modo */}
                  <div className="flex gap-4">
                    <label
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={modoVentaRapida}
                        onChange={(e) => setModoVentaRapida(e.target.checked)}
                        className="scale-125"
                      />
                       <Zap className="h-4 w-4" /> Venta rápida
                    </label>

                  </div>
                  <div className="ml-auto hidden items-center gap-1.5 lg:flex" aria-label="Atajos del punto de venta">
                    {[
                      ['F2', 'Buscar'],
                      ['F4', 'Escáner'],
                      ['F8', 'Cobrar'],
                    ].map(([key, label]) => (
                      <span key={key} className="flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
                        <kbd className="font-semibold text-foreground">{key}</kbd>
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Grid de Productos */}
              <div
                className={`${posPanelClass} overflow-y-auto p-3 sm:p-4 ${modoCajaEnfocado ? 'xl:max-h-[calc(100vh-245px)]' : 'xl:max-h-[calc(100vh-285px)]'}`}
              >
                <ProductGrid
                  productos={productosFiltrados}
                  onAgregar={agregarAlCarrito}
                  productoSeleccionado={productoSeleccionado}
                  onSeleccionar={setProductoSeleccionado}
                  currencySymbol={currencySymbol}
                  locale={locale}
                  taxRate={taxRate}
                  taxName={taxName}
                />
              </div>
            </div>

            {/* Venta activa: único panel persistente a la derecha. */}
            <div
              className={`${posPanelClass} flex min-w-0 flex-col overflow-hidden xl:sticky ${modoCajaEnfocado ? 'xl:top-3' : 'xl:top-4'}`}
            >
              {/* Header del Carrito */}
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">Venta actual</h2>
                    <p className="text-xs text-muted-foreground">{carrito.length} {carrito.length === 1 ? 'producto' : 'productos'}</p>
                  </div>
                </div>
                {carrito.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" className="h-9 gap-2 text-muted-foreground hover:text-destructive" onClick={() => setCarrito([])}>
                    <Trash2 className="h-4 w-4" />
                    Vaciar
                  </Button>
                )}
              </div>

              <div className="space-y-3 border-b bg-muted/20 p-4">
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <label htmlFor="pos-cliente-venta" className="sr-only">Cliente de la venta</label>
                  <select
                    id="pos-cliente-venta"
                    value={clienteSeleccionado}
                    onChange={(event) => setClienteSeleccionado(event.target.value)}
                    className={`${posInputClass} h-10 w-full py-2 pl-9 pr-3 text-sm`}
                  >
                    <option value="">Seleccionar cliente</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {(cliente.razon_social || `${cliente.nombres || ''} ${cliente.apellidos || ''}`.trim() || 'Cliente')} · {getClienteDocumento(cliente)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
                  <button
                    type="button"
                    onClick={() => setTipoComprobante('03')}
                    className={`min-h-9 rounded-md px-3 text-sm font-medium transition ${tipoComprobante === '03' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {consumerDocumentLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoComprobante('01')}
                    disabled={!clienteActual || clienteActual.tipo_documento !== documentoFiscal}
                    title={!clienteActual || clienteActual.tipo_documento !== documentoFiscal ? `Factura requiere cliente con ${documentoFiscal}` : ''}
                    className={`min-h-9 rounded-md px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${tipoComprobante === '01' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {businessDocumentLabel}
                  </button>
                </div>
              </div>

              {/* Lista de Items en Carrito */}
              <div className={`min-h-0 overflow-y-auto p-3 ${carrito.length > 0 ? 'max-h-[360px]' : ''}`}>
                {carrito.length === 0 ? (
                  <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-6 text-center text-muted-foreground">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                      <PackageOpen className="h-6 w-6" />
                    </div>
                    <p className="font-medium text-foreground">Comience una venta</p>
                    <p className="mt-1 max-w-[230px] text-sm">Agregue productos del catálogo; aquí verá cantidades y totales.</p>
                  </div>
                ) : (
                  carrito.map((item) => (
                    <div
                      key={item.producto.id}
                      className="mb-2 grid grid-cols-[38px_minmax(0,1fr)_auto] gap-2.5 rounded-xl border bg-background p-2.5"
                    >
                      <div className="shrink-0">
                        {item.producto.imagen_url ? (
                          <Image
                            src={item.producto.imagen_url}
                            alt={item.producto.nombre}
                            width={38}
                            height={38}
                            unoptimized
                            className="size-[38px] rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex size-[38px] items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <PackageOpen className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-semibold">
                          {item.producto.nombre}
                        </h4>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(item.precio_unitario)}
                          </p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => actualizarCantidad(item.producto.id, item.cantidad - 1)}
                            className="h-7 w-7"
                            aria-label={`Reducir cantidad de ${item.producto.nombre}`}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="min-w-7 text-center text-sm font-semibold">{item.cantidad}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => actualizarCantidad(item.producto.id, item.cantidad + 1)}
                            className="h-7 w-7"
                            aria-label={`Aumentar cantidad de ${item.producto.nombre}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="ghost" size="sm" className="ml-1 h-7 px-2 text-xs text-muted-foreground">
                                Descuento
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuLabel>Descuento de línea</DropdownMenuLabel>
                              <DropdownMenuItem onSelect={() => aplicarDescuentoRapido(item.producto.id, 5)}>Aplicar 5%</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => aplicarDescuentoRapido(item.producto.id, 10)}>Aplicar 10%</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => aplicarDescuentoRapido(item.producto.id, 0)}>Quitar descuento</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className="flex flex-col items-end justify-between text-right">
                          <p className="text-sm font-semibold">
                            {formatCurrency(item.subtotal)}
                          </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => eliminarDelCarrito(item.producto.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Eliminar producto del carrito"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer del Carrito (Resumen) */}
              {carrito.length > 0 && (
                <div className="border-t bg-card p-4">
                  <div
                    className="mb-1.5 flex justify-between text-sm text-muted-foreground"
                  >
                    <span>Subtotal</span>
                    <span>{formatCurrency(calcularSubtotal())}</span>
                  </div>
                  <div
                    className="mb-1.5 flex justify-between text-sm text-muted-foreground"
                  >
                    <span>Descuentos</span>
                    <span>
                      - {formatCurrency(calcularDescuentoTotal())}
                    </span>
                  </div>
                  <div
                    className="mb-3 flex justify-between text-sm text-muted-foreground"
                  >
                    <span>{taxLabel}</span>
                    <span>{formatCurrency(calcularImpuestos())}</span>
                  </div>
                  <div
                    className="flex items-end justify-between border-t pt-3"
                  >
                    <span className="text-sm font-semibold">Total</span>
                    <span className="text-2xl font-bold tracking-tight">{formatCurrency(calcularTotal())}</span>
                  </div>

                  {/* GRE Indicator: operational tenant rule, not the boleta S/700 identity rule. */}
                {greEnabled && calcularTotal() > greThreshold && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/40 p-2.5">
                      <PackageOpen className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="m-0 text-xs font-semibold">
                          GRE logística configurada
                        </p>
                        <p className="m-0 text-[0.7rem] text-muted-foreground">
                          Se evaluará generación por regla interna (&gt; {formatCurrency(greThreshold)})
                        </p>
                      </div>
                    </div>
                  )}
                  {!clienteSeleccionado && (
                    <p className="mt-3 text-xs font-medium text-destructive">Seleccione un cliente para continuar.</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 h-10 w-full gap-2"
                    onClick={abrirVistaPreviaBorrador}
                  >
                    <Eye className="h-4 w-4" />
                    Vista previa del comprobante
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    className="mt-2 min-h-12 w-full justify-between text-base"
                    onClick={() => setMostrarCheckout(true)}
                    disabled={!clienteSeleccionado}
                  >
                    <span className="flex items-center gap-2"><WalletCards className="h-5 w-5" /> Cobrar</span>
                    <span className="flex items-center gap-1">{formatCurrency(calcularTotal())}<ChevronRight className="h-4 w-4" /></span>
                  </Button>
                </div>
              )}
            </div>

          </div>

          <Dialog open={mostrarCheckout} onOpenChange={(open) => !procesandoVenta && setMostrarCheckout(open)}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[620px]">
              <DialogHeader>
                <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <WalletCards className="h-5 w-5" />
                </div>
                <DialogTitle className="text-xl">Cobrar {formatCurrency(calcularTotal())}</DialogTitle>
                <DialogDescription>
                  Confirme el medio de pago. El stock se actualizará únicamente cuando la venta sea aceptada.
                </DialogDescription>
              </DialogHeader>

              <div className="my-2 rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {clienteActual?.razon_social || `${clienteActual?.nombres || ''} ${clienteActual?.apellidos || ''}`.trim() || 'Cliente'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tipoComprobante === '01' ? businessDocumentLabel : consumerDocumentLabel} · {carrito.length} {carrito.length === 1 ? 'producto' : 'productos'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Total a cobrar</p>
                    <p className="text-xl font-bold tracking-tight">{formatCurrency(calcularTotal())}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <Label className="text-sm font-semibold">Medio de pago</Label>
                  <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${pagosMixtos ? 'border-primary bg-primary/10 text-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>
                    <input
                      type="checkbox"
                      checked={pagosMixtos}
                      onChange={(event) => {
                        const next = event.target.checked
                        setPagosMixtos(next)
                        if (next) {
                          if (pagos.length === 0) setPagos([{ metodo_pago_id: '', monto: '', referencia: '' }])
                          setMetodoPagoSeleccionado('')
                          setReferenciaPago('')
                          setMontoRecibido('')
                        } else {
                          setPagos([])
                        }
                      }}
                    />
                    Pago mixto
                  </label>
                </div>

                {!pagosMixtos ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {metodosPago.map((metodo) => (
                        <button
                          type="button"
                          key={metodo.id}
                          onClick={() => seleccionarMetodoPago(metodo)}
                          className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left text-sm font-medium transition ${metodoPagoSeleccionado === metodo.id ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'bg-background hover:bg-accent'}`}
                        >
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${metodoPagoSeleccionado === metodo.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                            {metodo.codigo?.toUpperCase().includes('EFECT') ? <Banknote className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                          </span>
                          <span className="line-clamp-2">{metodo.nombre}</span>
                        </button>
                      ))}
                    </div>
                    {metodoPagoActual?.requiere_referencia && (
                      <div className="space-y-2">
                        <Label htmlFor="pos-referencia-pago">Referencia de operación</Label>
                        <Input
                          id="pos-referencia-pago"
                          value={referenciaPago}
                          onChange={(event) => setReferenciaPago(event.target.value)}
                          placeholder="Número de referencia"
                        />
                      </div>
                    )}
                    {esPagoEfectivo && (
                      <CashTenderPanel
                        currencySymbol={currencySymbol}
                        total={totalVentaActual}
                        value={montoRecibido}
                        onChange={setMontoRecibido}
                      />
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pagos.map((pago, index) => {
                      const metodo = metodosPago.find((item) => item.id === pago.metodo_pago_id)
                      return (
                        <div key={`checkout-pago-${index}`} className="rounded-xl border p-3">
                          <div className="grid grid-cols-[minmax(0,1fr)_130px_auto] gap-2">
                            <select
                              aria-label={`Método del pago ${index + 1}`}
                              value={pago.metodo_pago_id}
                              onChange={(event) => actualizarPago(index, 'metodo_pago_id', event.target.value)}
                              className={`${posInputClass} h-10 px-3 text-sm`}
                            >
                              <option value="">Seleccionar método</option>
                              {metodosPago.map((opcion) => <option key={opcion.id} value={opcion.id}>{opcion.nombre}</option>)}
                            </select>
                            <Input
                              aria-label={`Monto del pago ${index + 1}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={pago.monto}
                              onChange={(event) => actualizarPago(index, 'monto', event.target.value)}
                              placeholder={`${currencySymbol} 0.00`}
                            />
                            <Button type="button" variant="ghost" size="icon" onClick={() => eliminarPago(index)} aria-label={`Eliminar pago ${index + 1}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          {metodo?.requiere_referencia && (
                            <Input
                              className="mt-2"
                              value={pago.referencia || ''}
                              onChange={(event) => actualizarPago(index, 'referencia', event.target.value)}
                              placeholder="Referencia de operación"
                            />
                          )}
                        </div>
                      )
                    })}
                    <Button type="button" variant="outline" className="w-full gap-2" onClick={agregarPago}>
                      <Plus className="h-4 w-4" /> Agregar otro pago
                    </Button>
                    <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
                      <div><span className="text-muted-foreground">Pagos</span><p className="font-semibold">{formatCurrency(totalPagosMixtos)}</p></div>
                      <div className="text-right"><span className="text-muted-foreground">Restante</span><p className="font-semibold">{formatCurrency(Math.max(0, calcularTotal() - totalPagosMixtos))}</p></div>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="mt-3 gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setMostrarCheckout(false)} disabled={procesandoVenta}>Volver</Button>
                <Button
                  type="button"
                  className="min-w-40 gap-2"
                  onClick={procesarVenta}
                  disabled={procesandoVenta || (!pagosMixtos && !metodoPagoSeleccionado) || (pagosMixtos && pagos.length === 0) || pagoEfectivoInsuficiente}
                >
                  {procesandoVenta ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {procesandoVenta ? 'Procesando…' : 'Confirmar cobro'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={mostrarHistorial} onOpenChange={setMostrarHistorial}>
            <DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-[760px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Ventas del día</DialogTitle>
                <DialogDescription>Consulte los comprobantes recientes sin abandonar la venta activa.</DialogDescription>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-y-auto rounded-xl border">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="p-3 text-left font-medium">Ticket</th>
                      <th className="p-3 text-left font-medium">Cliente</th>
                      <th className="p-3 text-right font-medium">Total</th>
                      <th className="p-3 text-center font-medium">Estado</th>
                      <th className="w-16 p-3"><span className="sr-only">Acción</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {historialVentas.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Aún no hay ventas registradas hoy.</td></tr>
                    ) : historialVentas.map((venta: any) => (
                      <tr key={venta.id} className="border-t">
                        <td className="p-3 font-medium">{venta.numero_venta || venta.numero_ticket || `#${venta.id}`}</td>
                        <td className="p-3 text-muted-foreground">{venta.cliente_nombre || 'General'}</td>
                        <td className="p-3 text-right font-semibold">{formatCurrency(venta.total)}</td>
                        <td className="p-3 text-center"><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400 dark:text-emerald-300">{venta.estado}</span></td>
                        <td className="p-2 text-center">
                          <Button type="button" variant="ghost" size="icon" onClick={() => { setMostrarHistorial(false); handleVerFactura(venta) }} aria-label={`Ver ticket ${venta.numero_venta || venta.numero_ticket || venta.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DialogContent>
          </Dialog>

          {/* Vista exacta del documento que se enviará a impresión */}
          {facturaSeleccionada && (
            <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
              <div className="flex max-h-[94vh] w-[1000px] max-w-[96vw] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl">
                <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Vista previa de impresión</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatoDocumentoSeleccionado === 'thermal'
                        ? 'Ticket térmico · papel de 80 mm'
                        : 'Factura · papel A4'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFacturaSeleccionada(null)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-xl leading-none text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    aria-label="Cerrar vista previa"
                  >
                    &times;
                  </button>
                </div>

                <div className="overflow-y-auto bg-slate-200 p-5 dark:bg-slate-950/80">
                  {loadingFactura || !documentoSeleccionado ? (
                    <div className="flex min-h-72 items-center justify-center rounded-lg bg-background text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando detalle del comprobante…
                    </div>
                  ) : (
                    <div ref={documentoImprimibleRef}>
                      <PosDocumentPreview
                        data={documentoSeleccionado}
                        company={empresaDocumento}
                        format={formatoDocumentoSeleccionado}
                        currencySymbol={currencySymbol}
                        taxLabel={taxLabel}
                        taxIdLabel={country.documentoFiscal}
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-4 border-t bg-card px-5 py-4">
                  <p className="text-xs text-muted-foreground">La impresión contiene únicamente el comprobante mostrado.</p>
                  <div className="flex gap-3">
                    <button
                    onClick={() => setFacturaSeleccionada(null)}
                    className="rounded-lg border bg-background px-4 py-2 text-sm font-semibold transition hover:bg-accent"
                    >
                      Cerrar
                    </button>
                    <Button
                      type="button"
                      className="gap-2"
                      disabled={loadingFactura || !documentoSeleccionado}
                      onClick={() => printPosDocument(
                        documentoImprimibleRef.current?.querySelector('[data-pos-print-document]') as HTMLElement | null,
                        `${documentoSeleccionado?.tipo || 'Comprobante'} ${documentoSeleccionado?.numero || ''}`,
                        formatoDocumentoSeleccionado,
                      )}
                    >
                      <Printer className="h-4 w-4" aria-hidden="true" />
                      {facturaSeleccionada.es_borrador
                        ? 'Imprimir borrador'
                        : formatoDocumentoSeleccionado === 'thermal' ? 'Imprimir ticket' : 'Imprimir factura'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <Dialog
            open={mostrarModalCerrarCaja}
            onOpenChange={(open) => {
              setMostrarModalCerrarCaja(open)
              if (!open) setMontoContadoInput('')
            }}
          >
            <DialogContent className="border-border bg-card text-card-foreground sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                    <Lock className="h-4 w-4" aria-hidden="true" />
                  </span>
                  Cerrar caja
                </DialogTitle>
                <DialogDescription>Registre el efectivo físico contado para finalizar el turno actual.</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <span className="text-xs text-muted-foreground">Monto inicial</span>
                  <p className="mt-1 font-semibold">{formatCurrency(estadoCaja?.montoInicial || 0)}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <span className="text-xs text-muted-foreground">Saldo esperado</span>
                  <p className="mt-1 font-semibold">{formatCurrency(estadoCaja?.montoFinal || 0)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="monto-contado-cierre">Monto contado en caja</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">{currencySymbol}</span>
                  <Input
                    id="monto-contado-cierre"
                    name="monto-contado-cierre"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    value={montoContadoInput}
                    onChange={(event) => setMontoContadoInput(event.target.value)}
                    placeholder="0.00"
                    className="h-11 pl-10 text-lg font-semibold"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted-foreground">Ingrese el total físico contado, incluyendo monedas y billetes.</p>
              </div>

              <div className="flex gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                <p className="text-muted-foreground">La diferencia definitiva se calculará al confirmar, considerando ventas y movimientos de caja.</p>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMostrarModalCerrarCaja(false)
                    setMontoContadoInput('')
                  }}
                >
                  Cancelar
                </Button>
                <Button type="button" variant="destructive" onClick={confirmarCerrarCaja} disabled={!montoContadoInput.trim()}>
                  <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                  Confirmar cierre
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Modal de Venta Exitosa */}
          <VentaExitosaModal
            isOpen={mostrarVentaExitosa}
            onClose={() => setMostrarVentaExitosa(false)}
            ventaData={ventaExitosaData}
            empresaData={empresaInfo ? {
              nombre: empresaInfo.razon_social || empresaInfo.nombre_comercial || 'Mi Empresa',
              ruc: empresaInfo.ruc || '20000000001',
              direccion: empresaInfo.direccion_fiscal || empresaInfo.direccion,
              logo_url: empresaInfo.logo_url,
            } : undefined}
          />
        </div>
      )}
    </>
  )
}
