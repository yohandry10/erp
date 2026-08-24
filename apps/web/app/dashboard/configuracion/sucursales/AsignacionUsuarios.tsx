'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useApi } from '@/hooks/use-api'

type SucursalResumen = {
  id: string
  nombre: string
  codigo_establecimiento: string
  activo: boolean
}

type UsuarioSistema = {
  id: string
  email: string
  nombre?: string | null
  apellido?: string | null
}

export function AsignacionUsuarios({ sucursales }: { sucursales: SucursalResumen[] }) {
  const { get, put } = useApi()
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([])
  const [asignaciones, setAsignaciones] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const respuesta = await get('/usuarios-sistema?activo=true&limit=200')
      const lista: UsuarioSistema[] =
        respuesta?.success && Array.isArray(respuesta.data) ? respuesta.data : []
      setUsuarios(lista)

      const pares = await Promise.all(
        lista.map(async (usuario) => {
          const asignado = await get(`/sucursales/usuarios/${usuario.id}`)
          return [
            usuario.id,
            asignado?.success && Array.isArray(asignado.data) ? asignado.data : [],
          ] as const
        }),
      )
      setAsignaciones(Object.fromEntries(pares))
    } catch {
      setError('No se pudo cargar la asignación de usuarios.')
      setUsuarios([])
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const alternar = async (usuarioId: string, sucursalId: string) => {
    const actual = asignaciones[usuarioId] ?? []
    const siguiente = actual.includes(sucursalId)
      ? actual.filter((id) => id !== sucursalId)
      : [...actual, sucursalId]

    setGuardando(usuarioId)
    setError(null)
    try {
      await put(`/sucursales/usuarios/${usuarioId}`, { sucursal_ids: siguiente })
      setAsignaciones((previo) => ({ ...previo, [usuarioId]: siguiente }))
    } catch {
      setError('No se pudo guardar la asignación.')
    } finally {
      setGuardando(null)
    }
  }

  const activas = sucursales.filter((sucursal) => sucursal.activo)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" />
          Quién ve qué
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Un usuario <strong>sin ningún establecimiento marcado ve todos</strong> — es la oficina
          central. Marca uno o varios para limitarlo a esos: dejará de ver las ventas, cajas y stock
          del resto.
        </p>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm font-medium text-red-600">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando usuarios…</p>
        ) : usuarios.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay usuarios activos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 font-semibold">Usuario</th>
                  {activas.map((sucursal) => (
                    <th key={sucursal.id} className="pb-2 pr-4 text-center font-semibold">
                      <span className="block font-mono text-xs text-muted-foreground">
                        {sucursal.codigo_establecimiento}
                      </span>
                      {sucursal.nombre}
                    </th>
                  ))}
                  <th className="pb-2 font-semibold">Alcance</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => {
                  const asignado = asignaciones[usuario.id] ?? []
                  const nombre = [usuario.nombre, usuario.apellido].filter(Boolean).join(' ')
                  return (
                    <tr key={usuario.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-4">
                        <span className="block font-medium">{nombre || usuario.email}</span>
                        {Boolean(nombre) && (
                          <span className="block text-xs text-muted-foreground">{usuario.email}</span>
                        )}
                      </td>
                      {activas.map((sucursal) => {
                        const marcado = asignado.includes(sucursal.id)
                        return (
                          <td key={sucursal.id} className="py-2 pr-4 text-center">
                            <Button
                              size="sm"
                              variant={marcado ? 'default' : 'ghost'}
                              aria-pressed={marcado}
                              aria-label={`${marcado ? 'Quitar' : 'Asignar'} ${sucursal.nombre} a ${usuario.email}`}
                              disabled={guardando === usuario.id}
                              onClick={() => alternar(usuario.id, sucursal.id)}
                            >
                              <Check className={`h-3.5 w-3.5 ${marcado ? '' : 'opacity-25'}`} />
                            </Button>
                          </td>
                        )
                      })}
                      <td className="py-2 text-xs text-muted-foreground">
                        {asignado.length === 0
                          ? 'Todos los establecimientos'
                          : `${asignado.length} de ${activas.length}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
