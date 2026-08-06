'use client'

import { useState, useCallback, useEffect } from 'react'
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
  // Calculados en tiempo real
  sueldo_diario: number
  descuento_tardanzas: number
  descuento_faltas: number
  pago_horas_extras: number
  sueldo_bruto_total: number
}

const DIAS_LABORABLES_MES = 30
const HORAS_DIA = 8
const VALOR_HORA_NORMAL = (sueldo: number) => sueldo / DIAS_LABORABLES_MES / HORAS_DIA

export default function PlanillaModal({ isOpen, onClose, onSuccess }: PlanillaModalProps) {
  console.log('🔥 PlanillaModal RENDERED - isOpen:', isOpen)

  const { get, post } = useApi()
  const [loading, setLoading] = useState(false)
  const [empleados, setEmpleados] = useState<EmpleadoPlanilla[]>([])


  const [formData, setFormData] = useState({
    periodo: '',
    tipo: 'mensual',
    fecha_inicio: '',
    fecha_fin: '',
    fecha_pago: '',
    observaciones: '',
    estado: 'borrador'
  })

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
      observaciones: `Planilla mensual ${periodo}`,
      estado: 'borrador'
    })
  }

  const loadEmpleados = useCallback(async () => {
    console.log('🔥 loadEmpleados INICIADO')
    try {
      setLoading(true)

      console.log('🔥 Haciendo GET a /api/rrhh/empleados')
      const empleadosResponse = await get('/api/rrhh/empleados')
      console.log('🔥 Respuesta empleados:', empleadosResponse)

      if (empleadosResponse && empleadosResponse.success && empleadosResponse.data) {
        const empleadosActivos = empleadosResponse.data.filter((emp: any) => emp.estado === 'activo')
        console.log('🔥 Empleados activos encontrados:', empleadosActivos.length)

        const empleadosConDatos = empleadosActivos.map((emp: any) => {
          const sueldoBase = emp.contratos?.[0]?.sueldo_bruto || 0
          return {
            ...emp,
            incluir: true,
            dias_trabajados: DIAS_LABORABLES_MES,
            horas_extras_25: 0,
            horas_extras_35: 0,
            tardanzas_minutos: 0,
            faltas: 0,
            sueldo_base: sueldoBase,
            bonos_adicionales: 0,
            // Calculados
            sueldo_diario: sueldoBase / DIAS_LABORABLES_MES,
            descuento_tardanzas: 0,
            descuento_faltas: 0,
            pago_horas_extras: 0,
            sueldo_bruto_total: sueldoBase
          }
        })

        console.log('🔥 Empleados procesados para planilla:', empleadosConDatos.length)
        setEmpleados(empleadosConDatos)
      } else {
        console.error('🔥 Error en respuesta empleados:', empleadosResponse)
        throw new Error('No se pudieron cargar empleados')
      }
    } catch (error) {
      console.error('🔥 ERROR CARGANDO EMPLEADOS:', error)
      toast({
        title: "Error",
        description: "No se pudieron cargar los empleados",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    console.log('🔥 useEffect triggered - isOpen:', isOpen)
    if (isOpen) {
      console.log('🔥 Modal OPENING - configurando período y cargando empleados')
      configurarPeriodoActual()
      loadEmpleados()
      document.body.style.overflow = 'hidden'
    } else {
      console.log('🔥 Modal CLOSING')
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, loadEmpleados])

  const calcularValoresEmpleado = (empleado: EmpleadoPlanilla) => {
    const sueldoDiario = empleado.sueldo_base / DIAS_LABORABLES_MES
    const valorHoraNormal = empleado.sueldo_base / DIAS_LABORABLES_MES / HORAS_DIA

    // Descuentos por tardanzas (proporcional por minuto)
    const descuentoTardanzas = (empleado.tardanzas_minutos * valorHoraNormal) / 60

    // Descuentos por faltas (día completo)
    const descuentoFaltas = empleado.faltas * sueldoDiario

    // Pago por horas extras
    const pagoHorasExtras25 = empleado.horas_extras_25 * valorHoraNormal * 1.25
    const pagoHorasExtras35 = empleado.horas_extras_35 * valorHoraNormal * 1.35
    const pagoHorasExtras = pagoHorasExtras25 + pagoHorasExtras35

    // Sueldo bruto total
    const sueldoBrutoTotal = empleado.sueldo_base + empleado.bonos_adicionales + pagoHorasExtras - descuentoTardanzas - descuentoFaltas

    return {
      sueldo_diario: sueldoDiario,
      descuento_tardanzas: descuentoTardanzas,
      descuento_faltas: descuentoFaltas,
      pago_horas_extras: pagoHorasExtras,
      sueldo_bruto_total: sueldoBrutoTotal
    }
  }

  const actualizarEmpleado = (empleadoId: string, campo: string, valor: any) => {
    setEmpleados(prevEmpleados =>
      prevEmpleados.map(emp => {
        if (emp.id === empleadoId) {
          const empleadoActualizado = { ...emp, [campo]: valor }
          const calculados = calcularValoresEmpleado(empleadoActualizado)
          return { ...empleadoActualizado, ...calculados }
        }
        return emp
      })
    )
  }

  const empleadosSeleccionados = empleados.filter(emp => emp.incluir)
  const totalPlanilla = empleadosSeleccionados.reduce((sum, emp) => sum + emp.sueldo_bruto_total, 0)
  const totalEmpleados = empleadosSeleccionados.length

  const handleSubmit = async (e: React.FormEvent) => {
    console.log('🔥 handleSubmit EJECUTADO')
    e.preventDefault()
    setLoading(true)

    try {
      console.log('🔥 Empleados seleccionados:', empleadosSeleccionados.length)
      console.log('🔥 Form data:', formData)

      if (empleadosSeleccionados.length === 0) {
        console.error('🔥 ERROR: No hay empleados seleccionados')
        toast({
          title: "Error",
          description: "Debe seleccionar al menos un empleado",
          variant: "destructive",
        })
        return
      }

      if (!formData.periodo.trim()) {
        console.error('🔥 ERROR: No hay período')
        toast({
          title: "Error",
          description: "Ingrese el período de la planilla",
          variant: "destructive",
        })
        return
      }

      console.log('🔥 Creando planilla con data:', formData)
      // Crear planilla
      const createResponse = await post('/api/rrhh/planillas', formData)
      console.log('🔥 Respuesta crear planilla:', createResponse)

      if (!createResponse) {
        throw new Error('Error creando planilla')
      }

      console.log('🔥 Calculando planilla personalizada...')
      // Calcular con empleados personalizados
      const calcResponse = await post(`/api/rrhh/planillas/${createResponse.id}/calcular-personalizada`, {
        empleados: empleadosSeleccionados.map((empleado) => ({
          empleado_id: empleado.id,
          dias_trabajados: empleado.dias_trabajados,
          horas_extras_25: empleado.horas_extras_25,
          horas_extras_35: empleado.horas_extras_35,
          tardanzas_minutos: empleado.tardanzas_minutos,
          faltas: empleado.faltas,
          bonos_adicionales: empleado.bonos_adicionales,
        })),
      })
      console.log('🔥 Respuesta calcular:', calcResponse)

      if (calcResponse && calcResponse.success) {
        console.log('🔥 ÉXITO: Planilla creada correctamente')
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
      console.error('🔥 ERROR EN SUBMIT:', error)
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
      observaciones: '',
      estado: 'borrador'
    })
    setEmpleados([])
    onClose()
  }

  if (!isOpen) {
    console.log('🔥 Modal NO ESTÁ ABIERTO - retornando null')
    return null
  }

  console.log('🔥 Modal SÍ ESTÁ ABIERTO - renderizando contenido')

  const modalContent = (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.5)] flex items-center justify-center p-4 z-[99999]"
    >
      <div className="bg-card rounded-xl shadow w-[100%] max-w-[1280px] overflow-hidden z-[100000]"
      >

        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2 m-0">
                💰 Nueva Planilla de Sueldos
              </h2>
              <p className="text-sm text-muted-foreground mt-[4px] m-0">
                Configure el período y seleccione empleados para generar la planilla
              </p>
            </div>

            <button
              onClick={handleClose} className="w-8 h-8 rounded-full bg-red-500 text-white border-0 cursor-pointer flex items-center justify-center font-bold text-base"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          <form id="planilla-form" onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Configuración de Planilla */}
            <div className="bg-muted p-4 rounded-lg">
              <h3 className="text-[18px] font-medium text-foreground mb-4 m-0">⚙️ Configuración</h3>
              <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4">
                <div>
                  <label htmlFor="planilla-modal-periodo" className="block text-sm font-medium text-foreground/85 mb-[4px]">Período</label>
                  <input id="planilla-modal-periodo"
                    type="text"
                    value={formData.periodo}
                    onChange={(e) => setFormData(prev => ({ ...prev, periodo: e.target.value }))} className="w-[100%] p-2 border rounded-[6px] text-sm"
                    placeholder="2025-06"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="planilla-modal-fecha-inicio" className="block text-sm font-medium text-foreground/85 mb-[4px]">Fecha Inicio</label>
                  <input id="planilla-modal-fecha-inicio"
                    type="date"
                    value={formData.fecha_inicio}
                    onChange={(e) => setFormData(prev => ({ ...prev, fecha_inicio: e.target.value }))} className="w-[100%] p-2 border rounded-[6px] text-sm"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="planilla-modal-fecha-fin" className="block text-sm font-medium text-foreground/85 mb-[4px]">Fecha Fin</label>
                  <input id="planilla-modal-fecha-fin"
                    type="date"
                    value={formData.fecha_fin}
                    onChange={(e) => setFormData(prev => ({ ...prev, fecha_fin: e.target.value }))} className="w-[100%] p-2 border rounded-[6px] text-sm"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="planilla-modal-fecha-pago" className="block text-sm font-medium text-foreground/85 mb-[4px]">Fecha Pago</label>
                  <input id="planilla-modal-fecha-pago"
                    type="date"
                    value={formData.fecha_pago}
                    onChange={(e) => setFormData(prev => ({ ...prev, fecha_pago: e.target.value }))} className="w-[100%] p-2 border rounded-[6px] text-sm"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label htmlFor="planilla-modal-observaciones" className="block text-sm font-medium text-foreground/85 mb-[4px]">Observaciones</label>
                <textarea id="planilla-modal-observaciones"
                  value={formData.observaciones}
                  onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))} className="w-[100%] p-2 border rounded-[6px] text-sm"
                  rows={2}
                />
              </div>
            </div>

            {/* Gestión de Empleados */}
            <div>
              <h3 className="text-[18px] font-medium text-foreground mb-4 m-0">👥 Empleados para Planilla</h3>

              <div className="border rounded-lg overflow-hidden">
                {/* Header con explicaciones claras */}
                <div className="bg-muted py-3 px-4 grid grid-cols-[40px_200px_120px_80px_80px_80px_80px_80px_120px] gap-2 text-xs font-semibold text-foreground/85 border-b">
                  <div>✓</div>
                  <div>👤 EMPLEADO</div>
                  <div>💰 SUELDO BASE<br/><span className="text-[0.625rem] text-muted-foreground">Mensual S/</span></div>
                  <div>📅 DÍAS<br/><span className="text-[0.625rem] text-muted-foreground">Trabajados</span></div>
                  <div>⏰ HE 25%<br/><span className="text-[0.625rem] text-muted-foreground">Primeras 2h</span></div>
                  <div>⏰ HE 35%<br/><span className="text-[0.625rem] text-muted-foreground">Siguientes</span></div>
                  <div>⏱️ TARDANZAS<br/><span className="text-[0.625rem] text-muted-foreground">Minutos</span></div>
                  <div>❌ FALTAS<br/><span className="text-[0.625rem] text-muted-foreground">Días</span></div>
                  <div>💵 BONOS<br/><span className="text-[0.625rem] text-muted-foreground">Adicionales S/</span></div>
                </div>

                {/* Filas de empleados con explicaciones */}
                <div className="max-h-[320px] overflow-y-auto">
                  {empleados.map((empleado) => {
                    const valores = calcularValoresEmpleado(empleado)
                    return (
                    <div
                      key={empleado.id} className="py-3 px-4 grid grid-cols-[40px_200px_120px_80px_80px_80px_80px_80px_120px] gap-2 text-[13px] border-b"
                    >
                      {/* Checkbox selección */}
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={empleado.incluir}
                          onChange={(e) => actualizarEmpleado(empleado.id, 'incluir', e.target.checked)} className="w-4 h-4 cursor-pointer"
                        />
                      </div>

                      {/* Datos del empleado */}
                      <div>
                        <div className="font-semibold text-foreground mb-[2px]">
                          {empleado.nombres} {empleado.apellidos}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {empleado.puesto} • DNI: {empleado.numero_documento}
                        </div>
                      </div>
                      {/* Sueldo Base */}
                      <div className="text-center">
                        <input
                          type="number"
                          value={empleado.sueldo_base}
                          onChange={(e) => actualizarEmpleado(empleado.id, 'sueldo_base', parseFloat(e.target.value) || 0)}
                          disabled={!empleado.incluir} className="w-[100%] p-[4px] text-xs border rounded-[4px] text-center"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                        />
                        <div className="text-[0.625rem] text-emerald-400 font-semibold mt-[2px]">
                          S/ {empleado.sueldo_base.toFixed(0)}
                        </div>
                      </div>

                      {/* Días Trabajados */}
                      <div className="text-center">
                        <input
                          type="number"
                          value={empleado.dias_trabajados}
                          onChange={(e) => actualizarEmpleado(empleado.id, 'dias_trabajados', parseInt(e.target.value) || 0)}
                          disabled={!empleado.incluir} className="w-[100%] p-[4px] text-xs border rounded-[4px] text-center"
                          min="0"
                          max="31"
                        />
                        <div className="text-[0.625rem] text-primary font-semibold mt-[2px]">
                          de 30 días
                        </div>
                      </div>

                      {/* Horas Extras 25% */}
                      <div className="text-center">
                        <input
                          type="number"
                          value={empleado.horas_extras_25}
                          onChange={(e) => actualizarEmpleado(empleado.id, 'horas_extras_25', parseFloat(e.target.value) || 0)}
                          disabled={!empleado.incluir} className="w-[100%] p-[4px] text-xs border rounded-[4px] text-center"
                          min="0"
                          step="0.5"
                        />
                        <div className="text-[0.625rem] text-destructive font-semibold mt-[2px]">
                          +25%
                        </div>
                      </div>

                      {/* Horas Extras 35% */}
                      <div className="text-center">
                        <input
                          type="number"
                          value={empleado.horas_extras_35}
                          onChange={(e) => actualizarEmpleado(empleado.id, 'horas_extras_35', parseFloat(e.target.value) || 0)}
                          disabled={!empleado.incluir} className="w-[100%] p-[4px] text-xs border rounded-[4px] text-center"
                          min="0"
                          step="0.5"
                        />
                        <div className="text-[0.625rem] text-destructive font-semibold mt-[2px]">
                          +35%
                        </div>
                      </div>

                      {/* Tardanzas */}
                      <div className="text-center">
                        <input
                          type="number"
                          value={empleado.tardanzas_minutos}
                          onChange={(e) => actualizarEmpleado(empleado.id, 'tardanzas_minutos', parseInt(e.target.value) || 0)}
                          disabled={!empleado.incluir} className="w-[100%] p-[4px] text-xs border rounded-[4px] text-center"
                          min="0"
                        />
                        <div className="text-[0.625rem] text-amber-500 font-semibold mt-[2px]">
                          -S/ {(empleado.tardanzas_minutos * (empleado.sueldo_base / 30 / 8) / 60).toFixed(0)}
                        </div>
                      </div>

                      {/* Faltas */}
                      <div className="text-center">
                        <input
                          type="number"
                          value={empleado.faltas}
                          onChange={(e) => actualizarEmpleado(empleado.id, 'faltas', parseInt(e.target.value) || 0)}
                          disabled={!empleado.incluir} className="w-[100%] p-[4px] text-xs border rounded-[4px] text-center"
                          min="0"
                        />
                        <div className="text-[0.625rem] text-red-500 font-semibold mt-[2px]">
                          -S/ {(empleado.faltas * (empleado.sueldo_base / 30)).toFixed(0)}
                        </div>
                      </div>

                      {/* Bonos Adicionales */}
                      <div className="text-center">
                        <input
                          type="number"
                          value={empleado.bonos_adicionales}
                          onChange={(e) => actualizarEmpleado(empleado.id, 'bonos_adicionales', parseFloat(e.target.value) || 0)}
                          disabled={!empleado.incluir} className="w-[100%] p-[4px] text-xs border rounded-[4px] text-center"
                          min="0"
                          step="0.01"
                        />
                        <div className="text-[0.625rem] text-emerald-400 font-semibold mt-[2px]">
                          Total: S/ {valores.sueldo_bruto_total.toFixed(0)}
                        </div>
                      </div>
                    </div>
                                      )
                  })}
                </div>
              </div>

              {/* Resumen Empresarial Claro */}
              <div className="mt-4 p-4 bg-muted rounded-lg border">
                <div className="grid grid-cols-[repeat(auto-fit,_minmax(150px,_1fr))] gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-primary">
                      {empleadosSeleccionados.length}
                    </div>
                    <div className="text-xs text-[#1e40af] font-medium">
                      EMPLEADOS INCLUIDOS
                    </div>
                  </div>

                  <div>
                    <div className="text-2xl font-bold text-emerald-400">
                      S/ {totalPlanilla.toFixed(0)}
                    </div>
                    <div className="text-xs text-emerald-400 font-medium">
                      TOTAL BRUTO PLANILLA
                    </div>
                  </div>

                  <div>
                    <div className="text-2xl font-bold text-violet-400">
                      S/ {empleadosSeleccionados.length > 0 ? (totalPlanilla / empleadosSeleccionados.length).toFixed(0) : '0'}
                    </div>
                    <div className="text-xs text-violet-400 font-medium">
                      PROMEDIO POR EMPLEADO
                    </div>
                  </div>

                  <div>
                    <div className="text-2xl font-bold text-destructive">
                      {formData.periodo}
                    </div>
                    <div className="text-xs text-destructive font-medium">
                      PERÍODO PLANILLA
                    </div>
                  </div>
                </div>

                {empleadosSeleccionados.length > 0 && (
                  <div className="mt-3 py-2 px-3 bg-[#dcfce7] rounded-[6px] text-[13px] text-[#166534] text-center font-medium">
                    ✅ Planilla lista para procesar con {empleadosSeleccionados.length} empleados
                    • Se calcularán automáticamente: AFP/ONP, ESSALUD, Impuesto 5ta categoría
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="py-4 px-6 border-t bg-muted flex justify-end items-center gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading} className="py-2 px-6 text-muted-foreground border rounded-lg bg-card text-sm"
          >
            Cancelar
          </button>

          <button
            type="submit"
            form="planilla-form"
            disabled={loading || empleadosSeleccionados.length === 0 || !formData.periodo} className="py-2 px-8 text-white rounded-lg border-0 flex items-center gap-2 text-sm font-medium"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded-full"></div>
                Procesando...
              </>
            ) : (
              <>
                ✅ Crear Planilla
                <span className="bg-blue-700 py-[2px] px-2 rounded-[4px] text-xs">
                  {empleadosSeleccionados.length} empleados
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof window !== 'undefined') {
    console.log('🔥 CREANDO PORTAL EN DOCUMENT.BODY')
    console.log('🔥 document.body existe:', !!document.body)
    return createPortal(modalContent, document.body)
  } else {
    console.log('🔥 Window undefined - no creando portal')
    return null
  }
}
