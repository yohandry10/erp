'use client'

import { useCallback, useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useApi } from '@/hooks/use-api'
import { useLocalizedMoney } from '@/hooks/use-localized-money'

type FilaResumen = {
  sucursal_id: string
  nombre: string
  codigo_establecimiento: string
  es_principal: boolean
  ventas_pos_total: number
  ventas_pos_cantidad: number
  comprobantes_cantidad: number
  cajas_abiertas: number
}

/**
 * Informe por establecimiento.
 *
 * Se apoya en que desde la migración 504 cada operación sabe dónde ocurrió, así
 * que agrupa por sucursal sin cruzar cajas con almacenes. Un usuario restringido
 * a un local ve sólo su fila, porque el filtro se aplica en el cliente del API.
 */
export function ResumenSucursales() {
  const { get } = useApi()
  const { formatCurrency } = useLocalizedMoney()
  const [filas, setFilas] = useState<FilaResumen[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const respuesta = await get('/sucursales/resumen')
      setFilas(respuesta?.success && Array.isArray(respuesta.data) ? respuesta.data : [])
    } catch {
      setFilas([])
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Con un solo establecimiento el informe no dice nada que el resto de la
  // pantalla no diga ya, así que no se muestra.
  if (!loading && filas.length < 2) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="h-5 w-5" />
          Actividad por establecimiento
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando actividad…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 font-semibold">Establecimiento</th>
                  <th className="pb-2 pr-4 text-right font-semibold">Ventas POS</th>
                  <th className="pb-2 pr-4 text-right font-semibold">Tickets</th>
                  <th className="pb-2 pr-4 text-right font-semibold">Comprobantes</th>
                  <th className="pb-2 text-right font-semibold">Cajas abiertas</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.sucursal_id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4">
                      <span className="mr-2 font-mono text-xs text-muted-foreground">
                        {fila.codigo_establecimiento}
                      </span>
                      {fila.nombre}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatCurrency(fila.ventas_pos_total)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fila.ventas_pos_cantidad}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {fila.comprobantes_cantidad}
                    </td>
                    <td className="py-2 text-right tabular-nums">{fila.cajas_abiertas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
