'use client'

import { useCallback, useEffect, useState } from 'react'
import { HelpCircle, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { fetchApi } from '@/lib/api-fetch'
import { useTenant } from '@/contexts/TenantContext'
import { useOnboarding, getTourByRole } from '@/components/onboarding'
import { getGuiaPorRuta } from '../module-guide'
import { AyudaPanel } from './AyudaPanel'
import { TemaAyuda } from './types'
import { useCountryContext } from '@/hooks/use-country-context'

/**
 * Boton flotante + panel de ayuda. Opt-in: nada se muestra hasta que la persona
 * pulsa el boton. No hay caja de texto: ver AyudaPanel.
 */
export function CentroAyuda() {
  const [abierto, setAbierto] = useState(false)
  const [temas, setTemas] = useState<TemaAyuda[]>([])
  const [temasCargando, setTemasCargando] = useState(false)

  const pathname = usePathname()
  const country = useCountryContext()
  const guia = getGuiaPorRuta(pathname, country.paisCodigo)

  const { user } = useTenant()
  const rol = (user?.roles?.[0] || (user?.is_super_admin ? 'superadmin' : '')) as string
  const tour = rol ? getTourByRole(rol) : null
  const { startTour } = useOnboarding()

  const cargarTemas = useCallback(async () => {
    // La base histórica de temas frecuentes es peruana. Hasta disponer de un
    // catálogo AR verificado, Argentina usa sólo las fichas locales específicas.
    if (country.paisCodigo !== 'PE') {
      setTemas([])
      setTemasCargando(false)
      return
    }
    setTemasCargando(true)
    try {
      const params = new URLSearchParams()
      if (rol) params.append('rol', rol)
      params.append('limite', '6')
      const res = await fetchApi(`/api/help/sugerencias?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTemas(
          (data.sugerencias || []).map((s: any) => ({
            id: String(s.id),
            pregunta: s.pregunta,
            categoria: s.categoria,
          })),
        )
      }
    } catch {
      // Sin temas del servidor el panel sigue sirviendo: la ficha y el tour son locales.
      setTemas([])
    } finally {
      setTemasCargando(false)
    }
  }, [country.paisCodigo, rol])

  useEffect(() => {
    setTemas([])
  }, [country.paisCodigo])

  useEffect(() => {
    if (abierto && temas.length === 0) cargarTemas()
  }, [abierto, cargarTemas, temas.length])

  /** Trae la respuesta de un tema del catalogo. Como la pregunta viene del propio
   *  catalogo, siempre existe: el usuario nunca queda sin respuesta. */
  const abrirTema = useCallback(
    async (tema: TemaAyuda): Promise<string | null> => {
      try {
        const params = new URLSearchParams({ q: tema.pregunta })
        if (rol) params.append('rol', rol)
        const res = await fetchApi(`/api/help/search?${params}`)
        if (!res.ok) return null
        const data = await res.json()
        const r = data.resultado
        if (!r) return null
        const pasos = Array.isArray(r.pasos) && r.pasos.length > 0 ? '\n\n' + r.pasos.map((p: any) => `${p.paso}. ${p.texto}`).join('\n') : ''
        return `${r.respuesta}${pasos}`
      } catch {
        return null
      }
    },
    [rol],
  )

  const iniciarTour = useCallback(() => {
    if (!tour) return
    setAbierto(false)
    startTour(tour.id)
  }, [tour, startTour])

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={abierto ? 'Cerrar ayuda' : 'Abrir ayuda'}
        aria-expanded={abierto}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:bg-blue-700"
      >
        {abierto ? <X className="h-5 w-5" /> : <HelpCircle className="h-6 w-6" />}
      </button>

      <AyudaPanel
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        guia={guia}
        temas={temas}
        temasCargando={temasCargando}
        onAbrirTema={abrirTema}
        tourNombre={tour ? tour.nombre : null}
        onIniciarTour={iniciarTour}
      />
    </>
  )
}
