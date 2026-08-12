'use client'

import { useState } from 'react'
import { ChevronDown, Compass, Link2 } from 'lucide-react'
import { GuiaModulo } from './types'

interface GuiaDeModuloProps {
  guia: GuiaModulo | null
}

/**
 * Ficha de la pantalla actual dentro del asistente.
 *
 * Arranca colapsada a proposito: el usuario ya pidio ayuda al abrir el bot,
 * pero eso no significa que quiera un texto largo encima. Se despliega solo si
 * lo pide. Nunca se muestra sola ni interrumpe la pantalla.
 */
export function GuiaDeModulo({ guia }: GuiaDeModuloProps) {
  const [abierta, setAbierta] = useState(false)

  if (!guia) return null

  return (
    <div className="rounded-lg border border-border bg-muted/40">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-muted"
      >
        <Compass className="h-4 w-4 shrink-0 text-blue-600" />
        <span className="flex-1 text-sm font-semibold text-foreground">
          ¿Qué hace esta pantalla?
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${abierta ? 'rotate-180' : ''}`}
        />
      </button>

      {abierta && (
        <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
          <div>
            <p className="m-0 text-sm font-semibold text-foreground">{guia.titulo}</p>
            <p className="m-0 mt-1 text-sm leading-relaxed text-foreground/80">{guia.queEs}</p>
          </div>

          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Qué puedes hacer aquí
            </p>
            <ul className="m-0 mt-1 list-disc space-y-1 pl-5">
              {guia.quePuedesHacer.map((accion) => (
                <li key={accion} className="text-sm leading-relaxed text-foreground/80">
                  {accion}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="m-0 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
        </div>
      )}
    </div>
  )
}
