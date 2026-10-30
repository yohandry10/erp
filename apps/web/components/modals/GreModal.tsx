'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useApiCall } from '@/hooks/use-api'
import { useAuth } from '@/contexts/AuthContext'
import { useGreRead } from '@/hooks/use-gre-read'
import { GreCreationIntent, greCreated, greCreationMatchesContext, greCreationRecoveryPath, greEstablishments, greProducts, readGreCreationIntent } from '@/lib/gre-read-contract'

function showToast(message: string) {
  if (typeof window === 'undefined') return

  const toast = document.createElement('div')
  const content = document.createElement('div')
  content.textContent = message
  toast.appendChild(content)
  document.body.appendChild(toast)
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast)
    }
  }, 3000)
}

function defaultTransferDate() {
  const value = new Date()
  value.setDate(value.getDate() + 1)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface CpeData {
  id: string
  tipoDocumento?: string
  tipoComprobante: string
  serie: string
  numero: number
  fechaEmision: string
  cliente: string
  clienteRuc: string
  total: number
  moneda: string
  estado: string
}

interface PedidoContext {
  id: string
  numero: string
  clienteNombre: string
  clienteDireccion?: string | null
}

interface GreModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (data?: any) => void
  cpeData?: CpeData | null // Datos opcionales del CPE para pre-llenar
  pedidoContext?: PedidoContext
  additionalPayload?: Record<string, any>
}

export default function GreModal({
  isOpen,
  onClose,
  onSuccess,
  cpeData,
  pedidoContext,
  additionalPayload
}: GreModalProps) {
  const router = useRouter()
  const [formData, setFormData] = useState({
    destinatario: '',
    direccionDestino: '',
    ubigeoDestino: '',
    fechaTraslado: defaultTransferDate(),
    modalidad: 'TRANSPORTE_PUBLICO',
    motivo: 'VENTA',
    pesoTotal: '',
    observaciones: '',
    transportista: '',
    transportistaDocumento: '',
    placaVehiculo: '',
    licenciaConducir: '',
    conductorDocumentoTipo: '1',
    conductorDocumentoNumero: '',
    conductorNombres: '',
    conductorApellidos: ''
  })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [recipient, setRecipient] = useState({ tipo: '6', numero: '' })
  const [manualItems, setManualItems] = useState([{ productoId: '', descripcion: '', cantidad: '1', unidadMedida: 'NIU' }])
  const [partidaId, setPartidaId] = useState('')
  const [llegadaId, setLlegadaId] = useState('')

  const api = useApiCall({ requireLive: true, throwOnError: true, showErrorToast: false, retries: 0 })
  const { session, loading: authLoading } = useAuth()
  const actor = session?.user
  const scope = actor?.tenant_id && actor?.id ? `erp.gre-create-intent.${actor.tenant_id}.${actor.id}.${pedidoContext?.id || cpeData?.id || 'manual'}` : ''
  const contextKey = JSON.stringify([scope, isOpen, additionalPayload?.despachosAsociados ?? []])
  const scopeRef = useRef(contextKey); scopeRef.current = contextKey
  const previousScope = useRef(scope)
  const [pendingState, setPendingState] = useState<{ scope: string; intent: GreCreationIntent | null }>({ scope: '', intent: null })
  const pending = pendingState.scope === scope ? pendingState.intent : null
  const contextMismatch = Boolean(pending && !greCreationMatchesContext(pending.payload, { pedidoId: pedidoContext?.id, dispatches: additionalPayload?.despachosAsociados }))
  const recoveryPath = contextMismatch ? greCreationRecoveryPath(pending?.payload, pedidoContext?.id) : null
  const [intentReady, setIntentReady] = useState('')
  const establishmentsRead = useGreRead('/api/sucursales', greEstablishments, isOpen)
  const productsRead = useGreRead('/api/inventario/productos?limit=1000', greProducts, isOpen && !pedidoContext && !cpeData)
  const establecimientos = establishmentsRead.data || []; const productos = productsRead.data || []
  const sourcesInvalid = establishmentsRead.loading || !!establishmentsRead.error || !pedidoContext && !cpeData && (productsRead.loading || !!productsRead.error)

  useEffect(() => {
    scopeRef.current = contextKey
    return () => { scopeRef.current = '' }
  }, [contextKey])

  useEffect(() => {
    setIntentReady(''); setError(''); setIsLoading(false)
    if (previousScope.current !== scope) {
      setFormData(prev => Object.fromEntries(Object.keys(prev).map(key => [key, key === 'fechaTraslado' ? defaultTransferDate() : key === 'modalidad' ? 'TRANSPORTE_PUBLICO' : key === 'motivo' ? 'VENTA' : key === 'conductorDocumentoTipo' ? '1' : ''])) as typeof prev)
      setRecipient({ tipo: '6', numero: '' }); setManualItems([{ productoId: '', descripcion: '', cantidad: '1', unidadMedida: 'NIU' }]); setPartidaId(''); setLlegadaId('')
      previousScope.current = scope
    }
    if (!isOpen || authLoading || !scope) return
    try {
      const intent = readGreCreationIntent(localStorage.getItem(scope)); setPendingState({ scope, intent })
      if (intent) { setFormData(intent.draft.formData); setRecipient(intent.draft.recipient); setManualItems(intent.draft.manualItems); setPartidaId(intent.draft.partidaId); setLlegadaId(intent.draft.llegadaId) }
      setIntentReady(scope)
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo recuperar el intento GRE.') }
  }, [scope, isOpen, authLoading])

  const elegirLlegada = (id: string) => {
    setLlegadaId(id)
    const destino = establecimientos.find((s) => s.id === id)
    if (destino) {
      setFormData((prev) => ({
        ...prev,
        direccionDestino: destino.direccion || prev.direccionDestino,
        ubigeoDestino: destino.ubigeo || prev.ubigeoDestino,
      }))
    }
  }

  // Pre-llenar datos cuando se proporciona CPE (OPCIONAL, para facilitar)
  useEffect(() => {
    if (cpeData && isOpen && intentReady === scope && !pending) {
      console.log('🔗 Pre-llenando GRE con datos de CPE para facilitar:', cpeData)

      // Calcular fecha de traslado (mañana por defecto)
      const mañana = new Date()
      mañana.setDate(mañana.getDate() + 1)
      const fechaTraslado = mañana.toISOString().split('T')[0]

      setFormData(prev => ({
        ...prev,
        destinatario: cpeData.cliente,
        fechaTraslado: fechaTraslado,
        motivo: 'VENTA',
        observaciones: `Relacionado con ${(cpeData.tipoDocumento || cpeData.tipoComprobante) === '01' ? 'Factura' : 'Boleta'} ${cpeData.serie}-${cpeData.numero.toString().padStart(8, '0')} - ${cpeData.cliente}`
      }))
    }
  }, [cpeData, isOpen, intentReady, scope, pending])

  useEffect(() => {
    if (pedidoContext && isOpen && intentReady === scope && !pending) {
      setFormData(prev => ({
        ...prev,
        destinatario: prev.destinatario || pedidoContext.clienteNombre,
        direccionDestino: pedidoContext.clienteDireccion || prev.direccionDestino
      }))
    }
  }, [pedidoContext, isOpen, intentReady, scope, pending])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (isLoading || sourcesInvalid || intentReady !== scope || contextMismatch) return
    const current = contextKey
    setIsLoading(true)
    setError('')

    try {
      const greData = pending?.payload || {
        ...formData,
        ...(additionalPayload || {}),
        datosAdicionales: {
          ...(additionalPayload?.datosAdicionales || {}),
          ...(!pedidoContext && !cpeData ? { destinatarioDocumentoTipo: recipient.tipo, destinatarioDocumento: recipient.numero.trim() } : {}),
        },
        pesoTotal: parseFloat(formData.pesoTotal) || 0,
        ...(partidaId ? { sucursalPartidaId: partidaId } : {}),
        ...(llegadaId && formData.motivo === 'TRASLADO_ENTRE_ESTABLECIMIENTOS' ? { sucursalLlegadaId: llegadaId } : {}),
        pedidoId: pedidoContext?.id,
        pedidoNumero: pedidoContext?.numero,
        // Sin `tenantId`: el servidor lo toma del JWT y `CreateGuiaRemisionDto` no
        // lo declara, así que el ValidationPipe global —con `forbidNonWhitelisted`—
        // rechazaba la petición entera con un 400. Crear una GRE desde un pedido no
        // funcionaba, y el usuario sólo veía «Error al crear la guía de remisión».
        ...(!pedidoContext && !cpeData ? {
          items: manualItems.map((item) => ({
            ...(item.productoId ? { productoId: item.productoId } : {}),
            descripcion: item.descripcion.trim(),
            cantidad: Number(item.cantidad),
            unidadMedida: item.unidadMedida.trim().toUpperCase() || 'NIU',
          })),
        } : {}),
      }

      const intent = pending || { payload: { ...greData, idempotencyKey: `gre-create:${crypto.randomUUID()}` }, draft: { formData, recipient, manualItems, partidaId, llegadaId } }
      localStorage.setItem(scope, JSON.stringify(intent)); setPendingState({ scope, intent })

      console.log('🚚 Enviando datos GRE:', greData)
      const result = await api.post('/api/gre/guias', intent.payload)

      console.log('✅ Respuesta del servidor:', result)

      const confirmed = greCreated(result, intent.payload)
      if (scopeRef.current !== current) return
      if (confirmed) {
        localStorage.removeItem(scope); setPendingState({ scope, intent: null })
        console.log('✅ GRE creada exitosamente:', result.data)

        // Mostrar toast de éxito
        showToast(`✅ ${result.message || 'Guía de remisión creada exitosamente'}`)

        onSuccess(result.data)
        onClose()
        // Reset form
        setFormData({
          destinatario: '',
          direccionDestino: '',
          ubigeoDestino: '',
          fechaTraslado: defaultTransferDate(),
          modalidad: 'TRANSPORTE_PUBLICO',
          motivo: 'VENTA',
          pesoTotal: '',
          observaciones: '',
          transportista: '',
          transportistaDocumento: '',
          placaVehiculo: '',
          licenciaConducir: '',
          conductorDocumentoTipo: '1',
          conductorDocumentoNumero: '',
          conductorNombres: '',
          conductorApellidos: ''
        })
        setRecipient({ tipo: '6', numero: '' })
        setManualItems([{ productoId: '', descripcion: '', cantidad: '1', unidadMedida: 'NIU' }])
        setPartidaId('')
        setLlegadaId('')
      } else {
        console.log('❌ Error en la respuesta:', result)
        setError(result?.message || 'Error al crear la guía de remisión')
      }
    } catch (err: any) {
      console.error('❌ Error al crear GRE:', err)
      if (scopeRef.current === current) setError(`${err.message || 'Error al crear la guía de remisión'} El intento se conserva; reintente con los mismos datos para recuperar su resultado.`)
    } finally {
      if (scopeRef.current === current) setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1100] flex items-start justify-center overflow-y-auto bg-[rgba(0,_0,_0,_0.5)] p-4">
      <div className="my-auto max-h-[calc(100dvh-2rem)] w-[90%] max-w-[700px] overflow-y-auto rounded-xl bg-card p-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Nueva Guía de Remisión Electrónica</h2>
            {cpeData && (
              <p className="text-sm text-[#22c55e] mt-1 font-medium">
                🔗 Datos pre-llenados desde {(cpeData.tipoDocumento || cpeData.tipoComprobante) === '01' ? 'Factura' : 'Boleta'} {cpeData.serie}-{cpeData.numero.toString().padStart(8, '0')}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={isLoading} className="border-0 text-2xl text-muted-foreground"
          >
            ×
          </button>
        </div>

        {error && (
          <div role="alert" className="bg-[#fee2e2] border text-destructive p-3 rounded-[6px] mb-4 text-sm">
            {error}
          </div>
        )}

        {establishmentsRead.error && <div role="alert" className="mb-4 text-destructive">{establishmentsRead.error} <button type="button" onClick={establishmentsRead.reload}>Reintentar establecimientos</button></div>}
        {!pedidoContext && !cpeData && productsRead.error && <div role="alert" className="mb-4 text-destructive">{productsRead.error} <button type="button" onClick={productsRead.reload}>Reintentar productos</button></div>}
        {pending && <div className="mb-4 rounded-lg border p-3"><p>Hay un alta GRE pendiente de confirmación. Se conservan los datos y la misma clave.</p><button type="button" disabled={isLoading || sourcesInvalid || contextMismatch} onClick={() => void handleSubmit()} className="mt-2 rounded border px-4 py-2">Reintentar alta GRE</button></div>}
        {contextMismatch && <div role="alert" data-testid="gre-creation-context-error" className="mb-4 rounded-lg border border-amber-500/40 p-3">
          <p>El alta pendiente corresponde a otro contexto o contiene referencias inconsistentes. Abra el contexto original para recuperar su resultado. Los datos y la clave se conservan.</p>
          {recoveryPath && <button type="button" disabled={isLoading} onClick={() => router.push(recoveryPath)} className="mt-2 rounded border px-4 py-2">Volver al pedido del intento pendiente</button>}
        </div>}

        <form onSubmit={handleSubmit}>
          <fieldset disabled={isLoading || !!pending || sourcesInvalid || intentReady !== scope}>
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-4 mb-6">
            <div>
              <label htmlFor="gre-modal-destinatario" className="block mb-2 font-semibold text-foreground/85">
                Destinatario *
              </label>
              <input id="gre-modal-destinatario"
                aria-label="Destinatario *"
                type="text"
                name="destinatario"
                value={formData.destinatario}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            {!pedidoContext && !cpeData && (
              <>
                <div>
                  <label htmlFor="gre-modal-destinatario-documento-tipo" className="block mb-2 font-semibold text-foreground/85">Tipo Doc. Destinatario *</label>
                  <select id="gre-modal-destinatario-documento-tipo" aria-label="Tipo Doc. Destinatario *" value={recipient.tipo} onChange={event => setRecipient(current => ({ ...current, tipo: event.target.value }))} className="w-full rounded-md border p-3 text-sm">
                    <option value="6">RUC</option><option value="1">DNI</option><option value="4">Carné de extranjería</option><option value="7">Pasaporte</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="gre-modal-destinatario-documento" className="block mb-2 font-semibold text-foreground/85">Documento del Destinatario *</label>
                  <input id="gre-modal-destinatario-documento" aria-label="Documento del Destinatario *" value={recipient.numero} onChange={event => setRecipient(current => ({ ...current, numero: event.target.value }))} required maxLength={recipient.tipo === '6' ? 11 : recipient.tipo === '1' ? 8 : 20} pattern={recipient.tipo === '6' ? '[0-9]{11}' : recipient.tipo === '1' ? '[0-9]{8}' : '[A-Za-z0-9]{5,20}'} className="w-full rounded-md border p-3 text-sm" />
                </div>
              </>
            )}


            {!pedidoContext && !cpeData && (
              <div className="col-span-full rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-foreground">Bienes trasladados *</div>
                    <div className="text-xs text-muted-foreground">La guía manual debe indicar lo que realmente se transporta.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setManualItems((items) => [...items, { productoId: '', descripcion: '', cantidad: '1', unidadMedida: 'NIU' }])}
                    className="rounded-md border px-3 py-2 text-sm font-semibold"
                  >
                    Agregar línea
                  </button>
                </div>
                <div className="grid gap-3">
                  {manualItems.map((item, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-[1fr_110px_90px_auto]">
                      <div className="col-span-full">
                        <label htmlFor={`gre-item-producto-${index}`} className="block text-sm font-semibold">Producto de inventario del bien {index + 1}</label>
                        <select id={`gre-item-producto-${index}`} value={item.productoId}
                          onChange={(event) => {
                            const product = productos.find(candidate => candidate.id === event.target.value)
                            setManualItems(items => items.map((current, currentIndex) => currentIndex === index
                              ? { ...current, productoId: event.target.value, ...(product ? { descripcion: product.nombre, unidadMedida: product.unidad_medida || 'NIU' } : {}) } : current))
                          }} className="w-full rounded-md border p-3 text-sm">
                          <option value="">Bien descrito manualmente</option>
                          {productos.map(product => <option key={product.id} value={product.id}>{product.codigo} · {product.nombre}</option>)}
                        </select>
                        <p className="mt-1 text-xs text-muted-foreground">Selecciona el producto para usar esta guía en una transferencia de inventario.</p>
                      </div>
                      <input
                        aria-label={`Descripción del bien ${index + 1}`}
                        value={item.descripcion}
                        onChange={(event) => setManualItems((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, descripcion: event.target.value } : current))}
                        placeholder="Descripción real del bien"
                        required
                        maxLength={500}
                        className="w-full rounded-md border p-3 text-sm"
                      />
                      <input
                        aria-label={`Cantidad del bien ${index + 1}`}
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={item.cantidad}
                        onChange={(event) => setManualItems((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, cantidad: event.target.value } : current))}
                        required
                        className="w-full rounded-md border p-3 text-sm"
                      />
                      <input
                        aria-label={`Unidad del bien ${index + 1}`}
                        value={item.unidadMedida}
                        onChange={(event) => setManualItems((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, unidadMedida: event.target.value } : current))}
                        minLength={2}
                        maxLength={3}
                        required
                        className="w-full rounded-md border p-3 text-sm uppercase"
                      />
                      <button
                        type="button"
                        aria-label={`Quitar bien ${index + 1}`}
                        disabled={manualItems.length === 1}
                        onClick={() => setManualItems((items) => items.filter((_, currentIndex) => currentIndex !== index))}
                        className="rounded-md border px-3 py-2 text-sm disabled:opacity-40"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="gre-modal-direccion-destino" className="block mb-2 font-semibold text-foreground/85">
                Dirección de Destino *
              </label>
              <input id="gre-modal-direccion-destino"
                aria-label="Dirección de Destino *"
                type="text"
                name="direccionDestino"
                value={formData.direccionDestino}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label htmlFor="gre-modal-ubigeo-destino" className="block mb-2 font-semibold text-foreground/85">
                Ubigeo de Destino *
              </label>
              <input id="gre-modal-ubigeo-destino"
                aria-label="Ubigeo de Destino *"
                type="text"
                inputMode="numeric"
                name="ubigeoDestino"
                value={formData.ubigeoDestino}
                onChange={handleChange}
                minLength={6}
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder="Ej: 150101"
                required
                className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label htmlFor="gre-modal-fecha-traslado" className="block mb-2 font-semibold text-foreground/85">
                Fecha de Traslado *
              </label>
              <input id="gre-modal-fecha-traslado"
                aria-label="Fecha de Traslado *"
                type="date"
                name="fechaTraslado"
                value={formData.fechaTraslado}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label htmlFor="gre-modal-modalidad" className="block mb-2 font-semibold text-foreground/85">
                Modalidad de Transporte *
              </label>
              <select id="gre-modal-modalidad"
                aria-label="Modalidad de Transporte *"
                name="modalidad"
                value={formData.modalidad}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              >
                <option value="TRANSPORTE_PUBLICO">Transporte Público</option>
                <option value="TRANSPORTE_PRIVADO">Transporte Privado</option>
              </select>
            </div>

            <div>
              <label htmlFor="gre-modal-motivo" className="block mb-2 font-semibold text-foreground/85">
                Motivo del Traslado *
              </label>
              <select id="gre-modal-motivo"
                aria-label="Motivo del Traslado *"
                name="motivo"
                value={formData.motivo}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              >
                <option value="VENTA">Venta</option>
                <option value="COMPRA">Compra</option>
                <option value="TRASLADO_ENTRE_ESTABLECIMIENTOS">Traslado entre establecimientos</option>
                <option value="CONSIGNACION">Consignación</option>
                <option value="DEVOLUCION">Devolución</option>
                <option value="OTROS">Otros</option>
              </select>
            </div>

            {establecimientos.length > 1 && (
              <div>
                <label htmlFor="gre-modal-partida" className="block mb-2 font-semibold text-foreground/85">
                  Establecimiento de partida
                </label>
                <select id="gre-modal-partida"
                  value={partidaId}
                  onChange={(e) => setPartidaId(e.target.value)}
                  className="w-[100%] p-3 border rounded-[6px] text-sm"
                >
                  <option value="">Domicilio fiscal (casa matriz)</option>
                  {establecimientos.map((s) => (
                    <option key={s.id} value={s.id}>{s.codigo_establecimiento} · {s.nombre}</option>
                  ))}
                </select>
              </div>
            )}

            {formData.motivo === 'TRASLADO_ENTRE_ESTABLECIMIENTOS' && (
              <div>
                <label htmlFor="gre-modal-llegada" className="block mb-2 font-semibold text-foreground/85">
                  Establecimiento de llegada *
                </label>
                <select id="gre-modal-llegada"
                  value={llegadaId}
                  onChange={(e) => elegirLlegada(e.target.value)}
                  required className="w-[100%] p-3 border rounded-[6px] text-sm"
                >
                  <option value="">Seleccione el establecimiento de destino</option>
                  {establecimientos.filter((s) => s.id !== partidaId).map((s) => (
                    <option key={s.id} value={s.id}>{s.codigo_establecimiento} · {s.nombre}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="gre-modal-peso-total" className="block mb-2 font-semibold text-foreground/85">
                Peso Total (Kg) *
              </label>
              <input id="gre-modal-peso-total"
                aria-label="Peso Total (Kg) *"
                type="number"
                name="pesoTotal"
                value={formData.pesoTotal}
                onChange={handleChange}
                step="0.001"
                // El DTO exige @Min(0.001): con min="0" el navegador dejaba pasar
                // un peso cero que el servidor rechazaba despues.
                min="0.001"
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            {formData.modalidad === 'TRANSPORTE_PUBLICO' && (
              <>
                <div>
                  <label htmlFor="gre-modal-transportista" className="block mb-2 font-semibold text-foreground/85">
                    Transportista *
                  </label>
                  <input id="gre-modal-transportista"
                    aria-label="Transportista *"
                    type="text"
                    name="transportista"
                    value={formData.transportista}
                    onChange={handleChange}
                    required={formData.modalidad === 'TRANSPORTE_PUBLICO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="gre-modal-transportista-documento" className="block mb-2 font-semibold text-foreground/85">
                    RUC del Transportista *
                  </label>
                  <input id="gre-modal-transportista-documento"
                    aria-label="RUC del Transportista *"
                    type="text"
                    name="transportistaDocumento"
                    value={formData.transportistaDocumento}
                    onChange={handleChange}
                    inputMode="numeric"
                    maxLength={11}
                    pattern="[0-9]{11}"
                    required={formData.modalidad === 'TRANSPORTE_PUBLICO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  />
                </div>
              </>
            )}

            {formData.modalidad === 'TRANSPORTE_PRIVADO' && (
              <>
                <div>
                  <label htmlFor="gre-modal-placa-vehiculo" className="block mb-2 font-semibold text-foreground/85">
                    Placa del Vehículo *
                  </label>
                  <input id="gre-modal-placa-vehiculo"
                    aria-label="Placa del Vehículo *"
                    type="text"
                    name="placaVehiculo"
                    value={formData.placaVehiculo}
                    onChange={handleChange}
                    maxLength={8}
                    required={formData.modalidad === 'TRANSPORTE_PRIVADO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="gre-modal-licencia-conducir" className="block mb-2 font-semibold text-foreground/85">
                    Licencia de Conducir *
                  </label>
                  <input id="gre-modal-licencia-conducir"
                    aria-label="Licencia de Conducir *"
                    type="text"
                    name="licenciaConducir"
                    value={formData.licenciaConducir}
                    onChange={handleChange}
                    maxLength={10}
                    required={formData.modalidad === 'TRANSPORTE_PRIVADO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="gre-modal-conductor-documento-tipo" className="block mb-2 font-semibold text-foreground/85">
                    Tipo Doc. Conductor *
                  </label>
                  <select id="gre-modal-conductor-documento-tipo"
                    aria-label="Tipo Doc. Conductor *"
                    name="conductorDocumentoTipo"
                    value={formData.conductorDocumentoTipo}
                    onChange={handleChange}
                    required={formData.modalidad === 'TRANSPORTE_PRIVADO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  >
                    <option value="1">DNI</option>
                    <option value="4">Carné de extranjería</option>
                    <option value="7">Pasaporte</option>
                    <option value="0">Doc. trib. no domiciliado</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="gre-modal-conductor-documento-numero" className="block mb-2 font-semibold text-foreground/85">
                    Documento Conductor *
                  </label>
                  <input id="gre-modal-conductor-documento-numero"
                    aria-label="Documento Conductor *"
                    type="text"
                    name="conductorDocumentoNumero"
                    value={formData.conductorDocumentoNumero}
                    onChange={handleChange}
                    maxLength={15}
                    required={formData.modalidad === 'TRANSPORTE_PRIVADO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="gre-modal-conductor-nombres" className="block mb-2 font-semibold text-foreground/85">
                    Nombres Conductor *
                  </label>
                  <input id="gre-modal-conductor-nombres"
                    aria-label="Nombres Conductor *"
                    type="text"
                    name="conductorNombres"
                    value={formData.conductorNombres}
                    onChange={handleChange}
                    required={formData.modalidad === 'TRANSPORTE_PRIVADO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="gre-modal-conductor-apellidos" className="block mb-2 font-semibold text-foreground/85">
                    Apellidos Conductor *
                  </label>
                  <input id="gre-modal-conductor-apellidos"
                    aria-label="Apellidos Conductor *"
                    type="text"
                    name="conductorApellidos"
                    value={formData.conductorApellidos}
                    onChange={handleChange}
                    required={formData.modalidad === 'TRANSPORTE_PRIVADO'} className="w-[100%] p-3 border rounded-[6px] text-sm"
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="gre-modal-observaciones" className="block mb-2 font-semibold text-foreground/85">
                Observaciones
              </label>
              <textarea id="gre-modal-observaciones"
                aria-label="Observaciones"
                name="observaciones"
                value={formData.observaciones}
                onChange={handleChange}
                rows={3} className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>
          </div>
          </fieldset>

          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={onClose} className="py-3 px-6 border rounded-[6px] bg-card text-foreground/85 cursor-pointer font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !!pending || sourcesInvalid || intentReady !== scope} className="py-3 px-6 border-0 rounded-[6px] text-white font-semibold"
            >
              {isLoading ? 'Creando...' : 'Crear GRE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
