'use client'

import { useState, useCallback, useEffect } from 'react'
import { useApiCall } from '@/hooks/use-api'
import { unwrapApiObject } from '@/lib/api-contract'
import { fetchApi } from '@/lib/api-fetch'

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
  estado: 'PENDIENTE' | 'EMITIDO' | 'ACEPTADO' | 'RECHAZADO' | 'ANULADO'
  observaciones?: string
  transportista?: string
  placaVehiculo?: string
  licenciaConducir?: string
}

export default function GreViewModal({ isOpen, onClose, documentId }: GreViewModalProps) {
  const [greData, setGreData] = useState<GreData | null>(null)
  const [loading, setLoading] = useState(false)
  const { get } = useApiCall<GreData>()

  const loadGreData = useCallback(async () => {
    if (!documentId) return

    setLoading(true)
    try {
      const result = await get(`/api/gre/guias/${documentId}`)
      setGreData(unwrapApiObject<GreData>(result, null as any))
    } catch (error) {
      console.error('Error cargando GRE:', error)
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
        <title>GRE ${greData.numero}</title>
      </head>
      <body>
        <div class="header">
          <div class="empresa">NEON SYSTEM</div>
          <div class="ruc">RUC: 12345678901</div>
          <div class="tipo-doc">GUÍA DE REMISIÓN ELECTRÓNICA</div>
          <div class="numero">${greData.numero}</div>
          <div class="fecha">Emisión: ${new Date(greData.fechaCreacion).toLocaleDateString('es-PE')}</div>
        </div>
        
        <div class="seccion">
          <div><span class="label">DESTINATARIO:</span></div>
          <div class="valor">${greData.destinatario}</div>
          <div><span class="label">DIRECCIÓN:</span></div>
          <div class="valor">${greData.direccionDestino}</div>
        </div>
        
        <div class="seccion">
          <div><span class="label">MOTIVO:</span><span class="valor">${getMotivoText(greData.motivo)}</span></div>
          <div><span class="label">MODALIDAD:</span><span class="valor">${getModalidadText(greData.modalidad)}</span></div>
          <div><span class="label">PESO:</span><span class="valor">${greData.pesoTotal} Kg</span></div>
          <div><span class="label">FECHA TRASLADO:</span><span class="valor">${new Date(greData.fechaTraslado).toLocaleDateString('es-PE')}</span></div>
        </div>
        
        ${greData.transportista || greData.placaVehiculo ? `
        <div class="seccion">
          ${greData.transportista ? `<div><span class="label">TRANSPORTISTA:</span><span class="valor">${greData.transportista}</span></div>` : ''}
          ${greData.placaVehiculo ? `<div><span class="label">PLACA:</span><span class="valor">${greData.placaVehiculo}</span></div>` : ''}
          ${greData.licenciaConducir ? `<div><span class="label">LICENCIA:</span><span class="valor">${greData.licenciaConducir}</span></div>` : ''}
        </div>
        ` : ''}
        
        <div class="seccion">
          <div><span class="label">ESTADO:</span><span class="valor">${greData.estado}</span></div>
        </div>
        
        <div class="footer">
          <div>Representación impresa de GRE</div>
          <div>Sistema certificado por SUNAT</div>
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
      case 'EMITIDO':
        return '#f59e0b'
      case 'PENDIENTE':
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
      <div className="bg-white rounded-2 w-[95%] max-w-[1200px] overflow-auto shadow relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-white p-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-5 font-semibold m-0">
                GUÍA DE REMISIÓN ELECTRÓNICA
              </h2>
              <p className="text-3.5 mt-[4px] mr-0 mb-0 ml-0 opacity-[0.9]">
                {greData?.numero}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={handleDownloadPdf} className="bg-[rgba(255,_255,_255,_0.2)] text-white border-0 py-2 px-3 rounded-[4px] text-3.5 cursor-pointer flex items-center gap-[4px]"
              >
                💾 Descargar
              </button>
              <button
                onClick={handlePrint} className="bg-[rgba(255,_255,_255,_0.2)] text-white border-0 py-2 px-3 rounded-[4px] text-3.5 cursor-pointer flex items-center gap-[4px]"
              >
                🖨️ Imprimir
              </button>
              <button
                onClick={onClose} className="border-0 text-white text-6 font-bold cursor-pointer p-0 w-[30px] h-[30px] flex items-center justify-center"
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
              <p className="text-gray-500 text-4">Cargando guía de remisión...</p>
            </div>
          ) : greData ? (
            <div className="text-3.5 leading-6 text-[#000] bg-white">
              
              {/* ENCABEZADO EMPRESARIAL */}
              <div className="mb-6">
                <table className="w-[100%]">
                  <tbody>
                    <tr>
                      <td className="border p-4 w-[65%]">
                        <div className="text-center">
                          <h1 className="text-6 font-bold mb-2 mt-0 mr-0 ml-0">
                            NEON SYSTEM
                          </h1>
                          <p className="text-3.5 mb-[4px] my-[4px] mx-0">
                            Sistema Empresarial Integrado
                          </p>
                          <p className="text-3.5 mb-[4px] my-[4px] mx-0">
                            <strong>RUC:</strong> 12345678901
                          </p>
                          <p className="text-3.5 mb-[4px] my-[4px] mx-0">
                            <strong>Razón Social:</strong> NEON SYSTEM SAC
                          </p>
                          <p className="text-3.5 my-[4px] mx-0">
                            Dirección: Lima, Perú
                          </p>
                        </div>
                      </td>
                      <td className="border p-4 w-[35%]">
                        <div className="text-center">
                          <div className="p-3 mb-3">
                            <h2 className="text-4 font-bold mb-2 mt-0 mr-0 ml-0">
                              GUÍA DE REMISIÓN ELECTRÓNICA
                            </h2>
                            <p className="text-[18px] font-bold m-0">
                              {greData.numero}
                            </p>
                          </div>
                          <div className="text-3.5">
                            <p className="mb-[4px] my-[4px] mx-0">
                              <strong>Fecha Emisión:</strong> {new Date(greData.fechaCreacion).toLocaleDateString('es-PE')}
                            </p>
                            <p className="mb-[4px] my-[4px] mx-0">
                              <strong>Fecha Traslado:</strong> {new Date(greData.fechaTraslado).toLocaleDateString('es-PE')}
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
                      <th className="border bg-[#f3f4f6] p-2 text-left font-bold">
                        DATOS DEL DESTINATARIO Y TRASLADO
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border p-3">
                        <div className="grid grid-cols-[1fr_1fr] gap-4 text-3.5">
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
                              <strong>Fecha Traslado:</strong> {new Date(greData.fechaTraslado).toLocaleDateString('es-PE')}
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
                <table className="w-[100%] border text-3.5">
                  <thead>
                    <tr>
                      <th className="border bg-[#f3f4f6] p-2 text-left font-bold">
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
                            <p className="my-[4px] mx-0">
                              <strong>Modalidad:</strong> {getModalidadText(greData.modalidad)}
                            </p>
                          </div>
                        </div>
                        {!greData.transportista && !greData.placaVehiculo && !greData.licenciaConducir && (
                          <p className="m-0 text-gray-500">
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
                  <table className="w-[100%] border text-3.5">
                    <thead>
                      <tr>
                        <th className="border bg-[#f3f4f6] p-2 text-left font-bold">
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
              <div className="text-center text-3 text-gray-700 border-t pt-4">
                <p className="font-bold mt-0 mr-0 mb-[4px] ml-0">
                  NEON SYSTEM - Sistema Empresarial Integrado
                </p>
                <p className="mt-0 mr-0 mb-[4px] ml-0">
                  Documento generado automáticamente el {new Date().toLocaleDateString('es-PE')}
                </p>
                <p className="m-0">
                  Para consultas sobre este documento, contacte al emisor • Sistema certificado por SUNAT
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center p-12 text-gray-500">
              <p className="text-4">No se pudo cargar la guía de remisión</p>
            </div>
          )}
        </div>
      </div>

      {/* CSS para animación */}
    </div>
  )
}
