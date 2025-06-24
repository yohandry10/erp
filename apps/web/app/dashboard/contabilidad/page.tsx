'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'

interface EstadoResultados {
  ingresos: {
    ventasNetas: number
    otrosIngresos: number
    totalIngresos: number
  }
  costos: {
    costoVentas: number
    utilidadBruta: number
  }
  gastos: {
    gastosOperativos: number
    gastosAdministrativos: number
    gastosVentas: number
    gastosFinancieros: number
    totalGastos: number
  }
  resultado: {
    utilidadOperativa: number
    utilidadAntesImpuestos: number
    impuestos: number
    utilidadNeta: number
  }
}

interface BalanceGeneral {
  activos: {
    corrientes: {
      efectivo: number
      cuentasPorCobrar: number
      inventarios: number
      otrosActivos: number
      totalCorrientes: number
    }
    fijos: {
      equipos: number
      muebles: number
      depreciacion: number
      totalFijos: number
    }
    totalActivos: number
  }
  pasivos: {
    corrientes: {
      cuentasPorPagar: number
      prestamosCortoplazo: number
      otrosPasivos: number
      totalCorrientes: number
    }
    largoplazo: {
      prestamosLargoplazo: number
      totalLargoplazo: number
    }
    totalPasivos: number
  }
  patrimonio: {
    capital: number
    utilidadesRetenidas: number
    totalPatrimonio: number
  }
}

interface LibroDiario {
  periodo: string
  totalAsientos: number
  totalDebe: number
  totalHaber: number
  asientos: AsientoContable[]
}

interface AsientoContable {
  numeroAsiento: string
  fecha: string
  concepto: string
  referencia: string
  detalles: DetalleAsiento[]
  totalDebe: number
  totalHaber: number
  estado: string
}

interface DetalleAsiento {
  cuentaCodigo: string
  cuentaNombre: string
  descripcion: string
  debe: number
  haber: number
}

interface LibroMayor {
  totalCuentas: number
  periodo: string
  cuentas: CuentaMayor[]
}

interface CuentaMayor {
  codigo: string
  nombre: string
  totalDebe: number
  totalHaber: number
  saldo: number
  cantidadMovimientos: number
}

interface RegistroVentas {
  periodo: string
  resumen: {
    cantidadComprobantes: number
    baseImponible: number
    igv: number
    total: number
    porTipo: any
  }
  ventas: VentaRegistro[]
}

interface VentaRegistro {
  fechaEmision: string
  tipoComprobante: string
  serieNumero: string
  razonSocialCliente: string
  numeroDocumentoCliente: string
  baseImponibleOperacionGravada: number
  igv: number
  totalComprobante: number
  moneda: string
  estadoSunat: string
}

export default function ContabilidadPage() {
  const [estadoResultados, setEstadoResultados] = useState<EstadoResultados | null>(null)
  const [balanceGeneral, setBalanceGeneral] = useState<BalanceGeneral | null>(null)
  const [libroDiario, setLibroDiario] = useState<LibroDiario | null>(null)
  const [libroMayor, setLibroMayor] = useState<LibroMayor | null>(null)
  const [registroVentas, setRegistroVentas] = useState<RegistroVentas | null>(null)
  
  const [periodo, setPeriodo] = useState('mes-actual')
  const [vistaActual, setVistaActual] = useState('estado-resultados')
  const [filtros, setFiltros] = useState({
    fechaDesde: '',
    fechaHasta: ''
  })
  const [loading, setLoading] = useState(false)

  const api = useApi()

  useEffect(() => {
    cargarDatos()
  }, [periodo, vistaActual])

  useEffect(() => {
    // Configurar fechas por defecto según período
    const hoy = new Date()
    let fechaDesde = ''
    let fechaHasta = hoy.toISOString().split('T')[0]

    switch(periodo) {
      case 'mes-actual':
        fechaDesde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0]
        break
      case 'trimestre':
        const mesActual = hoy.getMonth()
        const inicioTrimestre = Math.floor(mesActual / 3) * 3
        fechaDesde = new Date(hoy.getFullYear(), inicioTrimestre, 1).toISOString().split('T')[0]
        break
      case 'año':
        fechaDesde = new Date(hoy.getFullYear(), 0, 1).toISOString().split('T')[0]
        break
    }

    setFiltros({ fechaDesde, fechaHasta })
  }, [periodo])

  const cargarDatos = async () => {
    setLoading(true)
    try {
      const promises = []

      if (vistaActual === 'estado-resultados') {
        promises.push(cargarEstadoResultados())
      } else if (vistaActual === 'balance-general') {
        promises.push(cargarBalanceGeneral())
      } else if (vistaActual === 'libro-diario') {
        promises.push(cargarLibroDiario())
      } else if (vistaActual === 'libro-mayor') {
        promises.push(cargarLibroMayor())
      } else if (vistaActual === 'registro-ventas') {
        promises.push(cargarRegistroVentas())
      }

      await Promise.all(promises)
    } catch (error) {
      console.error('Error cargando datos:', error)
    } finally {
      setLoading(false)
    }
  }

  const cargarEstadoResultados = async () => {
    try {
      const response = await api.get(`/api/contabilidad/estado-resultados?periodo=${periodo}`)
      if (response && response.success && response.data) {
        setEstadoResultados(response.data)
      }
    } catch (error) {
      console.error('Error cargando estado de resultados:', error)
    }
  }

  const cargarBalanceGeneral = async () => {
    try {
      const response = await api.get('/api/contabilidad/balance-general')
      if (response && response.success && response.data) {
        setBalanceGeneral(response.data)
      }
    } catch (error) {
      console.error('Error cargando balance general:', error)
    }
  }

  const cargarLibroDiario = async () => {
    try {
      const params = new URLSearchParams()
      if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde)
      if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta)
      
      const response = await api.get(`/api/contabilidad/libro-diario?${params.toString()}`)
      if (response && response.success && response.data) {
        setLibroDiario(response.data)
      }
    } catch (error) {
      console.error('Error cargando libro diario:', error)
    }
  }

  const cargarLibroMayor = async () => {
    try {
      const params = new URLSearchParams()
      if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde)
      if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta)
      
      const response = await api.get(`/api/contabilidad/libro-mayor-completo?${params.toString()}`)
      if (response && response.success && response.data) {
        setLibroMayor(response.data)
      }
    } catch (error) {
      console.error('Error cargando libro mayor:', error)
    }
  }

  const cargarRegistroVentas = async () => {
    try {
      const params = new URLSearchParams()
      if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde)
      if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta)
      
      const response = await api.get(`/api/contabilidad/registro-ventas?${params.toString()}`)
      if (response && response.success && response.data) {
        setRegistroVentas(response.data)
      }
    } catch (error) {
      console.error('Error cargando registro de ventas:', error)
    }
  }

  // Función para exportar a Excel
  const exportarExcel = async (tipo: string) => {
    try {
      // Importar xlsx dinámicamente
      const XLSX = await import('xlsx')
      
      let nombreArchivo = ''
      let datosExcel: any[] = []
      
      switch(tipo) {
        case 'libro-diario':
          if (!libroDiario) return
          nombreArchivo = `LibroDiario_${filtros.fechaDesde}_${filtros.fechaHasta}.xlsx`
          
          // Preparar datos para Excel
          datosExcel = libroDiario.asientos.flatMap(asiento => 
            asiento.detalles.map(detalle => ({
              'Fecha': formatearFecha(asiento.fecha),
              'Asiento': asiento.numeroAsiento,
              'Concepto': asiento.concepto,
              'Cuenta': detalle.cuentaCodigo,
              'Nombre Cuenta': detalle.cuentaNombre,
              'Descripción': detalle.descripcion,
              'Debe': detalle.debe,
              'Haber': detalle.haber
            }))
          )
          break
          
        case 'libro-mayor':
          if (!libroMayor) return
          nombreArchivo = `LibroMayor_${filtros.fechaDesde}_${filtros.fechaHasta}.xlsx`
          
          datosExcel = libroMayor.cuentas.map(cuenta => ({
            'Código': cuenta.codigo,
            'Nombre de Cuenta': cuenta.nombre,
            'Movimientos': cuenta.cantidadMovimientos,
            'Total Debe': cuenta.totalDebe,
            'Total Haber': cuenta.totalHaber,
            'Saldo': cuenta.saldo
          }))
          break
          
        case 'registro-ventas':
          if (!registroVentas) return
          nombreArchivo = `RegistroVentas_${filtros.fechaDesde}_${filtros.fechaHasta}.xlsx`
          
          datosExcel = registroVentas.ventas.map(venta => ({
            'Fecha Emisión': formatearFecha(venta.fechaEmision),
            'Tipo Comprobante': venta.tipoComprobante,
            'Serie-Número': venta.serieNumero,
            'Cliente': venta.razonSocialCliente,
            'RUC/DNI': venta.numeroDocumentoCliente,
            'Base Imponible': venta.baseImponibleOperacionGravada,
            'IGV': venta.igv,
            'Total': venta.totalComprobante,
            'Moneda': venta.moneda,
            'Estado SUNAT': venta.estadoSunat
          }))
          break
      }
      
      if (datosExcel.length === 0) {
        alert('No hay datos para exportar')
        return
      }
      
      // Crear workbook y worksheet
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(datosExcel)
      
      // Agregar hoja al workbook
      XLSX.utils.book_append_sheet(wb, ws, tipo.replace('-', ' ').toUpperCase())
      
      // Descargar archivo
      XLSX.writeFile(wb, nombreArchivo)
      
      // Mostrar mensaje de éxito
      if (typeof window !== 'undefined') {
        const successToast = document.createElement('div')
        successToast.innerHTML = `
          <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: #10b981;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            font-weight: 600;
            animation: slideIn 0.3s ease-out;
          ">
            ✅ ${tipo.toUpperCase().replace('-', ' ')} exportado exitosamente
          </div>
          <style>
            @keyframes slideIn {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
          </style>
        `
        document.body.appendChild(successToast)
        setTimeout(() => {
          document.body.removeChild(successToast)
        }, 3000)
      }
      
    } catch (error) {
      console.error('Error exportando a Excel:', error)
      alert('Error al exportar archivo Excel')
    }
  }

  // Función para aplicar filtros
  const aplicarFiltros = () => {
    cargarDatos()
  }

  const formatearMoneda = (valor: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(valor)
  }

  const formatearFecha = (fecha: string) => {
    return new Date(fecha).toLocaleDateString('es-PE')
  }

  const renderEstadoResultados = () => {
    if (!estadoResultados || !estadoResultados.ingresos) {
      return (
        <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p>📊 Cargando datos del Estado de Resultados...</p>
          <p style={{ fontSize: '0.875rem', color: '#666' }}>
            Los datos contables se están generando desde las transacciones
          </p>
        </div>
      )
    }

    return (
      <div className="activity-card">
        <h2 style={{ marginBottom: '2rem', textAlign: 'center' }}>
          📊 Estado de Resultados
        </h2>
        
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          {/* Ingresos */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ 
              backgroundColor: '#10b981', 
              color: 'white', 
              padding: '0.75rem', 
              margin: 0,
              borderRadius: '8px 8px 0 0'
            }}>
              💰 INGRESOS
            </h3>
            <div style={{ border: '1px solid #10b981', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                <span>Ventas Netas</span>
                <span style={{ fontWeight: '600' }}>{formatearMoneda(estadoResultados.ingresos?.ventasNetas || 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                <span>Otros Ingresos</span>
                <span style={{ fontWeight: '600' }}>{formatearMoneda(estadoResultados.ingresos?.otrosIngresos || 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: '#f3f4f6', fontWeight: '700' }}>
                <span>TOTAL INGRESOS</span>
                <span>{formatearMoneda(estadoResultados.ingresos?.totalIngresos || 0)}</span>
              </div>
            </div>
          </div>

          {/* Costos */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ 
              backgroundColor: '#f59e0b', 
              color: 'white', 
              padding: '0.75rem', 
              margin: 0,
              borderRadius: '8px 8px 0 0'
            }}>
              🏭 COSTOS
            </h3>
            <div style={{ border: '1px solid #f59e0b', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                <span>Costo de Ventas</span>
                <span style={{ fontWeight: '600' }}>({formatearMoneda(estadoResultados.costos?.costoVentas || 0)})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: '#f3f4f6', fontWeight: '700' }}>
                <span>UTILIDAD BRUTA</span>
                <span>{formatearMoneda(estadoResultados.costos?.utilidadBruta || 0)}</span>
              </div>
            </div>
          </div>

          {/* Gastos */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ 
              backgroundColor: '#ef4444', 
              color: 'white', 
              padding: '0.75rem', 
              margin: 0,
              borderRadius: '8px 8px 0 0'
            }}>
              💸 GASTOS
            </h3>
            <div style={{ border: '1px solid #ef4444', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                <span>Gastos Operativos</span>
                <span style={{ fontWeight: '600' }}>({formatearMoneda(estadoResultados.gastos?.gastosOperativos || 0)})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                <span>Gastos Administrativos</span>
                <span style={{ fontWeight: '600' }}>({formatearMoneda(estadoResultados.gastos?.gastosAdministrativos || 0)})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                <span>Gastos de Ventas</span>
                <span style={{ fontWeight: '600' }}>({formatearMoneda(estadoResultados.gastos?.gastosVentas || 0)})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                <span>Gastos Financieros</span>
                <span style={{ fontWeight: '600' }}>({formatearMoneda(estadoResultados.gastos?.gastosFinancieros || 0)})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: '#f3f4f6', fontWeight: '700' }}>
                <span>TOTAL GASTOS</span>
                <span>({formatearMoneda(estadoResultados.gastos?.totalGastos || 0)})</span>
              </div>
            </div>
          </div>

          {/* Resultado */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ 
              backgroundColor: '#3b82f6', 
              color: 'white', 
              padding: '0.75rem', 
              margin: 0,
              borderRadius: '8px 8px 0 0'
            }}>
              📈 RESULTADO
            </h3>
            <div style={{ border: '1px solid #3b82f6', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                <span>Utilidad Operativa</span>
                <span style={{ fontWeight: '600' }}>{formatearMoneda(estadoResultados.resultado?.utilidadOperativa || 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                <span>Utilidad Antes de Impuestos</span>
                <span style={{ fontWeight: '600' }}>{formatearMoneda(estadoResultados.resultado?.utilidadAntesImpuestos || 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                <span>Impuestos</span>
                <span style={{ fontWeight: '600' }}>({formatearMoneda(estadoResultados.resultado?.impuestos || 0)})</span>
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '1rem 0.75rem', 
                backgroundColor: (estadoResultados.resultado?.utilidadNeta || 0) >= 0 ? '#d1fae5' : '#fee2e2', 
                fontWeight: '700',
                fontSize: '1.1rem',
                color: (estadoResultados.resultado?.utilidadNeta || 0) >= 0 ? '#065f46' : '#991b1b'
              }}>
                <span>UTILIDAD NETA</span>
                <span>{formatearMoneda(estadoResultados.resultado?.utilidadNeta || 0)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderBalanceGeneral = () => {
    if (!balanceGeneral || !balanceGeneral.activos) {
      return (
        <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p>⚖️ Cargando datos del Balance General...</p>
          <p style={{ fontSize: '0.875rem', color: '#666' }}>
            Los datos contables se están generando desde las transacciones
          </p>
        </div>
      )
    }

    return (
      <div className="activity-card">
        <h2 style={{ marginBottom: '2rem', textAlign: 'center' }}>
          ⚖️ Balance General
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {/* ACTIVOS */}
          <div>
            <h3 style={{ 
              backgroundColor: '#10b981', 
              color: 'white', 
              padding: '0.75rem', 
              margin: 0,
              borderRadius: '8px 8px 0 0',
              textAlign: 'center'
            }}>
              🏛️ ACTIVOS
            </h3>
            
            <div style={{ border: '1px solid #10b981', borderTop: 'none' }}>
              {/* Activos Corrientes */}
              <div style={{ backgroundColor: '#f0fdf4', padding: '0.75rem', fontWeight: '600', borderBottom: '1px solid #10b981' }}>
                Activos Corrientes
              </div>
              <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
                <span>Efectivo y Equivalentes</span>
                <span>{formatearMoneda(balanceGeneral.activos?.corrientes?.efectivo || 0)}</span>
              </div>
              <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
                <span>Cuentas por Cobrar</span>
                <span>{formatearMoneda(balanceGeneral.activos?.corrientes?.cuentasPorCobrar || 0)}</span>
              </div>
              <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
                <span>Inventarios</span>
                <span>{formatearMoneda(balanceGeneral.activos.corrientes.inventarios)}</span>
              </div>
              <div style={{ padding: '0.5rem 0.75rem', borderBottom: '2px solid #10b981', display: 'flex', justifyContent: 'space-between', fontWeight: '600' }}>
                <span>Total Activos Corrientes</span>
                <span>{formatearMoneda(balanceGeneral.activos.corrientes.totalCorrientes)}</span>
              </div>

              {/* Activos Fijos */}
              <div style={{ backgroundColor: '#f0fdf4', padding: '0.75rem', fontWeight: '600', borderBottom: '1px solid #10b981' }}>
                Activos Fijos
              </div>
              <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
                <span>Equipos</span>
                <span>{formatearMoneda(balanceGeneral.activos.fijos.equipos)}</span>
              </div>
              <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
                <span>Muebles y Enseres</span>
                <span>{formatearMoneda(balanceGeneral.activos.fijos.muebles)}</span>
              </div>
              <div style={{ padding: '0.5rem 0.75rem', borderBottom: '2px solid #10b981', display: 'flex', justifyContent: 'space-between', fontWeight: '600' }}>
                <span>Total Activos Fijos</span>
                <span>{formatearMoneda(balanceGeneral.activos.fijos.totalFijos)}</span>
              </div>

              {/* Total Activos */}
              <div style={{ 
                padding: '1rem 0.75rem', 
                backgroundColor: '#065f46', 
                color: 'white', 
                fontWeight: '700',
                fontSize: '1.1rem',
                display: 'flex', 
                justifyContent: 'space-between',
                borderRadius: '0 0 8px 0'
              }}>
                <span>TOTAL ACTIVOS</span>
                <span>{formatearMoneda(balanceGeneral.activos.totalActivos)}</span>
              </div>
            </div>
          </div>

          {/* PASIVOS Y PATRIMONIO */}
          <div>
            <h3 style={{ 
              backgroundColor: '#ef4444', 
              color: 'white', 
              padding: '0.75rem', 
              margin: 0,
              borderRadius: '8px 8px 0 0',
              textAlign: 'center'
            }}>
              💳 PASIVOS Y PATRIMONIO
            </h3>
            
            <div style={{ border: '1px solid #ef4444', borderTop: 'none' }}>
              {/* Pasivos Corrientes */}
              <div style={{ backgroundColor: '#fef2f2', padding: '0.75rem', fontWeight: '600', borderBottom: '1px solid #ef4444' }}>
                Pasivos Corrientes
              </div>
              <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
                <span>Cuentas por Pagar</span>
                <span>{formatearMoneda(balanceGeneral.pasivos.corrientes.cuentasPorPagar)}</span>
              </div>
              <div style={{ padding: '0.5rem 0.75rem', borderBottom: '2px solid #ef4444', display: 'flex', justifyContent: 'space-between', fontWeight: '600' }}>
                <span>Total Pasivos Corrientes</span>
                <span>{formatearMoneda(balanceGeneral.pasivos.corrientes.totalCorrientes)}</span>
              </div>

              {/* Pasivos Largo Plazo */}
              <div style={{ backgroundColor: '#fef2f2', padding: '0.75rem', fontWeight: '600', borderBottom: '1px solid #ef4444' }}>
                Pasivos Largo Plazo
              </div>
              <div style={{ padding: '0.5rem 0.75rem', borderBottom: '2px solid #ef4444', display: 'flex', justifyContent: 'space-between', fontWeight: '600' }}>
                <span>Total Pasivos L.P.</span>
                <span>{formatearMoneda(balanceGeneral.pasivos.largoplazo.totalLargoplazo)}</span>
              </div>

              {/* Total Pasivos */}
              <div style={{ padding: '0.75rem', backgroundColor: '#7f1d1d', color: 'white', fontWeight: '700', display: 'flex', justifyContent: 'space-between' }}>
                <span>TOTAL PASIVOS</span>
                <span>{formatearMoneda(balanceGeneral.pasivos.totalPasivos)}</span>
              </div>

              {/* Patrimonio */}
              <div style={{ backgroundColor: '#dbeafe', padding: '0.75rem', fontWeight: '600', borderBottom: '1px solid #3b82f6' }}>
                Patrimonio
              </div>
              <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
                <span>Capital</span>
                <span>{formatearMoneda(balanceGeneral.patrimonio.capital)}</span>
              </div>
              <div style={{ padding: '0.5rem 0.75rem', borderBottom: '2px solid #3b82f6', display: 'flex', justifyContent: 'space-between' }}>
                <span>Utilidades Retenidas</span>
                <span>{formatearMoneda(balanceGeneral.patrimonio.utilidadesRetenidas)}</span>
              </div>

              {/* Total Patrimonio */}
              <div style={{ 
                padding: '1rem 0.75rem', 
                backgroundColor: '#1e40af', 
                color: 'white', 
                fontWeight: '700',
                fontSize: '1.1rem',
                display: 'flex', 
                justifyContent: 'space-between',
                borderRadius: '0 0 8px 8px'
              }}>
                <span>TOTAL PATRIMONIO</span>
                <span>{formatearMoneda(balanceGeneral.patrimonio.totalPatrimonio)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderLibroDiario = () => {
    if (loading) {
      return (
        <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            border: '4px solid #f3f4f6', 
            borderTop: '4px solid #3b82f6', 
            borderRadius: '50%', 
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }}></div>
          <p>📖 Cargando Libro Diario...</p>
        </div>
      )
    }

    if (!libroDiario || !libroDiario.asientos.length) {
      return (
        <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📖</div>
          <h3>No hay asientos contables</h3>
          <p style={{ color: '#6b7280' }}>Los asientos se generan automáticamente desde las ventas</p>
        </div>
      )
    }

    return (
      <div className="activity-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2>📖 Libro Diario</h2>
          <button
            onClick={() => exportarExcel('libro-diario')}
            className="export-button"
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            📊 Exportar Excel
          </button>
        </div>

        {/* Resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div className="stats-card" style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#3b82f6' }}>{libroDiario.totalAsientos}</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Total Asientos</div>
          </div>
          <div className="stats-card" style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>{formatearMoneda(libroDiario.totalDebe)}</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Total Debe</div>
          </div>
          <div className="stats-card" style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#ef4444' }}>{formatearMoneda(libroDiario.totalHaber)}</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Total Haber</div>
          </div>
        </div>

        {/* Tabla de Asientos */}
        <div style={{ overflow: 'auto' }}>
          {libroDiario.asientos.map((asiento) => (
            <div key={asiento.numeroAsiento} style={{ marginBottom: '2rem', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
              {/* Cabecera del Asiento */}
              <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div>
                    <strong>Asiento:</strong> {asiento.numeroAsiento}
                  </div>
                  <div>
                    <strong>Fecha:</strong> {formatearFecha(asiento.fecha)}
                  </div>
                  <div>
                    <strong>Total:</strong> {formatearMoneda(asiento.totalDebe)}
                  </div>
                </div>
                <div style={{ marginTop: '0.5rem' }}>
                  <strong>Concepto:</strong> {asiento.concepto}
                </div>
              </div>

              {/* Detalles del Asiento */}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Cuenta</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Descripción</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>Debe</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>Haber</th>
                  </tr>
                </thead>
                <tbody>
                  {asiento.detalles.map((detalle, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ fontWeight: '600' }}>{detalle.cuentaCodigo}</div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{detalle.cuentaNombre}</div>
                      </td>
                      <td style={{ padding: '0.75rem' }}>{detalle.descripcion}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: detalle.debe > 0 ? '#10b981' : '#6b7280' }}>
                        {detalle.debe > 0 ? formatearMoneda(detalle.debe) : '-'}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: detalle.haber > 0 ? '#ef4444' : '#6b7280' }}>
                        {detalle.haber > 0 ? formatearMoneda(detalle.haber) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderLibroMayor = () => {
    if (loading) {
      return (
        <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            border: '4px solid #f3f4f6', 
            borderTop: '4px solid #3b82f6', 
            borderRadius: '50%', 
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }}></div>
          <p>📊 Cargando Libro Mayor...</p>
        </div>
      )
    }

    if (!libroMayor || !libroMayor.cuentas.length) {
      return (
        <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
          <h3>No hay movimientos contables</h3>
          <p style={{ color: '#6b7280' }}>Los movimientos se generan desde las transacciones</p>
        </div>
      )
    }

    return (
      <div className="activity-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2>📊 Libro Mayor</h2>
          <button
            onClick={() => exportarExcel('libro-mayor')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            📊 Exportar Excel
          </button>
        </div>

        <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
          <strong>Período:</strong> {libroMayor.periodo} | <strong>Total Cuentas:</strong> {libroMayor.totalCuentas}
        </div>

        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #d1d5db' }}>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Código</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Nombre de Cuenta</th>
                <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600' }}>Movimientos</th>
                <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>Total Debe</th>
                <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>Total Haber</th>
                <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {libroMayor.cuentas.map((cuenta) => (
                <tr key={cuenta.codigo} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '1rem', fontWeight: '600', fontFamily: 'monospace' }}>{cuenta.codigo}</td>
                  <td style={{ padding: '1rem' }}>{cuenta.nombre}</td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <span style={{ 
                      backgroundColor: '#e0e7ff', 
                      color: '#3730a3', 
                      padding: '0.25rem 0.5rem', 
                      borderRadius: '4px', 
                      fontSize: '0.875rem' 
                    }}>
                      {cuenta.cantidadMovimientos}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', color: '#10b981' }}>
                    {formatearMoneda(cuenta.totalDebe)}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', color: '#ef4444' }}>
                    {formatearMoneda(cuenta.totalHaber)}
                  </td>
                  <td style={{ 
                    padding: '1rem', 
                    textAlign: 'right', 
                    fontWeight: '600',
                    color: cuenta.saldo >= 0 ? '#10b981' : '#ef4444'
                  }}>
                    {formatearMoneda(Math.abs(cuenta.saldo))} {cuenta.saldo < 0 ? '(Cr)' : '(Db)'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const renderRegistroVentas = () => {
    if (loading) {
      return (
        <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            border: '4px solid #f3f4f6', 
            borderTop: '4px solid #3b82f6', 
            borderRadius: '50%', 
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }}></div>
          <p>📝 Cargando Registro de Ventas...</p>
        </div>
      )
    }

    if (!registroVentas || !registroVentas.ventas.length) {
      return (
        <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
          <h3>No hay ventas registradas</h3>
          <p style={{ color: '#6b7280' }}>Las ventas aparecen aquí una vez emitidos los CPE</p>
        </div>
      )
    }

    return (
      <div className="activity-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2>📝 Registro de Ventas</h2>
          <button
            onClick={() => exportarExcel('registro-ventas')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            📊 Exportar Excel
          </button>
        </div>

        {/* Resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ backgroundColor: '#e0f2fe', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0369a1' }}>{registroVentas.resumen.cantidadComprobantes}</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Comprobantes</div>
          </div>
          <div style={{ backgroundColor: '#f0fdf4', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#16a34a' }}>{formatearMoneda(registroVentas.resumen.baseImponible)}</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Base Imponible</div>
          </div>
          <div style={{ backgroundColor: '#fef3c7', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#d97706' }}>{formatearMoneda(registroVentas.resumen.igv)}</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>IGV</div>
          </div>
          <div style={{ backgroundColor: '#ede9fe', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#7c3aed' }}>{formatearMoneda(registroVentas.resumen.total)}</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Total</div>
          </div>
        </div>

        {/* Tabla de Ventas */}
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #d1d5db' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', minWidth: '100px' }}>Fecha</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', minWidth: '120px' }}>Tipo</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', minWidth: '150px' }}>Serie-Número</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', minWidth: '200px' }}>Cliente</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', minWidth: '120px' }}>RUC/DNI</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', minWidth: '120px' }}>Base Imponible</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', minWidth: '100px' }}>IGV</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', minWidth: '120px' }}>Total</th>
                <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', minWidth: '100px' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {registroVentas.ventas.map((venta, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.75rem' }}>{formatearFecha(venta.fechaEmision)}</td>
                  <td style={{ padding: '0.75rem' }}>
                    <span style={{
                      backgroundColor: venta.tipoComprobante === 'FACTURA' ? '#dbeafe' : '#fef3c7',
                      color: venta.tipoComprobante === 'FACTURA' ? '#1e40af' : '#92400e',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: '500'
                    }}>
                      {venta.tipoComprobante}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontWeight: '600' }}>
                    {venta.serieNumero}
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {venta.razonSocialCliente}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>
                    {venta.numeroDocumentoCliente}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                    {formatearMoneda(venta.baseImponibleOperacionGravada)}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', color: '#d97706' }}>
                    {formatearMoneda(venta.igv)}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>
                    {formatearMoneda(venta.totalComprobante)}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                    <span style={{
                      backgroundColor: venta.estadoSunat === 'ACEPTADO' ? '#dcfce7' : '#fef3c7',
                      color: venta.estadoSunat === 'ACEPTADO' ? '#166534' : '#92400e',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem'
                    }}>
                      {venta.estadoSunat}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">📊 Contabilidad</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid rgba(0,0,0,0.1)'
            }}
          >
            <option value="mes-actual">Mes Actual</option>
            <option value="trimestre">Trimestre</option>
            <option value="año">Año</option>
            <option value="personalizado">Personalizado</option>
          </select>
          
          {/* Filtros por fecha personalizados */}
          {(periodo === 'personalizado' || ['libro-diario', 'libro-mayor', 'registro-ventas'].includes(vistaActual)) && (
            <>
              <input
                type="date"
                value={filtros.fechaDesde}
                onChange={(e) => setFiltros(prev => ({ ...prev, fechaDesde: e.target.value }))}
                style={{
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(0,0,0,0.1)',
                  fontSize: '0.875rem'
                }}
                placeholder="Fecha desde"
              />
              <input
                type="date"
                value={filtros.fechaHasta}
                onChange={(e) => setFiltros(prev => ({ ...prev, fechaHasta: e.target.value }))}
                style={{
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(0,0,0,0.1)',
                  fontSize: '0.875rem'
                }}
                placeholder="Fecha hasta"
              />
              <button
                onClick={aplicarFiltros}
                disabled={loading}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                {loading ? '⏳' : '🔍'} Filtrar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Navegación */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', backgroundColor: '#f3f4f6', padding: '0.5rem', borderRadius: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setVistaActual('estado-resultados')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: vistaActual === 'estado-resultados' ? '#3b82f6' : 'transparent',
              color: vistaActual === 'estado-resultados' ? 'white' : '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            📊 Estado de Resultados
          </button>
          <button
            onClick={() => setVistaActual('balance-general')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: vistaActual === 'balance-general' ? '#3b82f6' : 'transparent',
              color: vistaActual === 'balance-general' ? 'white' : '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            ⚖️ Balance General
          </button>
          <button
            onClick={() => setVistaActual('libro-diario')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: vistaActual === 'libro-diario' ? '#3b82f6' : 'transparent',
              color: vistaActual === 'libro-diario' ? 'white' : '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            📖 Libro Diario
          </button>
          <button
            onClick={() => setVistaActual('libro-mayor')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: vistaActual === 'libro-mayor' ? '#3b82f6' : 'transparent',
              color: vistaActual === 'libro-mayor' ? 'white' : '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            📊 Libro Mayor
          </button>
          <button
            onClick={() => setVistaActual('registro-ventas')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: vistaActual === 'registro-ventas' ? '#3b82f6' : 'transparent',
              color: vistaActual === 'registro-ventas' ? 'white' : '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            📝 Registro de Ventas
          </button>
        </div>
      </div>

      {/* Contenido */}
      {vistaActual === 'estado-resultados' && renderEstadoResultados()}
      {vistaActual === 'balance-general' && renderBalanceGeneral()}
      {vistaActual === 'libro-diario' && renderLibroDiario()}
      {vistaActual === 'libro-mayor' && renderLibroMayor()}
      {vistaActual === 'registro-ventas' && renderRegistroVentas()}

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #f3f4f6;
          border-top: 4px solid #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 1rem;
        }
        
        .tabla-contable {
          border-collapse: collapse;
          width: 100%;
        }
        
        .tabla-contable th,
        .tabla-contable td {
          border: 1px solid #e5e7eb;
          padding: 0.75rem;
          text-align: left;
        }
        
        .tabla-contable th {
          background-color: #f9fafb;
          font-weight: 600;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        
        .tabla-contable tr:nth-child(even) {
          background-color: #f9fafb;
        }
        
        .tabla-contable tr:hover {
          background-color: #f3f4f6;
        }
        
        .export-button {
          transition: all 0.2s ease;
        }
        
        .export-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
        
        .tab-button {
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        
        .tab-button:hover {
          background-color: rgba(59, 130, 246, 0.1) !important;
        }
        
        .stats-card {
          transition: all 0.2s ease;
        }
        
        .stats-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
      `}</style>
    </div>
  )
}