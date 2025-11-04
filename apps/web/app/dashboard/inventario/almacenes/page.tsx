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
    <div style={fallbackStyle}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#0f172a' }}>
            Almacenes & Ubicaciones
          </h1>
          <span
            style={{
              background: 'rgba(59, 130, 246, 0.12)',
              color: '#1d4ed8',
              borderRadius: '999px',
              padding: '0.25rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            Inventario
          </span>
        </div>
        <p style={{ margin: 0, color: '#475569', maxWidth: '720px', lineHeight: 1.6 }}>
          Administra la estructura logística por tenant. Cada almacén y ubicación respeta la política de seguridad
          multitenant y se integra con recepciones, transferencias y kardex valorizado.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link href="/dashboard/inventario/recepciones" style={{ color: '#2563eb', fontWeight: 600 }}>
            Ir a Recepciones →
          </Link>
          <Link href="/dashboard/inventario/kardex" style={{ color: '#0f766e', fontWeight: 600 }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '3rem 0',
                color: '#2563eb',
                fontWeight: 600,
              }}
            >
              Cargando almacenes…
            </div>
          ) : (
            <>
              {error && (
                <div
                  style={{
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    background: 'rgba(254, 226, 226, 0.65)',
                    borderRadius: '12px',
                    padding: '1rem 1.2rem',
                    color: '#b91c1c',
                    fontWeight: 600,
                  }}
                >
                  {error}
                </div>
              )}

              <section
                style={{
                  display: 'grid',
                  gap: '0.75rem',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                }}
              >
                <div
                  style={{
                    borderRadius: '14px',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    background: 'rgba(191, 219, 254, 0.35)',
                    padding: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <Warehouse size={22} color="#1d4ed8" />
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#1d4ed8', textTransform: 'uppercase', fontWeight: 700 }}>
                      Almacenes
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
                      {stats.total.toLocaleString('es-PE')}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    borderRadius: '14px',
                    border: '1px solid rgba(34, 197, 94, 0.25)',
                    background: 'rgba(187, 247, 208, 0.45)',
                    padding: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <Building2 size={22} color="#047857" />
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#047857', textTransform: 'uppercase', fontWeight: 700 }}>
                      Activos
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#065f46' }}>
                      {stats.activos.toLocaleString('es-PE')}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    borderRadius: '14px',
                    border: '1px solid rgba(248, 113, 113, 0.25)',
                    background: 'rgba(254, 226, 226, 0.55)',
                    padding: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <MapPin size={22} color="#b91c1c" />
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#b91c1c', textTransform: 'uppercase', fontWeight: 700 }}>
                      Inactivos
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#991b1b' }}>
                      {stats.inactivos.toLocaleString('es-PE')}
                    </div>
                  </div>
                </div>
              </section>

              <section
                style={{
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  borderRadius: '16px',
                  padding: '1.2rem',
                  background: '#ffffff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                  Catálogo de almacenes
                </h2>

                {almacenes.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                    No hay almacenes registrados. Crea uno desde el módulo de configuración o mediante Supabase Studio.
                  </div>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
                    {almacenes.map((almacen) => {
                      const isExpanded = expanded === almacen.id
                      const ubicaciones = ubicacionesPorAlmacen[almacen.id] ?? []
                      return (
                        <li
                          key={almacen.id}
                          style={{
                            border: '1px solid rgba(226, 232, 240, 0.75)',
                            borderRadius: '12px',
                            background: 'rgba(248, 250, 252, 0.85)',
                            padding: '1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.65rem',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: '1rem',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{almacen.nombre}</span>
                              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                Código: {almacen.codigo ?? '—'} · Creado: {formatDate(almacen.created_at)}
                              </span>
                              {almacen.direccion && (
                                <span style={{ fontSize: '0.85rem', color: '#475569' }}>{almacen.direccion}</span>
                              )}
                              {almacen.descripcion && (
                                <span style={{ fontSize: '0.85rem', color: '#475569' }}>{almacen.descripcion}</span>
                              )}
                            </div>
                            <span
                              style={{
                                padding: '0.25rem 0.7rem',
                                borderRadius: '999px',
                                background: almacen.activo === false ? 'rgba(248, 113, 113, 0.2)' : 'rgba(34, 197, 94, 0.16)',
                                color: almacen.activo === false ? '#b91c1c' : '#166534',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                              }}
                            >
                              {almacen.activo === false ? 'Inactivo' : 'Activo'}
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            {almacen.telefono && (
                              <span style={{ fontSize: '0.85rem', color: '#475569' }}>Teléfono: {almacen.telefono}</span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleExpanded(almacen.id)}
                            style={{
                              alignSelf: 'flex-start',
                              padding: '0.45rem 0.9rem',
                              borderRadius: '8px',
                              border: '1px solid rgba(59, 130, 246, 0.35)',
                              background: 'white',
                              color: '#1d4ed8',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {isExpanded ? 'Ocultar ubicaciones' : 'Ver ubicaciones'}
                          </button>

                          {isExpanded && (
                            <div
                              style={{
                                border: '1px solid rgba(148, 163, 184, 0.35)',
                                borderRadius: '10px',
                                background: 'rgba(255, 255, 255, 0.65)',
                                padding: '0.85rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem',
                              }}
                            >
                              <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                                Ubicaciones ({ubicaciones.length})
                              </strong>
                              {ubicaciones.length === 0 ? (
                                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                                  Este almacén aún no tiene ubicaciones registradas.
                                </span>
                              ) : (
                                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
                                  {ubicaciones.map((ubicacion) => (
                                    <li
                                      key={ubicacion.id}
                                      style={{
                                        border: '1px solid rgba(226, 232, 240, 0.85)',
                                        borderRadius: '8px',
                                        padding: '0.6rem 0.75rem',
                                        background: 'rgba(248, 250, 252, 0.9)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        gap: '0.75rem',
                                        flexWrap: 'wrap',
                                      }}
                                    >
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                        <span style={{ fontWeight: 600, color: '#1f2937' }}>{ubicacion.codigo}</span>
                                        {ubicacion.descripcion && (
                                          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{ubicacion.descripcion}</span>
                                        )}
                                      </div>
                                      <span
                                        style={{
                                          fontSize: '0.75rem',
                                          color: ubicacion.activo === false ? '#b91c1c' : '#166534',
                                          fontWeight: 600,
                                        }}
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
            </>
          )}
        </div>
      </ProtectedComponent>
    </div>
  )
}
