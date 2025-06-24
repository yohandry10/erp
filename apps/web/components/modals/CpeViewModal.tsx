'use client'

import { useState, useEffect } from 'react'

interface CpeViewModalProps {
  isOpen: boolean
  onClose: () => void
  documentId: string
  documentType: string
}

interface CpeData {
  serie: string
  numero: string
  created_at: string
  razon_social_emisor: string
  ruc_emisor: string
  razon_social_receptor: string
  documento_receptor: string
  tipo_documento_receptor: string
  total_gravadas: number
  total_igv: number
  total_venta: number
  moneda: string
  estado: string
  hash: string
  items: any[]
  tipo_documento: string
}

export default function CpeViewModal({ isOpen, onClose, documentId, documentType }: CpeViewModalProps) {
  const [cpeData, setCpeData] = useState<CpeData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && documentId) {
      loadCpeData()
    }
  }, [isOpen, documentId])

  const loadCpeData = async () => {
    setLoading(true)
    try {
      console.log(`🔍 Cargando datos del CPE: ${documentId}`)
      
      // Obtener los datos estructurados directamente
      const dataResponse = await fetch(`http://localhost:3001/api/cpe/comprobantes/${documentId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || 'demo-token'}`,
          'Content-Type': 'application/json'
        }
      })
      
      console.log('📡 Respuesta del servidor:', dataResponse.status)
      
      if (dataResponse.ok) {
        const result = await dataResponse.json()
        console.log('✅ Datos CPE cargados:', result)
        
        if (result.success && result.data) {
          setCpeData(result.data)
        } else {
          console.error('❌ Respuesta sin datos:', result)
        }
      } else {
        const errorText = await dataResponse.text()
        console.error('❌ Error en respuesta:', dataResponse.status, errorText)
      }
    } catch (error) {
      console.error('❌ Error cargando CPE:', error)
    }
    setLoading(false)
  }

  const handleDownloadPdf = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/cpe/comprobantes/${documentId}/pdf`, {
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
        a.download = `${getDocumentTypeName()}-${cpeData?.serie}-${cpeData?.numero}.txt`
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
    window.print()
  }

  const getDocumentTypeName = () => {
    if (!cpeData) return 'Comprobante'
    
    switch (cpeData.tipo_documento) {
      case '01':
        return 'FACTURA ELECTRÓNICA'
      case '03':
        return 'BOLETA ELECTRÓNICA'
      case '07':
        return 'NOTA DE CRÉDITO ELECTRÓNICA'
      case '08':
        return 'NOTA DE DÉBITO ELECTRÓNICA'
      default:
        return 'COMPROBANTE ELECTRÓNICO'
    }
  }

  const getDocumentColor = () => {
    if (!cpeData) return '#2563eb'
    
    switch (cpeData.tipo_documento) {
      case '01':
        return '#dc2626' // Rojo para facturas
      case '03':
        return '#2563eb' // Azul para boletas
      case '07':
        return '#ea580c' // Naranja para notas de crédito
      case '08':
        return '#7c3aed' // Morado para notas de débito
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
          maxWidth: '1400px',
          maxHeight: '95vh',
          overflow: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          backgroundColor: getDocumentColor(), 
          color: 'white', 
          padding: '16px', 
          borderRadius: '8px 8px 0 0' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
                {getDocumentTypeName()}
              </h2>
              <p style={{ fontSize: '14px', margin: '4px 0 0 0', opacity: 0.9 }}>
                {cpeData?.serie}-{cpeData?.numero?.toString().padStart(8, '0')}
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
              <p style={{ color: '#6b7280', fontSize: '16px' }}>Cargando comprobante...</p>
            </div>
          ) : cpeData ? (
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
                            CABIMAS ERP
                          </h1>
                          <p style={{ fontSize: '14px', marginBottom: '4px', margin: '4px 0' }}>
                            Sistema Empresarial Integrado
                          </p>
                          <p style={{ fontSize: '14px', marginBottom: '4px', margin: '4px 0' }}>
                            <strong>RUC:</strong> {cpeData.ruc_emisor}
                          </p>
                          <p style={{ fontSize: '14px', marginBottom: '4px', margin: '4px 0' }}>
                            <strong>Razón Social:</strong> {cpeData.razon_social_emisor}
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
                              {getDocumentTypeName()}
                            </h2>
                            <p style={{ 
                              fontSize: '18px', 
                              fontWeight: 'bold',
                              margin: 0
                            }}>
                              {cpeData.serie} - {cpeData.numero?.toString().padStart(8, '0')}
                            </p>
                          </div>
                          <div style={{ fontSize: '14px' }}>
                            <p style={{ marginBottom: '4px', margin: '4px 0' }}>
                              <strong>Fecha:</strong> {new Date(cpeData.created_at).toLocaleDateString('es-PE')}
                            </p>
                            <p style={{ marginBottom: '4px', margin: '4px 0' }}>
                              <strong>Estado:</strong> {cpeData.estado}
                            </p>
                            <p style={{ margin: '4px 0' }}>
                              <strong>Moneda:</strong> {cpeData.moneda}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* DATOS DEL CLIENTE */}
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
                        DATOS DEL CLIENTE
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
                              <strong>Cliente:</strong> {cpeData.razon_social_receptor}
                            </p>
                            <p style={{ margin: '4px 0' }}>
                              <strong>Documento:</strong> {cpeData.documento_receptor}
                            </p>
                          </div>
                          <div>
                            <p style={{ margin: '4px 0' }}>
                              <strong>Tipo de Documento:</strong> {
                                cpeData.tipo_documento_receptor === '1' ? 'DNI' : 
                                cpeData.tipo_documento_receptor === '6' ? 'RUC' : 
                                'Otro'
                              }
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* DETALLE DE PRODUCTOS */}
              <div style={{ marginBottom: '24px' }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse', 
                  border: '1px solid #000',
                  fontSize: '14px'
                }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f3f4f6' }}>
                      <th style={{ 
                        border: '1px solid #000', 
                        padding: '8px', 
                        textAlign: 'center', 
                        fontWeight: 'bold' 
                      }}>
                        #
                      </th>
                      <th style={{ 
                        border: '1px solid #000', 
                        padding: '8px', 
                        textAlign: 'left', 
                        fontWeight: 'bold' 
                      }}>
                        DESCRIPCIÓN
                      </th>
                      <th style={{ 
                        border: '1px solid #000', 
                        padding: '8px', 
                        textAlign: 'center', 
                        fontWeight: 'bold' 
                      }}>
                        CANTIDAD
                      </th>
                      <th style={{ 
                        border: '1px solid #000', 
                        padding: '8px', 
                        textAlign: 'right', 
                        fontWeight: 'bold' 
                      }}>
                        PRECIO UNIT.
                      </th>
                      <th style={{ 
                        border: '1px solid #000', 
                        padding: '8px', 
                        textAlign: 'right', 
                        fontWeight: 'bold' 
                      }}>
                        TOTAL
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(cpeData.items) && cpeData.items.length > 0 ? (
                      cpeData.items.map((item, index) => (
                        <tr key={index}>
                          <td style={{ 
                            border: '1px solid #000', 
                            padding: '8px', 
                            textAlign: 'center' 
                          }}>
                            {index + 1}
                          </td>
                          <td style={{ 
                            border: '1px solid #000', 
                            padding: '8px' 
                          }}>
                            {item.nombre_producto || item.descripcion || 'Producto'}
                          </td>
                          <td style={{ 
                            border: '1px solid #000', 
                            padding: '8px', 
                            textAlign: 'center' 
                          }}>
                            {item.cantidad || 1}
                          </td>
                          <td style={{ 
                            border: '1px solid #000', 
                            padding: '8px', 
                            textAlign: 'right' 
                          }}>
                            {cpeData.moneda} {(item.precio_unitario || 0).toFixed(2)}
                          </td>
                          <td style={{ 
                            border: '1px solid #000', 
                            padding: '8px', 
                            textAlign: 'right', 
                            fontWeight: 'bold' 
                          }}>
                            {cpeData.moneda} {((item.cantidad || 1) * (item.precio_unitario || 0)).toFixed(2)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} style={{ 
                          border: '1px solid #000', 
                          padding: '16px', 
                          textAlign: 'center', 
                          color: '#6b7280' 
                        }}>
                          No hay productos disponibles
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* TOTALES Y HASH */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 300px', 
                gap: '24px', 
                marginBottom: '24px' 
              }}>
                <div>
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
                          INFORMACIÓN DE SEGURIDAD
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ 
                          border: '1px solid #000', 
                          padding: '12px' 
                        }}>
                          <p style={{ 
                            fontWeight: 'bold', 
                            marginBottom: '8px',
                            margin: '0 0 8px 0'
                          }}>
                            Hash de Seguridad:
                          </p>
                          <p style={{ 
                            fontFamily: 'monospace', 
                            fontSize: '12px', 
                            wordBreak: 'break-all', 
                            marginBottom: '12px',
                            margin: '0 0 12px 0'
                          }}>
                            {cpeData.hash}
                          </p>
                          <p style={{ fontSize: '12px', margin: 0 }}>
                            Representación impresa del {getDocumentTypeName()}
                          </p>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                <div>
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
                          RESUMEN DE TOTALES
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ 
                          border: '1px solid #000', 
                          padding: '12px' 
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Subtotal:</span>
                              <span style={{ fontWeight: 'bold' }}>
                                {cpeData.moneda} {(cpeData.total_gravadas || 0).toFixed(2)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>IGV (18%):</span>
                              <span style={{ fontWeight: 'bold' }}>
                                {cpeData.moneda} {(cpeData.total_igv || 0).toFixed(2)}
                              </span>
                            </div>
                            <div style={{ 
                              borderTop: '1px solid #000', 
                              paddingTop: '8px',
                              display: 'flex', 
                              justifyContent: 'space-between'
                            }}>
                              <span style={{ fontWeight: 'bold', fontSize: '16px' }}>TOTAL:</span>
                              <span style={{ fontWeight: 'bold', fontSize: '18px' }}>
                                {cpeData.moneda} {(cpeData.total_venta || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* FOOTER */}
              <div style={{ 
                textAlign: 'center', 
                fontSize: '12px', 
                color: '#374151',
                borderTop: '1px solid #d1d5db',
                paddingTop: '16px'
              }}>
                <p style={{ fontWeight: 'bold', margin: '0 0 4px 0' }}>
                  CABIMAS ERP - Sistema Empresarial Integrado
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
              <p style={{ fontSize: '16px' }}>No se pudo cargar el comprobante</p>
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