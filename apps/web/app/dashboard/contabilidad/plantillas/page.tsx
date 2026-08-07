'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { parseDateLocal } from '@/lib/date-utils'
import { AlertCircle, CalendarClock, FileStack, Loader2, PlayCircle, RefreshCw, Trash2 } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Plantilla {
  id: string
  nombre: string
  descripcion?: string
  concepto: string
  referencia?: string
  periodicidad: 'NINGUNA' | 'MENSUAL' | 'BIMESTRAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL'
  dia_ejecucion?: number
  proxima_ejecucion?: string
  ultima_ejecucion?: string
  crear_en_estado: 'BORRADOR' | 'CONFIRMADO'
  activa: boolean
}

const PERIODICIDAD_LABEL: Record<Plantilla['periodicidad'], string> = {
  NINGUNA: 'Manual',
  MENSUAL: 'Mensual',
  BIMESTRAL: 'Bimestral',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
}

export default function PlantillasAsientosPage() {
  const router = useRouter()
  const { get, post, del } = useApi()

  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await get('/api/contabilidad/plantillas-asientos')
      if (response?.success) setPlantillas(response.data || [])
    } catch (err: any) {
      setError(err.message || 'Error al cargar las plantillas')
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    cargar()
  }, [cargar])

  const generar = async (plantilla: Plantilla) => {
    const destino =
      plantilla.crear_en_estado === 'BORRADOR'
        ? 'Se creará un asiento en borrador que podrá revisar antes de confirmarlo.'
        : 'Se creará un asiento confirmado, que entra directamente en los libros.'

    if (!confirm(`Generar un asiento desde "${plantilla.nombre}".\n\n${destino}\n\n¿Continuar?`)) {
      return
    }

    try {
      setGenerando(plantilla.id)
      setError(null)

      const response = await post(`/api/contabilidad/plantillas-asientos/${plantilla.id}/generar`, {})
      if (!response?.success) throw new Error(response?.message || 'No se pudo generar')

      router.push(`/dashboard/contabilidad/asientos/${response.data.id}`)
    } catch (err: any) {
      setError(err.message || 'No se pudo generar el asiento')
      setGenerando(null)
    }
  }

  const eliminar = async (plantilla: Plantilla) => {
    if (!confirm(`¿Eliminar la plantilla "${plantilla.nombre}"? Los asientos ya generados se conservan.`)) {
      return
    }
    try {
      setError(null)
      await del(`/api/contabilidad/plantillas-asientos/${plantilla.id}`)
      await cargar()
    } catch (err: any) {
      setError(err.message || 'No se pudo eliminar la plantilla')
    }
  }

  const formatFecha = (fecha?: string) =>
    fecha
      ? parseDateLocal(String(fecha).slice(0, 10))?.toLocaleDateString('es-PE', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }) ?? fecha
      : '—'

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-primary">
                <FileStack className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  Plantillas de asiento
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Defina una vez la provisión mensual, el devengo de un alquiler o el prorrateo de un
                  seguro. Las plantillas con periodicidad se generan solas en cada período.
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={cargar}
              variant="outline"
              className="gap-2 border-cyan-400/20 bg-white/10 text-primary hover:bg-white/15 hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm font-medium text-primary">{error}</p>
          </div>
        )}

        <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-foreground">Plantillas registradas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex min-h-[160px] items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Cargando plantillas...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse">
                  <thead className="bg-cyan-400/10">
                    <tr className="border-b border-cyan-400/15 text-left text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                      <th className="px-4 py-3">Plantilla</th>
                      <th className="px-4 py-3">Periodicidad</th>
                      <th className="px-4 py-3">Próxima</th>
                      <th className="px-4 py-3">Última</th>
                      <th className="px-4 py-3">Genera en</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {plantillas.length > 0 ? (
                      plantillas.map((plantilla) => (
                        <tr
                          key={plantilla.id}
                          className="border-b border-cyan-400/10 text-sm text-foreground/90"
                        >
                          <td className="px-4 py-3">
                            <div className="font-semibold text-foreground">{plantilla.nombre}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {plantilla.descripcion || plantilla.concepto}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-primary">
                              <CalendarClock className="h-3.5 w-3.5" />
                              {PERIODICIDAD_LABEL[plantilla.periodicidad]}
                            </span>
                          </td>
                          <td className="px-4 py-3">{formatFecha(plantilla.proxima_ejecucion)}</td>
                          <td className="px-4 py-3">{formatFecha(plantilla.ultima_ejecucion)}</td>
                          <td className="px-4 py-3">{plantilla.crear_en_estado}</td>
                          <td className="px-4 py-3">{plantilla.activa ? 'Activa' : 'Inactiva'}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                onClick={() => generar(plantilla)}
                                disabled={!plantilla.activa || generando !== null}
                                className="gap-2 bg-blue-600 text-white hover:bg-blue-500 disabled:bg-muted"
                              >
                                {generando === plantilla.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <PlayCircle className="h-4 w-4" />
                                )}
                                Generar
                              </Button>
                              <Button
                                type="button"
                                onClick={() => eliminar(plantilla)}
                                variant="outline"
                                className="gap-2 border-cyan-400/20 bg-white/5 text-primary hover:bg-white/10 hover:text-foreground"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Todavía no hay plantillas. Cree una para dejar de teclear la misma
                          provisión cada mes.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
