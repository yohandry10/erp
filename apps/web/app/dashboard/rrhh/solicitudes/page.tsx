'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { CalendarDays, RefreshCw } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/contexts/AuthContext'
import { usePermission } from '@/hooks/use-permission'
import { useToast } from '@/components/ui/use-toast'
import { PageShell } from '@/components/erp/page-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseDateLocal } from '@/lib/date-utils'
import { readRequestCatalogs } from '@/lib/rrhh/requests-catalog'
import { readRequestIntent, readRequestReceipt, requestIntentKey, requestPayload, type RequestIntent } from '@/lib/rrhh/request-operation'

const fieldClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
const tipos = [
  ['vacaciones', 'Vacaciones'], ['licencia', 'Licencia'], ['permiso', 'Permiso'],
  ['descanso_medico', 'Descanso médico'], ['compensacion', 'Compensación'], ['otro', 'Otro'],
] as const
const formatDate = (value: string) => value ? parseDateLocal(value).toLocaleDateString('es-PE') : '—'

export default function SolicitudesRrhhPage() {
  const { post, put } = useApi({ requireLive: true, throwOnError: true, showErrorToast: false, retries: 0 })
  const { get } = useApi({ requireLive: true, throwOnError: true, showErrorToast: false, retries: 0 })
  const { session } = useAuth()
  const { hasPermission, loading: permissionsLoading } = usePermission('rrhh', 'access', '__global__')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ id_empleado: '', tipo: 'vacaciones', fecha_inicio: '', fecha_fin: '', motivo: '' })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [decision, setDecision] = useState<{ id: string; action: 'aprobar' | 'rechazar'; employee: string } | null>(null)
  const [observaciones, setObservaciones] = useState('')
  const [pendingIntent, setPendingIntent] = useState<RequestIntent | null>(null)
  const [intentReady, setIntentReady] = useState('')
  const [storageError, setStorageError] = useState('')
  const [writeError, setWriteError] = useState('')
  const operationEpoch = useRef(0)
  const writing = useRef<number | null>(null)
  const activeScope = useRef('')
  const tenantId = session?.user?.tenant_id || ''
  const actorId = session?.user?.id || ''
  const scope = `${tenantId}:${actorId}`
  activeScope.current = hasPermission && !permissionsLoading ? scope : ''
  const queryKey = ['rrhh-solicitudes', tenantId, actorId]
  useEffect(() => {
    operationEpoch.current++; writing.current = null
    setForm({ id_empleado: '', tipo: 'vacaciones', fecha_inicio: '', fecha_fin: '', motivo: '' })
    setDecision(null); setObservaciones(''); setSearch(''); setStatus(''); setPage(1); setBusy(false)
    setPendingIntent(null); setIntentReady(''); setStorageError(''); setWriteError('')
    if (tenantId && actorId) {
      try {
        const intent = readRequestIntent(localStorage.getItem(requestIntentKey({ tenantId, actorId })), { tenantId, actorId })
        setPendingIntent(intent)
        if (intent?.kind === 'create') {
          const { dias: _days, ...fields } = intent.payload
          setForm(fields)
        } else if (intent?.kind === 'decide') {
          setDecision({ id: intent.request.id, action: intent.action, employee: 'Empleado seleccionado' })
          setObservaciones(intent.payload.observaciones)
        }
      } catch (error: any) { setStorageError(error?.message || 'No se pudo recuperar la operación pendiente.') }
      setIntentReady(`${tenantId}:${actorId}`)
    }
    return () => { operationEpoch.current++; writing.current = null }
  }, [tenantId, actorId])
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    enabled: !!tenantId && !!actorId && !permissionsLoading && hasPermission,
    queryFn: async () => {
      const [requests, employees] = await Promise.all([get('/rrhh/solicitudes'), get('/rrhh/empleados')])
      return readRequestCatalogs(requests, employees, { tenantId, actorId })
    },
  })
  const readReady = !!data && data.scope === scope && !error && !isLoading && !isFetching
  const employees = useMemo(() => readReady ? data?.employees || [] : [], [data?.employees, readReady])
  const pendingEmployee = pendingIntent?.kind === 'decide' ? employees.find(person => person.id === pendingIntent.request.id_empleado) : null
  const decisionEmployeeName = pendingEmployee ? `${pendingEmployee.nombres} ${pendingEmployee.apellidos}` : decision?.employee
  const canCreate = readReady && employees.some(person => person.estado === 'activo')
  const controlsBlocked = busy || !!pendingIntent || !!storageError || intentReady !== scope
  const days = form.fecha_inicio && form.fecha_fin
    ? Math.round((parseDateLocal(form.fecha_fin).getTime() - parseDateLocal(form.fecha_inicio).getTime()) / 86400000) + 1
    : 0
  const employeeName = (request: any) => {
    const employee = request.empleados || employees.find((item: any) => item.id === request.id_empleado)
    return employee ? `${employee.nombres} ${employee.apellidos}` : 'Empleado no disponible'
  }
  const rows = useMemo(() => (readReady ? data?.requests || [] : []).filter((request: any) => {
    const employee = request.empleados || employees.find((item: any) => item.id === request.id_empleado)
    const text = `${employee?.nombres || ''} ${employee?.apellidos || ''} ${request.motivo || ''}`.toLocaleLowerCase('es-PE')
    return (!status || request.estado === status) && text.includes(search.toLocaleLowerCase('es-PE'))
  }), [data, employees, status, search, readReady])
  const totalPages = Math.max(1, Math.ceil(rows.length / 20))
  const currentPage = Math.min(page, totalPages)

  const execute = async (candidate: RequestIntent) => {
    if (!readReady || !hasPermission || busy || writing.current !== null || storageError || intentReady !== scope) return
    const submittedScope = activeScope.current
    const epoch = operationEpoch.current
    const current = () => submittedScope === activeScope.current && epoch === operationEpoch.current
    writing.current = epoch; setBusy(true); setWriteError('')
    try {
      const storageKey = requestIntentKey({ tenantId, actorId })
      const intent = readRequestIntent(JSON.stringify(candidate), { tenantId, actorId })!
      const serialized = JSON.stringify(intent)
      const stored = localStorage.getItem(storageKey)
      if (stored !== null && stored !== serialized) throw new Error('La operación pendiente cambió. Se conserva para revisar su resultado.')
      // Intención durable: datos de negocio e ids de empresa y usuario, sin token ni contraseña.
      // codeql[js/clear-text-storage-of-sensitive-data]
      localStorage.setItem(storageKey, serialized)
      if (localStorage.getItem(storageKey) !== serialized) throw new Error('No se pudo conservar la operación antes del envío.')
      setPendingIntent(intent)
      const headers = { 'Idempotency-Key': intent.key }
      const response = intent.kind === 'create'
        ? await post('/rrhh/solicitudes', intent.payload, { headers })
        : await put(`/rrhh/solicitudes/${intent.request.id}/${intent.action}`, intent.payload, { headers })
      if (!current()) return
      readRequestReceipt(response, intent, employees)
      if (localStorage.getItem(storageKey) !== serialized) throw new Error('La operación pendiente cambió. Se conserva para revisar su resultado.')
      localStorage.removeItem(storageKey)
      if (localStorage.getItem(storageKey) !== null) throw new Error('No se pudo retirar la operación confirmada. Se conservan los datos.')
      setPendingIntent(null)
      setForm({ id_empleado: '', tipo: 'vacaciones', fecha_inicio: '', fecha_fin: '', motivo: '' })
      setDecision(null); setObservaciones('')
      await queryClient.invalidateQueries({ queryKey })
      if (!current()) return
      toast({ title: intent.kind === 'create' ? 'Solicitud registrada' : intent.action === 'aprobar' ? 'Solicitud aprobada' : 'Solicitud rechazada' })
    } catch (error: any) { if (current()) setWriteError(error?.message || 'No se pudo confirmar la operación. Sus datos se conservan.') }
    finally { if (writing.current === epoch) writing.current = null; if (current()) setBusy(false) }
  }
  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canCreate || controlsBlocked) return
    if (days < 1) { toast({ title: 'Revisa las fechas', description: 'La fecha final debe ser igual o posterior a la inicial.', variant: 'destructive' }); return }
    await execute({ version: 1, tenantId, actorId, createdAt: new Date().toISOString(), key: `rrhh-request:${crypto.randomUUID()}`, kind: 'create', payload: { ...form, dias: days } })
  }
  const decide = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!decision || !readReady || controlsBlocked) return
    const request = data?.requests.find(row => row.id === decision.id && row.estado === 'pendiente')
    if (!request) { setWriteError('Consulta las solicitudes antes de decidir. Esta solicitud ya no está pendiente.'); return }
    await execute({ version: 1, tenantId, actorId, createdAt: new Date().toISOString(), key: `rrhh-request:${crypto.randomUUID()}`, kind: 'decide', action: decision.action, request: { ...requestPayload(request), id: request.id }, payload: { aprobado_por: actorId, observaciones: observaciones.trim() } })
  }

  return <PageShell title="Vacaciones y licencias" description="Registra y resuelve los descansos del personal. Las vacaciones aprobadas alimentan el cálculo de planillas y liquidaciones."
    actions={<Button variant="outline" onClick={() => refetch()} disabled={busy || isLoading || isFetching}><RefreshCw className="mr-2 h-4 w-4"/>Actualizar</Button>}>
    <Link className="text-sm text-primary underline" href="/dashboard/rrhh">Volver a Recursos humanos</Link>
    {!permissionsLoading && !hasPermission ? <p role="alert">No tienes permiso para consultar Recursos humanos.</p> : <>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5"/>Nueva solicitud</CardTitle></CardHeader><CardContent>
        <form onSubmit={create} className="grid gap-4 md:grid-cols-3">
          <fieldset className="contents" disabled={controlsBlocked || !canCreate}>
          {readReady && employees.every((item: any) => String(item.estado).toLowerCase() !== 'activo') && <p className="md:col-span-3">No hay empleados activos. <Link className="text-primary underline" href="/dashboard/rrhh">Registrar un empleado en Recursos humanos</Link>.</p>}
          <div><Label htmlFor="request-employee">Empleado</Label><select id="request-employee" required className={fieldClass} value={form.id_empleado} onChange={event => setForm({ ...form, id_empleado: event.target.value })}><option value="">Selecciona un empleado</option>{employees.filter((item: any) => String(item.estado).toLowerCase() === 'activo').map((item: any) => <option key={item.id} value={item.id}>{item.nombres} {item.apellidos}</option>)}</select></div>
          <div><Label htmlFor="request-type">Tipo de solicitud</Label><select id="request-type" className={fieldClass} value={form.tipo} onChange={event => setForm({ ...form, tipo: event.target.value })}>{tipos.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="flex items-end"><p aria-live="polite">Días calendario: <strong>{Math.max(0, days)}</strong></p></div>
          <div><Label htmlFor="request-start">Fecha inicial</Label><Input id="request-start" type="date" required value={form.fecha_inicio} onChange={event => setForm({ ...form, fecha_inicio: event.target.value })}/></div>
          <div><Label htmlFor="request-end">Fecha final</Label><Input id="request-end" type="date" required min={form.fecha_inicio || undefined} value={form.fecha_fin} onChange={event => setForm({ ...form, fecha_fin: event.target.value })}/></div>
          <div><Label htmlFor="request-reason">Motivo</Label><Input id="request-reason" required maxLength={2000} value={form.motivo} onChange={event => setForm({ ...form, motivo: event.target.value })}/></div>
          <div className="md:col-span-3">{!pendingIntent && <Button type="submit" disabled={controlsBlocked || !canCreate || !hasPermission}>Registrar solicitud</Button>}</div>
          </fieldset>
        </form>
      </CardContent></Card>
      {decision && <Card><CardHeader><CardTitle>{decision.action === 'aprobar' ? 'Aprobar' : 'Rechazar'} solicitud de {decisionEmployeeName}</CardTitle></CardHeader><CardContent><form onSubmit={decide} className="space-y-3"><Label htmlFor="request-observations">{decision.action === 'rechazar' ? 'Motivo del rechazo' : 'Observaciones'}</Label><textarea id="request-observations" disabled={controlsBlocked || !readReady} className={fieldClass} maxLength={2000} required={decision.action === 'rechazar'} value={observaciones} onChange={event => setObservaciones(event.target.value)}/><div className="flex gap-3">{!pendingIntent && <Button type="submit" disabled={controlsBlocked || !readReady}>Confirmar {decision.action === 'aprobar' ? 'aprobación' : 'rechazo'}</Button>}<Button type="button" variant="outline" disabled={controlsBlocked} onClick={() => { setDecision(null); setObservaciones('') }}>Cancelar</Button></div></form></CardContent></Card>}
      {storageError && <p role="alert">{storageError}</p>}
      {writeError && <p role="alert">{writeError}</p>}
      {pendingIntent && <div className="space-y-3"><p role="status">Hay una operación pendiente de confirmación. Se conservan los datos para reintentar el mismo registro.</p><Button type="button" disabled={busy || !readReady || !!storageError || intentReady !== scope} onClick={() => void execute(pendingIntent)}>Reintentar operación pendiente</Button></div>}
      <Card><CardHeader><CardTitle>Solicitudes registradas</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2"><div><Label htmlFor="request-search">Buscar empleado o motivo</Label><Input id="request-search" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }}/></div><div><Label htmlFor="request-status">Estado</Label><select id="request-status" className={fieldClass} value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="">Todos</option>{['pendiente', 'aprobada', 'rechazada', 'cancelada'].map(value => <option key={value} value={value}>{value}</option>)}</select></div></div>
        {error ? <p role="alert">No se pudieron verificar las solicitudes y los empleados de esta empresa. Usa Actualizar para reintentar.</p> : isLoading || isFetching ? <p>Cargando solicitudes…</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left">{['Empleado', 'Tipo', 'Fechas', 'Días', 'Estado', 'Motivo / decisión', 'Acciones'].map(title => <th key={title} className="p-2">{title}</th>)}</tr></thead><tbody>{rows.slice((currentPage - 1) * 20, currentPage * 20).map((request: any) => <tr key={request.id} className="border-b"><td className="p-2">{employeeName(request)}</td><td className="p-2">{tipos.find(([value]) => value === request.tipo)?.[1] || request.tipo}</td><td className="p-2">{formatDate(request.fecha_inicio)} — {formatDate(request.fecha_fin)}</td><td className="p-2">{request.dias}</td><td className="p-2">{request.estado}</td><td className="p-2">{request.motivo}{request.observaciones_aprobacion && <p>{request.observaciones_aprobacion}</p>}</td><td className="p-2">{request.estado === 'pendiente' && <div className="flex gap-2"><Button size="sm" disabled={controlsBlocked || !readReady} onClick={() => { setDecision({ id: request.id, action: 'aprobar', employee: employeeName(request) }); setObservaciones('') }}>Aprobar</Button><Button size="sm" variant="outline" disabled={controlsBlocked || !readReady} onClick={() => { setDecision({ id: request.id, action: 'rechazar', employee: employeeName(request) }); setObservaciones('') }}>Rechazar</Button></div>}</td></tr>)}</tbody></table>{rows.length === 0 && <p className="py-4">No hay solicitudes con estos filtros.</p>}</div>}
        {readReady && <div className="flex items-center justify-between"><span>{rows.length} solicitudes · Página {currentPage} de {totalPages}</span><div className="flex gap-2"><Button variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button><Button variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</Button></div></div>}
      </CardContent></Card>
    </>}
  </PageShell>
}
