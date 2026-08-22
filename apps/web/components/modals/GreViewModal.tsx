'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useApiCall } from '@/hooks/use-api'
import { unwrapApiObject } from '@/lib/api-contract'
import { fetchApi } from '@/lib/api-fetch'
import { parseDateLocal } from '@/lib/date-utils'

interface GreViewModalProps {
  isOpen: boolean
  onClose: () => void
  documentId: string
}

interface GreData {
  id: string
  numero: string
  destinatario: string
  direccionDestino: string
  fechaTraslado: string
  fechaCreacion: string
  modalidad: 'TRANSPORTE_PUBLICO' | 'TRANSPORTE_PRIVADO'
  motivo: string
  pesoTotal: number
  estado: 'BORRADOR' | 'FIRMADO' | 'ENVIADO' | 'ACEPTADO' | 'RECHAZADO' | 'ANULADO' | 'ERROR'
  observaciones?: string
  transportista?: string
  transportistaDocumento?: string
  placaVehiculo?: string
  licenciaConducir?: string
  conductorDocumentoTipo?: string
  conductorDocumentoNumero?: string
  conductorNombres?: string
  conductorApellidos?: string
  sunatStatus?: string
  errorMessage?: string
}

export default function GreViewModal({ isOpen, onClose, documentId }: GreViewModalProps) {
  const [greData, setGreData] = useState<GreData | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const { get, post } = useApiCall<GreData>()
  const [actionLoading, setActionLoading] = useState(false)
  const operationKeys = useRef(new Map<string, string>())

  const keyFor = (action: string) => {
    const semantic = `${documentId}:${action}`
    const existing = operationKeys.current.get(semantic)
    if (existing) return existing
    const key = `gre-${action}:${crypto.randomUUID()}`
    operationKeys.current.set(semantic, key)
    return key
  }

  const runLifecycleAction = async (action: 'firmar' | 'enviar-sunat' | 'reenviar' | 'consultar-sunat' | 'anular') => {
    setActionLoading(true)
    try {
      const body = action === 'anular' ? { motivo: 'Anulación operativa solicitada por el usuario' } : {}
      await post(`/api/gre/guias/${documentId}/${action}`, body, {
        headers: { 'Idempotency-Key': keyFor(action) },
      })
      operationKeys.current.delete(`${documentId}:${action}`)
      await loadGreData()
    } finally {
      setActionLoading(false)
    }
  }

  const loadGreData = useCallback(async () => {
    if (!documentId) return

    setLoading(true)
    setErrorCarga(null)
    try {
      const result = await get(`/api/gre/guias/${documentId}`)
      setGreData(unwrapApiObject<GreData>(result, null as any))
    } catch (error) {
      console.error('Error cargando GRE:', error)
      // Con `setGreData(null)` a secas, un fallo de carga se ve igual que una guia
      // que no existe. En un documento fiscal esa distincion importa.
      setErrorCarga(error instanceof Error ? error.message : 'No se pudo cargar la guia de remision.')
      setGreData(null)
    }
    setLoading(false)
  }, [get, documentId])

  useEffect(() => {
    if (isOpen && documentId) {
      loadGreData()
    }
  }, [documentId, isOpen, loadGreData])

  const handleDownloadPdf = async () => {
    try {
      const response = await fetchApi(`/api/gre/guias/${documentId}/pdf/`, {
        method: 'GET',
      })

      if (response.ok) {
        const textContent = await response.text()
        const blob = new Blob([textContent], { type: 'text/plain' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `GRE-${greData?.numero}.txt`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Error descargando PDF:', error)
      alert(error instanceof Error ? error.message : 'No se pudo descargar la guia.')
    }
  }

  const handlePrint = () => {
    // Generar ticket térmico de 80mm en lugar de imprimir el modal completo
    if (!greData) return

    const printWindow = window.open('', '_blank', 'width=350,height=600')

    if (!printWindow) {
      alert('Por favor permite las ventanas emergentes para imprimir')
      return
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>GRE ${escapeHtml(greData.numero)}</title>
      </head>
      <body>
        <div class="header">
          <div class="empresa">EMISOR CONFIGURADO EN EL ERP</div>
          <div class="tipo-doc">GUÍA DE REMISIÓN ELECTRÓNICA</div>
          <div class="numero">${escapeHtml(greData.numero)}</div>
          <div class="fecha">Emisión: ${escapeHtml(parseDateLocal(greData.fechaCreacion).toLocaleDateString('es-PE'))}</div>
        </div>

        <div class="seccion">
          <div><span class="label">DESTINATARIO:</span></div>
          <div class="valor">${escapeHtml(greData.destinatario)}</div>
          <div><span class="label">DIRECCIÓN:</span></div>
          <div class="valor">${escapeHtml(greData.direccionDestino)}</div>
        </div>

        <div class="seccion">
          <div><span class="label">MOTIVO:</span><span class="valor">${escapeHtml(getMotivoText(greData.motivo))}</span></div>
          <div><span class="label">MODALIDAD:</span><span class="valor">${escapeHtml(getModalidadText(greData.modalidad))}</span></div>
          <div><span class="label">PESO:</span><span class="valor">${escapeHtml(greData.pesoTotal)} Kg</span></div>
          <div><span class="label">FECHA TRASLADO:</span><span class="valor">${escapeHtml(parseDateLocal(greData.fechaTraslado).toLocaleDateString('es-PE'))}</span></div>
        </div>

        ${greData.transportista || greData.placaVehiculo || greData.conductorDocumentoNumero ? `
        <div class="seccion">
          ${greData.transportista ? `<div><span class="label">TRANSPORTISTA:</span><span class="valor">${escapeHtml(greData.transportista)}</span></div>` : ''}
          ${greData.transportistaDocumento ? `<div><span class="label">RUC TRANSPORTISTA:</span><span class="valor">${escapeHtml(greData.transportistaDocumento)}</span></div>` : ''}
          ${greData.placaVehiculo ? `<div><span class="label">PLACA:</span><span class="valor">${escapeHtml(greData.placaVehiculo)}</span></div>` : ''}
          ${greData.licenciaConducir ? `<div><span class="label">LICENCIA:</span><span class="valor">${escapeHtml(greData.licenciaConducir)}</span></div>` : ''}
          ${greData.conductorDocumentoNumero ? `<div><span class="label">CONDUCTOR:</span><span class="valor">${escapeHtml([greData.conductorNombres, greData.conductorApellidos].filter(Boolean).join(' '))}</span></div>` : ''}
          ${greData.conductorDocumentoNumero ? `<div><span class="label">DOC. CONDUCTOR:</span><span class="valor">${escapeHtml(greData.conductorDocumentoNumero)}</span></div>` : ''}
        </div>
        ` : ''}

        <div class="seccion">
          <div><span class="label">ESTADO:</span><span class="valor">${escapeHtml(greData.estado)}</span></div>
        </div>

        <div class="footer">
          <div>Representación impresa de GRE</div>
          <div>La transmisión fiscal depende de las credenciales configuradas por el cliente.</div>
        </div>
      </body>
      </html>
    `)

    printWindow.document.close()
    printWindow.onload = () => {
      printWindow.focus()
      printWindow.print()
    }
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
      <div className="bg-card rounded-lg w-[95%] max-w-[1200px] max-h-[95vh] overflow-auto shadow relative"
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
                <button disabled={actionLoading} onClick={() => runLifecycleAction('firmar')} className="bg-[rgba(255,_255,_255,_0.2)] text-white border-0 py-2 px-3 rounded-[4px] text-sm">
                  Firmar
                </button>
              )}
              {greData?.estado === 'FIRMADO' && (
                <button disabled={actionLoading} onClick={() => runLifecycleAction('enviar-sunat')} className="bg-[rgba(255,_255,_255,_0.2)] text-white border-0 py-2 px-3 rounded-[4px] text-sm">
                  Enviar
                </button>
              )}
              {greData?.estado === 'ERROR' && (
                <button disabled={actionLoading} onClick={() => runLifecycleAction('reenviar')} className="bg-[rgba(255,_255,_255,_0.2)] text-white border-0 py-2 px-3 rounded-[4px] text-sm">
                  Reintentar envío
                </button>
              )}
              {greData?.estado === 'ENVIADO' && (
                <button disabled={actionLoading} onClick={() => runLifecycleAction('consultar-sunat')} className="bg-[rgba(255,_255,_255,_0.2)] text-white border-0 py-2 px-3 rounded-[4px] text-sm">
                  Consultar estado
                </button>
              )}
              {greData && ['BORRADOR', 'FIRMADO', 'ERROR'].includes(greData.estado) && (
                <button disabled={actionLoading} onClick={() => runLifecycleAction('anular')} className="bg-[rgba(255,_255,_255,_0.2)] text-white border-0 py-2 px-3 rounded-[4px] text-sm">
                  Anular
                </button>
              )}
              <button
                onClick={handleDownloadPdf} className="bg-[rgba(255,_255,_255,_0.2)] text-white border-0 py-2 px-3 rounded-[4px] text-sm cursor-pointer flex items-center gap-[4px]"
              >
                💾 Descargar
              </button>
              <button
                onClick={handlePrint} className="bg-[rgba(255,_255,_255,_0.2)] text-white border-0 py-2 px-3 rounded-[4px] text-sm cursor-pointer flex items-center gap-[4px]"
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
