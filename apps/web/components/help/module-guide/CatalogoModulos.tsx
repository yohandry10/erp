'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ExternalLink, Link2 } from 'lucide-react'
import { agruparGuias } from './index'

/**
 * Catálogo navegable de todas las pantallas del ERP.
 *
 * Vive en el Centro de Ayuda para quien quiere entender el sistema completo sin
 * tener que pasearse pantalla por pantalla. La misma ficha que aparece en el
 * panel contextual, pero aquí ordenada por área y accesible de una sola vez.
 */
export function CatalogoModulos() {
  const grupos = useMemo(() => agruparGuias(), [])
  const [abierto, setAbierto] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-5">
      {grupos.map((grupo) => (
        <section key={grupo.area}>
          <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {grupo.area}
          </p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {grupo.modulos.map(({ ruta, guia }) => {
              const activo = abierto === ruta
              return (
                <li
                  key={ruta}
                  className="overflow-hidden rounded-xl border border-cyan-400/15 bg-card/50 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted/30"
                >
                  <button
                    type="button"
                    onClick={() => setAbierto(activo ? null : ruta)}
                    aria-expanded={activo}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition hover:bg-cyan-400/5"
                  >
                    <span className="flex-1 text-sm font-medium text-foreground">{guia.titulo}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${activo ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {activo && (
                    <div className="flex flex-col gap-3 border-t border-cyan-400/15 px-3 py-3 group-data-[erp-theme=light]/dashboard:border-border">
                      <p className="m-0 text-sm leading-relaxed text-foreground/80">{guia.queEs}</p>

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

                      <Link
                        href={ruta}
                        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-blue-300/30 bg-blue-500/10 px-3 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-500/20 dark:text-blue-200"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Ir a {guia.titulo}
                      </Link>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
