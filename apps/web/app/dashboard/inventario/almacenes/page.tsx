'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Building2, MapPin, Pencil, Plus, Power, RotateCcw, Save, Warehouse, X } from 'lucide-react'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useApi } from '@/hooks/use-api'

type Almacen = {
  id: string
  nombre: string
  codigo: string
  direccion?: string | null
  telefono?: string | null
  descripcion?: string | null
  activo: boolean
  es_principal?: boolean
}

type Ubicacion = {
  id: string
  almacen_id: string
  nombre: string
  codigo: string
  descripcion?: string | null
  tipo?: string | null
  activo: boolean
}

type AlmacenForm = {
  codigo: string
  nombre: string
  direccion: string
  telefono: string
  descripcion: string
  es_principal: boolean
}

type UbicacionForm = {
  codigo: string
  nombre: string
  descripcion: string
  tipo: string
}

const EMPTY_ALMACEN: AlmacenForm = {
  codigo: '',
  nombre: '',
  direccion: '',
  telefono: '',
  descripcion: '',
  es_principal: false,
}

const EMPTY_UBICACION: UbicacionForm = {
  codigo: '',
  nombre: '',
  descripcion: '',
  tipo: 'OTRO',
}

function NoPermission() {
  return (
    <div className="rounded-xl border border-dashed border-blue-400/40 bg-blue-500/10 p-6 font-semibold text-primary">
      Necesitas el permiso <code>inventario.almacenes.read</code> para administrar los almacenes.
    </div>
  )
}

export default function AlmacenesPage() {
  const { get, post, put, del } = useApi()
  const intentsRef = useRef(new Map<string, { fingerprint: string; key: string }>())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [almacenes, setAlmacenes] = useState<Almacen[]>([])
  const [ubicacionesPorAlmacen, setUbicacionesPorAlmacen] = useState<Record<string, Ubicacion[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [almacenEditor, setAlmacenEditor] = useState<{ id?: string; data: AlmacenForm } | null>(null)
  const [ubicacionEditor, setUbicacionEditor] = useState<{
    almacenId: string
    id?: string
    data: UbicacionForm
  } | null>(null)

  const withIntent = <T extends Record<string, unknown>>(intent: string, payload: T) => {
    const fingerprint = JSON.stringify(payload)
    const previous = intentsRef.current.get(intent)
    if (previous?.fingerprint !== fingerprint) {
      intentsRef.current.set(intent, {
        fingerprint,
        key: `${intent}:${crypto.randomUUID()}`,
      })
    }
    return { ...payload, idempotency_key: intentsRef.current.get(intent)!.key }
  }

  const loadAlmacenes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await get('/inventario/almacenes?includeInactive=true')
      setAlmacenes(response?.success && Array.isArray(response.data) ? response.data : [])
    } catch {
      setError('No se pudieron cargar los almacenes. Intenta nuevamente.')
      setAlmacenes([])
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    void loadAlmacenes()
  }, [loadAlmacenes])

  const loadUbicaciones = useCallback(async (almacenId: string) => {
    try {
      const response = await get(`/inventario/almacenes/${almacenId}/ubicaciones`)
      setUbicacionesPorAlmacen((prev) => ({
        ...prev,
        [almacenId]: response?.success && Array.isArray(response.data) ? response.data : [],
      }))
    } catch {
      setError('No se pudieron cargar las ubicaciones del almacén.')
    }
  }, [get])

  const toggleExpanded = async (almacenId: string) => {
    if (expanded === almacenId) {
      setExpanded(null)
      return
    }
    setExpanded(almacenId)
    await loadUbicaciones(almacenId)
  }

  const saveAlmacen = async () => {
    if (!almacenEditor?.data.codigo.trim() || !almacenEditor.data.nombre.trim()) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        codigo: almacenEditor.data.codigo.trim(),
        nombre: almacenEditor.data.nombre.trim(),
        direccion: almacenEditor.data.direccion.trim() || undefined,
        telefono: almacenEditor.data.telefono.trim() || undefined,
        descripcion: almacenEditor.data.descripcion.trim() || undefined,
        es_principal: almacenEditor.data.es_principal,
      }
      const id = almacenEditor.id
      const response = id
        ? await put(
            `/inventario/almacenes/${id}`,
            withIntent(`inventory-warehouse-update:${id}`, payload),
          )
        : await post(
            '/inventario/almacenes',
            withIntent('inventory-warehouse-create', payload),
          )
      if (!response?.success) throw new Error(response?.message || 'No se pudo guardar el almacén.')
      setAlmacenEditor(null)
      await loadAlmacenes()
    } catch (caught: any) {
      setError(caught?.message || 'No se pudo guardar el almacén.')
    } finally {
      setSaving(false)
    }
  }

  const saveUbicacion = async () => {
    if (!ubicacionEditor?.data.codigo.trim() || !ubicacionEditor.data.nombre.trim()) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        codigo: ubicacionEditor.data.codigo.trim(),
        nombre: ubicacionEditor.data.nombre.trim(),
        descripcion: ubicacionEditor.data.descripcion.trim() || undefined,
        tipo: ubicacionEditor.data.tipo,
      }
      const { almacenId, id } = ubicacionEditor
      const response = id
        ? await put(
            `/inventario/almacenes/${almacenId}/ubicaciones/${id}`,
            withIntent(`inventory-location-update:${id}`, payload),
          )
        : await post(
            `/inventario/almacenes/${almacenId}/ubicaciones`,
            withIntent(`inventory-location-create:${almacenId}`, payload),
          )
      if (!response?.success) throw new Error(response?.message || 'No se pudo guardar la ubicación.')
      setUbicacionEditor(null)
      await loadUbicaciones(almacenId)
    } catch (caught: any) {
      setError(caught?.message || 'No se pudo guardar la ubicación.')
    } finally {
      setSaving(false)
    }
  }

  const changeWarehouseState = async (almacen: Almacen) => {
    setError(null)
    try {
      const response = almacen.activo
        ? await del(`/inventario/almacenes/${almacen.id}`, {
            headers: {
              'Idempotency-Key': `inventory-warehouse-deactivate:${almacen.id}:${crypto.randomUUID()}`,
            },
          })
        : await put(
            `/inventario/almacenes/${almacen.id}`,
            withIntent(`inventory-warehouse-reactivate:${almacen.id}`, { activo: true }),
          )
      if (!response?.success) throw new Error(response?.message || 'No se pudo cambiar el estado.')
      await loadAlmacenes()
    } catch (caught: any) {
      setError(caught?.message || 'No se pudo cambiar el estado del almacén.')
    }
  }

  const changeLocationState = async (ubicacion: Ubicacion) => {
    setError(null)
    try {
      const response = ubicacion.activo
        ? await del(`/inventario/almacenes/${ubicacion.almacen_id}/ubicaciones/${ubicacion.id}`, {
            headers: {
              'Idempotency-Key': `inventory-location-deactivate:${ubicacion.id}:${crypto.randomUUID()}`,
            },
          })
        : await put(
            `/inventario/almacenes/${ubicacion.almacen_id}/ubicaciones/${ubicacion.id}`,
            withIntent(`inventory-location-reactivate:${ubicacion.id}`, { activo: true }),
          )
      if (!response?.success) throw new Error(response?.message || 'No se pudo cambiar el estado.')
      await loadUbicaciones(ubicacion.almacen_id)
    } catch (caught: any) {
      setError(caught?.message || 'No se pudo cambiar el estado de la ubicación.')
    }
  }

  const stats = useMemo(() => ({
    total: almacenes.length,
    activos: almacenes.filter((almacen) => almacen.activo).length,
    principales: almacenes.filter((almacen) => almacen.activo && almacen.es_principal).length,
  }), [almacenes])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-3xl font-bold text-foreground">Almacenes y ubicaciones</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Mantén la estructura física de inventario. La desactivación se bloquea cuando existe stock,
            reservas o ubicaciones activas.
          </p>
        </div>
        <ProtectedComponent modulo="inventario" recurso="almacenes" accion="create">
          <Button onClick={() => setAlmacenEditor({ data: { ...EMPTY_ALMACEN } })} className="gap-2">
            <Plus className="h-4 w-4" /> Nuevo almacén
          </Button>
        </ProtectedComponent>
      </header>

      <ProtectedComponent modulo="inventario" recurso="almacenes" accion="read" fallback={<NoPermission />}>
        <div className="space-y-5">
          {error && (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
              {error}
            </div>
          )}

          <section className="grid gap-3 md:grid-cols-3">
            {[
              { label: 'Total', value: stats.total, icon: Warehouse },
              { label: 'Activos', value: stats.activos, icon: Building2 },
              { label: 'Principales', value: stats.principales, icon: MapPin },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label}>
                <CardContent className="flex items-center gap-3 p-5">
                  <Icon className="h-6 w-6 text-primary" />
                  <div><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div>
                </CardContent>
              </Card>
            ))}
          </section>

          {almacenEditor && (
            <Card className="border-primary/30">
              <CardHeader><CardTitle>{almacenEditor.id ? 'Editar almacén' : 'Nuevo almacén'}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1 text-sm">Código *<Input aria-label="Código de almacén" value={almacenEditor.data.codigo} onChange={(event) => setAlmacenEditor((current) => current && ({ ...current, data: { ...current.data, codigo: event.target.value } }))} /></label>
                  <label className="space-y-1 text-sm">Nombre *<Input aria-label="Nombre de almacén" value={almacenEditor.data.nombre} onChange={(event) => setAlmacenEditor((current) => current && ({ ...current, data: { ...current.data, nombre: event.target.value } }))} /></label>
                  <label className="space-y-1 text-sm">Dirección<Input value={almacenEditor.data.direccion} onChange={(event) => setAlmacenEditor((current) => current && ({ ...current, data: { ...current.data, direccion: event.target.value } }))} /></label>
                  <label className="space-y-1 text-sm">Teléfono<Input value={almacenEditor.data.telefono} onChange={(event) => setAlmacenEditor((current) => current && ({ ...current, data: { ...current.data, telefono: event.target.value } }))} /></label>
                </div>
                <label className="block space-y-1 text-sm">Descripción<Input value={almacenEditor.data.descripcion} onChange={(event) => setAlmacenEditor((current) => current && ({ ...current, data: { ...current.data, descripcion: event.target.value } }))} /></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={almacenEditor.data.es_principal} onChange={(event) => setAlmacenEditor((current) => current && ({ ...current, data: { ...current.data, es_principal: event.target.checked } }))} /> Almacén principal</label>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setAlmacenEditor(null)} disabled={saving}><X className="mr-2 h-4 w-4" />Cancelar</Button>
                  <Button onClick={saveAlmacen} disabled={saving || !almacenEditor.data.codigo.trim() || !almacenEditor.data.nombre.trim()}><Save className="mr-2 h-4 w-4" />{saving ? 'Guardando…' : 'Guardar'}</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Catálogo de almacenes</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Cargando almacenes…</p>
              ) : almacenes.length === 0 ? (
                <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No hay almacenes registrados.</p>
              ) : (
                <ul className="space-y-3">
                  {almacenes.map((almacen) => {
                    const ubicaciones = ubicacionesPorAlmacen[almacen.id] ?? []
                    return (
                      <li key={almacen.id} className="rounded-xl border bg-muted/20 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <strong>{almacen.nombre}</strong><code className="rounded bg-muted px-2 py-0.5 text-xs">{almacen.codigo}</code>
                              {almacen.es_principal && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Principal</span>}
                              <span className={almacen.activo ? 'text-xs font-semibold text-emerald-600' : 'text-xs font-semibold text-muted-foreground'}>{almacen.activo ? 'Activo' : 'Inactivo'}</span>
                            </div>
                            {(almacen.direccion || almacen.descripcion) && <p className="mt-1 text-sm text-muted-foreground">{almacen.direccion || almacen.descripcion}</p>}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => toggleExpanded(almacen.id)}>{expanded === almacen.id ? 'Ocultar ubicaciones' : 'Ver ubicaciones'}</Button>
                            <ProtectedComponent modulo="inventario" recurso="almacenes" accion="update">
                              <Button size="sm" variant="outline" onClick={() => setAlmacenEditor({ id: almacen.id, data: { codigo: almacen.codigo, nombre: almacen.nombre, direccion: almacen.direccion ?? '', telefono: almacen.telefono ?? '', descripcion: almacen.descripcion ?? '', es_principal: almacen.es_principal === true } })}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button>
                            </ProtectedComponent>
                            <ProtectedComponent modulo="inventario" recurso="almacenes" accion={almacen.activo ? 'delete' : 'update'}>
                              <Button size="sm" variant="ghost" onClick={() => changeWarehouseState(almacen)}>{almacen.activo ? <Power className="mr-1 h-3.5 w-3.5" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}{almacen.activo ? 'Desactivar' : 'Reactivar'}</Button>
                            </ProtectedComponent>
                          </div>
                        </div>

                        {expanded === almacen.id && (
                          <div className="mt-4 space-y-3 border-t pt-4">
                            <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Ubicaciones ({ubicaciones.length})</h3><ProtectedComponent modulo="inventario" recurso="ubicaciones" accion="create"><Button size="sm" disabled={!almacen.activo} onClick={() => setUbicacionEditor({ almacenId: almacen.id, data: { ...EMPTY_UBICACION } })}><Plus className="mr-1 h-3.5 w-3.5" />Nueva ubicación</Button></ProtectedComponent></div>

                            {ubicacionEditor?.almacenId === almacen.id && (
                              <div className="grid gap-3 rounded-xl border border-primary/20 bg-card p-4 md:grid-cols-2">
                                <label className="space-y-1 text-sm">Código *<Input aria-label="Código de ubicación" value={ubicacionEditor.data.codigo} onChange={(event) => setUbicacionEditor((current) => current && ({ ...current, data: { ...current.data, codigo: event.target.value } }))} /></label>
                                <label className="space-y-1 text-sm">Nombre *<Input aria-label="Nombre de ubicación" value={ubicacionEditor.data.nombre} onChange={(event) => setUbicacionEditor((current) => current && ({ ...current, data: { ...current.data, nombre: event.target.value } }))} /></label>
                                <label className="space-y-1 text-sm">Descripción<Input value={ubicacionEditor.data.descripcion} onChange={(event) => setUbicacionEditor((current) => current && ({ ...current, data: { ...current.data, descripcion: event.target.value } }))} /></label>
                                <label className="space-y-1 text-sm">Tipo<select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={ubicacionEditor.data.tipo} onChange={(event) => setUbicacionEditor((current) => current && ({ ...current, data: { ...current.data, tipo: event.target.value } }))}>{['PISO', 'PASILLO', 'RACK', 'ESTANTE', 'BIN', 'OTRO'].map((tipo) => <option key={tipo}>{tipo}</option>)}</select></label>
                                <div className="flex justify-end gap-2 md:col-span-2"><Button size="sm" variant="outline" onClick={() => setUbicacionEditor(null)}>Cancelar</Button><Button size="sm" onClick={saveUbicacion} disabled={saving || !ubicacionEditor.data.codigo.trim() || !ubicacionEditor.data.nombre.trim()}>Guardar ubicación</Button></div>
                              </div>
                            )}

                            {ubicaciones.length === 0 ? <p className="text-sm text-muted-foreground">Este almacén aún no tiene ubicaciones.</p> : (
                              <ul className="grid gap-2 md:grid-cols-2">
                                {ubicaciones.map((ubicacion) => (
                                  <li key={ubicacion.id} className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3">
                                    <div><strong className="text-sm">{ubicacion.nombre}</strong><p className="text-xs text-muted-foreground">{ubicacion.codigo} · {ubicacion.tipo || 'OTRO'} · {ubicacion.activo ? 'Activa' : 'Inactiva'}</p>{ubicacion.descripcion && <p className="mt-1 text-xs text-muted-foreground">{ubicacion.descripcion}</p>}</div>
                                    <div className="flex gap-1">
                                      <ProtectedComponent modulo="inventario" recurso="ubicaciones" accion="update"><Button aria-label={`Editar ubicación ${ubicacion.nombre}`} size="sm" variant="ghost" onClick={() => setUbicacionEditor({ almacenId: almacen.id, id: ubicacion.id, data: { codigo: ubicacion.codigo, nombre: ubicacion.nombre, descripcion: ubicacion.descripcion ?? '', tipo: ubicacion.tipo ?? 'OTRO' } })}><Pencil className="h-3.5 w-3.5" /></Button></ProtectedComponent>
                                      <ProtectedComponent modulo="inventario" recurso="ubicaciones" accion={ubicacion.activo ? 'delete' : 'update'}><Button aria-label={`${ubicacion.activo ? 'Desactivar' : 'Reactivar'} ubicación ${ubicacion.nombre}`} size="sm" variant="ghost" onClick={() => changeLocationState(ubicacion)}>{ubicacion.activo ? <Power className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}</Button></ProtectedComponent>
                                    </div>
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
            </CardContent>
          </Card>
        </div>
      </ProtectedComponent>
    </div>
  )
}
