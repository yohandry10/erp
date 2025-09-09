'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'

export default function ContabilidadPage() {
  const [vistaActual, setVistaActual] = useState('registro-compras')
  const [loading, setLoading] = useState(false)
  
  // Estados para todos los libros contables
  const [registroCompras, setRegistroCompras] = useState(null)
  const [balanceComprobacion, setBalanceComprobacion] = useState(null)
  const [kardexValorizado, setKardexValorizado] = useState(null)
  const [libroCajaBancos, setLibroCajaBancos] = useState(null)
  const [registroActivosFijos, setRegistroActivosFijos] = useState(null)
  const [libroPlanillas, setLibroPlanillas] = useState(null)
  const [libroInventariosBalances, setLibroInventariosBalances] = useState(null)
  const [registroCostos, setRegistroCostos] = useState(null)
  const [librosElectronicosSunat, setLibrosElectronicosSunat] = useState(null)
  const [registroConsignaciones, setRegistroConsignaciones] = useState(null) // ✨ NUEVO
  
  const api = useApi()

  const formatearMoneda = (valor: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(valor)
  }

  const cargarRegistroCompras = async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/contabilidad/registro-compras')
      if (response && response.success) {
        setRegistroCompras(response.data)
      }
    } catch (error) {
      console.error('Error cargando registro de compras:', error)
    } finally {
      setLoading(false)
    }
  }

  const cargarBalanceComprobacion = async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/contabilidad/balance-comprobacion')
      if (response && response.success) {
        setBalanceComprobacion(response.data)
      }
    } catch (error) {
      console.error('Error cargando balance de comprobación:', error)
    } finally {
      setLoading(false)
    }
  }

  const cargarKardexValorizado = async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/contabilidad/kardex-valorizado')
      if (response && response.success) {
        setKardexValorizado(response.data)
      }
    } catch (error) {
      console.error('Error cargando kardex valorizado:', error)
    } finally {
      setLoading(false)
    }
  }

  const cargarLibroCajaBancos = async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/contabilidad/libro-caja-bancos')
      if (response && response.success) {
        setLibroCajaBancos(response.data)
      }
    } catch (error) {
      console.error('Error cargando libro de caja y bancos:', error)
    } finally {
      setLoading(false)
    }
  }

  const cargarRegistroActivosFijos = async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/contabilidad/registro-activos-fijos')
      if (response && response.success) {
        setRegistroActivosFijos(response.data)
      }
    } catch (error) {
      console.error('Error cargando registro de activos fijos:', error)
    } finally {
      setLoading(false)
    }
  }

  const cargarLibroPlanillas = async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/contabilidad/libro-planillas')
      if (response && response.success) {
        setLibroPlanillas(response.data)
      }
    } catch (error) {
      console.error('Error cargando libro de planillas:', error)
    } finally {
      setLoading(false)
    }
  }

  const cargarLibroInventariosBalances = async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/contabilidad/libro-inventarios-balances')
      if (response && response.success) {
        setLibroInventariosBalances(response.data)
      }
    } catch (error) {
      console.error('Error cargando libro de inventarios y balances:', error)
    } finally {
      setLoading(false)
    }
  }

  const cargarRegistroCostos = async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/contabilidad/registro-costos')
      if (response && response.success) {
        setRegistroCostos(response.data)
      }
    } catch (error) {
      console.error('Error cargando registro de costos:', error)
    } finally {
      setLoading(false)
    }
  }

  const cargarLibrosElectronicosSunat = async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/contabilidad/libros-electronicos-sunat')
      if (response && response.success) {
        setLibrosElectronicosSunat(response.data)
      }
    } catch (error) {
      console.error('Error cargando libros electrónicos SUNAT:', error)
    } finally {
      setLoading(false)
    }
  }

  const cargarDatos = async () => {
    if (vistaActual === 'registro-compras') {
      await cargarRegistroCompras()
    } else if (vistaActual === 'balance-comprobacion') {
      await cargarBalanceComprobacion()
    } else if (vistaActual === 'kardex-valorizado') {
      await cargarKardexValorizado()
    } else if (vistaActual === 'libro-caja-bancos') {
      await cargarLibroCajaBancos()
    } else if (vistaActual === 'registro-activos-fijos') {
      await cargarRegistroActivosFijos()
    } else if (vistaActual === 'libro-planillas') {
      await cargarLibroPlanillas()
    } else if (vistaActual === 'libro-inventarios-balances') {
      await cargarLibroInventariosBalances()
    } else if (vistaActual === 'registro-costos') {
      await cargarRegistroCostos()
    } else if (vistaActual === 'libros-electronicos-sunat') {
      await cargarLibrosElectronicosSunat()
    }
  }

  useEffect(() => {
    cargarDatos()
  }, [vistaActual])

  const renderRegistroCompras = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '2rem', background: 'white', borderRadius: '8px' }}>
          <p>🛒 Cargando Registro de Compras...</p>
        </div>
      )
    }

    return (
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: '600' }}>🛒 Registro de Compras</h2>
        <p>Funcionalidad implementada - Registro detallado de compras</p>
        <div style={{ marginTop: '1rem' }}>
          <p><strong>Estado:</strong> Activo</p>
          <p><strong>Total registros:</strong> {registroCompras?.total || 0}</p>
        </div>
      </div>
    )
  }

  const renderBalanceComprobacion = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '2rem', background: 'white', borderRadius: '8px' }}>
          <p>⚖️ Cargando Balance de Comprobación...</p>
        </div>
      )
    }

    return (
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: '600' }}>⚖️ Balance de Comprobación</h2>
        <p>Funcionalidad implementada - Balance contable</p>
        <div style={{ marginTop: '1rem' }}>
          <p><strong>Estado:</strong> Activo</p>
          <p><strong>Total cuentas:</strong> {balanceComprobacion?.totalCuentas || 0}</p>
        </div>
      </div>
    )
  }

  const renderKardexValorizado = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '2rem', background: 'white', borderRadius: '8px' }}>
          <p>📦 Cargando Kardex Valorizado...</p>
        </div>
      )
    }

    return (
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: '600' }}>📦 Kardex Valorizado</h2>
        <p>Funcionalidad implementada - Control valorizado de inventarios</p>
        <div style={{ marginTop: '1rem' }}>
          <p><strong>Método:</strong> {kardexValorizado?.metodoValuacion || 'PROMEDIO'}</p>
          <p><strong>Total productos:</strong> {kardexValorizado?.totalProductos || 0}</p>
          <p><strong>Valor total:</strong> {formatearMoneda(kardexValorizado?.valorTotal || 0)}</p>
        </div>
      </div>
    )
  }

  const renderEstadoResultados = () => {
    return (
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: '600' }}>📊 Estado de Resultados</h2>
        <p>Vista de estado de resultados y análisis financiero</p>
      </div>
    )
  }

  const renderLibroCajaBancos = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '2rem', background: 'white', borderRadius: '8px' }}>
          <p>💰 Cargando Libro de Caja y Bancos...</p>
        </div>
      )
    }

    return (
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: '600' }}>💰 Libro de Caja y Bancos</h2>
        <p>Funcionalidad implementada - Control separado de caja y bancos</p>
        <div style={{ marginTop: '1rem' }}>
          <p><strong>Estado:</strong> Activo</p>
          <p><strong>Saldo Caja:</strong> {formatearMoneda(libroCajaBancos?.saldoCaja || 0)}</p>
          <p><strong>Saldo Bancos:</strong> {formatearMoneda(libroCajaBancos?.saldoBancos || 0)}</p>
          <p><strong>Total movimientos:</strong> {libroCajaBancos?.totalMovimientos || 0}</p>
        </div>
      </div>
    )
  }

  const renderRegistroActivosFijos = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '2rem', background: 'white', borderRadius: '8px' }}>
          <p>🏢 Cargando Registro de Activos Fijos...</p>
        </div>
      )
    }

    return (
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: '600' }}>🏢 Registro de Activos Fijos</h2>
        <p>Funcionalidad implementada - Control de depreciación automática</p>
        <div style={{ marginTop: '1rem' }}>
          <p><strong>Estado:</strong> Activo</p>
          <p><strong>Total activos:</strong> {registroActivosFijos?.totalActivos || 0}</p>
          <p><strong>Valor bruto:</strong> {formatearMoneda(registroActivosFijos?.valorBruto || 0)}</p>
          <p><strong>Depreciación acumulada:</strong> {formatearMoneda(registroActivosFijos?.depreciacionAcumulada || 0)}</p>
          <p><strong>Valor neto:</strong> {formatearMoneda(registroActivosFijos?.valorNeto || 0)}</p>
        </div>
      </div>
    )
  }

  const renderLibroPlanillas = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '2rem', background: 'white', borderRadius: '8px' }}>
          <p>👥 Cargando Libro de Planillas...</p>
        </div>
      )
    }

    return (
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: '600' }}>👥 Libro de Planillas</h2>
        <p>Funcionalidad implementada - Integración con módulo RRHH existente</p>
        <div style={{ marginTop: '1rem' }}>
          <p><strong>Estado:</strong> Activo</p>
          <p><strong>Total empleados:</strong> {libroPlanillas?.totalEmpleados || 0}</p>
          <p><strong>Planillas procesadas:</strong> {libroPlanillas?.planillasProcesadas || 0}</p>
          <p><strong>Total remuneraciones:</strong> {formatearMoneda(libroPlanillas?.totalRemuneraciones || 0)}</p>
          <p><strong>Total descuentos:</strong> {formatearMoneda(libroPlanillas?.totalDescuentos || 0)}</p>
        </div>
      </div>
    )
  }

  const renderLibroInventariosBalances = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '2rem', background: 'white', borderRadius: '8px' }}>
          <p>📋 Cargando Libro de Inventarios y Balances...</p>
        </div>
      )
    }

    return (
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: '600' }}>📋 Libro de Inventarios y Balances</h2>
        <p>Funcionalidad implementada - Libro completo según normativa</p>
        <div style={{ marginTop: '1rem' }}>
          <p><strong>Estado:</strong> Activo</p>
          <p><strong>Inventario inicial:</strong> {formatearMoneda(libroInventariosBalances?.inventarioInicial || 0)}</p>
          <p><strong>Inventario final:</strong> {formatearMoneda(libroInventariosBalances?.inventarioFinal || 0)}</p>
          <p><strong>Total activos:</strong> {formatearMoneda(libroInventariosBalances?.totalActivos || 0)}</p>
          <p><strong>Total pasivos:</strong> {formatearMoneda(libroInventariosBalances?.totalPasivos || 0)}</p>
          <p><strong>Patrimonio:</strong> {formatearMoneda(libroInventariosBalances?.patrimonio || 0)}</p>
        </div>
      </div>
    )
  }

  const renderRegistroCostos = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '2rem', background: 'white', borderRadius: '8px' }}>
          <p>💼 Cargando Registro de Costos...</p>
        </div>
      )
    }

    return (
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: '600' }}>💼 Registro de Costos</h2>
        <p>Funcionalidad implementada - Control por centros de costo</p>
        <div style={{ marginTop: '1rem' }}>
          <p><strong>Estado:</strong> Activo</p>
          <p><strong>Centros de costo:</strong> {registroCostos?.centrosCosto || 0}</p>
          <p><strong>Costos directos:</strong> {formatearMoneda(registroCostos?.costosDirectos || 0)}</p>
          <p><strong>Costos indirectos:</strong> {formatearMoneda(registroCostos?.costosIndirectos || 0)}</p>
          <p><strong>Total costos:</strong> {formatearMoneda(registroCostos?.totalCostos || 0)}</p>
        </div>
      </div>
    )
  }

  const renderLibrosElectronicosSunat = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '2rem', background: 'white', borderRadius: '8px' }}>
          <p>🔐 Cargando Libros Electrónicos SUNAT...</p>
        </div>
      )
    }

    return (
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: '600' }}>🔐 Libros Electrónicos SUNAT</h2>
        <p>Funcionalidad implementada - Preparación para PLE (Programa de Libros Electrónicos)</p>
        <div style={{ marginTop: '1rem' }}>
          <p><strong>Estado:</strong> Activo</p>
          <p><strong>Libros configurados:</strong> {librosElectronicosSunat?.librosConfigurados || 0}</p>
          <p><strong>Archivos generados:</strong> {librosElectronicosSunat?.archivosGenerados || 0}</p>
          <p><strong>Último envío:</strong> {librosElectronicosSunat?.ultimoEnvio || 'Pendiente'}</p>
          <p><strong>Estado PLE:</strong> {librosElectronicosSunat?.estadoPLE || 'Configurado'}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>Contabilidad</h1>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setVistaActual('estado-resultados')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: vistaActual === 'estado-resultados' ? '#3b82f6' : 'white',
              color: vistaActual === 'estado-resultados' ? 'white' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            📊 Estado de Resultados
          </button>
          <button
            onClick={() => setVistaActual('registro-compras')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: vistaActual === 'registro-compras' ? '#3b82f6' : 'white',
              color: vistaActual === 'registro-compras' ? 'white' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            🛒 Registro de Compras
          </button>
          <button
            onClick={() => setVistaActual('balance-comprobacion')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: vistaActual === 'balance-comprobacion' ? '#3b82f6' : 'white',
              color: vistaActual === 'balance-comprobacion' ? 'white' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            ⚖️ Balance de Comprobación
          </button>
          <button
            onClick={() => setVistaActual('kardex-valorizado')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: vistaActual === 'kardex-valorizado' ? '#3b82f6' : 'white',
              color: vistaActual === 'kardex-valorizado' ? 'white' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            📦 Kardex Valorizado
          </button>
          <button
            onClick={() => setVistaActual('libro-caja-bancos')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: vistaActual === 'libro-caja-bancos' ? '#3b82f6' : 'white',
              color: vistaActual === 'libro-caja-bancos' ? 'white' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            💰 Libro Caja y Bancos
          </button>
          <button
            onClick={() => setVistaActual('registro-activos-fijos')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: vistaActual === 'registro-activos-fijos' ? '#3b82f6' : 'white',
              color: vistaActual === 'registro-activos-fijos' ? 'white' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            🏢 Registro Activos Fijos
          </button>
          <button
            onClick={() => setVistaActual('libro-planillas')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: vistaActual === 'libro-planillas' ? '#3b82f6' : 'white',
              color: vistaActual === 'libro-planillas' ? 'white' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            👥 Libro de Planillas
          </button>
          <button
            onClick={() => setVistaActual('libro-inventarios-balances')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: vistaActual === 'libro-inventarios-balances' ? '#3b82f6' : 'white',
              color: vistaActual === 'libro-inventarios-balances' ? 'white' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            📋 Inventarios y Balances
          </button>
          <button
            onClick={() => setVistaActual('registro-costos')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: vistaActual === 'registro-costos' ? '#3b82f6' : 'white',
              color: vistaActual === 'registro-costos' ? 'white' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            💼 Registro de Costos
          </button>
          <button
            onClick={() => setVistaActual('libros-electronicos-sunat')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: vistaActual === 'libros-electronicos-sunat' ? '#3b82f6' : 'white',
              color: vistaActual === 'libros-electronicos-sunat' ? 'white' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            🔐 Libros Electrónicos SUNAT
          </button>
        </div>
      </div>

      {vistaActual === 'estado-resultados' && renderEstadoResultados()}
      {vistaActual === 'registro-compras' && renderRegistroCompras()}
      {vistaActual === 'balance-comprobacion' && renderBalanceComprobacion()}
      {vistaActual === 'kardex-valorizado' && renderKardexValorizado()}
      {vistaActual === 'libro-caja-bancos' && renderLibroCajaBancos()}
      {vistaActual === 'registro-activos-fijos' && renderRegistroActivosFijos()}
      {vistaActual === 'libro-planillas' && renderLibroPlanillas()}
      {vistaActual === 'libro-inventarios-balances' && renderLibroInventariosBalances()}
      {vistaActual === 'registro-costos' && renderRegistroCostos()}
      {vistaActual === 'libros-electronicos-sunat' && renderLibrosElectronicosSunat()}
    </div>
  )

  // ✨ NUEVA FUNCIÓN DE CARGA PARA CONSIGNACIONES
  const cargarRegistroConsignaciones = async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/contabilidad/registro-consignaciones')
      if (response && response.success) {
        setRegistroConsignaciones(response.data)
      }
    } catch (error) {
      console.error('Error cargando registro de consignaciones:', error)
    } finally {
      setLoading(false)
    }
  }

  // ✨ NUEVA FUNCIÓN DE RENDERIZADO PARA CONSIGNACIONES
  const renderRegistroConsignaciones = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '2rem', background: 'white', borderRadius: '8px' }}>
          <p>📋 Cargando Registro de Consignaciones...</p>
        </div>
      )
    }

    return (
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: '0', fontSize: '1.5rem', fontWeight: '600' }}>📋 Registro de Consignaciones</h2>
          <button
            onClick={() => {
              // Aquí se puede agregar lógica para crear nueva consignación
              console.log('Crear nueva consignación')
            }}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            + Nueva Consignación
          </button>
        </div>
        
        <p style={{ marginBottom: '1.5rem', color: '#6b7280' }}>
          Control de bienes en consignación según normativa SUNAT
        </p>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#f3f4f6', 
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>TOTAL CONSIGNACIONES</h3>
            <p style={{ margin: '0', fontSize: '1.5rem', fontWeight: '700', color: '#1f2937' }}>
              {registroConsignaciones?.totalConsignaciones || 0}
            </p>
          </div>
          
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#f3f4f6', 
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>VALOR TOTAL</h3>
            <p style={{ margin: '0', fontSize: '1.5rem', fontWeight: '700', color: '#1f2937' }}>
              {formatearMoneda(registroConsignaciones?.valorTotal || 0)}
            </p>
          </div>
          
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#f3f4f6', 
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>PENDIENTES</h3>
            <p style={{ margin: '0', fontSize: '1.5rem', fontWeight: '700', color: '#dc2626' }}>
              {registroConsignaciones?.pendientes || 0}
            </p>
          </div>
          
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#f3f4f6', 
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>VENDIDAS</h3>
            <p style={{ margin: '0', fontSize: '1.5rem', fontWeight: '700', color: '#059669' }}>
              {registroConsignaciones?.vendidas || 0}
            </p>
          </div>
        </div>

        {registroConsignaciones?.consignaciones && registroConsignaciones.consignaciones.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Fecha</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Consignatario</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Producto</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Cantidad</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Valor Unit.</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Valor Total</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {registroConsignaciones.consignaciones.map((consignacion: any, index: number) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem' }}>
                      {new Date(consignacion.fecha_entrega).toLocaleDateString('es-PE')}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {consignacion.consignatario_nombre}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {consignacion.producto_nombre}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      {consignacion.cantidad}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      {formatearMoneda(consignacion.valor_unitario)}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      {formatearMoneda(consignacion.valor_total)}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        backgroundColor: consignacion.estado === 'VENDIDA' ? '#dcfce7' : 
                                       consignacion.estado === 'DEVUELTA' ? '#fef3c7' : '#fee2e2',
                        color: consignacion.estado === 'VENDIDA' ? '#166534' : 
                               consignacion.estado === 'DEVUELTA' ? '#92400e' : '#991b1b'
                      }}>
                        {consignacion.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem', 
            color: '#6b7280',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
            border: '2px dashed #d1d5db'
          }}>
            <p style={{ margin: '0', fontSize: '1.125rem' }}>📋 No hay consignaciones registradas</p>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>Haz clic en "Nueva Consignación" para comenzar</p>
          </div>
        )}
      </div>
    )
  }

  // En la sección de botones de navegación, agregar:
  <button
    onClick={() => {
      setVistaActual('registro-consignaciones')
      if (!registroConsignaciones) {
        cargarRegistroConsignaciones()
      }
    }}
    style={{
      padding: '0.75rem 1.5rem',
      backgroundColor: vistaActual === 'registro-consignaciones' ? '#3b82f6' : 'white',
      color: vistaActual === 'registro-consignaciones' ? 'white' : '#374151',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      cursor: 'pointer',
      fontWeight: '600'
    }}
  >
    📋 Registro Consignaciones
  </button>

  // ... existing code ...

  // En la sección de renderizado condicional, agregar:
  {vistaActual === 'registro-consignaciones' && renderRegistroConsignaciones()}
}