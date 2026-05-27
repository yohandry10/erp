'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Warehouse, MapPin, Building2 } from 'lucide-react'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { useApi } from '@/hooks/use-api'

type Almacen = {
  id: string
  nombre: string
  codigo?: string | null
  direccion?: string | null
  telefono?: string | null
  descripcion?: string | null
  activo?: boolean | null
  created_at?: string | null
}

type Ubicacion = {
  id: string
  codigo: string
  descripcion?: string | null
  tipo?: string | null
  activo?: boolean | null
}

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const candidate = value.includes('T') ? value : `${value}T00:00:00Z`
  const parsed = new Date(candidate)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('es-PE')
}

const fallbackStyle: React.CSSProperties = {
  border: '1px dashed rgba(59, 130, 246, 0.35)',
  borderRadius: '12px',
  background: 'rgba(191, 219, 254, 0.45)',
  padding: '1.5rem',
  color: '#1d4ed8',
  fontWeight: 600,
}

function NoPermission() {
  return (
    <div className="border border-dashed rounded-3 bg-[rgba(191,_219,_254,_0.45)] p-6 text-blue-700 font-semibold">
      Necesitas el permiso <code>inventario.almacenes.read</code> para administrar los almacenes.
    </div>
  )
}

export default function AlmacenesPage() {
  const { get } = useApi()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [almacenes, setAlmacenes] = useState<Almacen[]>([])
  const [ubicacionesPorAlmacen, setUbicacionesPorAlmacen] = useState<Record<string, Ubicacion[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    loadAlmacenes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAlmacenes = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await get('/inventario/almacenes')
      if (response?.success && Array.isArray(response.data)) {
        setAlmacenes(response.data)
      } else {
        setAlmacenes([])
      }
    } catch (err) {
      console.error('Error cargando almacenes', err)
      setError('No se pudieron cargar los almacenes. Intenta nuevamente.')
      setAlmacenes([])
    } finally {
      setLoading(false)
    }
  }

  const toggleExpanded = async (almacenId: string) => {
    setExpanded((current) => (current === almacenId ? null : almacenId))
    if (!ubicacionesPorAlmacen[almacenId]) {
      try {
        const response = await get(`/inventario/almacenes/${almacenId}/ubicaciones`)
        if (response?.success && Array.isArray(response.data)) {
          setUbicacionesPorAlmacen((prev) => ({ ...prev, [almacenId]: response.data }))
        } else {
          setUbicacionesPorAlmacen((prev) => ({ ...prev, [almacenId]: [] }))
        }
      } catch (err) {
        console.error('Error cargando ubicaciones', err)
        setUbicacionesPorAlmacen((prev) => ({ ...prev, [almacenId]: [] }))
      }
    }
  }

  const stats = useMemo(() => {
    const activos = almacenes.filter((almacen) => almacen.activo !== false).length
    const inactivos = almacenes.length - activos
    return { total: almacenes.length, activos, inactivos }
  }, [almacenes])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-3 items-center">
          <h1 className="m-0 text-7 font-bold text-slate-950">
            Almacenes & Ubicaciones
          </h1>
          <span className="bg-[rgba(59,_130,_246,_0.12)] text-blue-700 rounded-full py-1 px-3 text-3 font-semibold"
          >
            Inventario
          </span>
        </div>
        <p className="m-0 text-slate-600 max-w-[720px] leading-7">
          Administra la estructura logística por tenant. Cada almacén y ubicación respeta la política de seguridad
          multitenant y se integra con recepciones, transferencias y kardex valorizado.
        </p>
        <div className="flex gap-3 flex-wrap">
          <Link href="/dashboard/inventario/recepciones" className="text-blue-600 font-semibold">
            Ir a Recepciones →
          </Link>
          <Link href="/dashboard/inventario/kardex" className="text-teal-700 font-semibold">
            Revisar Kardex →
          </Link>
        </div>
      </header>

      <ProtectedComponent
        modulo="inventario"
        recurso="almacenes"
        accion="read"
        fallback={<NoPermission />}
      >
        <div className="flex flex-col gap-5">
          {/* Fix CLS: la estructura (header + 3 cards KPI + sección catálogo)
              se renderiza SIEMPRE para que el alto reservado sea estable entre
              loading y data cargada. Antes el estado loading mostraba solo
              "Cargando..." (~50px) y al llegar la data todo bajaba ~400px+,
              produciendo CLS ~0.32. Ahora los cards arrancan en 0 (estado
              natural) y el catálogo mantiene un min-height fijo. */}
          {error && (
            <div className="border bg-[rgba(254,_226,_226,_0.65)] rounded-3 py-4 px-5 text-red-700 font-semibold"
            >
              {error}
            </div>
          )}

          <section className="grid gap-3 grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))]"
          >
            <div className="rounded-3.5 border bg-[rgba(191,_219,_254,_0.35)] p-4 flex items-center gap-3"
            >
              <Warehouse size={22} color="#1d4ed8" />
              <div>
                <div className="text-3 text-blue-700 font-bold">
                  Almacenes
                </div>
                <div className="text-6 font-bold text-slate-950">
                  {stats.total.toLocaleString('es-PE')}
                </div>
              </div>
            </div>
            <div className="rounded-3.5 border bg-[rgba(187,_247,_208,_0.45)] p-4 flex items-center gap-3"
            >
              <Building2 size={22} color="#047857" />
              <div>
                <div className="text-3 text-emerald-700 font-bold">
                  Activos
                </div>
                <div className="text-6 font-bold text-[#065f46]">
                  {stats.activos.toLocaleString('es-PE')}
                </div>
              </div>
            </div>
            <div className="rounded-3.5 border bg-[rgba(254,_226,_226,_0.55)] p-4 flex items-center gap-3"
            >
              <MapPin size={22} color="#b91c1c" />
              <div>
                <div className="text-3 text-red-700 font-bold">
                  Inactivos
                </div>
                <div className="text-6 font-bold text-red-800">
                  {stats.inactivos.toLocaleString('es-PE')}
                </div>
              </div>
            </div>
          </section>

          <section className="border rounded-4 p-5 bg-white flex flex-col gap-4 min-h-[180px]"
          >
            <h2 className="m-0 text-[1.15rem] font-bold text-slate-950">
              Catálogo de almacenes
            </h2>

            {loading ? (
              <div className="text-blue-600 font-semibold text-3.5">
                Cargando almacenes…
              </div>
            ) : almacenes.length === 0 ? (
              <div className="text-slate-400 text-3.5">
                No hay almacenes registrados. Crea uno desde el módulo de configuración o mediante Supabase Studio.
              </div>
            ) : (
                  <ul className="list-none m-0 p-0 grid gap-3">
                    {almacenes.map((almacen) => {
                      const isExpanded = expanded === almacen.id
                      const ubicaciones = ubicacionesPorAlmacen[almacen.id] ?? []
                      return (
                        <li
                          key={almacen.id} className="border rounded-3 bg-[rgba(248,_250,_252,_0.85)] p-4 flex flex-col gap-[0.65rem]"
                        >
                          <div className="flex justify-between gap-4 flex-wrap items-center"
                          >
                            <div className="flex flex-col gap-1">
                              <span className="text-4 font-bold text-slate-950">{almacen.nombre}</span>
                              <span className="text-[0.8rem] text-slate-500">
                                Código: {almacen.codigo ?? '—'} · Creado: {formatDate(almacen.created_at)}
                              </span>
                              {almacen.direccion && (
                                <span className="text-3.5 text-slate-600">{almacen.direccion}</span>
                              )}
                              {almacen.descripcion && (
                                <span className="text-3.5 text-slate-600">{almacen.descripcion}</span>
                              )}
                            </div>
                            <span className="py-1 px-[0.7rem] rounded-full text-3 font-semibold"
                            >
                              {almacen.activo === false ? 'Inactivo' : 'Activo'}
                            </span>
                          </div>

                          <div className="flex gap-3 flex-wrap">
                            {almacen.telefono && (
                              <span className="text-3.5 text-slate-600">Teléfono: {almacen.telefono}</span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleExpanded(almacen.id)} className="py-2 px-3.5 rounded-2 border bg-white text-blue-700 font-semibold cursor-pointer"
                          >
                            {isExpanded ? 'Ocultar ubicaciones' : 'Ver ubicaciones'}
                          </button>

                          {isExpanded && (
                            <div className="border rounded-2.5 bg-[rgba(255,_255,_255,_0.65)] p-3.5 flex flex-col gap-2"
                            >
                              <strong className="text-3.5 text-slate-950">
                                Ubicaciones ({ubicaciones.length})
                              </strong>
                              {ubicaciones.length === 0 ? (
                                <span className="text-3.5 text-slate-400">
                                  Este almacén aún no tiene ubicaciones registradas.
                                </span>
                              ) : (
                                <ul className="list-none m-0 p-0 grid gap-1.5">
                                  {ubicaciones.map((ubicacion) => (
                                    <li
                                      key={ubicacion.id} className="border rounded-2 py-2.5 px-3 bg-[rgba(248,_250,_252,_0.9)] flex justify-between gap-3 flex-wrap"
                                    >
                                      <div className="flex flex-col gap-[0.15rem]">
                                        <span className="font-semibold text-gray-800">{ubicacion.codigo}</span>
                                        {ubicacion.descripcion && (
                                          <span className="text-[0.8rem] text-slate-500">{ubicacion.descripcion}</span>
                                        )}
                                      </div>
                                      <span className="text-3 font-semibold"
                                      >
                                        {ubicacion.activo === false ? 'Inactiva' : 'Activa'}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
        </div>
      </ProtectedComponent>
    </div>
  )
}
