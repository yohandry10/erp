'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Calculator, Check, Loader2, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Miembro = {
  tenant_id: string
  estado: 'PENDIENTE' | 'ACTIVO' | 'RECHAZADO'
  es_controladora: boolean
  participacion: number
  empresa?: { ruc?: string; razon_social?: string; nombre_comercial?: string; moneda_defecto?: string }
}

type Grupo = {
  id: string
  codigo: string
  nombre: string
  moneda_presentacion: string
  es_controladora: boolean
  miembros: Miembro[]
}

type LineaEditor = {
  codigo: string
  nombre: string
  tipo: 'CUENTAS' | 'FORMULA'
  definicion: string
  naturaleza: 'SALDO' | 'DEBE' | 'HABER'
  alcance_fecha: 'PERIODO' | 'HASTA_FECHA'
  tipo_tasa: 'CIERRE' | 'PROMEDIO' | 'HISTORICA'
}

type Reporte = { id: string; codigo: string; nombre: string; lineas: any[] }

const hoy = new Date().toISOString().slice(0, 10)
const inicioAnio = `${new Date().getFullYear()}-01-01`
const campo = 'min-w-0 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground'

const lineasIniciales: LineaEditor[] = [
  {
    codigo: 'INGRESOS', nombre: 'Ingresos', tipo: 'CUENTAS', definicion: '7',
    naturaleza: 'HABER', alcance_fecha: 'PERIODO', tipo_tasa: 'PROMEDIO',
  },
  {
    codigo: 'GASTOS', nombre: 'Gastos', tipo: 'CUENTAS', definicion: '6',
    naturaleza: 'DEBE', alcance_fecha: 'PERIODO', tipo_tasa: 'PROMEDIO',
  },
  {
    codigo: 'RESULTADO', nombre: 'Resultado del período', tipo: 'FORMULA',
    definicion: 'INGRESOS:1,GASTOS:-1', naturaleza: 'SALDO',
    alcance_fecha: 'PERIODO', tipo_tasa: 'CIERRE',
  },
]

export default function ConsolidacionPage() {
  const { get, post } = useApi({ throwOnError: true })
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [reportes, setReportes] = useState<Reporte[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [grupoId, setGrupoId] = useState('')
  const [reporteId, setReporteId] = useState('')
  const [resultado, setResultado] = useState<any>(null)
  const [fechaDesde, setFechaDesde] = useState(inicioAnio)
  const [fechaHasta, setFechaHasta] = useState(hoy)

  const [nuevoGrupo, setNuevoGrupo] = useState({ codigo: '', nombre: '', moneda_presentacion: 'PEN' })
  const [invitacion, setInvitacion] = useState({ ruc: '', participacion: '100' })
  const [tasa, setTasa] = useState({ tenant_miembro_id: '', fecha: hoy, tipo: 'CIERRE', factor_conversion: '' })
  const [mapeo, setMapeo] = useState({ tenant_miembro_id: '', cuenta_codigo_origen: '', cuenta_codigo_destino: '' })
  const [ajuste, setAjuste] = useState({ fecha: hoy, tipo: 'ELIMINACION', cuenta_codigo: '', descripcion: '', debe: '', haber: '' })
  const [reporteForm, setReporteForm] = useState({ codigo: 'ER-GESTION', nombre: 'Estado de resultados de gestión' })
  const [lineas, setLineas] = useState<LineaEditor[]>(lineasIniciales)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [gruposResponse, reportesResponse] = await Promise.all([
        get('/api/contabilidad/consolidacion/grupos'),
        get('/api/contabilidad/reportes-configurables'),
      ])
      const nuevosGrupos = gruposResponse?.data || []
      const nuevosReportes = reportesResponse?.data || []
      setGrupos(nuevosGrupos)
      setReportes(nuevosReportes)
      setGrupoId((actual) => actual || nuevosGrupos[0]?.id || '')
      setReporteId((actual) => actual || nuevosReportes[0]?.id || '')
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar consolidación y reportes.')
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => { void cargar() }, [cargar])

  const grupo = useMemo(() => grupos.find((item) => item.id === grupoId), [grupos, grupoId])
  const invitacionPendiente = grupo?.miembros.find((m) => !m.es_controladora && m.estado === 'PENDIENTE')

  const ejecutar = async (accion: () => Promise<void>) => {
    setWorking(true)
    setError(null)
    try { await accion() } catch (e: any) { setError(e?.message || 'La operación no pudo completarse.') } finally { setWorking(false) }
  }

  const crearGrupo = () => ejecutar(async () => {
    await post('/api/contabilidad/consolidacion/grupos', nuevoGrupo)
    setNuevoGrupo({ codigo: '', nombre: '', moneda_presentacion: 'PEN' })
    await cargar()
  })

  const invitar = () => ejecutar(async () => {
    if (!grupo) return
    await post(`/api/contabilidad/consolidacion/grupos/${grupo.id}/invitaciones`, {
      ruc: invitacion.ruc,
      participacion: Number(invitacion.participacion),
    })
    setInvitacion({ ruc: '', participacion: '100' })
    await cargar()
  })

  const responder = (aceptar: boolean) => ejecutar(async () => {
    if (!grupo) return
    await post(`/api/contabilidad/consolidacion/grupos/${grupo.id}/respuesta`, { aceptar })
    await cargar()
  })

  const registrarTasa = () => ejecutar(async () => {
    if (!grupo) return
    await post(`/api/contabilidad/consolidacion/grupos/${grupo.id}/tasas`, {
      ...tasa,
      factor_conversion: Number(tasa.factor_conversion),
    })
    setTasa({ tenant_miembro_id: '', fecha: hoy, tipo: 'CIERRE', factor_conversion: '' })
  })

  const registrarMapeo = () => ejecutar(async () => {
    if (!grupo) return
    await post(`/api/contabilidad/consolidacion/grupos/${grupo.id}/mapeos-cuentas`, mapeo)
    setMapeo({ tenant_miembro_id: '', cuenta_codigo_origen: '', cuenta_codigo_destino: '' })
  })

  const registrarAjuste = () => ejecutar(async () => {
    if (!grupo) return
    await post(`/api/contabilidad/consolidacion/grupos/${grupo.id}/ajustes`, {
      ...ajuste,
      debe: Number(ajuste.debe || 0),
      haber: Number(ajuste.haber || 0),
    })
    setAjuste({ fecha: hoy, tipo: 'ELIMINACION', cuenta_codigo: '', descripcion: '', debe: '', haber: '' })
  })

  const guardarReporte = () => ejecutar(async () => {
    const payload = {
      ...reporteForm,
      lineas: lineas.map((linea, indice) => ({
        codigo: linea.codigo,
        nombre: linea.nombre,
        orden: indice + 1,
        tipo: linea.tipo,
        patrones_cuenta: linea.tipo === 'CUENTAS'
          ? linea.definicion.split(',').map((item) => item.trim()).filter(Boolean)
          : [],
        formula: linea.tipo === 'FORMULA'
          ? linea.definicion.split(',').map((item) => {
              const [codigo, coeficiente] = item.split(':')
              return { codigo: codigo?.trim(), coeficiente: Number(coeficiente) }
            })
          : [],
        naturaleza: linea.naturaleza,
        alcance_fecha: linea.alcance_fecha,
        tipo_tasa: linea.tipo_tasa,
        signo: 1,
      })),
    }
    const response = await post('/api/contabilidad/reportes-configurables', payload)
    await cargar()
    if (response?.data?.id) setReporteId(response.data.id)
  })

  const generar = () => ejecutar(async () => {
    if (!reporteId) return
    const params = new URLSearchParams({ fecha_desde: fechaDesde, fecha_hasta: fechaHasta })
    if (grupoId) params.set('grupo_id', grupoId)
    const response = await get(`/api/contabilidad/reportes-configurables/${reporteId}/generar?${params}`)
    setResultado(response?.data)
  })

  const modificarLinea = (indice: number, cambios: Partial<LineaEditor>) => {
    setLineas((actuales) => actuales.map((linea, i) => i === indice ? { ...linea, ...cambios } : linea))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-5 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Fase 7</div>
              <h1 className="text-3xl font-bold">Consolidación y reportes configurables</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Consolida únicamente empresas que aceptaron, convierte con tasas explícitas y aplica eliminaciones sin modificar sus libros legales.
              </p>
            </div>
            <Button variant="outline" onClick={() => void cargar()} disabled={loading || working} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Actualizar
            </Button>
          </div>
        </section>

        {error && <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center gap-3"><Loader2 className="h-6 w-6 animate-spin text-primary" /> Cargando...</div>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="min-w-0 border-cyan-400/20 bg-card/70">
                <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Grupos empresariales</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 md:grid-cols-4 [&>*]:min-w-0">
                    <Input aria-label="Código" placeholder="Código" value={nuevoGrupo.codigo} onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, codigo: e.target.value })} />
                    <Input aria-label="Nombre del grupo" className="md:col-span-2" placeholder="Nombre del grupo" value={nuevoGrupo.nombre} onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, nombre: e.target.value })} />
                    <div className="flex gap-2">
                      <Input aria-label="Moneda de presentación" maxLength={3} value={nuevoGrupo.moneda_presentacion} onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, moneda_presentacion: e.target.value.toUpperCase() })} />
                      <Button onClick={crearGrupo} disabled={working || !nuevoGrupo.codigo || !nuevoGrupo.nombre}><Plus className="h-4 w-4" /></Button>
                    </div>
                  </div>

                  <select aria-label="Grupo" className={`${campo} w-full`} value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
                    <option value="">Reporte individual, sin grupo</option>
                    {grupos.map((item) => <option key={item.id} value={item.id}>{item.nombre} · {item.moneda_presentacion}</option>)}
                  </select>

                  {grupo && (
                    <div className="space-y-3 rounded-xl border border-cyan-400/15 bg-background/30 p-4">
                      <div className="flex items-center justify-between"><strong>{grupo.nombre}</strong><span className="text-xs text-muted-foreground">{grupo.es_controladora ? 'Controladora' : 'Empresa invitada'}</span></div>
                      <div className="space-y-2">
                        {grupo.miembros.map((miembro) => (
                          <div key={miembro.tenant_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
                            <span>{miembro.empresa?.razon_social || miembro.empresa?.nombre_comercial || miembro.tenant_id}</span>
                            <span className="text-xs text-muted-foreground">{miembro.empresa?.moneda_defecto} · {miembro.estado} · {miembro.participacion}%</span>
                          </div>
                        ))}
                      </div>
                      {grupo.es_controladora ? (
                        <div className="grid gap-2 md:grid-cols-[1fr_120px_auto]">
                          <Input aria-label="RUC exacto de la empresa" placeholder="RUC exacto de la empresa" value={invitacion.ruc} onChange={(e) => setInvitacion({ ...invitacion, ruc: e.target.value })} />
                          <Input aria-label="Participación" type="number" min="0.01" max="100" value={invitacion.participacion} onChange={(e) => setInvitacion({ ...invitacion, participacion: e.target.value })} />
                          <Button onClick={invitar} disabled={working || !invitacion.ruc} className="gap-2"><Send className="h-4 w-4" /> Invitar</Button>
                        </div>
                      ) : invitacionPendiente ? (
                        <div className="flex gap-2">
                          <Button onClick={() => responder(true)} className="gap-2"><Check className="h-4 w-4" /> Aceptar</Button>
                          <Button variant="outline" onClick={() => responder(false)} className="gap-2"><X className="h-4 w-4" /> Rechazar</Button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="min-w-0 border-cyan-400/20 bg-card/70">
                <CardHeader><CardTitle>Tasas y ajustes del consolidado</CardTitle></CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Homologación de cuentas</div>
                    <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] [&>*]:min-w-0">
                      <select aria-label="Tenant miembro" className={campo} value={mapeo.tenant_miembro_id} onChange={(e) => setMapeo({ ...mapeo, tenant_miembro_id: e.target.value })}>
                        <option value="">Empresa miembro</option>
                        {grupo?.miembros.filter((m) => m.estado === 'ACTIVO' && !m.es_controladora).map((m) => <option key={m.tenant_id} value={m.tenant_id}>{m.empresa?.razon_social || m.tenant_id}</option>)}
                      </select>
                      <Input aria-label="Cuenta origen" placeholder="Cuenta origen" value={mapeo.cuenta_codigo_origen} onChange={(e) => setMapeo({ ...mapeo, cuenta_codigo_origen: e.target.value })} />
                      <Input aria-label="Cuenta destino" placeholder="Cuenta destino" value={mapeo.cuenta_codigo_destino} onChange={(e) => setMapeo({ ...mapeo, cuenta_codigo_destino: e.target.value })} />
                      <Button onClick={registrarMapeo} disabled={working || !grupo?.es_controladora || !mapeo.tenant_miembro_id || !mapeo.cuenta_codigo_origen || !mapeo.cuenta_codigo_destino}><Plus className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tasa de presentación</div>
                    <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-[minmax(0,2fr)_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)_auto] [&>*]:min-w-0">
                      <select aria-label="Tenant miembro" className={campo} value={tasa.tenant_miembro_id} onChange={(e) => setTasa({ ...tasa, tenant_miembro_id: e.target.value })}>
                        <option value="">Empresa miembro</option>
                        {grupo?.miembros.filter((m) => m.estado === 'ACTIVO' && !m.es_controladora).map((m) => <option key={m.tenant_id} value={m.tenant_id}>{m.empresa?.razon_social || m.tenant_id}</option>)}
                      </select>
                      <Input aria-label="Fecha" type="date" value={tasa.fecha} onChange={(e) => setTasa({ ...tasa, fecha: e.target.value })} />
                      <select aria-label="Tipo" className={campo} value={tasa.tipo} onChange={(e) => setTasa({ ...tasa, tipo: e.target.value })}><option>CIERRE</option><option>PROMEDIO</option><option>HISTORICA</option></select>
                      <Input aria-label="Factor" type="number" step="0.000001" placeholder="Factor" value={tasa.factor_conversion} onChange={(e) => setTasa({ ...tasa, factor_conversion: e.target.value })} />
                      <Button onClick={registrarTasa} disabled={working || !grupo?.es_controladora || !tasa.tenant_miembro_id || !tasa.factor_conversion}><Plus className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Eliminación o reclasificación</div>
                    <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4 [&>*]:min-w-0">
                      <Input aria-label="Fecha" type="date" value={ajuste.fecha} onChange={(e) => setAjuste({ ...ajuste, fecha: e.target.value })} />
                      <select aria-label="Tipo" className={campo} value={ajuste.tipo} onChange={(e) => setAjuste({ ...ajuste, tipo: e.target.value })}><option>ELIMINACION</option><option>RECLASIFICACION</option></select>
                      <Input aria-label="Cuenta" placeholder="Cuenta" value={ajuste.cuenta_codigo} onChange={(e) => setAjuste({ ...ajuste, cuenta_codigo: e.target.value })} />
                      <Input aria-label="Descripción" placeholder="Descripción" value={ajuste.descripcion} onChange={(e) => setAjuste({ ...ajuste, descripcion: e.target.value })} />
                      <Input aria-label="Debe" type="number" step="0.01" placeholder="Debe" value={ajuste.debe} onChange={(e) => setAjuste({ ...ajuste, debe: e.target.value, haber: '' })} />
                      <Input aria-label="Haber" type="number" step="0.01" placeholder="Haber" value={ajuste.haber} onChange={(e) => setAjuste({ ...ajuste, haber: e.target.value, debe: '' })} />
                      <Button className="md:col-span-2" onClick={registrarAjuste} disabled={working || !grupo?.es_controladora || !ajuste.cuenta_codigo || (!ajuste.debe && !ajuste.haber)}>Registrar sin tocar libros</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-cyan-400/20 bg-card/70">
              <CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-primary" /> Diseñador de reportes</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 md:grid-cols-3">
                  <Input aria-label="Código" placeholder="Código" value={reporteForm.codigo} onChange={(e) => setReporteForm({ ...reporteForm, codigo: e.target.value })} />
                  <Input aria-label="Nombre" className="md:col-span-2" placeholder="Nombre" value={reporteForm.nombre} onChange={(e) => setReporteForm({ ...reporteForm, nombre: e.target.value })} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-sm">
                    <thead><tr className="border-b border-border text-left text-xs uppercase text-muted-foreground"><th className="p-2">Código</th><th className="p-2">Nombre</th><th className="p-2">Tipo</th><th className="p-2">Prefijos o fórmula</th><th className="p-2">Naturaleza</th><th className="p-2">Fechas</th><th className="p-2">Tasa</th><th /></tr></thead>
                    <tbody>{lineas.map((linea, indice) => (
                      <tr key={indice} className="border-b border-border/50">
                        <td className="p-1"><Input aria-label="Código" value={linea.codigo} onChange={(e) => modificarLinea(indice, { codigo: e.target.value })} /></td>
                        <td className="p-1"><Input aria-label="Nombre" value={linea.nombre} onChange={(e) => modificarLinea(indice, { nombre: e.target.value })} /></td>
                        <td className="p-1"><select aria-label="Tipo" className={campo} value={linea.tipo} onChange={(e) => modificarLinea(indice, { tipo: e.target.value as any })}><option>CUENTAS</option><option>FORMULA</option></select></td>
                        <td className="p-1"><Input aria-label="Definición" value={linea.definicion} placeholder={linea.tipo === 'CUENTAS' ? '10,11,12' : 'A:1,B:-1'} onChange={(e) => modificarLinea(indice, { definicion: e.target.value })} /></td>
                        <td className="p-1"><select aria-label="Naturaleza" className={campo} value={linea.naturaleza} disabled={linea.tipo === 'FORMULA'} onChange={(e) => modificarLinea(indice, { naturaleza: e.target.value as any })}><option>SALDO</option><option>DEBE</option><option>HABER</option></select></td>
                        <td className="p-1"><select aria-label="Alcance fecha" className={campo} value={linea.alcance_fecha} disabled={linea.tipo === 'FORMULA'} onChange={(e) => modificarLinea(indice, { alcance_fecha: e.target.value as any })}><option>PERIODO</option><option>HASTA_FECHA</option></select></td>
                        <td className="p-1"><select aria-label="Tipo tasa" className={campo} value={linea.tipo_tasa} disabled={linea.tipo === 'FORMULA'} onChange={(e) => modificarLinea(indice, { tipo_tasa: e.target.value as any })}><option>CIERRE</option><option>PROMEDIO</option><option>HISTORICA</option></select></td>
                        <td className="p-1"><Button variant="ghost" onClick={() => setLineas((actuales) => actuales.filter((_, i) => i !== indice))}><Trash2 className="h-4 w-4" /></Button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setLineas((actuales) => [...actuales, { ...lineasIniciales[0], codigo: '', nombre: '', definicion: '' }])}><Plus className="mr-2 h-4 w-4" /> Línea</Button>
                  <Button onClick={guardarReporte} disabled={working || !reporteForm.codigo || !reporteForm.nombre || lineas.length === 0}>Guardar definición atómica</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-cyan-400/20 bg-card/70">
              <CardHeader><CardTitle>Generar estado financiero</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 md:grid-cols-5">
                  <select aria-label="Reporte" className={`${campo} md:col-span-2`} value={reporteId} onChange={(e) => setReporteId(e.target.value)}><option value="">Seleccione reporte</option>{reportes.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select>
                  <Input aria-label="Fecha desde" type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
                  <Input aria-label="Fecha hasta" type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
                  <Button onClick={generar} disabled={working || !reporteId}>{working ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generar'}</Button>
                </div>
                {resultado && (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <div className="flex flex-wrap justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3 text-sm"><strong>{resultado.reporte?.nombre}</strong><span>{resultado.alcance} · {resultado.empresas_incluidas} empresa(s) · {resultado.moneda_presentacion}</span></div>
                    <table className="w-full min-w-[600px] text-sm"><tbody>{resultado.lineas?.map((linea: any) => <tr key={linea.codigo} className="border-b border-border/60"><td className="px-4 py-3 font-mono text-xs">{linea.codigo}</td><td className="px-4 py-3">{linea.nombre}</td><td className="px-4 py-3 text-right font-semibold">{Number(linea.valor).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>)}</tbody></table>
                    <div className="px-4 py-3 text-xs text-muted-foreground">Ajustes de consolidación aplicados solo en esta vista. Libros legales alterados: no.</div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
