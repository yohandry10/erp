'use client'

import Image from 'next/image'
import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useApi } from '@/hooks/use-api'
import { ConfigStatusBanner } from '@/components/pos/config-status-banner'
import { usePosConfig } from '@/hooks/use-pos-config'
import { ConfigurationStatus } from '@/app/dashboard/hooks/useConfigurationStatus'
import { useAuth } from '@/contexts/AuthContext'
// CajaControls ya no se usa - el modal de abrir caja está inline
import { ProductGrid, ProductoPOS } from '@/components/pos/ProductGrid'
import { QuickActions } from '@/components/pos/QuickActions'
import { QuickClient } from '@/components/pos/QuickClient'
import VentaExitosaModal from '@/components/pos/VentaExitosaModal'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'
import { useCountryContext } from '@/hooks/use-country-context'
import { AlertTriangle, Check, CircleDollarSign, FileText, Loader2, Lock, RefreshCw, Settings } from 'lucide-react'

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
  'min-h-screen max-w-full bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.18),transparent_26rem),radial-gradient(circle_at_86%_18%,rgba(99,102,241,0.18),transparent_30rem),linear-gradient(135deg,#020617_0%,#071426_42%,#0f172a_100%)] p-6 text-slate-100'

const posHeaderClass =
  'relative mb-6 overflow-hidden rounded-[28px] border border-cyan-400/25 bg-[linear-gradient(135deg,rgba(2,8,23,0.96),rgba(15,23,42,0.9)),radial-gradient(circle_at_82%_0%,rgba(37,99,235,0.28),transparent_24rem)] p-8 shadow-[0_24px_70px_rgba(2,8,23,0.42)]'

const posPanelClass =
  'rounded-2xl border border-cyan-400/20 bg-[linear-gradient(145deg,rgba(15,23,42,0.92),rgba(2,8,23,0.86)),radial-gradient(circle_at_100%_0%,rgba(34,211,238,0.16),transparent_18rem)] text-slate-100 shadow-[0_20px_55px_rgba(2,8,23,0.35)]'

const posInputClass =
  'rounded-lg border border-cyan-400/25 bg-slate-950/70 text-slate-100 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10 placeholder:text-slate-500'

const posPrimaryButtonClass =
  'rounded-lg border border-cyan-300/30 bg-gradient-to-br from-blue-600 to-cyan-500 px-4 py-3 font-semibold text-white shadow-[0_16px_34px_rgba(37,99,235,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50'

const posSecondaryButtonClass =
  'rounded-lg border border-slate-400/25 bg-slate-900/75 px-4 py-3 font-semibold text-blue-100 transition hover:border-cyan-300/45 hover:bg-slate-800/90 disabled:cursor-not-allowed disabled:opacity-50'

const posTinyButtonClass =
  'rounded-md border border-slate-400/25 bg-slate-900/75 px-2 py-1 text-xs font-semibold text-blue-100 transition hover:border-cyan-300/45 hover:bg-slate-800/90'

export default function POSPage() {
  const posEnabled = process.env.NEXT_PUBLIC_FEATURE_POS_ENABLED === 'true'

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
  const [mostrarModalPago, setMostrarModalPago] = useState(false)
  const [mostrarVentaExitosa, setMostrarVentaExitosa] = useState(false)
  const [ventaExitosaData, setVentaExitosaData] = useState<any>(null)
  const [procesandoVenta, setProcesandoVenta] = useState(false)

  // Estados de formularios
  const [montoInicialInput, setMontoInicialInput] = useState('')
  const [montoContadoInput, setMontoContadoInput] = useState('')
  const [notasCierreInput, setNotasCierreInput] = useState('')
  const [isLoading, setIsLoading] = useState(true);
  const [empresaInfo, setEmpresaInfo] = useState<any | null>(null);
  const [detallesFactura, setDetallesFactura] = useState<any[]>([]);
  const [loadingFactura, setLoadingFactura] = useState<boolean>(false);
  const [greThreshold, setGreThreshold] = useState<number>(700);
  const [greEnabled, setGreEnabled] = useState<boolean>(true);
  const [cajaId, setCajaId] = useState<string | null>(null);
  const [sesionCajaId, setSesionCajaId] = useState<string | null>(null);
  const [datosInicializados, setDatosInicializados] = useState(false);
  const [hayCajasDisponibles, setHayCajasDisponibles] = useState(true);
  const [productoSeleccionado, setProductoSeleccionado] = useState<string | null>(null);
  const [currentIdempotencyKey, setCurrentIdempotencyKey] = useState<string | null>(null);
  const cargandoRef = useRef(false);
  const sesionGuardadaRef = useRef<string | null>(null);

  const formatMoney = (value: any): string => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(2) : '0.00';
  };
  const formatCurrency = (value: any): string => `${currencySymbol} ${formatMoney(value)}`;

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
    console.log('🔄 Cargando datos POS empresarial...')
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
      console.log('📦 Respuesta completa del API:', productosResponse);
      const productosData = productosResponse?.data || [];
      console.log('📦 Productos extraídos:', productosData);
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
          console.log(`✅ ${cajas.length} caja(s) encontrada(s), usando: ${cajas[0].nombre || cajas[0].id}`);

          // Buscar sesión activa solo del usuario autenticado para evitar tomar cajas de otro cajero
          const sesionActiva = sesionRes?.data || null;
          const aperturaIso = sesionActiva?.hora_apertura || sesionActiva?.fecha_apertura || sesionActiva?.created_at;
          const apertura = aperturaIso ? new Date(aperturaIso) : null;
          const hoy = new Date();
          const esMismoDia =
            !!apertura &&
            apertura.getFullYear() === hoy.getFullYear() &&
            apertura.getMonth() === hoy.getMonth() &&
            apertura.getDate() === hoy.getDate();
          const sesionValida = sesionActiva
            && sesionActiva.estado === 'ABIERTA'
            && !sesionActiva.hora_cierre
            && !sesionActiva.fecha_cierre
            && esMismoDia;

          const sesionGuardada = sesionGuardadaRef.current;

          if (sesionValida) {
            // Si había una sesión guardada y no coincide con la devuelta por el backend, limpiar storage
            if (sesionGuardada && sesionGuardada !== sesionActiva.id && typeof window !== 'undefined') {
              localStorage.removeItem('pos_sesion_caja_id');
            }
            console.log('✅ Sesión de caja activa encontrada:', sesionActiva.id);
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
            console.log('ℹ️ No hay sesión de caja activa, mostrando pantalla de apertura');
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

      console.log(`✅ POS cargado: ${productosData.length} productos disponibles`);
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
        console.log('⚙️ Configuration status:', configResponse);
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
          if (!configResponse.data.isComplete) {
            console.warn('⚠️ Configuración incompleta:', configResponse.data.missingItems);
          }
        }
      } else {
        console.error('❌ Error checking configuration status:', configResult.reason);
      }

      if (greResult.status === 'fulfilled') {
        const greConfigResponse = greResult.value;
        console.log('📦 GRE config:', greConfigResponse);
        if (greConfigResponse?.success && greConfigResponse?.data) {
          setGreThreshold(greConfigResponse.data.umbralGREAutomatico || 700);
          setGreEnabled(greConfigResponse.data.greAutomaticoHabilitado !== false);
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

      console.log(`✅ Historial cargado: ${ventasRes.data?.length || 0} ventas encontradas`);
      setHistorialVentas(ventasRes.data || []);
    } catch (error) {
      console.error('❌ Error recargando historial de ventas:', error);
      setHistorialVentas([]);
    }
  }

  const recargarProductos = async () => {
    try {
      console.log('🔄 Recargando productos en POS...');
      const productosResponse = await api.get('/api/pos/productos');
      console.log('📦 Respuesta de recarga:', productosResponse);

      if (!productosResponse.success) {
        throw new Error(`API Error: ${productosResponse.message}`);
      }

      const productosData = productosResponse?.data || [];
      console.log('📦 Productos extraídos en recarga:', productosData);
      setProductos(productosData);
      console.log(`✅ ${productosData.length} productos recargados`);

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
      console.log('👁️ Cargando detalles de venta:', venta);

      // Intentar obtener detalles desde API POS
      let detalles: any[] = [];
      const detallesResponse = await api.get(`/api/pos/detalles-venta/${venta.id}`);

      if (detallesResponse?.success && Array.isArray(detallesResponse.data) && detallesResponse.data.length > 0) {
        detalles = detallesResponse.data;
        console.log('✅ Detalles obtenidos desde API POS:', detalles);
      } else {
        console.log('⚠️ No se encontraron detalles en API, intentando reconstruir desde observaciones...');

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
              console.log('✅ Detalles reconstruidos desde observaciones:', detalles);
            }
          } catch (parseError) {
            console.warn('⚠️ Error parseando observaciones:', parseError);
          }
        }

        // Último fallback: crear detalle básico
        if (detalles.length === 0) {
          console.log('⚠️ Creando detalles básicos de fallback...');
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

      setDetallesFactura(detalles);
      console.log(`✅ Se cargaron ${detalles.length} detalles para la factura`);

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
    console.log('🗑️ Eliminando producto del carrito:', productoId);
    setCarrito(carrito.filter(item => item.producto.id !== productoId));
    console.log('✅ Producto eliminado del carrito');
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
    } else if (metodoPagoActual?.requiere_referencia && !(referenciaPago || '').trim()) {
      toast({
        variant: 'destructive',
        title: '❌ Referencia requerida',
        description: 'Ingrese la referencia del pago.',
      })
      return
    }

    if (isPeru) {
      // SUNAT limit for boletas without RUC is 700
      const esBoletaSinRuc = clienteActual?.tipo_documento !== 'RUC'

      if (esBoletaSinRuc && totalVenta > 700) {
        // Para ventas > 700 sin RUC, mostrar advertencia pero continuar
        toast({
          title: `⚠️ Advertencia ${fiscalAuthority}`,
          description: `Venta > ${currencySymbol} 700 sin RUC. Se generará GRE automáticamente.`,
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
      console.log('📤 Enviando venta al backend...', ventaData)
      let resultado: any = null;

      const enviarVenta = async () => {
        console.log('🔄 Iniciando llamada API...')
        const resp = await posSaleApi.post('/api/pos/venta', ventaData)
        console.log('📨 Respuesta completa del backend:', resp)
        console.log('📨 Tipo de respuesta:', typeof resp, 'Es null?', resp === null, 'Es undefined?', resp === undefined)
        return resp
      }

      try {
        resultado = await enviarVenta()
        console.log('✅ Resultado recibido:', resultado)
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
        console.log('✅ Venta procesada exitosamente:', resultado)
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

  const calcularDescuentoTotal = () => {
    const descuentoItems = carrito.reduce((sum, item) => sum + item.descuento_monto, 0)

    // Aplicar descuento global al subtotal antes de descuentos
    const subtotalOriginal = carrito.reduce((sum, item) => sum + (item.precio_original * item.cantidad), 0)
    const descuentoGlobalMonto = descuentoGlobal.tipo === 'PORCENTAJE'
      ? (subtotalOriginal * descuentoGlobal.valor / 100)
      : descuentoGlobal.valor

    return descuentoItems + descuentoGlobalMonto
  }

  const calcularImpuestos = () => {
    const subtotalConDescuentos = calcularSubtotal()
    return subtotalConDescuentos * taxRate
  }

  const calcularTotal = () => {
    const subtotal = calcularSubtotal()
    const impuestos = calcularImpuestos()
    const descuentoGlobalMonto = descuentoGlobal.tipo === 'PORCENTAJE'
      ? (subtotal * descuentoGlobal.valor / 100)
      : descuentoGlobal.valor

    return Math.max(0, subtotal + impuestos - descuentoGlobalMonto)
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

    console.log('📄 Comprobante generado:', comprobante)
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

      // Mostrar modal de cierre de caja
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
      const diferencia = montoFinal - (estadoCaja?.montoInicial || 0)

      const resultado = await api.post(`/cajas/${cajaId}/cierre`, {
        sesion_id: sesionCajaId,
        monto_cierre: montoFinal,
        monto_contado: montoFinal,
        notas: `Cierre manual. Diferencia: ${formatCurrency(diferencia)}`
      })

      if (resultado) {
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
          description: `Monto contado: ${formatCurrency(montoFinal)}. Diferencia: ${formatCurrency(diferencia)}.`,
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

  // Búsqueda mejorada con múltiples criterios
  const productosFiltrados = (productos || []).filter((producto) => {
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

    // Filtrar productos sin stock (excepto servicios)
    const stockDisponible = producto.stock_disponible ?? producto.stock_actual ?? 0;
    const tieneStock = producto.es_servicio || stockDisponible > 0;

    // Filtrar productos sin precio válido (precio debe ser > 0)
    const tienePrecioValido = producto.precio_venta > 0;

    return coincideBusqueda && coincideCategoria && tieneStock && tienePrecioValido;
  });

  const categorias = [...new Set((productos || []).map((p) => p.categoria))];
  const metodoPagoActual = metodosPago.find(
    (m) => m.id === metodoPagoSeleccionado
  );
  const clienteActual = clientes.find((c) => c.id === clienteSeleccionado);

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

  // Mostrar loading mientras se cargan los datos iniciales
  if (isLoading || !datosInicializados) {
    return (
      <div className={posShellClass}>
        <div className="flex min-h-screen items-center justify-center">
          <div className={`${posPanelClass} w-full max-w-[460px] p-8 text-center`}>
            <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-100">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
            <h2 className="mb-2 text-2xl font-semibold text-white">Cargando POS...</h2>
            <p className="text-slate-400">Verificando estado de caja</p>
          </div>
        </div>
      </div>
    )
  }

  if (!posEnabled) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">POS no disponible</h1>
        <p className="text-slate-600 mt-2">
          El módulo POS está deshabilitado en este entorno.
        </p>
      </div>
    )
  }

  return (
    <>
      {!estadoCaja || estadoCaja.estado === 'CERRADA' ? (
        <div className={posShellClass}>
          <div className="flex min-h-screen items-center justify-center">
            <div className={`${posPanelClass} max-w-[500px] p-8 text-center`}>
              <div className="mb-8">
                <div className="mx-auto mb-8 flex size-[112px] items-center justify-center rounded-3xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-100 shadow-[0_22px_55px_rgba(8,145,178,0.18)]">
                  {hayCajasDisponibles ? <Lock className="h-14 w-14" /> : <AlertTriangle className="h-14 w-14" />}
                </div>
                <h2 className="mb-4 text-4xl font-bold text-slate-50">
                  {hayCajasDisponibles ? 'CAJA CERRADA' : 'SIN CAJA CONFIGURADA'}
                </h2>
                <p className="mb-8 text-slate-300">
                  {hayCajasDisponibles
                    ? 'Para usar el sistema POS, primero debe abrir la caja registradora con el monto inicial'
                    : 'No hay cajas registradoras configuradas. Vaya a Configuración para crear una caja primero.'}
                </p>
                {hayCajasDisponibles ? (
                  <button
                    onClick={abrirCaja}
                    className="flex w-full items-center justify-center gap-3 rounded-xl border border-cyan-300/30 bg-gradient-to-br from-blue-600 to-cyan-500 px-8 py-6 text-lg font-bold text-white shadow-[0_20px_45px_rgba(37,99,235,0.26)] transition hover:brightness-110"
                  >
                    <CircleDollarSign className="h-5 w-5" />
                    Abrir Caja Registradora
                  </button>
                ) : (
                  <a
                    href="/dashboard/wizard"
                    className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 px-8 py-6 text-center text-lg font-bold text-white no-underline shadow-lg transition hover:brightness-110"
                  >
                    <Settings className="h-5 w-5" />
                    Ir a Configuración
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Panel inline para abrir caja (evita doble modal superpuesto) */}
          {mostrarModalAbrirCaja && (
            <div className={`${posPanelClass} mx-auto mt-6 max-w-[500px] p-6`}>
              <h3 className="mb-4 flex items-center gap-2 text-2xl font-semibold text-white">
                <CircleDollarSign className="h-6 w-6 text-cyan-200" />
                Abrir Caja
              </h3>
              <label htmlFor="monto-inicial-caja" className="mb-2 block text-sm font-semibold text-slate-300">
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
      ) : (
        <div className={posShellClass}>
          {/* Header del POS empresarial */}
          <div className={posHeaderClass}>
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.07)_1px,transparent_1px)] bg-[length:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
            <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-cyan-300/30 bg-cyan-600/15 px-3 py-1 text-[0.72rem] font-extrabold uppercase tracking-[0.16em] text-cyan-100">
                Punto de venta conectado
              </div>
              <h1 className="text-4xl font-bold tracking-normal text-slate-50">
                Sistema POS Empresarial
              </h1>
              <p className="mt-2 text-lg text-slate-300">
                Caja: <span className="rounded-full border border-cyan-300/30 bg-cyan-500/15 px-3 py-1 text-sm font-bold text-cyan-100">{estadoCaja?.estado}</span> | Productos:{' '}
                <span className="font-semibold">{productosFiltrados.length}</span> | En Carrito:{' '}
                <span className="font-semibold">{carrito.length}</span>
              </p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={recargarProductos}
                className={`${posPrimaryButtonClass} inline-flex items-center gap-2`}
              >
                <RefreshCw className="h-4 w-4" />
                Sincronizar
              </button>
              <button
                onClick={() => router.push('/dashboard/cajas#cortes')}
                className={`${posSecondaryButtonClass} inline-flex items-center gap-2`}
              >
                <FileText className="h-4 w-4" />
                Ver cortes
              </button>
              <button
                onClick={cerrarCaja}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-300/35 bg-slate-900/75 px-4 py-3 font-semibold text-blue-100 shadow-[0_16px_34px_rgba(37,99,235,0.18)] transition hover:border-cyan-300/45 hover:bg-slate-800/90"
              >
                <Lock className="h-4 w-4" />
                Cerrar Caja
              </button>
            </div>
            </div>
          </div>

          {/* Configuration Warning Banner */}
          <ConfigStatusBanner
            onOpenWizard={() => window.location.href = '/dashboard/wizard'}
            configurationStatus={configurationStatus}
          />

          {/* Certificate Expiring Warning */}
          {configurationStatus &&
            configurationStatus.certificate.isValid &&
            configurationStatus.certificate.expiresAt && (
              (() => {
                const daysUntilExpiration = Math.floor(
                  (new Date(configurationStatus.certificate.expiresAt).getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24)
                );
                return daysUntilExpiration < 30 && daysUntilExpiration > 0 ? (
                  <div className="mb-6 flex items-center gap-4 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-6 py-4 text-cyan-50">
                    <AlertTriangle className="h-7 w-7 text-cyan-100" />
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

          <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]">
            {/* Panel Izquierdo - Productos */}
            <div className="flex min-w-0 flex-col gap-4 2xl:row-span-3">
              {/* Filtros y Búsqueda */}
              <div className={`${posPanelClass} p-5`}>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div>
                    <label htmlFor="pos-busqueda" className="sr-only">Buscar productos</label>
                    <input
                      id="pos-busqueda"
                      name="pos-busqueda"
                      type="text"
                      placeholder="🔍 Buscar por nombre, código o código de barras..."
                      value={busqueda}
                      list="pos-busqueda-options"
                      onChange={(e) => setBusqueda(e.target.value)}
                      className={`${posInputClass} w-full p-4 text-base`}
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
                    className={`${posInputClass} w-full p-4`}
                  >
                    <option value="">Todas las categorías</option>
                    {categorias.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Panel de Herramientas Avanzadas */}
              <div className={`${posPanelClass} p-4`}>
                <div className="flex flex-wrap items-center gap-4">
                  {/* Estado de Venta */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Estado:</span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        estadoVentaActual.estado === 'EN_PROGRESO'
                          ? 'border border-cyan-300/25 bg-cyan-400/10 text-cyan-100'
                          : estadoVentaActual.estado === 'PENDIENTE_PAGO'
                            ? 'border border-blue-300/25 bg-blue-400/10 text-blue-100'
                            : estadoVentaActual.estado === 'PAGADA'
                              ? 'border border-cyan-300/25 bg-cyan-400/10 text-cyan-100'
                              : 'border border-slate-300/25 bg-slate-400/10 text-slate-100'
                      }`}
                    >
                      {estadoVentaActual.estado.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Búsqueda por Código de Barras */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="pos-codigo-barras" className="sr-only">Código de barras</label>
                    <input
                      id="pos-codigo-barras"
                      name="pos-codigo-barras"
                      type="text"
                      placeholder="📱 Código de barras"
                      value={busquedaPorCodigoBarras}
                      onChange={(e) => setBusquedaPorCodigoBarras(e.target.value)}
                      className={`${posInputClass} w-[150px] p-2 text-sm`}
                    />
                  </div>

                  {/* Descuento Global */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="pos-descuento-tipo" className="text-sm font-semibold">Desc:</label>
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
                      className={`${posInputClass} p-2 text-sm`}
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
                      className={`${posInputClass} w-20 p-2 text-sm`}
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
                      ⚡ Rápida
                    </label>

                  </div>
                </div>
              </div>

              {/* Grid de Productos */}
              <div
                className={`${posPanelClass} min-h-[720px] flex-1 overflow-y-auto p-5`}
              >
                <ProductGrid
                  productos={productosFiltrados}
                  onAgregar={agregarAlCarrito}
                  productoSeleccionado={productoSeleccionado}
                  onSeleccionar={setProductoSeleccionado}
                />
              </div>
            </div>

            {/* Panel Central - Detalles de Venta */}
            <div
              className={`${posPanelClass} flex min-w-0 flex-col overflow-hidden 2xl:col-start-2 2xl:row-start-1`}
            >
              {/* Header del Carrito */}
              <div
                className="border-b border-white/15 bg-gradient-to-br from-blue-600 to-cyan-500 p-4 text-center text-white"
              >
                <h2 className="text-xl font-bold">Carrito</h2>
              </div>

              {/* Lista de Items en Carrito */}
              <div className="flex-1 overflow-y-auto p-4">
                {carrito.length === 0 ? (
                  <div className="flex min-h-[170px] flex-col items-center justify-center text-center text-slate-400">
                    <span className="mb-4 text-5xl">🛍️</span>
                    <p>El carrito está vacío</p>
                    <p className="text-sm">Agregue productos desde el catálogo</p>
                  </div>
                ) : (
                  carrito.map((item) => (
                    <div
                      key={item.producto.id}
                      className="mb-4 flex items-center gap-4 rounded-xl border border-cyan-400/15 bg-slate-900/70 p-4 text-slate-100"
                    >
                      <div className="shrink-0">
                        {item.producto.imagen_url ? (
                          <Image
                            src={item.producto.imagen_url}
                            alt={item.producto.nombre}
                            width={60}
                            height={60}
                            unoptimized
                            className="size-[60px] rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex size-[60px] items-center justify-center rounded-lg bg-slate-800 text-2xl">
                            📦
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-semibold">
                          {item.producto.nombre}
                        </h4>
                          <p className="text-xs text-cyan-300">
                            {formatCurrency(item.precio_unitario)}
                          </p>
                        <p className="m-0 text-[0.7rem] text-slate-400">
                          Stock: {item.producto.stock_disponible ?? item.producto.stock_actual ?? 0}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <button
                            className={posTinyButtonClass}
                            onClick={() => aplicarDescuentoRapido(item.producto.id, 5)}
                          >
                            -5%
                          </button>
                          <button
                            className={posTinyButtonClass}
                            onClick={() => aplicarDescuentoRapido(item.producto.id, 10)}
                          >
                            -10%
                          </button>
                          <button
                            className={posTinyButtonClass}
                            onClick={() => aplicarDescuentoRapido(item.producto.id, 0)}
                          >
                            ↺
                          </button>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => actualizarCantidad(item.producto.id, item.cantidad - 1)}
                            className="btn-icon"
                          >
                            -
                          </button>
                          <span>{item.cantidad}</span>
                          <button
                            onClick={() => actualizarCantidad(item.producto.id, item.cantidad + 1)}
                            className="btn-icon"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="text-right">
                          <p className="text-sm font-bold">
                            {formatCurrency(item.subtotal)}
                          </p>
                        <button
                          onClick={() => eliminarDelCarrito(item.producto.id)}
                          className="btn-icon-danger"
                          title="Eliminar producto del carrito"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer del Carrito (Resumen) */}
              {carrito.length > 0 && (
                <div
                  className="border-t border-cyan-400/15 bg-slate-950/80 p-6 text-blue-100"
                >
                  <div
                    className="mb-3 flex justify-between text-sm"
                  >
                    <span>Subtotal</span>
                    <span>{formatCurrency(calcularSubtotal())}</span>
                  </div>
                  <div
                    className="mb-3 flex justify-between text-sm"
                  >
                    <span>Descuentos</span>
                    <span className="text-blue-200">
                      - {formatCurrency(calcularDescuentoTotal())}
                    </span>
                  </div>
                  <div
                    className="mb-4 flex justify-between text-sm"
                  >
                    <span>{taxLabel}</span>
                    <span>{formatCurrency(calcularImpuestos())}</span>
                  </div>
                  <div
                    className="flex justify-between border-t-2 border-dashed border-cyan-300/25 pt-4 text-2xl font-bold text-cyan-100"
                  >
                    <span>TOTAL</span>
                    <span>{formatCurrency(calcularTotal())}</span>
                  </div>

                  {/* GRE Indicator */}
                {greEnabled && calcularTotal() > greThreshold && (
                    <div className="mt-4 flex items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-3">
                      <span className="text-xl">📦</span>
                      <div className="flex-1">
                        <p className="m-0 text-xs font-bold text-cyan-100">
                          GRE Automática
                        </p>
                        <p className="m-0 text-[0.7rem] text-slate-300">
                          Se generará Guía de Remisión (&gt; {formatCurrency(greThreshold)})
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Panel Derecho - Cliente y Pago */}
            <div
              className="flex min-h-[470px] min-w-0 flex-col gap-4 2xl:col-start-2 2xl:row-start-2"
            >
              {/* Selección de Cliente y Tipo de Comprobante */}
              <div
                className={`${posPanelClass} p-6`}
              >
                <h3 id="cliente-section-title" className="mb-4 font-bold">👤 Cliente</h3>
                <div className="mb-3 flex gap-2">
                  <label htmlFor="pos-cliente" className="sr-only">Seleccionar cliente</label>
                  <select
                    id="pos-cliente"
                    name="pos-cliente"
                    value={clienteSeleccionado}
                    onChange={(e) => setClienteSeleccionado(e.target.value)}
                    aria-labelledby="cliente-section-title"
                    className={`${posInputClass} flex-1 p-3`}
                  >
                    <option value="">-- Seleccionar cliente --</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {(c.razon_social || `${c.nombres || ''} ${c.apellidos || ''}`.trim() || 'Cliente')} - {getClienteDocumento(c)}
                      </option>
                    ))}
                  </select>
                </div>
                {clienteActual && (
                  <div className="mb-3 rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-3 text-sm">
                    <div className="flex items-center gap-2 font-semibold text-cyan-100">
                      <Check className="h-4 w-4" />
                      {clienteActual.razon_social || `${clienteActual.nombres || ''} ${clienteActual.apellidos || ''}`.trim()}
                    </div>
                    <div className="mt-1 text-xs text-slate-300">
                      {clienteActual.tipo_documento}: {getClienteDocumento(clienteActual)}
                    </div>
                  </div>
                )}
                {!clienteActual && (
                  <button
                    className={`${posSecondaryButtonClass} mb-3 w-full`}
                    onClick={() => window.open('/dashboard/ventas/clientes', '_blank')}
                  >
                    ➕ Crear nuevo cliente
                  </button>
                )}

                {/* Tipo de Comprobante */}
                <div className="mt-3">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/80">
                    Tipo de Comprobante
                  </label>
                  <div className="flex gap-2">
                    <button
                      className={`flex-1 ${tipoComprobante === '03' ? posPrimaryButtonClass : posSecondaryButtonClass}`}
                      onClick={() => setTipoComprobante('03')}
                    >
                      🧾 Boleta
                    </button>
                    <button
                      className={`flex-1 ${tipoComprobante === '01' ? posPrimaryButtonClass : posSecondaryButtonClass}`}
                      onClick={() => setTipoComprobante('01')}
                        disabled={!clienteActual || clienteActual.tipo_documento !== documentoFiscal}
                        title={!clienteActual || clienteActual.tipo_documento !== documentoFiscal ? `Factura requiere cliente con ${documentoFiscal}` : ''}
                    >
                      📋 Factura
                    </button>
                  </div>
                    {tipoComprobante === '01' && clienteActual?.tipo_documento !== documentoFiscal && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-blue-100">
                        <AlertTriangle className="h-3 w-3" />
                        Factura requiere cliente con {documentoFiscal}
                      </p>
                    )}
                </div>
              </div>

              {/* Métodos de Pago */}
              <div
                className={`${posPanelClass} flex-1 p-6`}
              >
                <h3 className="mb-4 font-bold">💳 Pago</h3>
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-300">Modo de pago</span>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pagosMixtos}
                      onChange={(e) => {
                        const next = e.target.checked
                        setPagosMixtos(next)
                        if (next) {
                          if (pagos.length === 0) {
                            setPagos([{ metodo_pago_id: '', monto: '', referencia: '' }])
                          }
                          setMetodoPagoSeleccionado('')
                          setReferenciaPago('')
                        } else {
                          setPagos([])
                        }
                      }}
                    />
                    Pago mixto
                  </label>
                </div>
                {!pagosMixtos ? (
                  <>
                    <div className="mb-4 grid grid-cols-2 gap-4">
                      {metodosPago.map((metodo) => (
                        <button
                          key={metodo.id}
                          onClick={() => setMetodoPagoSeleccionado(metodo.id)}
                        className={metodoPagoSeleccionado === metodo.id ? posPrimaryButtonClass : posSecondaryButtonClass}
                        >
                          {metodo.nombre}
                        </button>
                      ))}
                    </div>
                    {metodoPagoActual?.requiere_referencia && (
                      <input
                        type="text"
                        value={referenciaPago}
                        onChange={(e) => setReferenciaPago(e.target.value)}
                        placeholder="N° de referencia / operación"
                        className={`${posInputClass} w-full p-3`}
                      />
                    )}
                  </>
                ) : (
                  <div className="flex flex-col gap-3">
                    {pagos.map((pago, index) => {
                      const metodo = metodosPago.find((m) => m.id === pago.metodo_pago_id)
                      return (
                        <div
                          key={`pago-${index}`}
                          className="grid grid-cols-[1fr_0.8fr_auto] items-center gap-2"
                        >
                          <select
                            value={pago.metodo_pago_id}
                            onChange={(e) => actualizarPago(index, 'metodo_pago_id', e.target.value)}
                            className={`${posInputClass} p-2`}
                          >
                            <option value="">-- Método --</option>
                            {metodosPago.map((metodoPago) => (
                              <option key={metodoPago.id} value={metodoPago.id}>
                                {metodoPago.nombre}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={pago.monto}
                            onChange={(e) => actualizarPago(index, 'monto', e.target.value)}
                            placeholder={`${currencySymbol} 0.00`}
                            className={`${posInputClass} p-2`}
                          />
                          <button
                            type="button"
                            onClick={() => eliminarPago(index)}
                            className={posTinyButtonClass}
                          >
                            🗑️
                          </button>
                          {metodo?.requiere_referencia && (
                            <input
                              type="text"
                              value={pago.referencia || ''}
                              onChange={(e) => actualizarPago(index, 'referencia', e.target.value)}
                              placeholder="Referencia"
                              className={`${posInputClass} col-span-3 p-2`}
                            />
                          )}
                        </div>
                      )
                    })}
                    <button
                      type="button"
                      onClick={agregarPago}
                      className={`${posSecondaryButtonClass} w-full`}
                    >
                      ➕ Agregar pago
                    </button>
                    <div className="flex justify-between text-sm">
                      <span>Total pagos</span>
                      <strong>{formatCurrency(totalPagosMixtos)}</strong>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Restante</span>
                      <strong>{formatCurrency(Math.max(0, calcularTotal() - totalPagosMixtos))}</strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Acciones Finales */}
              <div className="flex flex-col gap-4">
                <button
                  onClick={procesarVenta}
                  disabled={
                    procesandoVenta
                  || carrito.length === 0
                  || (!pagosMixtos && !metodoPagoSeleccionado)
                  || (pagosMixtos && pagos.length === 0)
                  }
                  className="rounded-xl border border-cyan-300/30 bg-gradient-to-br from-blue-600 to-cyan-500 p-6 text-xl font-bold text-white shadow-[0_18px_36px_rgba(37,99,235,0.26)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {procesandoVenta ? 'Procesando venta...' : `Procesar Venta (${formatCurrency(calcularTotal())})`}
                </button>
                <div className="flex gap-4">
                  <button
                    className={`${posSecondaryButtonClass} flex-1`}
                    onClick={() => setCarrito([])}
                  >
                    Cancelar
                  </button>
                  <button className={`${posSecondaryButtonClass} flex-1`}>
                    Guardar
                  </button>
                </div>
              </div>
            </div>

            {/* Historial de Ventas Recientes */}
            <div
              className={`${posPanelClass} p-6 2xl:col-span-2`}
            >
              <h3 className="mb-4 font-bold">📊 Historial de Ventas del Día</h3>
              <div className="max-h-[200px] overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-cyan-400/10 text-slate-300">
                      <th className="p-3 text-left">Ticket</th>
                      <th className="p-3 text-left">Cliente</th>
                      <th className="p-3 text-right">Total</th>
                      <th className="p-3 text-center">Estado</th>
                      <th className="p-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historialVentas.map((venta: any) => (
                      <tr
                        key={venta.id}
                        className={`border-b border-cyan-400/10 ${facturaSeleccionada?.id === venta.id ? 'bg-blue-500/15' : 'bg-transparent'}`}
                      >
                        <td className="p-3">
                          {venta.numero_venta || venta.numero_ticket || `#${venta.id}`}
                        </td>
                        <td className="p-3">{venta.cliente_nombre || 'General'}</td>
                        <td className="p-3 text-right font-bold">
                          {formatCurrency(venta.total)}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`rounded-full border px-2 py-1 text-xs ${venta.estado === 'PAGADA' ? 'border-cyan-300/25 bg-cyan-400/15 text-cyan-100' : 'border-blue-300/25 bg-blue-400/15 text-blue-100'}`}
                          >
                            {venta.estado}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button onClick={() => handleVerFactura(venta)} className="btn-icon">
                            👁️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Modal de Factura Detallada */}
          {facturaSeleccionada && (
            <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/75 p-8">
              <div className="flex max-h-[90vh] w-[800px] max-w-[90vw] flex-col rounded-lg bg-white text-slate-700 shadow-2xl">
                {/* Header del Modal */}
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                  <h2 className="text-xl font-semibold text-slate-950">
                    Vista Previa del Comprobante
                  </h2>
                  <button
                    onClick={() => setFacturaSeleccionada(null)}
                    className="border-0 bg-transparent text-2xl leading-none text-slate-500 transition hover:text-slate-900"
                  >
                    &times;
                  </button>
                </div>

                {/* Contenido de la Factura (Scrollable) */}
                <div className="overflow-y-auto p-8 font-sans text-slate-700">
                  {/* Encabezado del Documento */}
                  <div className="flex justify-between gap-6 pb-6">
                    <div>
                      {empresaInfo?.logo_url ? (
                        <Image
                          src={empresaInfo.logo_url}
                          alt="Logo de la empresa"
                          width={160}
                          height={60}
                          unoptimized
                          className="mb-4 h-auto max-h-[60px] w-auto object-contain"
                        />
                      ) : (
                        <h1 className="text-2xl font-bold text-slate-950">
                          {empresaInfo?.nombre_comercial || 'Mi Empresa'}
                        </h1>
                      )}
                      <p className="text-sm">{empresaInfo?.direccion || 'Dirección de la Empresa'}</p>
                      <p className="text-sm">Email: {empresaInfo?.email || 'email@empresa.com'}</p>
                      <p className="text-sm">Teléfono: {empresaInfo?.telefono || '987654321'}</p>
                    </div>
                    <div className="w-[250px] rounded-lg border-2 border-slate-200 p-4 text-center">
                      <h2 className="text-lg font-bold uppercase text-slate-950">
                        R.U.C. {empresaInfo?.ruc || '20000000001'}
                      </h2>
                      <h3 className="my-2 rounded bg-slate-100 p-2 text-base font-semibold uppercase text-slate-800">
                        {facturaSeleccionada.tipo_comprobante || 'Factura de Venta'}
                      </h3>
                      <p className="text-base font-bold text-blue-700">
                        N° {facturaSeleccionada.numero_venta || '001-0001'}
                      </p>
                    </div>
                  </div>

                  {/* Datos del Cliente y Venta */}
                  <div className="mb-6 grid grid-cols-2 gap-8 border-y border-slate-200 py-4">
                    <div>
                      <p><strong>Cliente:</strong> {facturaSeleccionada.cliente_nombre || 'Cliente General'}</p>
                        <p><strong>Documento:</strong> {facturaSeleccionada.cliente_documento || 'Sin documento'}</p>
                    </div>
                    <div>
                      <p><strong>Fecha de Emisión:</strong> {new Date(facturaSeleccionada.fecha || facturaSeleccionada.created_at).toLocaleDateString('es-PE')}</p>
                      <p><strong>Forma de Pago:</strong> {facturaSeleccionada.metodo_pago_nombre || 'Contado'}</p>
                    </div>
                  </div>

                  {/* Tabla de Items */}
                  {loadingFactura ? (
                    <p className="p-8 text-center">Cargando detalles...</p>
                  ) : (
                    <table className="w-full border-collapse text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="p-3 text-left font-semibold">CÓDIGO</th>
                          <th className="p-3 text-left font-semibold">DESCRIPCIÓN</th>
                          <th className="p-3 text-right font-semibold">CANT.</th>
                          <th className="p-3 text-right font-semibold">P. UNIT.</th>
                          <th className="p-3 text-right font-semibold">TOTAL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detallesFactura.map(item => (
                          <tr key={item.id} className="border-b border-slate-100">
                            <td className="p-3">{item.codigo_producto}</td>
                            <td className="p-3">{item.descripcion}</td>
                            <td className="p-3 text-right">{item.cantidad}</td>
                            <td className="p-3 text-right">{formatCurrency(item.precio_unitario)}</td>
                            <td className="p-3 text-right">{formatCurrency(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* Totales */}
                  <div className="mt-6 flex justify-end">
                    <div className="w-[280px] text-sm">
                      <div className="flex justify-between p-2">
                        <span>Subtotal:</span>
                        <strong>{formatCurrency(facturaSeleccionada.subtotal || 0)}</strong>
                      </div>
                      <div className="flex justify-between p-2">
                        <span>Descuentos:</span>
                        <strong>- {formatCurrency(facturaSeleccionada.descuentos || 0)}</strong>
                      </div>
                      <div className="flex justify-between p-2">
                        <span>{taxLabel}:</span>
                        <strong>{formatCurrency(facturaSeleccionada.impuestos || 0)}</strong>
                      </div>
                      <div className="mt-2 flex justify-between border-t-2 border-slate-300 px-2 py-3 text-lg font-bold text-slate-950">
                        <span>TOTAL:</span>
                        <span>{formatCurrency(facturaSeleccionada.total || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer del Modal */}
                <div className="flex justify-end gap-4 border-t border-slate-200 bg-slate-50 px-6 py-4">
                  <button
                    onClick={() => setFacturaSeleccionada(null)}
                    className="rounded-md border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Cerrar
                  </button>
                  <button className="rounded-md border border-blue-600 bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700">
                    🖨️ Imprimir
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Cierre de Caja */}
          {mostrarModalCerrarCaja && (
            <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/80 p-8 backdrop-blur">
              <div className="relative w-full max-w-[450px] rounded-3xl border border-cyan-400/25 bg-slate-950/95 p-8 text-slate-100 shadow-2xl shadow-blue-950/40 backdrop-blur-xl">
                <div className="absolute inset-x-0 top-0 h-1 rounded-t-3xl bg-gradient-to-r from-blue-600 to-cyan-500" />
                <h3 className="mb-6 flex items-center gap-2 text-2xl font-bold text-white">
                  <Lock className="h-6 w-6 text-cyan-200" />
                  Cerrar Caja
                </h3>

                <div className="mb-6 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                  <p className="m-0 text-sm text-cyan-50">
                    <strong>Monto inicial:</strong> {formatCurrency(estadoCaja?.montoInicial || 0)}
                  </p>
                </div>

                <label
                  htmlFor="monto-contado-cierre"
                  className="mb-2 block font-semibold text-slate-300"
                >
                  Ingrese el monto contado en caja:
                </label>
                <input
                  id="monto-contado-cierre"
                  name="monto-contado-cierre"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={montoContadoInput}
                  onChange={(e) => setMontoContadoInput(e.target.value)}
                  placeholder="0.00"
                  className={`${posInputClass} mb-4 w-full p-4 text-xl`}
                  autoFocus
                />

                {montoContadoInput && (
                  <div
                    className="mb-6 rounded-xl border border-cyan-400/20 bg-white/[0.04] p-4"
                  >
                    <p className="m-0 text-sm text-cyan-50">
                      <strong>Diferencia:</strong> {formatCurrency(parseFloat(montoContadoInput || '0') - (estadoCaja?.montoInicial || 0))}
                    </p>
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    onClick={confirmarCerrarCaja}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-gradient-to-br from-blue-600 to-cyan-500 p-4 text-base font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110"
                  >
                    <Check className="h-4 w-4" />
                    Confirmar Cierre
                  </button>
                  <button
                    onClick={() => {
                      setMostrarModalCerrarCaja(false)
                      setMontoContadoInput('')
                    }}
                    className="flex-1 rounded-xl border border-slate-400/25 bg-slate-900/75 p-4 text-base font-semibold text-blue-100 transition hover:border-cyan-300/45 hover:bg-slate-800/90"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

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
