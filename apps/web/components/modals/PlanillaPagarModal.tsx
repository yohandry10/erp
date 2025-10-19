'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useApi } from '@/hooks/use-api'

interface PlanillaPagarModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  planilla: any
}

interface EmpleadoPago {
  id: string
  empleado_id: string
  empleado_nombre: string
  empleado_documento: string
  dias_trabajados: number
  total_ingresos: number
  total_descuentos: number
  neto_pagar: number
  estado_pago: string
  fecha_pago?: string
  metodo_pago?: string
  numero_operacion?: string
}

interface HistorialPago {
  id: string
  fecha: string
  metodo: string
  monto: number
  empleados_count: number
  numero_operacion?: string
  observaciones?: string
}

export default function PlanillaPagarModal({ isOpen, onClose, onSuccess, planilla }: PlanillaPagarModalProps) {
  const { get, post } = useApi()
  const [loading, setLoading] = useState(false)
  const [empleados, setEmpleados] = useState<EmpleadoPago[]>([])
  const [historialPagos, setHistorialPagos] = useState<HistorialPago[]>([])
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia'>('transferencia')
  const [numeroOperacion, setNumeroOperacion] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [empleadosSeleccionados, setEmpleadosSeleccionados] = useState<string[]>([])
  const [pagando, setPagando] = useState(false)

  useEffect(() => {
    if (isOpen && planilla) {
      loadDetallePlanilla()
      loadHistorialPagos()
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, planilla])

  const loadDetallePlanilla = async () => {
    try {
      setLoading(true)
      const response = await get(`/api/rrhh/planillas/${planilla.id}/detalle`)
      
      if (response && Array.isArray(response)) {
        const empleadosConEstado = response.map((emp: any) => ({
          id: emp.id,
          empleado_id: emp.empleado_id,
          empleado_nombre: `${emp.empleados?.nombres} ${emp.empleados?.apellidos}`,
          empleado_documento: emp.empleados?.numero_documento,
          dias_trabajados: emp.dias_trabajados,
          total_ingresos: parseFloat(emp.total_ingresos) || 0,
          total_descuentos: parseFloat(emp.total_descuentos) || 0,
          neto_pagar: parseFloat(emp.neto_pagar) || 0,
          estado_pago: emp.estado_pago || 'pendiente',
          fecha_pago: emp.fecha_pago,
          metodo_pago: emp.metodo_pago,
          numero_operacion: emp.numero_operacion
        }))
        
        setEmpleados(empleadosConEstado)
        
        // Seleccionar empleados pendientes por defecto
        const pendientes = empleadosConEstado
          .filter(emp => emp.estado_pago === 'pendiente')
          .map(emp => emp.id)
        setEmpleadosSeleccionados(pendientes)
      }
    } catch (error) {
      console.error('Error cargando detalle planilla:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadHistorialPagos = async () => {
    try {
      const response = await get(`/api/rrhh/planillas/${planilla.id}/historial-pagos`)
      if (response?.success && response.data) {
        setHistorialPagos(response.data)
      }
    } catch (error) {
      console.error('Error cargando historial:', error)
    }
  }

  const toggleEmpleado = (empleadoId: string) => {
    setEmpleadosSeleccionados(prev => {
      if (prev.includes(empleadoId)) {
        return prev.filter(id => id !== empleadoId)
      } else {
        return [...prev, empleadoId]
      }
    })
  }

  const seleccionarTodos = () => {
    // Seleccionar TODOS los empleados (no solo pendientes)
    const todosLosEmpleados = empleados.map(emp => emp.id)
    setEmpleadosSeleccionados(todosLosEmpleados)
  }

  const deseleccionarTodos = () => {
    setEmpleadosSeleccionados([])
  }

  const procesarPago = async () => {
    if (empleadosSeleccionados.length === 0) {
      alert('Debe seleccionar al menos un empleado para pagar')
      return
    }

    if (metodoPago === 'transferencia' && !numeroOperacion.trim()) {
      alert('Debe ingresar el número de operación para transferencias')
      return
    }

    try {
      setPagando(true)
      
      const datosPago = {
        empleados_ids: empleadosSeleccionados,
        metodo_pago: metodoPago,
        numero_operacion: numeroOperacion.trim() || null,
        observaciones: observaciones.trim() || null
      }
      
      const response = await post(`/api/rrhh/planillas/${planilla.id}/pagar-empleados`, datosPago)
      
      if (response?.success) {
        alert(`✅ Pago procesado correctamente para ${empleadosSeleccionados.length} empleados`)
        await loadDetallePlanilla()
        await loadHistorialPagos()
        setEmpleadosSeleccionados([])
        setNumeroOperacion('')
        setObservaciones('')
        onSuccess()
      } else {
        throw new Error(response?.message || 'Error procesando pago')
      }
    } catch (error) {
      console.error('Error procesando pago:', error)
      alert('Error procesando pago: ' + error.message)
    } finally {
      setPagando(false)
    }
  }

  const generarComprobantePago = async () => {
    if (empleadosSeleccionados.length === 0) {
      alert('Debe seleccionar empleados para generar comprobante')
      return
    }

    try {
      const empleadosParaComprobante = empleados.filter(emp => 
        empleadosSeleccionados.includes(emp.id)
      )
      
      const html = generarComprobanteHTML(empleadosParaComprobante)
      
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const link = document.createElement("a")
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", `comprobante_pago_${planilla.periodo}_${new Date().toISOString().split('T')[0]}.html`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error generando comprobante:', error)
      alert('Error generando comprobante: ' + error.message)
    }
  }

  const generarComprobanteHTML = (empleadosPago: EmpleadoPago[]) => {
    const totalPago = empleadosPago.reduce((sum, emp) => sum + emp.neto_pagar, 0)
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Comprobante de Pago - Planilla ${planilla.periodo}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
            .company { font-size: 28px; font-weight: bold; color: #2563eb; }
            .title { font-size: 20px; margin: 10px 0; }
            .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0; }
            .info-box { background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #2563eb; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #2563eb; color: white; }
            .number { text-align: right; }
            .total-row { font-weight: bold; background-color: #f0f9ff; }
            .footer { margin-top: 40px; text-align: center; color: #6b7280; }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="company">NEON SYSTEM</div>
            <div class="title">Comprobante de Pago de Planilla</div>
            <div>Período: ${planilla.periodo}</div>
            <div>Generado: ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE')}</div>
        </div>

        <div class="info-grid">
            <div class="info-box">
                <h3>Información del Pago</h3>
                <p><strong>Método:</strong> ${metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia Bancaria'}</p>
                <p><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-PE')}</p>
                ${numeroOperacion ? `<p><strong>N° Operación:</strong> ${numeroOperacion}</p>` : ''}
                ${observaciones ? `<p><strong>Observaciones:</strong> ${observaciones}</p>` : ''}
            </div>
            <div class="info-box">
                <h3>Resumen</h3>
                <p><strong>Total Empleados:</strong> ${empleadosPago.length}</p>
                <p><strong>Monto Total:</strong> S/ ${totalPago.toFixed(2)}</p>
                <p><strong>Estado:</strong> Pagado</p>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Empleado</th>
                    <th>Documento</th>
                    <th class="number">Días</th>
                    <th class="number">Total Ingresos</th>
                    <th class="number">Descuentos</th>
                    <th class="number">Neto Pagado</th>
                </tr>
            </thead>
            <tbody>
                ${empleadosPago.map(emp => `
                    <tr>
                        <td>${emp.empleado_nombre}</td>
                        <td>${emp.empleado_documento}</td>
                        <td class="number">${emp.dias_trabajados}</td>
                        <td class="number">S/ ${emp.total_ingresos.toFixed(2)}</td>
                        <td class="number">S/ ${emp.total_descuentos.toFixed(2)}</td>
                        <td class="number">S/ ${emp.neto_pagar.toFixed(2)}</td>
                    </tr>
                `).join('')}
                <tr class="total-row">
                    <td colspan="5">TOTAL PAGADO</td>
                    <td class="number">S/ ${totalPago.toFixed(2)}</td>
                </tr>
            </tbody>
        </table>

        <div class="footer">
            <p>Este comprobante certifica el pago de la planilla correspondiente al período ${planilla.periodo}</p>
            <p>Sistema ERP - Generado automáticamente</p>
        </div>
    </body>
    </html>`
  }

  // Cálculos
  const empleadosPendientes = empleados.filter(emp => emp.estado_pago === 'pendiente')
  const empleadosPagados = empleados.filter(emp => emp.estado_pago === 'pagado')
  const empleadosASerarPagados = empleados.filter(emp => empleadosSeleccionados.includes(emp.id))
  const totalASerPagado = empleadosASerarPagados.reduce((sum, emp) => sum + emp.neto_pagar, 0)
  const totalYaPagado = empleadosPagados.reduce((sum, emp) => sum + emp.neto_pagar, 0)

  if (!isOpen) return null

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-content payment" style={{ 
        width: '95vw', 
        maxWidth: '1400px', 
        height: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div className="modal-header">
          <h2 className="modal-title">
            💰 Pagar Planilla {planilla?.periodo}
          </h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ 
          flex: 1, 
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Resumen superior */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(4, 1fr)', 
            gap: '1rem',
            marginBottom: '1rem',
            flexShrink: 0
          }}>
            <div style={{ 
              background: 'var(--blue-50)', 
              padding: '1rem', 
              borderRadius: 'var(--border-radius)',
              textAlign: 'center',
              border: '1px solid var(--blue-200)'
            }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--blue-600)' }}>
                {empleados.length}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--blue-700)' }}>
                Total Empleados
              </div>
            </div>
            <div style={{ 
              background: 'var(--emerald-50)', 
              padding: '1rem', 
              borderRadius: 'var(--border-radius)',
              textAlign: 'center',
              border: '1px solid var(--emerald-200)'
            }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--emerald-600)' }}>
                {empleadosSeleccionados.length}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--emerald-700)' }}>
                Seleccionados
              </div>
            </div>
            <div style={{ 
              background: 'var(--blue-50)', 
              padding: '1rem', 
              borderRadius: 'var(--border-radius)',
              textAlign: 'center',
              border: '1px solid var(--blue-200)'
            }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--blue-600)' }}>
                S/ {totalASerPagado.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--blue-700)' }}>
                A Pagar Ahora
              </div>
            </div>
            <div style={{ 
              background: '#f0f9ff', 
              padding: '1rem', 
              borderRadius: 'var(--border-radius)',
              textAlign: 'center',
              border: '1px solid #0ea5e9'
            }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0ea5e9' }}>
                S/ {totalYaPagado.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#0c4a6e' }}>
                Ya Pagado
              </div>
            </div>
          </div>

          {/* Configuración de pago */}
          <div style={{ 
            background: 'var(--primary-50)', 
            padding: '1rem', 
            borderRadius: 'var(--border-radius)',
            marginBottom: '1rem',
            flexShrink: 0
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: 'var(--primary-700)' }}>
              💳 Configuración del Pago
            </h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'auto auto 1fr auto auto', 
              gap: '1rem',
              alignItems: 'center'
            }}>
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-700)' }}>
                  Método:
                </label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value as 'efectivo' | 'transferencia')}
                  style={{
                    padding: '0.5rem',
                    border: '1px solid var(--primary-300)',
                    borderRadius: '4px',
                    marginLeft: '0.5rem'
                  }}
                >
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                </select>
              </div>
              
              {metodoPago === 'transferencia' && (
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-700)' }}>
                    N° Operación:
                  </label>
                  <input
                    type="text"
                    value={numeroOperacion}
                    onChange={(e) => setNumeroOperacion(e.target.value)}
                    placeholder="Ej: 123456789"
                    style={{
                      padding: '0.5rem',
                      border: '1px solid var(--primary-300)',
                      borderRadius: '4px',
                      marginLeft: '0.5rem',
                      width: '150px'
                    }}
                  />
                </div>
              )}
              
              <div>
                <input
                  type="text"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Observaciones adicionales..."
                  style={{
                    padding: '0.5rem',
                    border: '1px solid var(--primary-300)',
                    borderRadius: '4px',
                    width: '100%'
                  }}
                />
              </div>
              
              <button
                className="btn btn-secondary"
                onClick={seleccionarTodos}
                style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
              >
                ✅ Seleccionar Todos
              </button>
              
              <button
                className="btn btn-secondary"
                onClick={deseleccionarTodos}
                style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
              >
                ❌ Deseleccionar
              </button>
            </div>
          </div>

          {/* Lista de empleados */}
          <div style={{ 
            flex: 1,
            overflow: 'auto',
            border: '1px solid var(--primary-200)',
            borderRadius: 'var(--border-radius)'
          }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse', 
              fontSize: '0.875rem',
              background: 'white'
            }}>
              <thead style={{ 
                position: 'sticky', 
                top: 0, 
                background: 'var(--primary-100)',
                zIndex: 10
              }}>
                <tr>
                  <th style={{ padding: '0.75rem', border: '1px solid var(--primary-200)', width: '50px' }}>
                    ✓
                  </th>
                  <th style={{ padding: '0.75rem', border: '1px solid var(--primary-200)', minWidth: '200px' }}>
                    👤 EMPLEADO
                  </th>
                  <th style={{ padding: '0.75rem', border: '1px solid var(--primary-200)', minWidth: '100px' }}>
                    📄 DOCUMENTO
                  </th>
                  <th style={{ padding: '0.75rem', border: '1px solid var(--primary-200)', minWidth: '80px' }}>
                    📅 DÍAS
                  </th>
                  <th style={{ padding: '0.75rem', border: '1px solid var(--primary-200)', minWidth: '120px' }}>
                    💰 INGRESOS
                  </th>
                  <th style={{ padding: '0.75rem', border: '1px solid var(--primary-200)', minWidth: '120px' }}>
                    💸 DESCUENTOS
                  </th>
                  <th style={{ padding: '0.75rem', border: '1px solid var(--primary-200)', minWidth: '120px' }}>
                    💵 NETO A PAGAR
                  </th>
                  <th style={{ padding: '0.75rem', border: '1px solid var(--primary-200)', minWidth: '120px' }}>
                    📊 ESTADO
                  </th>
                  <th style={{ padding: '0.75rem', border: '1px solid var(--primary-200)', minWidth: '100px' }}>
                    📅 FECHA PAGO
                  </th>
                </tr>
              </thead>
              <tbody>
                {empleados.map((empleado, index) => (
                  <tr key={empleado.id} style={{ 
                    backgroundColor: empleado.estado_pago === 'pagado' ? '#f0fdf4' : 
                                   empleadosSeleccionados.includes(empleado.id) ? '#eff6ff' :
                                   index % 2 === 0 ? 'white' : '#f8fafc'
                  }}>
                    <td style={{ 
                      padding: '0.75rem', 
                      border: '1px solid var(--primary-200)',
                      textAlign: 'center'
                    }}>
                      {/* SIEMPRE mostrar checkbox - se puede pagar múltiples veces */}
                      <input
                        type="checkbox"
                        checked={empleadosSeleccionados.includes(empleado.id)}
                        onChange={() => toggleEmpleado(empleado.id)}
                        style={{ width: '16px', height: '16px' }}
                      />
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      border: '1px solid var(--primary-200)',
                      fontWeight: '600'
                    }}>
                      {empleado.empleado_nombre}
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      border: '1px solid var(--primary-200)',
                      color: 'var(--primary-600)'
                    }}>
                      {empleado.empleado_documento}
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      border: '1px solid var(--primary-200)',
                      textAlign: 'center'
                    }}>
                      {empleado.dias_trabajados}
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      border: '1px solid var(--primary-200)',
                      textAlign: 'right',
                      color: 'var(--emerald-600)',
                      fontWeight: '600'
                    }}>
                      S/ {empleado.total_ingresos.toFixed(2)}
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      border: '1px solid var(--primary-200)',
                      textAlign: 'right',
                      color: 'var(--red-600)',
                      fontWeight: '600'
                    }}>
                      S/ {empleado.total_descuentos.toFixed(2)}
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      border: '1px solid var(--primary-200)',
                      textAlign: 'right',
                      color: 'var(--blue-700)',
                      fontWeight: '700',
                      fontSize: '1rem'
                    }}>
                      S/ {empleado.neto_pagar.toFixed(2)}
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      border: '1px solid var(--primary-200)',
                      textAlign: 'center'
                    }}>
                      <span className={
                        empleado.estado_pago === 'pagado' ? 'status-success' : 'status-warning'
                      }>
                        {empleado.estado_pago === 'pagado' ? '✅ Pagado' : '⏳ Pendiente'}
                      </span>
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      border: '1px solid var(--primary-200)',
                      textAlign: 'center',
                      fontSize: '0.8rem',
                      color: 'var(--primary-600)'
                    }}>
                      {empleado.fecha_pago ? new Date(empleado.fecha_pago).toLocaleDateString('es-PE') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Historial de pagos */}
          {historialPagos.length > 0 && (
            <div style={{ 
              marginTop: '1rem',
              flexShrink: 0
            }}>
              <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary-700)' }}>
                📊 Historial de Pagos de esta Planilla
              </h3>
              <div style={{ 
                maxHeight: '150px',
                overflow: 'auto',
                border: '1px solid var(--primary-200)',
                borderRadius: 'var(--border-radius)',
                background: 'white'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead style={{ background: 'var(--primary-50)' }}>
                    <tr>
                      <th style={{ padding: '0.5rem', border: '1px solid var(--primary-200)' }}>Fecha</th>
                      <th style={{ padding: '0.5rem', border: '1px solid var(--primary-200)' }}>Método</th>
                      <th style={{ padding: '0.5rem', border: '1px solid var(--primary-200)' }}>Empleados</th>
                      <th style={{ padding: '0.5rem', border: '1px solid var(--primary-200)' }}>Monto</th>
                      <th style={{ padding: '0.5rem', border: '1px solid var(--primary-200)' }}>N° Operación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historialPagos.map((pago, index) => (
                      <tr key={pago.id} style={{ 
                        backgroundColor: index % 2 === 0 ? 'white' : '#f8fafc'
                      }}>
                        <td style={{ padding: '0.5rem', border: '1px solid var(--primary-200)' }}>
                          {new Date(pago.fecha).toLocaleDateString('es-PE')}
                        </td>
                        <td style={{ padding: '0.5rem', border: '1px solid var(--primary-200)' }}>
                          {pago.metodo === 'efectivo' ? '💵 Efectivo' : '🏦 Transferencia'}
                        </td>
                        <td style={{ padding: '0.5rem', border: '1px solid var(--primary-200)', textAlign: 'center' }}>
                          {pago.empleados_count}
                        </td>
                        <td style={{ padding: '0.5rem', border: '1px solid var(--primary-200)', textAlign: 'right', fontWeight: '600' }}>
                          S/ {pago.monto.toFixed(2)}
                        </td>
                        <td style={{ padding: '0.5rem', border: '1px solid var(--primary-200)' }}>
                          {pago.numero_operacion || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button 
            className="modal-btn modal-btn-warning"
            onClick={generarComprobantePago}
            disabled={empleadosSeleccionados.length === 0}
          >
            📄 Generar Comprobante
          </button>
          
          {/* BOTÓN DE PAGO - SIEMPRE DISPONIBLE para múltiples pagos */}
          <button 
            className="modal-btn modal-btn-success"
            onClick={procesarPago}
            disabled={empleadosSeleccionados.length === 0 || pagando}
          >
            {pagando ? '⏳ Procesando...' : `💰 Pagar ${empleadosSeleccionados.length} Empleados`}
          </button>
          
          <button 
            className="modal-btn modal-btn-secondary" 
            onClick={onClose}
            disabled={pagando}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
} 