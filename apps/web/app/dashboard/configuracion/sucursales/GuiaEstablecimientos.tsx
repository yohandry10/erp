'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, FileText, HelpCircle, Layers, Store } from 'lucide-react'

/**
 * Guía para el cliente, en la propia pantalla.
 *
 * Está plegada por defecto: quien ya sabe lo que es un establecimiento anexo no
 * tiene que leer nada, y quien no lo sabe lo tiene a un clic sin salir de aquí
 * ni buscar en un manual.
 */
export function GuiaEstablecimientos() {
  const [abierta, setAbierta] = useState(false)

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card/95 text-card-foreground shadow-sm">
      <button
        type="button"
        onClick={() => setAbierta((previo) => !previo)}
        aria-expanded={abierta}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40"
      >
        <HelpCircle className="h-5 w-5 shrink-0 text-primary" />
        <span className="flex-1">
          <span className="block text-sm font-semibold">
            ¿Tienes varios locales? Así funcionan en el sistema
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Un RUC, varios establecimientos. Qué se separa y qué va junto.
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${abierta ? 'rotate-180' : ''}`}
        />
      </button>

      {abierta && (
        <div className="border-t border-border px-5 pb-5 pt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <article className="space-y-1.5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Store className="h-4 w-4 text-primary" />
                Un RUC, varios locales
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Tus tiendas o almacenes son <strong>establecimientos anexos</strong> del mismo RUC,
                tal como figuran en tu ficha de SUNAT. El <code>0000</code> es la casa matriz y
                siempre existe. No necesitas un RUC por local.
              </p>
            </article>

            <article className="space-y-1.5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4 text-primary" />
                Cada local, sus series
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Asigna una serie de facturación a cada establecimiento —por ejemplo{' '}
                <code>F001</code> en la matriz y <code>F002</code> en la sucursal—. El código del
                local viaja dentro de cada comprobante, y su numeración queda separada sola.
              </p>
            </article>

            <article className="space-y-1.5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Layers className="h-4 w-4 text-primary" />
                Qué se separa
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Se separan <strong>stock, almacenes, cajas, ventas e informes</strong>. Los libros
                contables van juntos, porque SUNAT los recibe por RUC; para ver el resultado de
                cada local se usan los centros de costo.
              </p>
            </article>
          </div>

          <div className="mt-5 rounded-xl border border-dashed border-border bg-muted/30 p-4">
            <h3 className="text-sm font-semibold">¿Y si cada local es una razón social distinta?</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Entonces no son sucursales: son <strong>empresas distintas</strong>, cada una con su
              RUC, su Clave SOL y su certificado. El sistema las maneja en la misma instalación y
              después las consolida, con mapeo de cuentas y tipos de cambio.
            </p>
            <Link
              href="/dashboard/contabilidad/consolidacion"
              className="mt-3 inline-flex min-h-9 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              Ver grupos de consolidación
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}
