'use client'

import { useState, useEffect } from 'react'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

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

  useEffect(() => {
    if (isOpen && documentId) {
      loadGreData()
    }
  }, [isOpen, documentId])

  const loadGreData = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/gre/guias/${documentId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || 'demo-token'}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const result = await response.json()
        setGreData(result.data)
      }
    } catch (error) {
      console.error('Error cargando GRE:', error)
    }
    setLoading(false)
  }

  const handleDownloadPdf = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/gre/guias/${documentId}/pdf`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || 'demo-token'}`,
        }
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
        <style>
          @page { size: 80mm auto; margin: 0; }
          @media print { 
            html, body { width: 80mm; margin: 0; padding: 0; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            font-size: 11px;
            width: 80mm;
            max-width: 80mm;
            padding: 3mm;
            background: white;
            color: black;
            line-height: 1.3;
          }
          .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }
          .empresa { font-size: 14px; font-weight: bold; }
          .ruc { font-size: 10px; }
          .tipo-doc { font-size: 11px; font-weight: bold; margin: 6px 0 2px; border: 1px solid #000; padding: 4px; }
          .numero { font-size: 12px; font-weight: bold; }
          .fecha { font-size: 9px; color: #333; margin-top: 4px; }
          .seccion { border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 6px; }
          .label { font-size: 9px; color: #666; font-weight: bold; }
          .valor { font-size: 10px; margin-left: 4px; }
          .footer { text-align: center; margin-top: 10px; font-size: 8px; border-top: 1px dashed #000; padding-top: 6px; }
        </style>
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
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          width: '95%',
          maxWidth: '1200px',
          maxHeight: '95vh',
          overflow: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          backgroundColor: getStatusColor(), 
          color: 'white', 
          padding: '16px', 
          borderRadius: '8px 8px 0 0' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
                GUÍA DE REMISIÓN ELECTRÓNICA
              </h2>
              <p style={{ fontSize: '14px', margin: '4px 0 0 0', opacity: 0.9 }}>
                {greData?.numero}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={handleDownloadPdf}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                💾 Descargar
              </button>
              <button
                onClick={handlePrint}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                🖨️ Imprimir
              </button>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {loading ? (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              height: '400px',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                border: '4px solid #f3f4f6',
                borderTop: '4px solid #3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              <p style={{ color: '#6b7280', fontSize: '16px' }}>Cargando guía de remisión...</p>
            </div>
          ) : greData ? (
            <div style={{ 
              fontFamily: 'Arial, sans-serif', 
              fontSize: '14px', 
              lineHeight: '1.5', 
              color: '#000',
              backgroundColor: 'white'
            }}>
              
              {/* ENCABEZADO EMPRESARIAL */}
              <div style={{ marginBottom: '24px' }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse', 
                  border: '2px solid #000'
                }}>
                  <tbody>
                    <tr>
                      <td style={{ 
                        border: '1px solid #000', 
                        padding: '16px', 
                        width: '65%' 
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <h1 style={{ 
                            fontSize: '24px', 
                            fontWeight: 'bold', 
                            marginBottom: '8px',
                            margin: '0 0 8px 0'
                          }}>
                            NEON SYSTEM
                          </h1>
                          <p style={{ fontSize: '14px', marginBottom: '4px', margin: '4px 0' }}>
                            Sistema Empresarial Integrado
                          </p>
                          <p style={{ fontSize: '14px', marginBottom: '4px', margin: '4px 0' }}>
                            <strong>RUC:</strong> 12345678901
                          </p>
                          <p style={{ fontSize: '14px', marginBottom: '4px', margin: '4px 0' }}>
                            <strong>Razón Social:</strong> NEON SYSTEM SAC
                          </p>
                          <p style={{ fontSize: '14px', margin: '4px 0' }}>
                            Dirección: Lima, Perú
                          </p>
                        </div>
                      </td>
                      <td style={{ 
                        border: '1px solid #000', 
                        padding: '16px', 
                        width: '35%' 
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ 
                            border: '2px solid #000', 
                            padding: '12px', 
                            marginBottom: '12px' 
                          }}>
                            <h2 style={{ 
                              fontSize: '16px', 
                              fontWeight: 'bold', 
                              marginBottom: '8px',
                              margin: '0 0 8px 0'
                            }}>
                              GUÍA DE REMISIÓN ELECTRÓNICA
                            </h2>
                            <p style={{ 
                              fontSize: '18px', 
                              fontWeight: 'bold',
                              margin: 0
                            }}>
                              {greData.numero}
                            </p>
                          </div>
                          <div style={{ fontSize: '14px' }}>
                            <p style={{ marginBottom: '4px', margin: '4px 0' }}>
                              <strong>Fecha Emisión:</strong> {new Date(greData.fechaCreacion).toLocaleDateString('es-PE')}
                            </p>
                            <p style={{ marginBottom: '4px', margin: '4px 0' }}>
                              <strong>Fecha Traslado:</strong> {new Date(greData.fechaTraslado).toLocaleDateString('es-PE')}
                            </p>
                            <p style={{ margin: '4px 0' }}>
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
              <div style={{ marginBottom: '24px' }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse', 
                  border: '1px solid #000'
                }}>
                  <thead>
                    <tr>
                      <th style={{ 
                        border: '1px solid #000', 
                        backgroundColor: '#f3f4f6', 
                        padding: '8px', 
                        textAlign: 'left', 
                        fontWeight: 'bold' 
                      }}>
                        DATOS DEL DESTINATARIO Y TRASLADO
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ 
                        border: '1px solid #000', 
                        padding: '12px' 
                      }}>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '1fr 1fr', 
                          gap: '16px', 
                          fontSize: '14px' 
                        }}>
                          <div>
                            <p style={{ margin: '4px 0' }}>
                              <strong>Destinatario:</strong> {greData.destinatario}
                            </p>
                            <p style={{ margin: '4px 0' }}>
                              <strong>Dirección Destino:</strong> {greData.direccionDestino}
                            </p>
                            <p style={{ margin: '4px 0' }}>
                              <strong>Motivo:</strong> {getMotivoText(greData.motivo)}
                            </p>
                          </div>
                          <div>
                            <p style={{ margin: '4px 0' }}>
                              <strong>Modalidad:</strong> {getModalidadText(greData.modalidad)}
                            </p>
                            <p style={{ margin: '4px 0' }}>
                              <strong>Peso Total:</strong> {greData.pesoTotal} Kg
                            </p>
                            <p style={{ margin: '4px 0' }}>
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
              <div style={{ marginBottom: '24px' }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse', 
                  border: '1px solid #000',
                  fontSize: '14px'
                }}>
                  <thead>
                    <tr>
                      <th style={{ 
                        border: '1px solid #000', 
                        backgroundColor: '#f3f4f6', 
                        padding: '8px', 
                        textAlign: 'left', 
                        fontWeight: 'bold' 
                      }}>
                        INFORMACIÓN DEL TRANSPORTE
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ 
                        border: '1px solid #000', 
                        padding: '12px' 
                      }}>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '1fr 1fr', 
                          gap: '16px'
                        }}>
                          <div>
                            {greData.transportista && (
                              <p style={{ margin: '4px 0' }}>
                                <strong>Transportista:</strong> {greData.transportista}
                              </p>
                            )}
                            {greData.placaVehiculo && (
                              <p style={{ margin: '4px 0' }}>
                                <strong>Placa del Vehículo:</strong> {greData.placaVehiculo}
                              </p>
                            )}
                          </div>
                          <div>
                            {greData.licenciaConducir && (
                              <p style={{ margin: '4px 0' }}>
                                <strong>Licencia de Conducir:</strong> {greData.licenciaConducir}
                              </p>
                            )}
                            <p style={{ margin: '4px 0' }}>
                              <strong>Modalidad:</strong> {getModalidadText(greData.modalidad)}
                            </p>
                          </div>
                        </div>
                        {!greData.transportista && !greData.placaVehiculo && !greData.licenciaConducir && (
                          <p style={{ margin: 0, color: '#6b7280', fontStyle: 'italic' }}>
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
                <div style={{ marginBottom: '24px' }}>
                  <table style={{ 
                    width: '100%', 
                    borderCollapse: 'collapse', 
                    border: '1px solid #000',
                    fontSize: '14px'
                  }}>
                    <thead>
                      <tr>
                        <th style={{ 
                          border: '1px solid #000', 
                          backgroundColor: '#f3f4f6', 
                          padding: '8px', 
                          textAlign: 'left', 
                          fontWeight: 'bold' 
                        }}>
                          OBSERVACIONES
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ 
                          border: '1px solid #000', 
                          padding: '12px' 
                        }}>
                          {greData.observaciones}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* FOOTER */}
              <div style={{ 
                textAlign: 'center', 
                fontSize: '12px', 
                color: '#374151',
                borderTop: '1px solid #d1d5db',
                paddingTop: '16px'
              }}>
                <p style={{ fontWeight: 'bold', margin: '0 0 4px 0' }}>
                  NEON SYSTEM - Sistema Empresarial Integrado
                </p>
                <p style={{ margin: '0 0 4px 0' }}>
                  Documento generado automáticamente el {new Date().toLocaleDateString('es-PE')}
                </p>
                <p style={{ margin: 0 }}>
                  Para consultas sobre este documento, contacte al emisor • Sistema certificado por SUNAT
                </p>
              </div>
            </div>
          ) : (
            <div style={{ 
              textAlign: 'center', 
              padding: '48px',
              color: '#6b7280'
            }}>
              <p style={{ fontSize: '16px' }}>No se pudo cargar la guía de remisión</p>
            </div>
          )}
        </div>
      </div>

      {/* CSS para animación */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}