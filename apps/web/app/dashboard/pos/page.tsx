'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
import {
  createClientComponentClient
} from "@supabase/auth-helpers-nextjs";
// import { showSuccessToast } from '@/components/ui/success-toast'
// import { showErrorToast } from '@/components/ui/error-toast'

// Interfaces actualizadas para el POS empresarial
interface ProductoPOS {
  id: string
  codigo: string
  codigo_barras?: string
  nombre: string
  descripcion?: string
  categoria: string
  subcategoria?: string
  marca?: string
  precio_venta: number
  precio_mayorista?: number
  precio_especial?: number
  stock_actual: number
  stock_minimo: number
  impuesto: number
  imagen_url?: string
}

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
}

export default function POSPage() {
  const api = useApi()
  const supabase = createClientComponentClient();
  
  // Estados principales
  const [productos, setProductos] = useState<ProductoPOS[]>([])
  const [carrito, setCarrito] = useState<ItemVenta[]>([])
  const [estadoCaja, setEstadoCaja] = useState<EstadoCaja | null>(null)
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [historialVentas, setHistorialVentas] = useState<any[]>([])
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<any>(null)
  
  // Estados de UI
  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<string>('')
  const [metodoPagoSeleccionado, setMetodoPagoSeleccionado] = useState<string>('')
  const [referenciaPago, setReferenciaPago] = useState('')
  
  // Nuevos estados para funcionalidades avanzadas
  const [descuentoGlobal, setDescuentoGlobal] = useState<Descuento>({ tipo: 'PORCENTAJE', valor: 0, descripcion: '' })
  const [modoVentaRapida, setModoVentaRapida] = useState(false)
  const [ventaSinStock, setVentaSinStock] = useState(true)
  const [estadoVentaActual, setEstadoVentaActual] = useState<EstadoVenta>({ estado: 'EN_PROGRESO', fecha_estado: new Date().toISOString() })
  const [busquedaPorCodigoBarras, setBusquedaPorCodigoBarras] = useState('')
  
  // Estados de modales
  const [mostrarModalAbrirCaja, setMostrarModalAbrirCaja] = useState(false)
  const [mostrarModalCerrarCaja, setMostrarModalCerrarCaja] = useState(false)
  const [mostrarModalPago, setMostrarModalPago] = useState(false)
  
  // Estados de formularios
  const [montoInicialInput, setMontoInicialInput] = useState('')
  const [montoContadoInput, setMontoContadoInput] = useState('')
  const [notasCierreInput, setNotasCierreInput] = useState('')
  const [isLoading, setIsLoading] = useState(true);
  const [empresaInfo, setEmpresaInfo] = useState<any | null>(null);
  const [detallesFactura, setDetallesFactura] = useState<any[]>([]);
  const [loadingFactura, setLoadingFactura] = useState<boolean>(false);

  useEffect(() => {
    cargarDatos()
  }, [])

  const cargarDatos = async () => {
    console.log('🔄 Cargando datos POS empresarial...')
    try {
      // Cargar productos usando el endpoint del API corregido
      const productosResponse = await api.get('/api/pos/productos');
      console.log('📦 Respuesta completa del API:', productosResponse);
      const productosData = productosResponse?.data || [];
      console.log('📦 Productos extraídos:', productosData);
      setProductos(productosData);

      // Paralelizar las demás cargas de datos
      const [
        clientesRes,
        metodosPagoRes,
        cajaRes,
        empresaRes
      ] = await Promise.all([
        supabase.from('clientes').select('*'),
        supabase.from('metodos_pago').select('*'),
        supabase.from('cajas').select('*').single(),
        supabase.from('empresa_config').select('*').single()
      ]);

      if (clientesRes.error) throw clientesRes.error;
      setClientes(clientesRes.data || []);

      if (metodosPagoRes.error) throw metodosPagoRes.error;
      setMetodosPago(metodosPagoRes.data || []);

      if (cajaRes.error) {
        console.warn("No se encontró caja, usando estado por defecto 'CERRADA'");
        setEstadoCaja({
          estado: 'CERRADA',
          montoInicial: 0,
          ventasEfectivo: 0,
          ventasTarjeta: 0,
          montoFinal: 0
        });
      } else {
        setEstadoCaja(cajaRes.data);
      }
      
      if (empresaRes.error) {
        console.error("Error cargando configuración de empresa:", empresaRes.error);
      } else {
        setEmpresaInfo(empresaRes.data);
      }

      await recargarHistorialVentas();

      console.log(`✅ POS cargado: ${productosData.length} productos disponibles`);

    } catch (error) {
      console.error('❌ Error general cargando POS:', error)
      
      // Mostrar el error real al usuario
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      alert(`❌ ERROR CARGANDO POS\n\nDetalle: ${errorMessage}\n\nPor favor:\n1. Verifica la conexión a la base de datos\n2. Asegúrate de que existe la vista 'vista_pos_productos'\n3. Revisa los logs del servidor`);
      
      // Establecer valores por defecto en caso de error total
      setProductos([])
      setMetodosPago([])
      setClientes([])
      setEstadoCaja({ estado: 'CERRADA', montoInicial: 0, ventasEfectivo: 0, ventasTarjeta: 0, montoFinal: 0 })
      setHistorialVentas([])
    }
  }

  const recargarHistorialVentas = async () => {
    try {
      const {
        data,
        error
      } = await supabase
        .from('ventas_pos')
        .select('*')
        .order('created_at', {
          ascending: false
        })
        .limit(10);

      if (error) throw error;
      console.log(`✅ Historial cargado: ${data?.length || 0} ventas encontradas`);
      setHistorialVentas(data || []);
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
        alert(`✅ Se recargaron ${productosData.length} productos correctamente`);
      }
    } catch (error) {
      console.error('❌ Error recargando productos:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      alert(`❌ ERROR RECARGANDO PRODUCTOS\n\nDetalle: ${errorMessage}\n\nVerifica:\n1. Conexión a la base de datos\n2. Existencia de vista_pos_productos\n3. Productos activos en la base de datos`);
    }
  }

  const handleVerFactura = async (venta: any) => {
    if (!venta) return;

    setFacturaSeleccionada(venta);
    setLoadingFactura(true);
    setDetallesFactura([]);

    try {
      console.log('👁️ Cargando detalles de venta:', venta);
      
      // MÉTODO 1: Intentar obtener desde detalle_ventas_pos
      let detalles = [];
      try {
        const { data: detallesDB, error: errorDetalles } = await supabase
          .from('detalle_ventas_pos')
          .select('*')
          .eq('venta_id', venta.id);

        if (!errorDetalles && detallesDB && detallesDB.length > 0) {
          console.log('✅ Detalles encontrados en BD:', detallesDB);
          detalles = detallesDB;
        } else {
          console.log('⚠️ No se encontraron detalles en BD, intentando desde observaciones...');
          
          // MÉTODO 2: Obtener desde observaciones (JSON)
          if (venta.observaciones) {
            try {
              const observacionesData = JSON.parse(venta.observaciones);
              console.log('📋 Datos en observaciones:', observacionesData);
              
              if (observacionesData.items && Array.isArray(observacionesData.items)) {
                detalles = observacionesData.items.map((item: any, index: number) => ({
                  id: index + 1,
                  venta_id: venta.id,
                  codigo_producto: item.producto?.codigo || item.producto_id || 'N/A',
                  nombre_producto: item.producto?.nombre || 'Producto',
                  cantidad: item.cantidad || 1,
                  precio_unitario: item.precio_unitario || 0,
                  descuento: item.descuento_monto || 0,
                  total_parcial: item.subtotal || 0
                }));
                console.log('✅ Detalles extraídos de observaciones:', detalles);
              }
            } catch (parseError) {
              console.warn('⚠️ Error parseando observaciones:', parseError);
            }
          }
          
          // MÉTODO 3: Fallback - crear detalles básicos
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
              total_parcial: venta.total || 0
            }];
          }
        }
      } catch (dbError) {
        console.warn('⚠️ Error consultando BD, usando observaciones:', dbError);
        
        // Fallback a observaciones si hay error de BD
        if (venta.observaciones) {
          try {
            const observacionesData = JSON.parse(venta.observaciones);
            if (observacionesData.items) {
              detalles = observacionesData.items.map((item: any, index: number) => ({
                id: index + 1,
                codigo_producto: item.producto?.codigo || 'N/A',
                nombre_producto: item.producto?.nombre || 'Producto',
                cantidad: item.cantidad || 1,
                precio_unitario: item.precio_unitario || 0,
                total_parcial: item.subtotal || 0
              }));
            }
          } catch (parseError) {
            console.warn('Error parseando observaciones:', parseError);
          }
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
    // Verificar stock disponible (solo si no permite venta sin stock)
    if (!ventaSinStock && producto.stock_actual <= 0) {
      alert(`❌ SIN STOCK\n${producto.nombre} no tiene stock disponible`)
      return
    }

    const precioFinal = obtenerPrecioProducto(producto)
    const itemExistente = carrito.find(item => item.producto.id === producto.id)
    
    if (itemExistente) {
      // Verificar que no exceda el stock (solo si no permite venta sin stock)
      if (!ventaSinStock && itemExistente.cantidad >= producto.stock_actual) {
        alert(`❌ STOCK INSUFICIENTE\nSolo hay ${producto.stock_actual} unidades disponibles`)
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

    // Toast de producto agregado - REMOVIDO para mejor UX
  }

  const actualizarCantidad = (productoId: string, nuevaCantidad: number) => {
    if (nuevaCantidad <= 0) {
      setCarrito(carrito.filter(item => item.producto.id !== productoId))
    } else {
      setCarrito(carrito.map(item =>
        item.producto.id === productoId
          ? { ...item, cantidad: nuevaCantidad, subtotal: nuevaCantidad * item.precio_unitario }
          : item
      ))
    }
  }

  const eliminarDelCarrito = (productoId: string) => {
    console.log('🗑️ Eliminando producto del carrito:', productoId);
    setCarrito(carrito.filter(item => item.producto.id !== productoId));
    console.log('✅ Producto eliminado del carrito');
  }

  const procesarVenta = async () => {
    // 1. Validaciones iniciales
    if (carrito.length === 0) {
          alert('❌ CARRITO VACÍO\nAgregue productos antes de procesar la venta')
      return
    }

    if (!clienteSeleccionado || !metodoPagoSeleccionado) {
      alert('❌ DATOS INCOMPLETOS\nSeleccione cliente y método de pago')
      return
    }

    let resultado: any = null;
    try {
      // 2. Cambiar estado a PENDIENTE_PAGO
      setEstadoVentaActual({ estado: 'PENDIENTE_PAGO', fecha_estado: new Date().toISOString() })

      // 3. Generar comprobante antes de enviar
      const comprobante = generarComprobante()

      // 4. Preparar datos mejorados para envío
      const clienteActual = clientes.find(c => c.id === clienteSeleccionado);
      
      const ventaData = {
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

      // 5. Procesar venta en backend
      console.log('📤 Enviando venta al backend...', ventaData)
      let resultado: any = null;
      
      try {
        console.log('🔄 Iniciando llamada API...')
        resultado = await api.post('/api/pos/venta', ventaData)
        console.log('📨 Respuesta completa del backend:', resultado)
        console.log('📊 Tipo de respuesta:', typeof resultado)
        console.log('📋 Keys de la respuesta:', resultado ? Object.keys(resultado) : 'null/undefined')
        
        if (resultado && resultado.data) {
          console.log('📦 Contenido de data:', resultado.data)
        }
      } catch (apiError: any) {
        console.error('❌ Error de conexión API:', apiError)
        console.error('❌ Stack del error API:', apiError?.stack)
        console.error('❌ Response del error:', apiError?.response)
        throw new Error(`Error de conexión: ${apiError?.message || 'Error de red'}`)
      }

      // Verificar que se recibió una respuesta válida
      if (!resultado) {
        console.error('❌ No se recibió respuesta del backend')
        throw new Error('No se recibió respuesta del servidor')
      }
      
      if (resultado && (resultado.success === true || resultado.venta_id)) {
        // 6. Cambiar estado a PAGADA
        setEstadoVentaActual({ estado: 'PAGADA', fecha_estado: new Date().toISOString() })
        
        // 7. Limpiar carrito y resetear formulario
        setCarrito([])
        setReferenciaPago('')
        setDescuentoGlobal({ tipo: 'PORCENTAJE', valor: 0, descripcion: '' })
        
        // 8. SOLO recargar historial de ventas (NO cargar todos los datos para mantener caja abierta)
        console.log('🔄 Recargando historial de ventas...')
        await recargarHistorialVentas().catch(err => console.warn('⚠️ Error recargando historial:', err))
        
        // 9. Mostrar éxito con información del comprobante y factura
        console.log('✅ Venta procesada exitosamente:', resultado)
        const ventaInfo = resultado; // Ya no está envuelto en 'data'
        
        // Crear mensaje mejorado con enlace a CPE
        const mensajeExito = `✅ VENTA PROCESADA EXITOSAMENTE

📄 Ticket: ${ventaInfo.numero_ticket || comprobante.numero}
💰 Total: S/ ${calcularTotal().toFixed(2)}
📋 Estado: ${ventaInfo.estado || 'PAGADA'}
🧾 Factura Electrónica: ${ventaInfo.factura_electronica ? 'GENERADA' : 'PENDIENTE'}

${ventaInfo.url_factura ? `🔗 Ver factura: ${ventaInfo.url_factura}` : ''}

La caja permanece ABIERTA para continuar vendiendo.`;

        alert(mensajeExito);

        // 10. Resetear estado para nueva venta (mantener caja abierta)
        setEstadoVentaActual({ estado: 'EN_PROGRESO', fecha_estado: new Date().toISOString() })
        
        // 11. Opcional: Abrir CPE automáticamente si está configurado
        if (ventaInfo.url_factura) {
          const abrirCPE = confirm("¿Desea ver la factura electrónica generada en el módulo CPE?");
          if (abrirCPE) {
            // Abrir CPE en nueva pestaña o redirigir
            window.open('/dashboard/cpe', '_blank');
          }
        }
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

      alert(mensajeDetallado)
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
    const comprobante = {
      numero: `T001-${String(Date.now()).slice(-8)}`,
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
      alert('❌ MONTO INVÁLIDO\nIngrese un monto inicial válido')
      return
    }

    try {
      const resultado = await api.post('/api/pos/caja/abrir', { 
        monto_inicial: montoInicial 
      })
      
      if (resultado) {
        setEstadoCaja({
          estado: 'ABIERTA',
          montoInicial,
          ventasEfectivo: 0,
          ventasTarjeta: 0,
          montoFinal: montoInicial
        })
        
        setMostrarModalAbrirCaja(false)
        setMontoInicialInput('')
        
        alert(`🔓 ¡CAJA ABIERTA!\nCaja abierta con S/ ${montoInicial.toFixed(2)}`)
      }
    } catch (error) {
      console.error('❌ Error abriendo caja:', error)
    }
  }

  const cerrarCaja = async () => {
    try {
      const resultado = await api.post('/api/pos/caja/cerrar', {
        monto_contado: parseFloat(montoContadoInput) || 0,
        notas: notasCierreInput
      })
      
      if (resultado) {
        cargarDatos()
        
        // Toast para cerrar caja
        alert('🔒 ¡CAJA CERRADA!\nSesión finalizada correctamente')
      }
    } catch (error) {
      console.error('❌ Error cerrando caja:', error)
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

    // Mostrar productos sin stock solo si está habilitado
    const tieneStock = ventaSinStock || producto.stock_actual > 0;

    return coincideBusqueda && coincideCategoria && tieneStock;
  });

  const categorias = [...new Set((productos || []).map((p) => p.categoria))];
  const metodoPagoActual = metodosPago.find(
    (m) => m.id === metodoPagoSeleccionado
  );
  const clienteActual = clientes.find((c) => c.id === clienteSeleccionado);

  return (
    <>
      {estadoCaja?.estado === 'CERRADA' ? (
        <div className="dashboard-container">
          <div className="min-h-screen flex items-center justify-center">
            <div className="stat-card" style={{ maxWidth: '500px', textAlign: 'center' }}>
              <div style={{ marginBottom: '2rem' }}>
                <div
                  style={{
                    width: '120px',
                    height: '120px',
                    margin: '0 auto 2rem',
                    background: 'var(--gradient-danger)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '4rem',
                  }}
                >
                  🔒
                </div>
                <h2 className="dashboard-title" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
                  CAJA CERRADA
                </h2>
                <p className="dashboard-subtitle" style={{ marginBottom: '2rem' }}>
                  Para usar el sistema POS, primero debe abrir la caja registradora con el monto inicial
                </p>
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
              </div>
            </div>
          </div>

          {/* Modal para abrir caja */}
          {mostrarModalAbrirCaja && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
              }}
            >
              <div className="stat-card" style={{ maxWidth: '400px', textAlign: 'center' }}>
                <div style={{ marginBottom: '2rem' }}>
                  <div
                    style={{
                      width: '80px',
                      height: '80px',
                      margin: '0 auto 1rem',
                      background: 'var(--gradient-success)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '2.5rem',
                    }}
                  >
                    💰
                  </div>
                  <h3
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 'bold',
                      color: 'var(--primary-800)',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Abrir Caja Registradora
                  </h3>
                  <p style={{ color: 'var(--primary-600)' }}>Ingrese el monto inicial en efectivo</p>
                </div>

                <div style={{ marginBottom: '2rem' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: 'var(--primary-700)',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Monto inicial (S/)
                  </label>
                  <input
                    type="number"
                    value={montoInicialInput}
                    onChange={(e) => setMontoInicialInput(e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '1rem',
                      border: '2px solid var(--primary-300)',
                      borderRadius: 'var(--border-radius)',
                      fontSize: '1.25rem',
                      textAlign: 'center',
                      background: 'white',
                    }}
                    step="0.01"
                    min="0"
                  />
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={() => setMostrarModalAbrirCaja(false)}
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmarAbrirCaja}
                    className="btn btn-primary"
                    style={{
                      flex: 1,
                      background: 'var(--gradient-success)',
                    }}
                  >
                    Abrir Caja
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
    <div className="dashboard-container" style={{ padding: '1rem', maxWidth: '100%' }}>
      {/* Header del POS empresarial */}
      <div className="dashboard-header" style={{ marginBottom: '1.5rem' }}>
        <div>
              <h1 className="dashboard-title" style={{ fontSize: '2.5rem' }}>
                🛒 Sistema POS Empresarial
              </h1>
              <p className="dashboard-subtitle">
                Caja: <span className="status-success">{estadoCaja?.estado}</span> | Productos:{' '}
                <span style={{ fontWeight: '600' }}>{productos.length}</span> | En Carrito:{' '}
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
            <input
              type="text"
                      placeholder="🔍 Buscar por nombre, código o código de barras..."
              value={busqueda}
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
                  </div>
            <select
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
                    <input
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
                    <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>Desc:</span>
                    <select
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
                    <input
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
                        checked={ventaSinStock}
                        onChange={(e) => setVentaSinStock(e.target.checked)}
                        style={{ transform: 'scale(1.2)' }}
                      />
                      📦 Sin Stock
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
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  {productosFiltrados.map((producto) => (
                    <div
                      key={producto.id}
                      onClick={() => agregarAlCarrito(producto)}
                      className="stat-card"
                      style={{
                        cursor: 'pointer',
                        padding: '1rem',
                        transition: 'all 0.3s ease',
                      }}
                    >
                      <div
                        style={{
                          aspectRatio: '1',
                          background: 'var(--gradient-primary)',
                          borderRadius: 'var(--border-radius)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: '1rem',
                        }}
                      >
                        {producto.imagen_url ? (
                          <img
                            src={producto.imagen_url}
                            alt={producto.nombre}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              borderRadius: 'var(--border-radius)',
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: '3rem' }}>📦</span>
                        )}
                      </div>
                      <div>
                        <h3
                          style={{
                            fontWeight: '600',
                            color: 'var(--primary-800)',
                            fontSize: '0.875rem',
                            lineHeight: '1.2',
                            marginBottom: '0.5rem',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {producto.nombre}
                        </h3>
                        <p
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--primary-500)',
                            marginBottom: '0.5rem',
                          }}
                        >
                          {producto.codigo}
                        </p>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 'bold',
                              color: 'var(--emerald-600)',
                              fontSize: '1rem',
                            }}
                          >
                            S/ {producto.precio_venta.toFixed(2)}
                          </span>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '999px',
                              backgroundColor:
                                producto.stock_actual > producto.stock_minimo
                                  ? 'var(--emerald-100)'
                                  : producto.stock_actual > 0
                                  ? 'var(--amber-100)'
                                  : 'var(--red-100)',
                              color:
                                producto.stock_actual > producto.stock_minimo
                                  ? 'var(--emerald-800)'
                                  : producto.stock_actual > 0
                                  ? 'var(--amber-800)'
                                  : 'var(--red-800)',
                            }}
                          >
                            {producto.stock_actual} un.
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
                      <div style={{ flex: 1, overflow: 'hidden' }}>
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
                          S/ {item.precio_unitario.toFixed(2)}
                        </p>
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
                          S/ {item.subtotal.toFixed(2)}
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
                    <span>S/ {calcularSubtotal().toFixed(2)}</span>
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
                      -S/ {calcularDescuentoTotal().toFixed(2)}
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
                    <span>S/ {calcularImpuestos().toFixed(2)}</span>
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
                    <span>S/ {calcularTotal().toFixed(2)}</span>
                  </div>
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
              {/* Selección de Cliente */}
              <div
                className="stat-card"
                style={{
                  padding: '1.5rem',
                  background:
                    'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
                  backdropFilter: 'blur(20px)',
                }}
              >
                <h3 style={{ fontWeight: 'bold', marginBottom: '1rem' }}>👤 Cliente</h3>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <select
                    value={clienteSeleccionado}
                    onChange={(e) => setClienteSeleccionado(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      border: '1px solid var(--primary-300)',
                      borderRadius: '4px',
                    }}
                  >
                    <option value="">Cliente general</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.razon_social || `${c.nombres} ${c.apellidos}`}
                      </option>
                    ))}
                  </select>
                  <button className="btn-icon">➕</button>
                </div>
                {clienteActual && (
                  <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--primary-600)' }}>
                    {clienteActual.tipo_documento}: {clienteActual.numero_documento}
                  </div>
                )}
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
                  Procesar Venta (S/ {calcularTotal().toFixed(2)})
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
                      S/ {parseFloat(venta.total).toFixed(2)}
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
                            <p><strong>Fecha de Emisión:</strong> {new Date(facturaSeleccionada.fecha_venta || facturaSeleccionada.created_at).toLocaleDateString('es-PE')}</p>
                            <p><strong>Forma de Pago:</strong> {facturaSeleccionada.metodo_pago_nombre || 'Contado'}</p>
                        </div>
                    </div>

                    {/* Tabla de Items */}
                    {loadingFactura ? (
                        <p style={{textAlign: 'center', padding: '2rem'}}>Cargando detalles...</p>
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
                                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>S/ {item.precio_unitario.toFixed(2)}</td>
                                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>S/ {item.subtotal.toFixed(2)}</td>
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
                                <strong>S/ {parseFloat(facturaSeleccionada.subtotal || 0).toFixed(2)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem' }}>
                                <span>Descuentos:</span>
                                <strong>- S/ {parseFloat(facturaSeleccionada.descuentos || 0).toFixed(2)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem' }}>
                                <span>IGV (18%):</span>
                                <strong>S/ {parseFloat(facturaSeleccionada.impuestos || 0).toFixed(2)}</strong>
                            </div>
                            <div style={{ 
                                display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0.5rem',
                                borderTop: '2px solid #d1d5db', marginTop: '0.5rem',
                                fontSize: '1.125rem', fontWeight: 'bold', color: '#111827'
                            }}>
                                <span>TOTAL:</span>
                                <span>S/ {parseFloat(facturaSeleccionada.total || 0).toFixed(2)}</span>
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
    </div>
      )}
    </>
  )
}