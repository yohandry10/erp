'use client'

import { useEffect, useState } from 'react'
import { X, ChevronDown, PlayCircle, Compass, Link2, BookOpen } from 'lucide-react'
import { GuiaModulo } from '../module-guide'
import { TemaAyuda } from './types'

interface AyudaPanelProps {
  abierto: boolean
  onCerrar: () => void
  guia: GuiaModulo | null
  temas: TemaAyuda[]
  temasCargando: boolean
  onAbrirTema: (tema: TemaAyuda) => Promise<string | null>
  tourNombre: string | null
  onIniciarTour: () => void
}

/**
 * Centro de ayuda contextual.
 *
 * No hay caja de texto a proposito. Un chat libre obliga al usuario a adivinar
 * que preguntar, y cuando no acierta recibe un "no encontre informacion" que lo
 * deja peor que antes y hace pensar que es un bot roto. Aqui todo lo que se ve
 * es navegable y tiene respuesta garantizada: la ficha de la pantalla, temas ya
 * redactados, y el tour guiado.
 */
export function AyudaPanel({
  abierto,
  onCerrar,
  guia,
  temas,
  temasCargando,
  onAbrirTema,
  tourNombre,
  onIniciarTour,
}: AyudaPanelProps) {
  const [temaAbierto, setTemaAbierto] = useState<string | null>(null)
  const [respuestas, setRespuestas] = useState<Record<string, string>>({})
  const [cargandoTema, setCargandoTema] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) setTemaAbierto(null)
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [abierto, onCerrar])

  if (!abierto) return null

  const alternarTema = async (tema: TemaAyuda) => {
    if (temaAbierto === tema.id) {
      setTemaAbierto(null)
      return
    }
    setTemaAbierto(tema.id)
    if (respuestas[tema.id] === undefined) {
      setCargandoTema(tema.id)
      const respuesta = await onAbrirTema(tema)
      setRespuestas((prev) => ({ ...prev, [tema.id]: respuesta ?? 'Sin detalle disponible.' }))
      setCargandoTema(null)
    }
  }

  return (
    <div
      className="fixed bottom-20 right-4 z-50 flex max-h-[min(34rem,calc(100vh-7rem))] w-96 max-w-[calc(100vw-32px)] animate-in slide-in-from-bottom-2 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      role="dialog"
      aria-label="Centro de ayuda"
    >
      <div className="flex shrink-0 items-center justify-between bg-blue-600 px-4 py-3">
        <h2 className="m-0 flex items-center gap-2 text-base font-semibold text-white">
          <BookOpen className="h-4 w-4" />
          Ayuda
        </h2>
        <button
          onClick={onCerrar}
          className="flex cursor-pointer items-center justify-center rounded-md p-1 text-white/80 transition hover:bg-white/10 hover:text-white"
          aria-label="Cerrar ayuda"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {/* Esta pantalla */}
        {guia && (
          <section>
            <p className="m-0 mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Compass className="h-3.5 w-3.5" />
              Esta pantalla
            </p>
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="m-0 text-sm font-semibold text-foreground">{guia.titulo}</p>
              <p className="m-0 mt-1 text-sm leading-relaxed text-foreground/80">{guia.queEs}</p>

              <p className="m-0 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Qué puedes hacer aquí
              </p>
              <ul className="m-0 mt-1 list-disc space-y-1 pl-5">
                {guia.quePuedesHacer.map((accion) => (
                  <li key={accion} className="text-sm leading-relaxed text-foreground/80">
                    {accion}
                  </li>
                ))}
              </ul>

              <p className="m-0 mt-3 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Link2 className="h-3 w-3" />
                Con qué se conecta
              </p>
              <ul className="m-0 mt-1 list-disc space-y-1 pl-5">
                {guia.conectaCon.map((relacion) => (
                  <li key={relacion} className="text-sm leading-relaxed text-foreground/80">
                    {relacion}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Tour guiado */}
        {tourNombre && (
          <section>
            <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recorrido guiado
            </p>
            <button
              type="button"
              onClick={onIniciarTour}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-left transition hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:hover:bg-blue-950/70"
            >
              <PlayCircle className="h-4 w-4 shrink-0 text-blue-600" />
              <span className="text-sm font-medium text-foreground">{tourNombre}</span>
            </button>
          </section>
        )}

        {/* Temas ya redactados: todo lo que se ve tiene respuesta */}
        {(temasCargando || temas.length > 0) && (
          <section>
            <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Temas frecuentes
            </p>
            {temasCargando ? (
              <p className="m-0 text-sm text-muted-foreground">Cargando temas…</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {temas.map((tema) => {
                  const activo = temaAbierto === tema.id
                  return (
                    <li key={tema.id}>
                      <button
                        type="button"
                        onClick={() => alternarTema(tema)}
                        aria-expanded={activo}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-muted"
                      >
                        <span className="flex-1 text-sm text-foreground">{tema.pregunta}</span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${activo ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {activo && (
                        <p className="m-0 whitespace-pre-line px-2 pb-2 text-sm leading-relaxed text-foreground/80">
                          {cargandoTema === tema.id ? 'Cargando…' : respuestas[tema.id]}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
