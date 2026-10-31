'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useApiCall } from '@/hooks/use-api'
import { useAuth } from '@/contexts/AuthContext'
import { useGreRead } from '@/hooks/use-gre-read'
import { GreAction, GreIntent, greDetail, greConfirmation, readGreIntent, greTransportNotApplied } from '@/lib/gre-read-contract'
import { liveGreFile, saveGreFile } from '@/lib/gre-download'
import { parseDateLocal } from '@/lib/date-utils'

interface GreViewModalProps {
  isOpen: boolean
  onClose: () => void
  documentId: string
}

export default function GreViewModal({ isOpen, onClose, documentId }: GreViewModalProps) {
  const { session, loading: authLoading } = useAuth()
  const { post } = useApiCall({ requireLive: true, throwOnError: true, showErrorToast: false, retries: 0 })
  const validate = useCallback((response: any) => greDetail(response, documentId), [documentId])
  const read = useGreRead(`/api/gre/guias/${documentId}`, validate, isOpen && !!documentId)
  const greData = read.data; const loading = read.loading; const errorCarga = read.error
  const actor = session?.user
  const storageKey = actor?.tenant_id && actor?.id && documentId ? `erp.gre-action-intent.${actor.tenant_id}.${actor.id}.${documentId}` : ''
  const scope = `${storageKey}:${isOpen}`; const scopeRef = useRef(scope); scopeRef.current = scope
  const [pendingState, setPendingState] = useState<{ scope: string; intent: GreIntent | null }>({ scope: '', intent: null })
  const pending = pendingState.scope === scope ? pendingState.intent : null
  const [intentReady, setIntentReady] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  useEffect(() => {
    setActionError(null); setActionMessage(null); setActionLoading(false); setDownloading(false); setIntentReady('')
    if (!isOpen || authLoading || !storageKey) return
    try {
      setPendingState({ scope, intent: readGreIntent(localStorage.getItem(storageKey), documentId) }); setIntentReady(scope)
    } catch (error) { setActionError(error instanceof Error ? error.message : 'No se pudo recuperar el intento de GRE.') }
  }, [scope, storageKey, documentId, authLoading, isOpen])
  const runLifecycleAction = async (action: GreAction) => {
    if (!greData || loading || actionLoading || pending && pending.action !== action || intentReady !== scope) return
    const current = scope
    const intent = pending || { documentId, action, key: `gre-${action}:${crypto.randomUUID()}` }
    setActionLoading(true); setActionError(null); setActionMessage(null)
    try {
      localStorage.setItem(storageKey, JSON.stringify(intent)); setPendingState({ scope, intent })
      const body = action === 'anular' ? { motivo: 'Anulación operativa solicitada por el usuario' } : {}
      const response = await post(`/api/gre/guias/${documentId}/${action}`, body, { headers: { 'Idempotency-Key': intent.key } })
      const confirmed = greConfirmation(response, intent)
      if (scopeRef.current !== current) return
      localStorage.removeItem(storageKey); setPendingState({ scope, intent: null })
      setActionMessage(`Acción confirmada. Estado de la guía: ${confirmed.estado}.`)
      await read.reload()
    } catch (error) {
      if (scopeRef.current === current) {
        if (greTransportNotApplied(error, action)) {
          localStorage.removeItem(storageKey); setPendingState({ scope, intent: null })
          setActionError(`${error instanceof Error ? error.message : 'El transporte fiscal está bloqueado.'} La acción no se aplicó; puede continuar consultando la guía.`)
        } else setActionError(`${error instanceof Error ? error.message : 'No se pudo confirmar la acción.'} El intento se conserva; reintente para consultar su resultado sin crear otra operación.`)
      }
    } finally { if (scopeRef.current === current) setActionLoading(false) }
  }
  const actionDisabled = actionLoading || !!pending || loading || !greData || intentReady !== scope
  const handleDownloadPdf = async () => {
    if (!greData || loading || downloading) return
    const current = scope; setDownloading(true); setActionError(null)
    try {
      const blob = await liveGreFile(`/api/gre/guias/${documentId}/pdf/`, 'pdf')
      if (scopeRef.current === current) saveGreFile(blob, `GRE-${greData.numero}.pdf`)
    } catch (error) {
      if (scopeRef.current === current) setActionError(error instanceof Error ? error.message : 'No se pudo descargar la guía.')
    } finally { if (scopeRef.current === current) setDownloading(false) }
  }
  const handlePrint = async () => {
    if (!greData || loading || downloading) return
    const current = scope; setDownloading(true); setActionError(null)
    const printWindow = window.open('', '_blank', 'width=800,height=900')
    if (!printWindow) { setActionError('Permita las ventanas emergentes para imprimir'); setDownloading(false); return }
    try {
      const blob = await liveGreFile(`/api/gre/guias/${documentId}/pdf/`, 'pdf')
      if (scopeRef.current !== current) { printWindow.close(); return }
      const url = window.URL.createObjectURL(blob)
      printWindow.document.write(`<!DOCTYPE html><html><head><title>GRE ${escapeHtml(greData.numero)}</title></head><body style="margin:0"><iframe id="gre-print" title="Guía de remisión para imprimir" src="${url}" style="width:100%;height:100vh;border:0"></iframe></body></html>`)
      const frame = printWindow.document.getElementById('gre-print') as HTMLIFrameElement | null
      frame?.addEventListener('load', () => { printWindow.focus(); printWindow.print() })
      printWindow.document.close(); setTimeout(() => window.URL.revokeObjectURL(url), 60000)
    } catch (error) {
      printWindow.close()
      if (scopeRef.current === current) setActionError(error instanceof Error ? error.message : 'No se pudo imprimir la guía.')
    } finally { if (scopeRef.current === current) setDownloading(false) }
  }

  const getModalidadText = (modalidad: string) => {
    return modalidad === 'TRANSPORTE_PUBLICO' ? 'Transporte Público' : 'Transporte Privado'
  }

  const getMotivoText = (motivo: string) => {
    switch (motivo) {
      case 'VENTA':
        return 'Venta'
      case 'COMPRA':
        return 'Compra'
      case 'TRASLADO_ENTRE_ESTABLECIMIENTOS':
        return 'Traslado entre establecimientos'
      case 'CONSIGNACION':
        return 'Consignación'
      case 'DEVOLUCION':
        return 'Devolución'
      case 'OTROS':
        return 'Otros'
      default:
        return motivo
    }
  }

  const getStatusColor = () => {
    if (!greData) return '#2563eb'

    switch (greData.estado) {
      case 'ACEPTADO':
        return '#10b981'
      case 'FIRMADO':
        return '#f59e0b'
      case 'BORRADOR':
        return '#6b7280'
      case 'RECHAZADO':
        return '#ef4444'
      case 'ANULADO':
        return '#dc2626'
      default:
        return '#6b7280'
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.5)] z-[999999] flex items-center justify-center p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Detalle GRE" className="bg-card rounded-lg w-[95%] max-w-[1200px] max-h-[95vh] overflow-auto shadow relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-white p-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold m-0">
                GUÍA DE REMISIÓN ELECTRÓNICA
              </h2>
              <p className="text-sm mt-[4px] mr-0 mb-0 ml-0 opacity-[0.9]">
                {greData?.numero}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              {greData?.estado === 'BORRADOR' && (
                <button disabled={actionDisabled} onClick={() => runLifecycleAction('firmar')} className="bg-[rgba(255,_255,_255,_0.2)] text-white border-0 py-2 px-3 rounded-[4px] text-sm">
                  Firmar
                </button>
              )}
              {greData?.estado === 'FIRMADO' && (
                <button disabled={actionDisabled} onClick={() => runLifecycleAction('enviar-sunat')} className="bg-[rgba(255,_255,_255,_0.2)] text-white border-0 py-2 px-3 rounded-[4px] text-sm">
                  Enviar
                </button>
              )}
              {greData?.estado === 'ERROR' && (
                <button disabled={actionDisabled} onClick={() => runLifecycleAction('reenviar')} className="bg-[rgba(255,_255,_255,_0.2)] text-white border-0 py-2 px-3 rounded-[4px] text-sm">
                  Reintentar envío
                </button>
              )}
              {greData?.estado === 'ENVIADO' && (
                <button disabled={actionDisabled} onClick={() => runLifecycleAction('consultar-sunat')} className="bg-[rgba(255,_255,_255,_0.2)] text-white border-0 py-2 px-3 rounded-[4px] text-sm">
                  Consultar estado
                </button>
              )}
              {greData && ['BORRADOR', 'FIRMADO', 'ERROR'].includes(greData.estado) && (
                <button disabled={actionDisabled} onClick={() => runLifecycleAction('anular')} className="bg-[rgba(255,_255,_255,_0.2)] text-white border-0 py-2 px-3 rounded-[4px] text-sm">
                  Anular
                </button>
              )}
              <button
                disabled={loading || !greData || downloading} onClick={handleDownloadPdf} className="bg-[rgba(255,_255,_255,_0.2)] text-white border-0 py-2 px-3 rounded-[4px] text-sm cursor-pointer flex items-center gap-[4px]"
              >
                💾 Descargar
              </button>
              <button
                disabled={loading || !greData || downloading} onClick={handlePrint} className="bg-[rgba(255,_255,_255,_0.2)] text-white border-0 py-2 px-3 rounded-[4px] text-sm cursor-pointer flex items-center gap-[4px]"
              >
                🖨️ Imprimir
              </button>
              <button
                onClick={onClose} className="border-0 text-white text-2xl font-bold cursor-pointer p-0 w-[30px] h-[30px] flex items-center justify-center"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {actionError && <div role="alert" className="mb-4 rounded-xl border border-destructive p-4 text-destructive">{actionError}</div>}
          {actionMessage && <p role="status" className="mb-4 text-primary">{actionMessage}</p>}
          {pending && <div className="mb-4 rounded-xl border p-4">
            <p>Hay una acción pendiente de confirmación: {pending.action}. Se conserva la misma clave al reintentar.</p>
            <button disabled={actionLoading || loading || !greData} onClick={() => runLifecycleAction(pending.action)} className="mt-2 rounded-lg border px-4 py-2">Reintentar acción</button>
          </div>}

          {loading ? (
            <div className="flex justify-center items-center h-[400px] flex-col gap-4">
              <div className="w-10 h-10 rounded-full"></div>
              <p className="text-muted-foreground text-base">Cargando guía de remisión...</p>
            </div>
          ) : greData ? (
            <div className="text-sm leading-6 text-[#000] bg-card">

              {/* ENCABEZADO EMPRESARIAL */}
              <div className="mb-6">
                <table className="w-[100%]">
                  <tbody>
                    <tr>
                      <td className="border p-4 w-[65%]">
                        <div className="text-center">
                          <h1 className="text-2xl font-bold mb-2 mt-0 mr-0 ml-0">
                            EMISOR CONFIGURADO EN EL ERP
                          </h1>
                          <p className="text-sm mb-[4px] my-[4px] mx-0">
                            Datos del emisor tomados de la configuración del tenant
                          </p>
                        </div>
                      </td>
                      <td className="border p-4 w-[35%]">
                        <div className="text-center">
                          <div className="p-3 mb-3">
                            <h2 className="text-base font-bold mb-2 mt-0 mr-0 ml-0">
                              GUÍA DE REMISIÓN ELECTRÓNICA
                            </h2>
                            <p className="text-[18px] font-bold m-0">
                              {greData.numero}
                            </p>
                          </div>
                          <div className="text-sm">
                            <p className="mb-[4px] my-[4px] mx-0">
                              <strong>Fecha Emisión:</strong> {parseDateLocal(greData.fechaCreacion).toLocaleDateString('es-PE')}
                            </p>
                            <p className="mb-[4px] my-[4px] mx-0">
                              <strong>Fecha Traslado:</strong> {parseDateLocal(greData.fechaTraslado).toLocaleDateString('es-PE')}
                            </p>
                            <p className="my-[4px] mx-0">
                              <strong>Estado:</strong> {greData.estado}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* DATOS DEL DESTINATARIO */}
              <div className="mb-6">
                <table className="w-[100%] border">
                  <thead>
                    <tr>
                      <th className="border bg-muted p-2 text-left font-bold">
                        DATOS DEL DESTINATARIO Y TRASLADO
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border p-3">
                        <div className="grid grid-cols-[1fr_1fr] gap-4 text-sm">
                          <div>
                            <p className="my-[4px] mx-0">
                              <strong>Destinatario:</strong> {greData.destinatario}
                            </p>
                            <p className="my-[4px] mx-0">
                              <strong>Dirección Destino:</strong> {greData.direccionDestino}
                            </p>
                            <p className="my-[4px] mx-0">
                              <strong>Motivo:</strong> {getMotivoText(greData.motivo)}
                            </p>
                          </div>
                          <div>
                            <p className="my-[4px] mx-0">
                              <strong>Modalidad:</strong> {getModalidadText(greData.modalidad)}
                            </p>
                            <p className="my-[4px] mx-0">
                              <strong>Peso Total:</strong> {greData.pesoTotal} Kg
                            </p>
                            <p className="my-[4px] mx-0">
                              <strong>Fecha Traslado:</strong> {parseDateLocal(greData.fechaTraslado).toLocaleDateString('es-PE')}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* DATOS DEL TRANSPORTE */}
              <div className="mb-6">
                <table className="w-[100%] border text-sm">
                  <thead>
                    <tr>
                      <th className="border bg-muted p-2 text-left font-bold">
                        INFORMACIÓN DEL TRANSPORTE
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border p-3">
                        <div className="grid grid-cols-[1fr_1fr] gap-4">
                          <div>
                            {greData.transportista && (
                              <p className="my-[4px] mx-0">
                                <strong>Transportista:</strong> {greData.transportista}
                              </p>
                            )}
                            {greData.transportistaDocumento && (
                              <p className="my-[4px] mx-0">
                                <strong>RUC Transportista:</strong> {greData.transportistaDocumento}
                              </p>
                            )}
                            {greData.placaVehiculo && (
                              <p className="my-[4px] mx-0">
                                <strong>Placa del Vehículo:</strong> {greData.placaVehiculo}
                              </p>
                            )}
                          </div>
                          <div>
                            {greData.licenciaConducir && (
                              <p className="my-[4px] mx-0">
                                <strong>Licencia de Conducir:</strong> {greData.licenciaConducir}
                              </p>
                            )}
                            {greData.conductorDocumentoNumero && (
                              <p className="my-[4px] mx-0">
                                <strong>Conductor:</strong> {[greData.conductorNombres, greData.conductorApellidos].filter(Boolean).join(' ')}
                              </p>
                            )}
                            {greData.conductorDocumentoNumero && (
                              <p className="my-[4px] mx-0">
                                <strong>Doc. Conductor:</strong> {greData.conductorDocumentoNumero}
                              </p>
                            )}
                            <p className="my-[4px] mx-0">
                              <strong>Modalidad:</strong> {getModalidadText(greData.modalidad)}
                            </p>
                          </div>
                        </div>
                        {!greData.transportista && !greData.placaVehiculo && !greData.licenciaConducir && !greData.conductorDocumentoNumero && (
                          <p className="m-0 text-muted-foreground">
                            No se registraron datos adicionales de transporte
                          </p>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mb-6">
                <h3 className="font-bold">BIENES TRASLADADOS</h3>
                <table className="w-full border text-sm"><thead><tr><th className="border p-2 text-left">Descripción</th><th className="border p-2 text-right">Cantidad</th><th className="border p-2 text-left">Unidad</th></tr></thead><tbody>
                  {(greData.items || []).map((item, index) => <tr key={index}><td className="border p-2">{item.descripcion}</td><td className="border p-2 text-right">{item.cantidad}</td><td className="border p-2">{item.unidadMedida || 'NIU'}</td></tr>)}
                </tbody></table>
              </div>

              {/* OBSERVACIONES */}
              {greData.observaciones && (
                <div className="mb-6">
                  <table className="w-[100%] border text-sm">
                    <thead>
                      <tr>
                        <th className="border bg-muted p-2 text-left font-bold">
                          OBSERVACIONES
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border p-3">
                          {greData.observaciones}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* FOOTER */}
              <div className="text-center text-xs text-foreground/85 border-t pt-4">
                <p className="font-bold mt-0 mr-0 mb-[4px] ml-0">
                  Representación operativa generada por el ERP
                </p>
                <p className="mt-0 mr-0 mb-[4px] ml-0">
                  Documento generado automáticamente el {new Date().toLocaleDateString('es-PE')}
                </p>
                <p className="m-0">
                  Para consultas sobre este documento, contacte al emisor. La aceptación fiscal se muestra únicamente cuando existe respuesta persistida.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center p-12 text-muted-foreground">
              {/* Distinguir «no se pudo leer» de «no existe»: sin esto, un fallo de
                  red se veía igual que una guía inexistente, y en un documento
                  fiscal esa diferencia es justo la que importa. */}
              <p className="text-base">
                {errorCarga
                  ? `No se pudo cargar la guía de remisión: ${errorCarga}`
                  : 'No se encontró la guía de remisión'}
              </p>
              {errorCarga && <button onClick={read.reload} className="mt-4 rounded-lg border px-4 py-2">Reintentar detalle</button>}
            </div>
          )}
        </div>
      </div>

      {/* CSS para animación */}
    </div>
  )
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[char]
  })
}
