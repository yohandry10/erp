'use client'

import Image from 'next/image'
import { useState, useCallback, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
import { toast } from '@/components/ui/use-toast'

interface Empleado {
  id: string
  nombres: string
  apellidos: string
  numero_documento: string
  puesto: string
  foto_url?: string
}

interface RegistroAsistencia {
  id: string
  id_empleado: string
  fecha: string
  hora_entrada?: string
  hora_salida?: string
  horas_trabajadas: number
  estado: 'presente' | 'ausente' | 'licencia' | 'vacaciones'
  tardanza_minutos: number
  empleados: Empleado
}

export default function AsistenciaComponent() {
  const { get, post } = useApi()
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [asistenciaHoy, setAsistenciaHoy] = useState<RegistroAsistencia[]>([])
  const [loading, setLoading] = useState(false)
  const [fechaConsulta, setFechaConsulta] = useState(new Date().toISOString().split('T')[0])
  const [modoMarcado, setModoMarcado] = useState<'individual' | 'masivo'>('individual')

  const loadEmpleados = useCallback(async () => {
    try {
      const response = await get('/api/rrhh/empleados')
      if (response?.success) {
        const empleadosActivos = response.data.filter((emp: any) => emp.estado === 'activo')
        setEmpleados(empleadosActivos)
      }
    } catch (error) {
      console.error('Error cargando empleados:', error)
    }
  }, [get])

  const loadAsistenciaDelDia = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get(`/api/rrhh/asistencia?fecha_desde=${fechaConsulta}&fecha_hasta=${fechaConsulta}`)
      if (response?.success) {
        setAsistenciaHoy(response.data)
      }
    } catch (error) {
      console.error('Error cargando asistencia:', error)
    } finally {
      setLoading(false)
    }
  }, [fechaConsulta, get])

  useEffect(() => {
    loadEmpleados()
    loadAsistenciaDelDia()
  }, [loadAsistenciaDelDia, loadEmpleados])

  const marcarAsistencia = async (empleadoId: string, tipo: 'entrada' | 'salida') => {
    try {
      setLoading(true)
      const response = await post(`/api/rrhh/asistencia/${tipo}/${empleadoId}`, {})

      if (response?.success) {
        toast({
          title: `✅ ${tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada`,
          description: response.message,
          variant: "default",
        })
        loadAsistenciaDelDia()
      } else {
        throw new Error(response?.message || 'Error en el registro')
      }
    } catch (error: any) {
      toast({
        title: `❌ Error`,
        description: error.message || `Error registrando ${tipo}`,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const marcarTodosPresentes = async () => {
    try {
      setLoading(true)
      const empleadosSinMarcar = empleados.filter(emp =>
        !asistenciaHoy.find(asist => asist.id_empleado === emp.id)
      )

      for (const empleado of empleadosSinMarcar) {
        await post(`/api/rrhh/asistencia/entrada/${empleado.id}`, {})
      }

      toast({
        title: "✅ Marcado masivo completado",
        description: `Se marcó entrada para ${empleadosSinMarcar.length} empleados`,
        variant: "default",
      })
      loadAsistenciaDelDia()
    } catch (error) {
      toast({
        title: "❌ Error en marcado masivo",
        description: "No se pudo completar el marcado masivo",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const getEstadoEmpleado = (empleado: Empleado) => {
    const registro = asistenciaHoy.find(asist => asist.id_empleado === empleado.id)

    if (!registro) {
      return { estado: 'sin_marcar', color: 'bg-muted text-foreground/80', icon: '❓' }
    }

    if (registro.hora_entrada && !registro.hora_salida) {
      return { estado: 'trabajando', color: 'bg-emerald-500/10 text-emerald-400', icon: '💼' }
    }

    if (registro.hora_entrada && registro.hora_salida) {
      return { estado: 'completo', color: 'bg-primary/10 text-primary', icon: '✅' }
    }

    return { estado: 'ausente', color: 'bg-destructive/10 text-destructive', icon: '❌' }
  }

  const formatearHora = (hora: string) => {
    return new Date(`2000-01-01T${hora}`).toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const calcularHorasTrabajadas = (entrada: string, salida?: string) => {
    if (!salida) return 0
    const horaEntrada = new Date(`2000-01-01T${entrada}`)
    const horaSalida = new Date(`2000-01-01T${salida}`)
    return (horaSalida.getTime() - horaEntrada.getTime()) / (1000 * 60 * 60)
  }

  const horaActual = new Date().toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  const estadisticasDelDia = {
    total: empleados.length,
    presentes: asistenciaHoy.filter(a => a.hora_entrada).length,
    trabajando: asistenciaHoy.filter(a => a.hora_entrada && !a.hora_salida).length,
    completados: asistenciaHoy.filter(a => a.hora_entrada && a.hora_salida).length,
    ausentes: empleados.length - asistenciaHoy.filter(a => a.hora_entrada).length
  }

  return (
    <div className="space-y-6">
      {/* Header con estadísticas */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-100 p-6 rounded-xl border border-blue-200">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
              ⏰ Control de Asistencia
            </h2>
            <p className="text-primary mt-1">
              Gestión de marcado de entrada y salida • Hora actual: {horaActual}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-primary">Fecha de consulta</div>
              <input
                type="date"
                value={fechaConsulta}
                onChange={(e) => setFechaConsulta(e.target.value)}
                className="p-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Estadísticas del día */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
          <div className="bg-card p-4 rounded-lg text-center shadow-sm">
            <div className="text-2xl font-bold text-foreground">{estadisticasDelDia.total}</div>
            <div className="text-sm text-foreground/80">👥 Total empleados</div>
          </div>
          <div className="bg-card p-4 rounded-lg text-center shadow-sm">
            <div className="text-2xl font-bold text-emerald-400">{estadisticasDelDia.presentes}</div>
            <div className="text-sm text-foreground/80">✅ Presentes</div>
          </div>
          <div className="bg-card p-4 rounded-lg text-center shadow-sm">
            <div className="text-2xl font-bold text-primary">{estadisticasDelDia.trabajando}</div>
            <div className="text-sm text-foreground/80">💼 Trabajando</div>
          </div>
          <div className="bg-card p-4 rounded-lg text-center shadow-sm">
            <div className="text-2xl font-bold text-violet-400">{estadisticasDelDia.completados}</div>
            <div className="text-sm text-foreground/80">🏁 Terminados</div>
          </div>
          <div className="bg-card p-4 rounded-lg text-center shadow-sm">
            <div className="text-2xl font-bold text-destructive">{estadisticasDelDia.ausentes}</div>
            <div className="text-sm text-foreground/80">❌ Ausentes</div>
          </div>
        </div>
      </div>

      {/* Controles de marcado */}
      <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-foreground">🎯 Herramientas de Marcado</h3>

          <div className="flex gap-3">
            <button
              onClick={() => setModoMarcado('individual')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                modoMarcado === 'individual'
                  ? 'bg-primary/10 text-primary border border-blue-300'
                  : 'bg-muted text-foreground/80 hover:bg-muted'
              }`}
            >
              👤 Individual
            </button>
            <button
              onClick={() => setModoMarcado('masivo')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                modoMarcado === 'masivo'
                  ? 'bg-primary/10 text-primary border border-blue-300'
                  : 'bg-muted text-foreground/80 hover:bg-muted'
              }`}
            >
              👥 Masivo
            </button>
          </div>
        </div>

        {modoMarcado === 'masivo' && (
          <div className="bg-amber-500/10 border border-amber-200 rounded-lg p-4 mb-4">
            <h4 className="font-medium text-amber-400 mb-2">🚀 Marcado masivo</h4>
            <p className="text-sm text-amber-400 mb-3">
              Marcar entrada para todos los empleados que aún no han registrado asistencia hoy.
            </p>
            <button
              onClick={marcarTodosPresentes}
              disabled={loading}
              className="bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 disabled:bg-gray-400 transition-colors"
            >
              {loading ? '⏳ Marcando...' : '✅ Marcar todos presentes'}
            </button>
          </div>
        )}
      </div>

      {/* Lista de empleados con controles */}
      <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="bg-muted/30 px-6 py-3 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">👥 Estado de Empleados - {new Date(fechaConsulta).toLocaleDateString('es-PE')}</h3>
        </div>

        <div className="divide-y divide-gray-100">
          {empleados.map((empleado) => {
            const registro = asistenciaHoy.find(asist => asist.id_empleado === empleado.id)
            const estadoInfo = getEstadoEmpleado(empleado)

            return (
              <div key={empleado.id} className="p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                      {empleado.foto_url ? (
                        <Image
                          src={empleado.foto_url}
                          alt={empleado.nombres}
                          width={48}
                          height={48}
                          unoptimized
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-primary font-semibold text-lg">
                          {empleado.nombres.charAt(0)}{empleado.apellidos.charAt(0)}
                        </span>
                      )}
                    </div>

                    {/* Información del empleado */}
                    <div>
                      <div className="font-medium text-foreground">
                        {empleado.nombres} {empleado.apellidos}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {empleado.puesto} • DNI: {empleado.numero_documento}
                      </div>
                    </div>

                    {/* Estado */}
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${estadoInfo.color} flex items-center gap-1`}>
                      <span>{estadoInfo.icon}</span>
                      {estadoInfo.estado.replace('_', ' ').toUpperCase()}
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* Información de horarios */}
                    <div className="text-right text-sm">
                      {registro?.hora_entrada && (
                        <div className="text-emerald-400 font-medium">
                          📥 Entrada: {formatearHora(registro.hora_entrada)}
                          {registro.tardanza_minutos > 0 && (
                            <span className="text-amber-400 ml-2">
                              (+{registro.tardanza_minutos}min tarde)
                            </span>
                          )}
                        </div>
                      )}
                      {registro?.hora_salida && (
                        <div className="text-primary font-medium">
                          📤 Salida: {formatearHora(registro.hora_salida)}
                        </div>
                      )}
                      {registro?.hora_entrada && registro?.hora_salida && (
                        <div className="text-violet-400 font-medium">
                          ⏱️ Total: {calcularHorasTrabajadas(registro.hora_entrada, registro.hora_salida).toFixed(1)}h
                        </div>
                      )}
                    </div>

                    {/* Botones de acción */}
                    <div className="flex gap-2">
                      {fechaConsulta === new Date().toISOString().split('T')[0] && (
                        <>
                          {!registro?.hora_entrada && (
                            <button
                              onClick={() => marcarAsistencia(empleado.id, 'entrada')}
                              disabled={loading}
                              className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 disabled:bg-gray-400 transition-colors text-sm font-medium"
                            >
                              📥 Marcar Entrada
                            </button>
                          )}

                          {registro?.hora_entrada && !registro?.hora_salida && (
                            <button
                              onClick={() => marcarAsistencia(empleado.id, 'salida')}
                              disabled={loading}
                              className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 transition-colors text-sm font-medium"
                            >
                              📤 Marcar Salida
                            </button>
                          )}

                          {registro?.hora_entrada && registro?.hora_salida && (
                            <div className="bg-muted text-foreground/80 px-4 py-2 rounded-lg text-sm font-medium">
                              ✅ Jornada completa
                            </div>
                          )}
                        </>
                      )}

                      {fechaConsulta !== new Date().toISOString().split('T')[0] && (
                        <div className="text-muted-foreground text-sm italic">
                          📅 Consulta histórica
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {empleados.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <div className="text-4xl mb-2">👥</div>
            <div>No hay empleados registrados</div>
          </div>
        )}
      </div>

      {/* Información adicional */}
      <div className="bg-primary/10 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-primary mb-2">ℹ️ Información del sistema:</h4>
        <ul className="text-sm text-primary space-y-1">
          <li>• Las tardanzas se calculan automáticamente según el horario asignado</li>
          <li>• El marcado masivo solo funciona para empleados sin registro del día</li>
          <li>• Los horarios se registran en tiempo real</li>
          <li>• Para consultas históricas, cambiar la fecha en el selector</li>
        </ul>
      </div>
    </div>
  )
}
