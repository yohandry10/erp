'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useApi } from '@/hooks/use-api'
import { toast } from '@/components/ui/use-toast'

interface PlanillaModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface Empleado {
  id: string
  nombres: string
  apellidos: string
  numero_documento: string
  puesto: string
  estado: string
  contratos?: any[]
}

interface EmpleadoPlanilla extends Empleado {
  incluir: boolean
  dias_trabajados: number
  horas_extras_25: number
  horas_extras_35: number
  tardanzas_minutos: number
  faltas: number
  sueldo_base: number
  bonos_adicionales: number
}

export default function PlanillaModal({ isOpen, onClose, onSuccess }: PlanillaModalProps) {
  const { get, post } = useApi()
  const [loading, setLoading] = useState(false)
  const [empleados, setEmpleados] = useState<EmpleadoPlanilla[]>([])
  
  const [formData, setFormData] = useState({
    periodo: '',
    tipo: 'mensual',
    fecha_inicio: '',
    fecha_fin: '',
    fecha_pago: '',
    observaciones: ''
  })

  useEffect(() => {
    if (isOpen) {
      loadEmpleados()
      configurarPeriodoActual()
      // Prevenir scroll del body
      document.body.style.overflow = 'hidden'
    } else {
      // Restaurar scroll del body
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const configurarPeriodoActual = () => {
    const ahora = new Date()
    const periodo = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
    const fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
    const fechaFin = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0)
    const fechaPago = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 5)
    
    setFormData({
      periodo,
      tipo: 'mensual',
      fecha_inicio: fechaInicio.toISOString().split('T')[0],
      fecha_fin: fechaFin.toISOString().split('T')[0],
      fecha_pago: fechaPago.toISOString().split('T')[0],
      observaciones: `Planilla mensual ${periodo}`
    })
  }

  const loadEmpleados = async () => {
    try {
      setLoading(true)
      
      const empleadosResponse = await get('/api/rrhh/empleados')
      
      if (empleadosResponse && empleadosResponse.success && empleadosResponse.data) {
        const empleadosActivos = empleadosResponse.data.filter(emp => emp.estado === 'activo')
        
        const empleadosConDatos = empleadosActivos.map(emp => ({
          ...emp,
          incluir: true,
          dias_trabajados: 30,
          horas_extras_25: 0,
          horas_extras_35: 0,
          tardanzas_minutos: 0,
          faltas: 0,
          sueldo_base: emp.contratos?.[0]?.sueldo_bruto || 0,
          bonos_adicionales: 0
        }))
        
        setEmpleados(empleadosConDatos)
      } else {
        throw new Error('No se pudieron cargar empleados')
      }
    } catch (error) {
      console.error('Error cargando empleados:', error)
      toast({
        title: "Error",
        description: "No se pudieron cargar los empleados",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const actualizarEmpleado = (empleadoId: string, campo: string, valor: any) => {
    setEmpleados(prevEmpleados =>
      prevEmpleados.map(emp =>
        emp.id === empleadoId
          ? { ...emp, [campo]: valor }
          : emp
      )
    )
  }

  const empleadosSeleccionados = Array.isArray(empleados) ? empleados.filter(emp => emp.incluir) : []
  const totalSueldosBase = empleadosSeleccionados.reduce((sum, emp) => sum + (emp.sueldo_base || 0), 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (empleadosSeleccionados.length === 0) {
        toast({
          title: "Error",
          description: "Debe seleccionar al menos un empleado",
          variant: "destructive",
        })
        return
      }

      if (!formData.periodo.trim()) {
        toast({
          title: "Error",
          description: "Ingrese el período de la planilla",
          variant: "destructive",
        })
        return
      }

      // Crear planilla
      const createResponse = await post('/api/rrhh/planillas', formData)

      if (!createResponse) {
        throw new Error('Error creando planilla')
      }

      // Calcular con empleados personalizados
      const calcResponse = await post(`/api/rrhh/planillas/${createResponse.id}/calcular-personalizada`, {
        empleados: empleadosSeleccionados
      })

      if (calcResponse && calcResponse.success) {
        toast({
          title: "¡Éxito!",
          description: `Planilla ${formData.periodo} creada con ${calcResponse.totalEmpleados} empleados`,
          variant: "default",
        })
        onSuccess()
        handleClose()
      } else {
        throw new Error('Error calculando planilla')
      }

    } catch (error: any) {
      console.error('Error:', error)
      toast({
        title: "Error",
        description: error.message || "Error procesando planilla",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFormData({
      periodo: '',
      tipo: 'mensual',
      fecha_inicio: '',
      fecha_fin: '',
      fecha_pago: '',
      observaciones: ''
    })
    setEmpleados([])
    onClose()
  }

  if (!isOpen) {
    return null
  }
  
  const modalContent = (
    <div 
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div 
        className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden"
        style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          width: '100%',
          maxWidth: '72rem',
          maxHeight: '90vh',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-800">📋 Nueva Planilla</h2>
            <button
              onClick={handleClose}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'rotate(90deg) scale(1.1)'
                e.currentTarget.style.backgroundColor = '#b91c1c'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'rotate(0deg) scale(1)'
                e.currentTarget.style.backgroundColor = '#dc2626'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div 
          className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]"
          style={{
            padding: '1.5rem',
            overflowY: 'auto',
            maxHeight: 'calc(90vh - 140px)'
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Configuración de Planilla */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-medium text-gray-800 mb-4">⚙️ Configuración</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Período</label>
                  <input
                    type="text"
                    value={formData.periodo}
                    onChange={(e) => handleInputChange('periodo', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="2025-06"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
                  <input
                    type="date"
                    value={formData.fecha_inicio}
                    onChange={(e) => handleInputChange('fecha_inicio', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
                  <input
                    type="date"
                    value={formData.fecha_fin}
                    onChange={(e) => handleInputChange('fecha_fin', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Pago</label>
                  <input
                    type="date"
                    value={formData.fecha_pago}
                    onChange={(e) => handleInputChange('fecha_pago', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                <textarea
                  value={formData.observaciones}
                  onChange={(e) => handleInputChange('observaciones', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                />
              </div>
            </div>

            {/* Gestión de Empleados */}
            <div>
              <h3 className="text-lg font-medium text-gray-800 mb-4">👥 Empleados</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Header de tabla */}
                <div className="bg-gray-50 px-4 py-3 grid grid-cols-12 gap-2 text-sm font-medium text-gray-700 border-b">
                  <div className="col-span-1">✓</div>
                  <div className="col-span-3">Empleado</div>
                  <div className="col-span-1">Sueldo</div>
                  <div className="col-span-1">Días</div>
                  <div className="col-span-1">HE 25%</div>
                  <div className="col-span-1">HE 35%</div>
                  <div className="col-span-1">Tardanzas</div>
                  <div className="col-span-1">Faltas</div>
                  <div className="col-span-2">Bonos</div>
                </div>

                {/* Filas de empleados */}
                <div className="max-h-80 overflow-y-auto">
                  {(Array.isArray(empleados) ? empleados : []).map((empleado, index) => (
                    <div 
                      key={empleado.id} 
                      className={`px-4 py-3 grid grid-cols-12 gap-2 text-sm border-b border-gray-100 ${
                        empleado.incluir ? 'bg-white' : 'bg-gray-50'
                      }`}
                    >
                      <div className="col-span-1 flex items-center">
                        <input
                          type="checkbox"
                          checked={empleado.incluir}
                          onChange={(e) => actualizarEmpleado(empleado.id, 'incluir', e.target.checked)}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </div>
                      <div className="col-span-3">
                        <div className="font-medium text-gray-900">
                          {empleado.nombres} {empleado.apellidos}
                        </div>
                        <div className="text-gray-500 text-xs">{empleado.puesto}</div>
                      </div>
                      <div className="col-span-1">
                        <input
                          type="number"
                          value={empleado.sueldo_base}
                          onChange={(e) => actualizarEmpleado(empleado.id, 'sueldo_base', parseFloat(e.target.value) || 0)}
                          disabled={!empleado.incluir}
                          className="w-full p-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div className="col-span-1">
                        <input
                          type="number"
                          value={empleado.dias_trabajados}
                          onChange={(e) => actualizarEmpleado(empleado.id, 'dias_trabajados', parseInt(e.target.value) || 0)}
                          disabled={!empleado.incluir}
                          className="w-full p-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                          min="0"
                          max="31"
                        />
                      </div>
                      <div className="col-span-1">
                        <input
                          type="number"
                          value={empleado.horas_extras_25}
                          onChange={(e) => actualizarEmpleado(empleado.id, 'horas_extras_25', parseFloat(e.target.value) || 0)}
                          disabled={!empleado.incluir}
                          className="w-full p-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                          min="0"
                          step="0.5"
                        />
                      </div>
                      <div className="col-span-1">
                        <input
                          type="number"
                          value={empleado.horas_extras_35}
                          onChange={(e) => actualizarEmpleado(empleado.id, 'horas_extras_35', parseFloat(e.target.value) || 0)}
                          disabled={!empleado.incluir}
                          className="w-full p-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                          min="0"
                          step="0.5"
                        />
                      </div>
                      <div className="col-span-1">
                        <input
                          type="number"
                          value={empleado.tardanzas_minutos}
                          onChange={(e) => actualizarEmpleado(empleado.id, 'tardanzas_minutos', parseInt(e.target.value) || 0)}
                          disabled={!empleado.incluir}
                          className="w-full p-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                          min="0"
                        />
                      </div>
                      <div className="col-span-1">
                        <input
                          type="number"
                          value={empleado.faltas}
                          onChange={(e) => actualizarEmpleado(empleado.id, 'faltas', parseInt(e.target.value) || 0)}
                          disabled={!empleado.incluir}
                          className="w-full p-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                          min="0"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          value={empleado.bonos_adicionales}
                          onChange={(e) => actualizarEmpleado(empleado.id, 'bonos_adicionales', parseFloat(e.target.value) || 0)}
                          disabled={!empleado.incluir}
                          className="w-full p-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resumen */}
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <div className="text-sm text-blue-800">
                  <strong>📊 Resumen:</strong> {empleadosSeleccionados.length} empleados seleccionados
                  {empleadosSeleccionados.length > 0 && (
                    <span> | Total sueldos base: S/ {totalSueldosBase.toFixed(2)}</span>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div 
          style={{
            padding: '1.5rem',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem'
          }}
        >
          <button
            type="button"
            onClick={handleClose}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151',
              backgroundColor: 'white',
              border: '2px solid #d1d5db',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6'
              e.currentTarget.style.borderColor = '#9ca3af'
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white'
              e.currentTarget.style.borderColor = '#d1d5db'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}
          >
            ❌ Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || empleadosSeleccionados.length === 0}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: '600',
              color: 'white',
              backgroundColor: loading || empleadosSeleccionados.length === 0 ? '#9ca3af' : '#059669',
              border: 'none',
              borderRadius: '8px',
              cursor: loading || empleadosSeleccionados.length === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}
            onMouseEnter={(e) => {
              if (!loading && empleadosSeleccionados.length > 0) {
                e.currentTarget.style.backgroundColor = '#047857'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(5, 150, 105, 0.4)'
              }
            }}
            onMouseLeave={(e) => {
              if (!loading && empleadosSeleccionados.length > 0) {
                e.currentTarget.style.backgroundColor = '#059669'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)'
              }
            }}
          >
            {loading ? '⏳ Procesando...' : '✅ Crear Planilla Perú'}
          </button>
        </div>
      </div>
    </div>
  )

  // Usar portal para renderizar el modal en el body
  return typeof window !== 'undefined' 
    ? createPortal(modalContent, document.body)
    : null
} 