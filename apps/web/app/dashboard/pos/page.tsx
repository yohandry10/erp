'use client'

import React, { useState, useEffect, useRef } from 'react'
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
import './pos-styles.css'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'

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
  numero_documento: string
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

export default function POSPage() {
  const posEnabled = process.env.NEXT_PUBLIC_FEATURE_POS_ENABLED === 'true'
  if (!posEnabled) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">POS no disponible</h1>
        {/* // HARDENING: POS deshabilitado por feature flag. */}
        <p className="text-slate-600 mt-2">
          El módulo POS está deshabilitado en este entorno.
        </p>
      </div>
    )
  }

  const api = useApi()
  const { user } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

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
  }, []);

  const cargarDatos = async () => {
    console.log('🔄 Cargando datos POS empresarial...')
    setIsLoading(true)
    try {
      // Cargar productos usando el endpoint del API corregido
      const productosResponse = await api.get('/api/pos/productos');
      console.log('📦 Respuesta completa del API:', productosResponse);
      const productosData = productosResponse?.data || [];
      console.log('📦 Productos extraídos:', productosData);
      setProductos(productosData);

      // Check configuration status
      try {
        const configResponse = await api.get('/api/pos/configuration-status');
        console.log('⚙️ Configuration status:', configResponse);
        if (configResponse?.success && configResponse?.data) {
          // Convertir expiresAt de string a Date si existe
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

          // Show warning if configuration is incomplete
          if (!configResponse.data.isComplete) {
            console.warn('⚠️ Configuración incompleta:', configResponse.data.missingItems);
          }
        }
      } catch (configError) {
        console.error('❌ Error checking configuration status:', configError);
      }

      // Fetch GRE threshold configuration
      try {
        const greConfigResponse = await api.get('/api/configuration/gre-thresholds');
        console.log('📦 GRE config:', greConfigResponse);
        if (greConfigResponse?.success && greConfigResponse?.data) {
          setGreThreshold(greConfigResponse.data.umbralGREAutomatico || 700);
          setGreEnabled(greConfigResponse.data.greAutomaticoHabilitado !== false);
        }
      } catch (greError) {
        console.error('❌ Error fetching GRE config:', greError);
      }

      // Paralelizar las demás cargas de datos usando API backend (asegura contexto multi-tenant)
      const [
        clientesRes,
        metodosPagoRes,
        empresaRes,
        ventasRecientesRes,
      ] = await Promise.all([
        api.get('/api/pos/clientes'),
        api.get('/api/pos/metodos-pago'),
        api.get('/api/pos/empresa-config'),
        api.get('/api/pos/ventas-recientes'),
      ]);

      if (clientesRes?.success) {
        setClientes(clientesRes.data || []);
      } else {
        console.warn('⚠️ No se pudieron cargar clientes POS');
        setClientes([]);
      }

      if (metodosPagoRes?.success) {
        setMetodosPago(metodosPagoRes.data || []);
      } else {
        console.warn('⚠️ No se pudieron cargar métodos de pago POS');
        setMetodosPago([]);
      }

      // Obtener cajas y sesión abierta (nuevo endpoint)
      try {
        const cajasRes = await api.get('/cajas');
        const cajas = cajasRes?.data || [];
        
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
          const sesionRes = await api.get('/api/pos/sesion-caja');
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

      if (empresaRes?.success) {
        setEmpresaInfo(empresaRes.data);
      } else {
        setEmpresaInfo(null);
      }

      if (ventasRecientesRes?.success) {
        setHistorialVentas(ventasRecientesRes.data || []);
      } else {
        setHistorialVentas([]);
      }

      await recargarHistorialVentas();

      console.log(`✅ POS cargado: ${productosData.length} productos disponibles`);
      setDatosInicializados(true)
      setIsLoading(false)

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
  }

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
      const detallesResponse = await api.post(`/api/pos/detalles-venta/${venta.id}`, { venta_id: venta.id });

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

        const precioConDescuento = item.precio_original - (descuentoMonto / item.cantidad)

        return {
          ...item,
          descuento_porcentaje: descuento.tipo === 'PORCENTAJE' ? descuento.valor : 0,
          descuento_monto: descuentoMonto,
          precio_unitario: Math.max(0, precioConDescuento),
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
    if (cliente?.tipo_documento === 'RUC' && producto.precio_mayorista) {
      return producto.precio_mayorista // Precio mayorista para empresas
    }

    if (producto.precio_especial && Math.random() > 0.7) {
      return producto.precio_especial // Precio especial aleatorio (simula promociones)
    }

    return producto.precio_venta
  }

  const agregarAlCarrito = (producto: ProductoPOS) => {
    const stockDisponible = producto.stock_disponible ?? producto.stock_actual ?? 0

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

    // Validar límite de items SUNAT (max 999 items)
    const totalItems = carrito.reduce((sum, item) => sum + item.cantidad, 0)
    const itemExistente = carrito.find(item => item.producto.id === producto.id)
    const nuevaCantidadTotal = itemExistente ? totalItems + 1 : totalItems + 1

    if (nuevaCantidadTotal > 999) {
      toast({
        variant: 'destructive',
        title: '❌ Límite de items excedido',
        description: `SUNAT permite máximo 999 items. Actualmente tiene ${totalItems} items.`,
      })
      return
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
            precio_unitario: precioFinal,
            precio_original: producto.precio_venta,
            descuento_porcentaje: precioFinal < producto.precio_venta ? ((producto.precio_venta - precioFinal) / producto.precio_venta * 100) : 0,
            descuento_monto: precioFinal < producto.precio_venta ? ((producto.precio_venta - precioFinal) * (item.cantidad + 1)) : 0,
            subtotal: (item.cantidad + 1) * precioFinal
          }
          : item
      ))
    } else {
      setCarrito([...carrito, {
        producto,
        cantidad: 1,
        precio_unitario: precioFinal,
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

      setCarrito(carrito.map(item =>
        item.producto.id === productoId
          ? { ...item, cantidad: nuevaCantidad, subtotal: nuevaCantidad * item.precio_unitario }
          : item
      ))
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
    // 1. Validaciones iniciales
    if (carrito.length === 0) {
      toast({
        variant: 'destructive',
        title: '❌ Carrito vacío',
        description: 'Agregue productos antes de procesar la venta.',
      })
      return
    }

    if (!clienteSeleccionado || !metodoPagoSeleccionado) {
      toast({
        variant: 'destructive',
        title: '❌ Datos incompletos',
        description: 'Seleccione cliente y método de pago.',
      })
      return
    }

    // Validar documento de cliente seleccionado
    const clienteActual = clientes.find(c => c.id === clienteSeleccionado)
    const documento = (clienteActual?.numero_documento || '').trim()
    if (!documento || documento.length < 8) {
      toast({
        variant: 'destructive',
        title: '❌ Documento inválido',
        description: 'Seleccione un cliente con documento válido (mínimo 8 dígitos).',
      })
      return
    }

    // Validar que Factura requiere RUC
    if (tipoComprobante === '01' && clienteActual?.tipo_documento !== 'RUC') {
      toast({
        variant: 'destructive',
        title: '❌ Factura requiere RUC',
        description: 'Para emitir Factura, el cliente debe tener RUC.',
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

    // 2. Validaciones SUNAT antes de procesar
    const totalItems = carrito.reduce((sum, item) => sum + item.cantidad, 0)
    if (totalItems > 999) {
      toast({
        variant: 'destructive',
        title: '❌ Validación SUNAT fallida',
        description: `El documento tiene ${totalItems} items. Máximo permitido: 999.`,
      })
      return
    }

    const totalVenta = calcularTotal()
    // SUNAT limit for boletas without RUC is S/ 700
    const esBoletaSinRuc = clienteActual?.tipo_documento !== 'RUC'

    if (esBoletaSinRuc && totalVenta > 700) {
      // Para ventas > S/700 sin RUC, mostrar advertencia pero continuar
      toast({
        title: '⚠️ Advertencia SUNAT',
        description: `Venta > S/ 700 sin RUC. Se generará GRE automáticamente.`,
      })
    }

    // Check configuration status before processing
    if (configurationStatus && !configurationStatus.isComplete) {
      toast({
        title: '⚠️ Configuración incompleta',
        description: 'La venta puede fallar. Revise la configuración.',
      })
    }

    let resultado: any = null;
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

      const ventaData = {
        idempotency_key: idempotencyKey,
        sesion_caja_id: sesionCajaId,
        cliente_id: clienteSeleccionado,
        cliente_nombre: clienteActual?.razon_social || `${clienteActual?.nombres || ''} ${clienteActual?.apellidos || ''}`.trim() || 'Cliente General',
        cliente_documento: clienteActual?.numero_documento || '00000000',
        metodo_pago_id: metodoPagoSeleccionado,
        referencia_pago: referenciaPago,
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
        descuento_global: descuentoGlobal,
        impuestos: calcularImpuestos(),
        total: calcularTotal(),
        comprobante: comprobante,
        modo_venta_rapida: modoVentaRapida,
        permite_venta_sin_stock: ventaSinStock
      }

      // 5. Procesar venta en backend con 1 reintento en caso de error de red
      console.log('📤 Enviando venta al backend...', ventaData)
      let resultado: any = null;

      const enviarVenta = async () => {
        console.log('🔄 Iniciando llamada API...')
        const resp = await api.post('/api/pos/venta', ventaData)
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
        setDescuentoGlobal({ tipo: 'PORCENTAJE', valor: 0, descripcion: '' })
        setCurrentIdempotencyKey(null)

        // 8. SOLO recargar historial de ventas (NO cargar todos los datos para mantener caja abierta)
        console.log('🔄 Recargando historial de ventas...')
        await recargarHistorialVentas().catch(err => console.warn('⚠️ Error recargando historial:', err))

        // 9. Mostrar modal de venta exitosa con opción de imprimir
        console.log('✅ Venta procesada exitosamente:', resultado)
        const totalVenta = totalServidor ?? calcularTotal()
        
        // Preparar datos para el modal de éxito
        setVentaExitosaData({
          venta_id: ventaInfo.venta_id,
          numero_ticket: ventaInfo.numero_ticket || comprobante.numero,
          total: totalVenta,
          subtotal: subtotalServidor ?? calcularSubtotal(),
          impuestos: impuestosServidor ?? calcularImpuestos(),
          estado: ventaInfo.estado || 'PAGADA',
          factura_electronica: ventaInfo.factura_electronica || false,
          cpe_id: ventaInfo.cpe_id,
          cliente_nombre: clienteActual?.razon_social || clienteActual?.nombres || 'Cliente General',
          fecha: new Date().toISOString(),
        })
        setMostrarVentaExitosa(true)

        // 10. Resetear estado para nueva venta (mantener caja abierta)
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
    return subtotalConDescuentos * 0.18 // IGV 18%
  }

  const calcularTotal = () => {
    const subtotal = calcularSubtotal()
    const impuestos = calcularImpuestos()
    const descuentoGlobalMonto = descuentoGlobal.tipo === 'PORCENTAJE'
      ? (subtotal * descuentoGlobal.valor / 100)
      : descuentoGlobal.valor

    return Math.max(0, subtotal + impuestos - descuentoGlobalMonto)
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
          description: `Caja abierta con S/ ${formatMoney(montoInicial)}.`,
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
        notas: `Cierre manual. Diferencia: S/ ${formatMoney(diferencia)}`
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
          description: `Monto contado: S/ ${formatMoney(montoFinal)}. Diferencia: S/ ${formatMoney(diferencia)}.`,
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
    const lineas = carrito.slice(0, 5).map(
      (item) => `• ${item.producto.nombre} x${item.cantidad} - S/ ${formatMoney(item.subtotal)}`
    )
    const extra = carrito.length > 5 ? `… y ${carrito.length - 5} ítems más` : ''
    return [
      `Hola ${clienteActual?.razon_social || clienteActual?.nombres || clienteActual?.apellidos || 'cliente'},`,
      `Detalle de tu compra en Neon System:`,
      ...lineas,
      extra,
      `Total: S/ ${formatMoney(calcularTotal())}`,
      `Método de pago: ${metodoPagoActual?.nombre || 'Sin seleccionar'}`,
      `Gracias por tu preferencia.`
    ]
      .filter(Boolean)
      .join('\n')
  }

  // Mostrar loading mientras se cargan los datos iniciales
  if (isLoading || !datosInicializados) {
    return (
      <div className="dashboard-container pos-page">
        <div className="min-h-screen flex items-center justify-center">
          <div className="stat-card" style={{ maxWidth: '400px', textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⏳</div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Cargando POS...</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Verificando estado de caja</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {!estadoCaja || estadoCaja.estado === 'CERRADA' ? (
        <div className="dashboard-container pos-page">
          <div className="min-h-screen flex items-center justify-center">
            <div className="stat-card" style={{ maxWidth: '500px', textAlign: 'center' }}>
              <div style={{ marginBottom: '2rem' }}>
                <div
                  style={{
                    width: '120px',
                    height: '120px',
                    margin: '0 auto 2rem',
                    background: hayCajasDisponibles ? 'var(--gradient-danger)' : 'var(--gradient-warning)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '4rem',
                  }}
                >
                  {hayCajasDisponibles ? '🔒' : '⚠️'}
                </div>
                <h2 className="dashboard-title" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
                  {hayCajasDisponibles ? 'CAJA CERRADA' : 'SIN CAJA CONFIGURADA'}
                </h2>
                <p className="dashboard-subtitle" style={{ marginBottom: '2rem' }}>
                  {hayCajasDisponibles 
                    ? 'Para usar el sistema POS, primero debe abrir la caja registradora con el monto inicial'
                    : 'No hay cajas registradoras configuradas. Vaya a Configuración para crear una caja primero.'}
                </p>
                {hayCajasDisponibles ? (
                  <button
                    onClick={abrirCaja}
                    className="btn btn-primary"
                    style={{
                      width: '100%',
                      padding: '1.5rem 2rem',
                      fontSize: '1.2rem',
                      background: 'var(--gradient-success)',
                    }}
                  >
                    💰 Abrir Caja Registradora
                  </button>
                ) : (
                  <a
                    href="/dashboard/wizard"
                    className="btn btn-primary"
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '1.5rem 2rem',
                      fontSize: '1.2rem',
                      background: 'var(--gradient-primary)',
                      textDecoration: 'none',
                      textAlign: 'center',
                    }}
                  >
                    ⚙️ Ir a Configuración
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Panel inline para abrir caja (evita doble modal superpuesto) */}
          {mostrarModalAbrirCaja && (
            <div className="stat-card" style={{ maxWidth: '500px', margin: '1.5rem auto 0', padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>💰 Abrir Caja</h3>
              <label htmlFor="monto-inicial-caja" style={{ display: 'block', marginBottom: '0.5rem' }}>Monto inicial (S/)</label>
              <input
                id="monto-inicial-caja"
                name="monto-inicial-caja"
                type="number"
                value={montoInicialInput}
                onChange={(e) => setMontoInicialInput(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1.2rem',
                  border: '2px solid var(--border-color)',
                  borderRadius: '8px',
                  marginBottom: '1rem'
                }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  className="btn"
                  onClick={confirmarAbrirCaja}
                  style={{
                    flex: 1,
                    padding: '1rem',
                    background: 'var(--gradient-success)',
                    color: 'white',
                    border: 'none'
                  }}
                >
                  ✅ Confirmar
                </button>
                <button
                  className="btn"
                  onClick={() => setMostrarModalAbrirCaja(false)}
                  style={{
                    flex: 1,
                    padding: '1rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="dashboard-container pos-page">
          {/* Header del POS empresarial */}
          <div className="dashboard-header pos-header">
            <div>
              <h1 className="dashboard-title" style={{ fontSize: '2.5rem' }}>
                🛒 Sistema POS Empresarial
              </h1>
              <p className="dashboard-subtitle">
                Caja: <span className="status-success">{estadoCaja?.estado}</span> | Productos:{' '}
                <span style={{ fontWeight: '600' }}>{productosFiltrados.length}</span> | En Carrito:{' '}
                <span style={{ fontWeight: '600' }}>{carrito.length}</span>
              </p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={recargarProductos}
                className="btn"
                style={{
                  background: 'var(--gradient-primary)',
                  color: 'white',
                  border: 'none',
                }}
              >
                🔄 Sincronizar
              </button>
              <button
                onClick={() => router.push('/dashboard/cajas#cortes')}
                className="btn"
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  padding: '0.8rem 1.2rem',
                }}
              >
                📄 Ver cortes
              </button>
              <button
                onClick={cerrarCaja}
                className="btn"
                style={{
                  background: 'var(--gradient-danger)',
                  color: 'white',
                  border: 'none',
                }}
              >
                🔒 Cerrar Caja
              </button>
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
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
                      border: '2px solid #FF9800',
                      borderRadius: 'var(--border-radius)',
                      padding: '1rem 1.5rem',
                      marginBottom: '1.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                    }}
                  >
                    <div style={{ fontSize: '2rem' }}>⏰</div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: 0, color: '#E65100', fontSize: '1.1rem', fontWeight: 'bold' }}>
                        Certificado Próximo a Vencer
                      </h3>
                      <p style={{ margin: '0.5rem 0 0 0', color: '#E65100' }}>
                        Su certificado digital vence en {daysUntilExpiration} días. Renuévelo pronto para evitar
                        interrupciones.
                      </p>
                    </div>
                  </div>
                ) : null;
              })()
            )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 350px 450px',
              gap: '1.5rem',
              height: 'calc(100vh - 250px)',
            }}
          >
            {/* Panel Izquierdo - Productos */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Filtros y Búsqueda */}
              <div className="stat-card" style={{ marginBottom: '1rem', padding: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="pos-busqueda" className="sr-only">Buscar productos</label>
                    <input
                      id="pos-busqueda"
                      name="pos-busqueda"
                      type="text"
                      placeholder="🔍 Buscar por nombre, código o código de barras..."
                      value={busqueda}
                      list="pos-busqueda-options"
                      onChange={(e) => setBusqueda(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '1rem',
                        border: '2px solid var(--primary-300)',
                        borderRadius: 'var(--border-radius)',
                        fontSize: '1rem',
                        background: 'white',
                      }}
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
                    style={{
                      padding: '1rem',
                      border: '2px solid var(--primary-300)',
                      borderRadius: 'var(--border-radius)',
                      minWidth: '180px',
                      background: 'white',
                    }}
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
              <div className="stat-card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                  {/* Estado de Venta */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>Estado:</span>
                    <span
                      style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        backgroundColor:
                          estadoVentaActual.estado === 'EN_PROGRESO'
                            ? 'var(--blue-100)'
                            : estadoVentaActual.estado === 'PENDIENTE_PAGO'
                              ? 'var(--amber-100)'
                              : estadoVentaActual.estado === 'PAGADA'
                                ? 'var(--emerald-100)'
                                : 'var(--red-100)',
                        color:
                          estadoVentaActual.estado === 'EN_PROGRESO'
                            ? 'var(--blue-800)'
                            : estadoVentaActual.estado === 'PENDIENTE_PAGO'
                              ? 'var(--amber-800)'
                              : estadoVentaActual.estado === 'PAGADA'
                                ? 'var(--emerald-800)'
                                : 'var(--red-800)',
                      }}
                    >
                      {estadoVentaActual.estado.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Búsqueda por Código de Barras */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label htmlFor="pos-codigo-barras" className="sr-only">Código de barras</label>
                    <input
                      id="pos-codigo-barras"
                      name="pos-codigo-barras"
                      type="text"
                      placeholder="📱 Código de barras"
                      value={busquedaPorCodigoBarras}
                      onChange={(e) => setBusquedaPorCodigoBarras(e.target.value)}
                      style={{
                        padding: '0.5rem',
                        border: '1px solid var(--primary-300)',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        width: '150px',
                      }}
                    />
                  </div>

                  {/* Descuento Global */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label htmlFor="pos-descuento-tipo" style={{ fontSize: '0.875rem', fontWeight: '600' }}>Desc:</label>
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
                      style={{
                        padding: '0.5rem',
                        border: '1px solid var(--primary-300)',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                      }}
                    >
                      <option value="PORCENTAJE">%</option>
                      <option value="MONTO_FIJO">S/</option>
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
                      style={{
                        padding: '0.5rem',
                        border: '1px solid var(--primary-300)',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        width: '80px',
                      }}
                    />
                  </div>

                  {/* Switches de Modo */}
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={modoVentaRapida}
                        onChange={(e) => setModoVentaRapida(e.target.checked)}
                        style={{ transform: 'scale(1.2)' }}
                      />
                      ⚡ Rápida
                    </label>

                  </div>
                </div>
              </div>

              {/* Grid de Productos */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  background:
                    'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
                  backdropFilter: 'blur(20px)',
                  borderRadius: 'var(--border-radius-xl)',
                  padding: '1.5rem',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  boxShadow: 'var(--shadow-xl)',
                }}
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
              style={{
                width: '350px',
                display: 'flex',
                flexDirection: 'column',
                background:
                  'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
                backdropFilter: 'blur(20px)',
                borderRadius: 'var(--border-radius-xl)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                boxShadow: 'var(--shadow-2xl)',
                overflow: 'hidden',
              }}
            >
              {/* Header del Carrito */}
              <div
                style={{
                  background: 'var(--gradient-primary)',
                  color: 'white',
                  padding: '1rem',
                  textAlign: 'center',
                }}
              >
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>🛒 Carrito</h2>
              </div>

              {/* Lista de Items en Carrito */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                {carrito.length === 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      color: 'var(--primary-500)',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛍️</span>
                    <p>El carrito está vacío</p>
                    <p style={{ fontSize: '0.875rem' }}>Agregue productos desde la izquierda</p>
                  </div>
                ) : (
                  carrito.map((item) => (
                    <div
                      key={item.producto.id}
                      className="stat-card"
                      style={{
                        padding: '1rem',
                        marginBottom: '1rem',
                        display: 'flex',
                        gap: '1rem',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ flexShrink: 0 }}>
                        {item.producto.imagen_url ? (
                          <img
                            src={item.producto.imagen_url}
                            alt={item.producto.nombre}
                            style={{
                              width: '60px',
                              height: '60px',
                              objectFit: 'cover',
                              borderRadius: 'var(--border-radius)',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '60px',
                              height: '60px',
                              background: 'var(--primary-100)',
                              borderRadius: 'var(--border-radius)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.5rem',
                            }}
                          >
                            📦
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4
                          style={{
                            fontWeight: '600',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontSize: '0.875rem',
                          }}
                        >
                          {item.producto.nombre}
                        </h4>
                        <p style={{ fontSize: '0.75rem', color: 'var(--primary-500)' }}>
                          S/ {formatMoney(item.precio_unitario)}
                        </p>
                        <p style={{ fontSize: '0.7rem', color: '#9CA3AF', margin: 0 }}>
                          Stock: {item.producto.stock_disponible ?? item.producto.stock_actual ?? 0}
                        </p>
                        <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0.25rem 0.4rem', fontSize: '0.7rem', minWidth: 'auto' }} 
                            onClick={() => aplicarDescuentoRapido(item.producto.id, 5)}
                          >
                            -5%
                          </button>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0.25rem 0.4rem', fontSize: '0.7rem', minWidth: 'auto' }} 
                            onClick={() => aplicarDescuentoRapido(item.producto.id, 10)}
                          >
                            -10%
                          </button>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0.25rem 0.4rem', fontSize: '0.7rem', minWidth: 'auto' }} 
                            onClick={() => aplicarDescuentoRapido(item.producto.id, 0)}
                          >
                            ↺
                          </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
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
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>
                          S/ {formatMoney(item.subtotal)}
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
                  style={{
                    padding: '1.5rem',
                    borderTop: '1px solid var(--primary-200)',
                    background: 'rgba(248, 250, 252, 0.7)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.75rem',
                      fontSize: '0.875rem',
                    }}
                  >
                    <span>Subtotal</span>
                    <span>S/ {formatMoney(calcularSubtotal())}</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.75rem',
                      fontSize: '0.875rem',
                    }}
                  >
                    <span>Descuentos</span>
                    <span style={{ color: 'var(--red-600)' }}>
                      -S/ {formatMoney(calcularDescuentoTotal())}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '1rem',
                      fontSize: '0.875rem',
                    }}
                  >
                    <span>IGV (18%)</span>
                    <span>S/ {formatMoney(calcularImpuestos())}</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontWeight: 'bold',
                      fontSize: '1.5rem',
                      color: 'var(--primary-800)',
                      borderTop: '2px dashed var(--primary-300)',
                      paddingTop: '1rem',
                    }}
                  >
                    <span>TOTAL</span>
                    <span>S/ {formatMoney(calcularTotal())}</span>
                  </div>

                  {/* GRE Indicator */}
                {greEnabled && calcularTotal() > greThreshold && (
                    <div
                      style={{
                        marginTop: '1rem',
                        padding: '0.75rem',
                        background: 'linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)',
                        border: '2px solid #2196F3',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <span style={{ fontSize: '1.25rem' }}>📦</span>
                      <div style={{ flex: 1 }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            color: '#1565C0',
                          }}
                        >
                          GRE Automática
                        </p>
                        <p style={{ margin: 0, fontSize: '0.7rem', color: '#1976D2' }}>
                          Se generará Guía de Remisión (&gt; S/ {formatMoney(greThreshold)})
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Panel Derecho - Cliente y Pago */}
            <div
              style={{
                width: '450px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
              }}
            >
              {/* Selección de Cliente y Tipo de Comprobante */}
              <div
                className="stat-card"
                style={{
                  padding: '1.5rem',
                  background:
                    'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
                  backdropFilter: 'blur(20px)',
                }}
              >
                <h3 id="cliente-section-title" style={{ fontWeight: 'bold', marginBottom: '1rem' }}>👤 Cliente</h3>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <label htmlFor="pos-cliente" className="sr-only">Seleccionar cliente</label>
                  <select
                    id="pos-cliente"
                    name="pos-cliente"
                    value={clienteSeleccionado}
                    onChange={(e) => setClienteSeleccionado(e.target.value)}
                    aria-labelledby="cliente-section-title"
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      border: '1px solid var(--primary-300)',
                      borderRadius: '4px',
                    }}
                  >
                    <option value="">-- Seleccionar cliente --</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {(c.razon_social || `${c.nombres || ''} ${c.apellidos || ''}`.trim() || 'Cliente')} - {c.numero_documento}
                      </option>
                    ))}
                  </select>
                </div>
                {clienteActual && (
                  <div style={{ fontSize: '0.875rem', padding: '0.75rem', background: 'var(--emerald-50)', borderRadius: '8px', border: '1px solid var(--emerald-200)', marginBottom: '0.75rem' }}>
                    <div style={{ fontWeight: '600', color: 'var(--emerald-700)' }}>
                      ✅ {clienteActual.razon_social || `${clienteActual.nombres || ''} ${clienteActual.apellidos || ''}`.trim()}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--emerald-600)' }}>
                      {clienteActual.tipo_documento}: {clienteActual.numero_documento}
                    </div>
                  </div>
                )}
                {!clienteActual && (
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%', marginBottom: '0.75rem' }}
                    onClick={() => window.open('/dashboard/ventas/clientes', '_blank')}
                  >
                    ➕ Crear nuevo cliente
                  </button>
                )}
                
                {/* Tipo de Comprobante */}
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--primary-600)', marginBottom: '0.5rem', display: 'block' }}>
                    📄 Tipo de Comprobante
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className={`btn ${tipoComprobante === '03' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1 }}
                      onClick={() => setTipoComprobante('03')}
                    >
                      🧾 Boleta
                    </button>
                    <button
                      className={`btn ${tipoComprobante === '01' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1 }}
                      onClick={() => setTipoComprobante('01')}
                      disabled={!clienteActual || clienteActual.tipo_documento !== 'RUC'}
                      title={!clienteActual || clienteActual.tipo_documento !== 'RUC' ? 'Factura requiere cliente con RUC' : ''}
                    >
                      📋 Factura
                    </button>
                  </div>
                  {tipoComprobante === '01' && clienteActual?.tipo_documento !== 'RUC' && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--red-500)', marginTop: '0.25rem' }}>
                      ⚠️ Factura requiere cliente con RUC
                    </p>
                  )}
                </div>
              </div>

              {/* Métodos de Pago */}
              <div
                className="stat-card"
                style={{
                  padding: '1.5rem',
                  background:
                    'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
                  backdropFilter: 'blur(20px)',
                  flex: 1,
                }}
              >
                <h3 style={{ fontWeight: 'bold', marginBottom: '1rem' }}>💳 Pago</h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '1rem',
                    marginBottom: '1rem',
                  }}
                >
                  {metodosPago.map((metodo) => (
                    <button
                      key={metodo.id}
                      onClick={() => setMetodoPagoSeleccionado(metodo.id)}
                      className={`btn ${metodoPagoSeleccionado === metodo.id ? 'btn-primary' : 'btn-secondary'}`}
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
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid var(--primary-300)',
                      borderRadius: '4px',
                    }}
                  />
                )}
                {/* Visualizador de Pago Dividido (Futuro) */}
              </div>

              {/* Acciones Finales */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <button
                  onClick={procesarVenta}
                  disabled={carrito.length === 0 || !metodoPagoSeleccionado}
                  className="btn btn-primary"
                  style={{
                    padding: '1.5rem',
                    fontSize: '1.25rem',
                    background: 'var(--gradient-success)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                  }}
                >
                  Procesar Venta (S/ {formatMoney(calcularTotal())})
                </button>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => setCarrito([])}
                  >
                    Cancelar
                  </button>
                  <button className="btn btn-secondary" style={{ flex: 1 }}>
                    Guardar
                  </button>
                </div>
              </div>
            </div>

            {/* Historial de Ventas Recientes */}
            <div
              className="stat-card"
              style={{
                gridColumn: 'span 3',
                padding: '1.5rem',
                background:
                  'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
                backdropFilter: 'blur(20px)',
              }}
            >
              <h3 style={{ fontWeight: 'bold', marginBottom: '1rem' }}>📊 Historial de Ventas del Día</h3>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--primary-100)' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Ticket</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Cliente</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Estado</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historialVentas.map((venta: any) => (
                      <tr
                        key={venta.id}
                        style={{
                          borderBottom: '1px solid var(--primary-200)',
                          background:
                            facturaSeleccionada?.id === venta.id ? 'var(--blue-100)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '0.75rem' }}>
                          {venta.numero_venta || venta.numero_ticket || `#${venta.id}`}
                        </td>
                        <td style={{ padding: '0.75rem' }}>{venta.cliente_nombre || 'General'}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold' }}>
                          S/ {formatMoney(venta.total)}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '999px',
                              fontSize: '0.75rem',
                              backgroundColor:
                                venta.estado === 'PAGADA' ? 'var(--emerald-100)' : 'var(--amber-100)',
                              color: venta.estado === 'PAGADA' ? 'var(--emerald-800)' : 'var(--amber-800)',
                            }}
                          >
                            {venta.estado}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
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
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 2000, padding: '2rem'
            }}>
              <div style={{
                width: '800px',
                maxWidth: '90vw',
                background: 'white',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '90vh'
              }}>
                {/* Header del Modal */}
                <div style={{
                  padding: '1rem 1.5rem',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111827' }}>
                    Vista Previa del Comprobante
                  </h2>
                  <button
                    onClick={() => setFacturaSeleccionada(null)}
                    style={{
                      background: 'none', border: 'none', fontSize: '1.5rem',
                      cursor: 'pointer', color: '#6b7280'
                    }}
                  >
                    &times;
                  </button>
                </div>

                {/* Contenido de la Factura (Scrollable) */}
                <div style={{ overflowY: 'auto', padding: '2rem', fontFamily: 'sans-serif', color: '#374151' }}>
                  {/* Encabezado del Documento */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '1.5rem' }}>
                    <div>
                      {empresaInfo?.logo_url ? (
                        <img src={empresaInfo.logo_url} alt="Logo de la empresa" style={{ maxHeight: '60px', marginBottom: '1rem' }} />
                      ) : (
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>
                          {empresaInfo?.nombre_comercial || 'Mi Empresa'}
                        </h1>
                      )}
                      <p style={{ fontSize: '0.875rem' }}>{empresaInfo?.direccion || 'Dirección de la Empresa'}</p>
                      <p style={{ fontSize: '0.875rem' }}>Email: {empresaInfo?.email || 'email@empresa.com'}</p>
                      <p style={{ fontSize: '0.875rem' }}>Teléfono: {empresaInfo?.telefono || '987654321'}</p>
                    </div>
                    <div style={{
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '1rem',
                      textAlign: 'center',
                      width: '250px'
                    }}>
                      <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#111827' }}>
                        R.U.C. {empresaInfo?.ruc || '20000000001'}
                      </h2>
                      <h3 style={{
                        background: '#f3f4f6', padding: '0.5rem', borderRadius: '4px',
                        fontSize: '1rem', fontWeight: '600', margin: '0.5rem 0',
                        textTransform: 'uppercase', color: '#1f2937'
                      }}>
                        {facturaSeleccionada.tipo_comprobante || 'Factura de Venta'}
                      </h3>
                      <p style={{ fontSize: '1rem', fontWeight: 'bold', color: '#be123c' }}>
                        N° {facturaSeleccionada.numero_venta || '001-0001'}
                      </p>
                    </div>
                  </div>

                  {/* Datos del Cliente y Venta */}
                  <div style={{
                    borderTop: '1px solid #e5e7eb',
                    borderBottom: '1px solid #e5e7eb',
                    padding: '1rem 0',
                    marginBottom: '1.5rem',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '2rem'
                  }}>
                    <div>
                      <p><strong>Cliente:</strong> {facturaSeleccionada.cliente_nombre || 'Cliente General'}</p>
                      <p><strong>RUC/DNI:</strong> {facturaSeleccionada.cliente_documento || 'Sin documento'}</p>
                    </div>
                    <div>
                      <p><strong>Fecha de Emisión:</strong> {new Date(facturaSeleccionada.fecha || facturaSeleccionada.created_at).toLocaleDateString('es-PE')}</p>
                      <p><strong>Forma de Pago:</strong> {facturaSeleccionada.metodo_pago_nombre || 'Contado'}</p>
                    </div>
                  </div>

                  {/* Tabla de Items */}
                  {loadingFactura ? (
                    <p style={{ textAlign: 'center', padding: '2rem' }}>Cargando detalles...</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                      <thead style={{ background: '#f9fafb' }}>
                        <tr>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>CÓDIGO</th>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>DESCRIPCIÓN</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>CANT.</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>P. UNIT.</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>TOTAL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detallesFactura.map(item => (
                          <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '0.75rem' }}>{item.codigo_producto}</td>
                            <td style={{ padding: '0.75rem' }}>{item.descripcion}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>{item.cantidad}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>S/ {formatMoney(item.precio_unitario)}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>S/ {formatMoney(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* Totales */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                    <div style={{ width: '280px', fontSize: '0.875rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem' }}>
                        <span>Subtotal:</span>
                        <strong>S/ {formatMoney(facturaSeleccionada.subtotal || 0)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem' }}>
                        <span>Descuentos:</span>
                        <strong>- S/ {formatMoney(facturaSeleccionada.descuentos || 0)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem' }}>
                        <span>IGV (18%):</span>
                        <strong>S/ {formatMoney(facturaSeleccionada.impuestos || 0)}</strong>
                      </div>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0.5rem',
                        borderTop: '2px solid #d1d5db', marginTop: '0.5rem',
                        fontSize: '1.125rem', fontWeight: 'bold', color: '#111827'
                      }}>
                        <span>TOTAL:</span>
                        <span>S/ {formatMoney(facturaSeleccionada.total || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer del Modal */}
                <div style={{
                  padding: '1rem 1.5rem',
                  borderTop: '1px solid #e5e7eb',
                  background: '#f9fafb',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '1rem'
                }}>
                  <button
                    onClick={() => setFacturaSeleccionada(null)}
                    style={{
                      padding: '0.5rem 1rem', background: 'white', border: '1px solid #d1d5db',
                      borderRadius: '6px', cursor: 'pointer', fontWeight: '600'
                    }}
                  >
                    Cerrar
                  </button>
                  <button style={{
                    padding: '0.5rem 1rem', background: '#2563eb', color: 'white',
                    border: '1px solid #2563eb', borderRadius: '6px', cursor: 'pointer', fontWeight: '600'
                  }}>
                    🖨️ Imprimir
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Cierre de Caja */}
          {mostrarModalCerrarCaja && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2000,
                padding: '2rem',
              }}
            >
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
                  backdropFilter: 'blur(20px)',
                  borderRadius: '24px',
                  padding: '2rem',
                  width: '100%',
                  maxWidth: '450px',
                  boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                    borderRadius: '24px 24px 0 0',
                  }}
                />
                <h3
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  🔒 Cerrar Caja
                </h3>

                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '12px',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#991b1b' }}>
                    <strong>Monto inicial:</strong> S/ {formatMoney(estadoCaja?.montoInicial || 0)}
                  </p>
                </div>

                <label
                  htmlFor="monto-contado-cierre"
                  style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Ingrese el monto contado en caja:
                </label>
                <input
                  id="monto-contado-cierre"
                  name="monto-contado-cierre"
                  type="number"
                  value={montoContadoInput}
                  onChange={(e) => setMontoContadoInput(e.target.value)}
                  placeholder="0.00"
                  style={{
                    width: '100%',
                    padding: '1rem',
                    fontSize: '1.2rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '12px',
                    marginBottom: '1rem',
                  }}
                  autoFocus
                />

                {montoContadoInput && (
                  <div
                    style={{
                      background: parseFloat(montoContadoInput) - (estadoCaja?.montoInicial || 0) >= 0 ? '#ecfdf5' : '#fef2f2',
                      border: `1px solid ${parseFloat(montoContadoInput) - (estadoCaja?.montoInicial || 0) >= 0 ? '#a7f3d0' : '#fecaca'}`,
                      borderRadius: '12px',
                      padding: '1rem',
                      marginBottom: '1.5rem',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: '0.9rem', color: parseFloat(montoContadoInput) - (estadoCaja?.montoInicial || 0) >= 0 ? '#065f46' : '#991b1b' }}>
                      <strong>Diferencia:</strong> S/ {formatMoney(parseFloat(montoContadoInput || '0') - (estadoCaja?.montoInicial || 0))}
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={confirmarCerrarCaja}
                    style={{
                      flex: 1,
                      padding: '1rem',
                      background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '1rem',
                    }}
                  >
                    ✅ Confirmar Cierre
                  </button>
                  <button
                    onClick={() => {
                      setMostrarModalCerrarCaja(false)
                      setMontoContadoInput('')
                    }}
                    style={{
                      flex: 1,
                      padding: '1rem',
                      background: '#f1f5f9',
                      color: '#475569',
                      border: '1px solid #cbd5e1',
                      borderRadius: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '1rem',
                    }}
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
