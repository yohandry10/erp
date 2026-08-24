'use client'

import { useCallback, useEffect, useState } from 'react'
import { Building2, MapPin, Pencil, Plus, Power, RotateCcw, Save, X } from 'lucide-react'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useApi } from '@/hooks/use-api'
import { GuiaEstablecimientos } from './GuiaEstablecimientos'
import { AsignacionUsuarios } from './AsignacionUsuarios'
import { ResumenSucursales } from './ResumenSucursales'

type Sucursal = {
  id: string
  nombre: string
  codigo: string
  codigo_establecimiento: string
  es_principal: boolean
  activo: boolean
  direccion?: string | null
  ubigeo?: string | null
  telefono?: string | null
}

type SucursalForm = {
  nombre: string
  codigo_establecimiento: string
  direccion: string
  ubigeo: string
  telefono: string
}

const EMPTY_SUCURSAL: SucursalForm = {
  nombre: '',
  codigo_establecimiento: '',
  direccion: '',
  ubigeo: '',
  telefono: '',
}

function NoPermission() {
  return (
    <div className="rounded-xl border border-dashed border-blue-400/40 bg-blue-500/10 p-6 font-semibold text-primary">
      Necesitas el permiso <code>configuracion.sucursales.read</code> para administrar los
      establecimientos.
    </div>
  )
}

export default function SucursalesPage() {
  const { get, post, put, del } = useApi()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [editor, setEditor] = useState<{ id?: string; data: SucursalForm } | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await get('/sucursales?incluir_inactivas=true')
      setSucursales(response?.success && Array.isArray(response.data) ? response.data : [])
    } catch {
      setError('No se pudieron cargar los establecimientos. Intenta nuevamente.')
      setSucursales([])
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const guardar = async () => {
    if (!editor?.data.nombre.trim()) return
    setSaving(true)
    setError(null)
    try {
      // El codigo de establecimiento sale de la ficha RUC y no se reescribe:
      // sólo viaja al crear. Un anexo que cambia de codigo es otro anexo.
      const payload: Record<string, unknown> = {
        nombre: editor.data.nombre.trim(),
        direccion: editor.data.direccion.trim() || undefined,
        ubigeo: editor.data.ubigeo.trim() || undefined,
        telefono: editor.data.telefono.trim() || undefined,
      }

      if (editor.id) {
        await put(`/sucursales/${editor.id}`, payload)
      } else {
        if (editor.data.codigo_establecimiento.trim()) {
          payload.codigo_establecimiento = editor.data.codigo_establecimiento.trim()
        }
        await post('/sucursales', payload)
      }

      setEditor(null)
      await cargar()
    } catch {
      setError('No se pudo guardar el establecimiento.')
    } finally {
      setSaving(false)
    }
  }

  const cambiarEstado = async (sucursal: Sucursal) => {
    setError(null)
    try {
      if (sucursal.activo) {
        await del(`/sucursales/${sucursal.id}`)
      } else {
        await put(`/sucursales/${sucursal.id}`, { activo: true })
      }
      await cargar()
    } catch {
      setError('No se pudo cambiar el estado del establecimiento.')
    }
  }

  return (
    <div className="space-y-6 p-6">
      <ProtectedComponent modulo="configuracion" recurso="sucursales" accion="read" fallback={<NoPermission />}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Building2 className="h-6 w-6" />
              Establecimientos
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Cada establecimiento es un anexo de tu ficha RUC. El código de cuatro dígitos viaja
              dentro de cada comprobante electrónico, y las series de facturación se asignan por
              establecimiento. La casa matriz es el <code>0000</code> y no se puede desactivar.
            </p>
          </div>
          <ProtectedComponent modulo="configuracion" recurso="sucursales" accion="create">
            <Button onClick={() => setEditor({ data: { ...EMPTY_SUCURSAL } })}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo establecimiento
            </Button>
          </ProtectedComponent>
        </div>

        <GuiaEstablecimientos />

        {error && (
          <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm font-medium text-red-600">
            {error}
          </div>
        )}

        {editor && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {editor.id ? 'Editar establecimiento' : 'Nuevo establecimiento'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm font-medium">
                  <span>Nombre</span>
                  <Input
                    value={editor.data.nombre}
                    onChange={(event) =>
                      setEditor({ ...editor, data: { ...editor.data, nombre: event.target.value } })
                    }
                    placeholder="Sucursal Arequipa"
                  />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  <span>Código de establecimiento</span>
                  <Input
                    value={editor.data.codigo_establecimiento}
                    disabled={Boolean(editor.id)}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        data: {
                          ...editor.data,
                          codigo_establecimiento: event.target.value.replace(/[^0-9]/g, '').slice(0, 4),
                        },
                      })
                    }
                    placeholder="Se asigna solo si lo dejas vacío"
                  />
                  <span className="block text-xs font-normal text-muted-foreground">
                    {editor.id
                      ? 'No se puede cambiar: ya viaja dentro de comprobantes emitidos.'
                      : 'El que figura en tu ficha RUC. Si lo dejas vacío se asigna el siguiente libre.'}
                  </span>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  <span>Dirección</span>
                  <Input
                    value={editor.data.direccion}
                    onChange={(event) =>
                      setEditor({ ...editor, data: { ...editor.data, direccion: event.target.value } })
                    }
                  />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  <span>Ubigeo</span>
                  <Input
                    value={editor.data.ubigeo}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        data: { ...editor.data, ubigeo: event.target.value.replace(/[^0-9]/g, '').slice(0, 6) },
                      })
                    }
                    placeholder="040101"
                  />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  <span>Teléfono</span>
                  <Input
                    value={editor.data.telefono}
                    onChange={(event) =>
                      setEditor({ ...editor, data: { ...editor.data, telefono: event.target.value } })
                    }
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <Button onClick={guardar} disabled={saving || !editor.data.nombre.trim()}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Guardando…' : 'Guardar'}
                </Button>
                <Button variant="ghost" onClick={() => setEditor(null)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando establecimientos…</p>
        ) : sucursales.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay establecimientos.</p>
        ) : (
          <ul className="space-y-3">
            {sucursales.map((sucursal) => (
              <li key={sucursal.id}>
                <Card className={sucursal.activo ? undefined : 'opacity-60'}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-muted px-2 py-0.5 font-mono text-sm">
                          {sucursal.codigo_establecimiento}
                        </span>
                        <span className="font-semibold">{sucursal.nombre}</span>
                        {sucursal.es_principal && (
                          <span className="rounded bg-blue-500/15 px-2 py-0.5 text-xs font-semibold text-blue-600">
                            Casa matriz
                          </span>
                        )}
                        {!sucursal.activo && (
                          <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold">
                            Inactivo
                          </span>
                        )}
                      </div>
                      {sucursal.direccion && (
                        <p className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          {sucursal.direccion}
                          {sucursal.ubigeo ? ` · ${sucursal.ubigeo}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <ProtectedComponent modulo="configuracion" recurso="sucursales" accion="update">
                        <Button
                          aria-label={`Editar establecimiento ${sucursal.nombre}`}
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setEditor({
                              id: sucursal.id,
                              data: {
                                nombre: sucursal.nombre,
                                codigo_establecimiento: sucursal.codigo_establecimiento,
                                direccion: sucursal.direccion ?? '',
                                ubigeo: sucursal.ubigeo ?? '',
                                telefono: sucursal.telefono ?? '',
                              },
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </ProtectedComponent>
                      {!sucursal.es_principal && (
                        <ProtectedComponent
                          modulo="configuracion"
                          recurso="sucursales"
                          accion={sucursal.activo ? 'delete' : 'update'}
                        >
                          <Button
                            aria-label={`${sucursal.activo ? 'Desactivar' : 'Reactivar'} establecimiento ${sucursal.nombre}`}
                            size="sm"
                            variant="ghost"
                            onClick={() => cambiarEstado(sucursal)}
                          >
                            {sucursal.activo ? (
                              <Power className="h-3.5 w-3.5" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </ProtectedComponent>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <ResumenSucursales />

        <ProtectedComponent modulo="configuracion" recurso="sucursales" accion="assign">
          <AsignacionUsuarios sucursales={sucursales} />
        </ProtectedComponent>
      </ProtectedComponent>
    </div>
  )
}
