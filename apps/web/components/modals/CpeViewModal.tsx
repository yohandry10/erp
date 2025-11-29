'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'

interface CpeViewModalProps {
  isOpen: boolean
  onClose: () => void
  documentId: string
  documentType: string
}

interface CpeItem {
  nombre_producto?: string
  descripcion?: string
  cantidad?: number
  precio_unitario?: number
}

interface CpeData {
  serie: string
  numero: string | number
  created_at: string
  razon_social_emisor: string
  ruc_emisor: string
  logo_url?: string
  razon_social_receptor: string
  documento_receptor: string
  tipo_documento_receptor: string
  total_gravadas: number
  total_igv: number
  total_venta: number
  moneda: string
  estado: string
  hash: string
  items: CpeItem[]
  tipo_documento: string
}

export default function CpeViewModal({
  isOpen,
  onClose,
  documentId,
  documentType,
}: CpeViewModalProps) {
  const [cpeData, setCpeData] = useState<CpeData | null>(null)
  const [loading, setLoading] = useState(false)
  const api = useApi()

  useEffect(() => {
    if (isOpen && documentId) {
      loadCpeData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, documentId])

  const loadCpeData = async () => {
    setLoading(true)
    try {
      // Usar el endpoint correcto: /api/cpe/comprobantes/:id
      const response = await api.get(`/api/cpe/comprobantes/${documentId}`)
      
      if (response?.success && response?.data) {
        setCpeData(response.data)
      } else {
        console.error('Error al cargar CPE:', response?.message || 'Sin datos')
        setCpeData(null)
      }
    } catch (error) {
      console.error('Error al cargar CPE:', error)
      setCpeData(null)
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    // Generar ticket térmico de 80mm en lugar de imprimir el modal completo
    if (!cpeData) return

    const formatMoney = (value: number) => `${cpeData.moneda} ${value.toFixed(2)}`
    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('es-PE')

    const itemsHtml = Array.isArray(cpeData.items) && cpeData.items.length > 0
      ? cpeData.items.map((item, idx) => {
          const qty = item.cantidad ?? 1
          const unit = item.precio_unitario ?? 0
          return `
            <div style="display:flex;justify-content:space-between;margin:2px 0;font-size:10px;">
              <span style="flex:1;">${qty}x ${item.nombre_producto || item.descripcion || 'Producto'}</span>
              <span style="text-align:right;min-width:50px;">${formatMoney(qty * unit)}</span>
            </div>
          `
        }).join('')
      : '<div style="font-size:10px;">Sin detalle de productos</div>'

    const printWindow = window.open('', '_blank', 'width=350,height=600')
    
    if (!printWindow) {
      alert('Por favor permite las ventanas emergentes para imprimir')
      return
    }

    const numeroFormateado = `${cpeData.serie}-${(typeof cpeData.numero === 'number' ? cpeData.numero : parseInt(String(cpeData.numero || '0'), 10)).toString().padStart(8, '0')}`

    // Generar HTML del logo si existe
    const logoHtml = cpeData.logo_url 
      ? `<img src="${cpeData.logo_url}" alt="Logo" style="max-width: 60mm; max-height: 20mm; margin-bottom: 6px;" />`
      : ''

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${getDocumentTypeName()} ${numeroFormateado}</title>
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
          .logo { margin-bottom: 6px; }
          .logo img { max-width: 60mm; max-height: 20mm; }
          .empresa { font-size: 14px; font-weight: bold; }
          .ruc { font-size: 10px; }
          .tipo-doc { font-size: 11px; font-weight: bold; margin: 6px 0 2px; border: 1px solid #000; padding: 4px; }
          .numero { font-size: 12px; font-weight: bold; }
          .fecha { font-size: 9px; color: #333; margin-top: 4px; }
          .seccion { border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 6px; }
          .label { font-size: 9px; color: #666; }
          .valor { font-size: 10px; }
          .items { border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }
          .totales { padding: 6px 0; }
          .total-row { display: flex; justify-content: space-between; margin: 2px 0; font-size: 10px; }
          .total-final { font-size: 14px; font-weight: bold; border-top: 1px solid #000; padding-top: 6px; margin-top: 6px; }
          .footer { text-align: center; margin-top: 10px; font-size: 8px; border-top: 1px dashed #000; padding-top: 6px; }
          .hash { font-size: 7px; word-break: break-all; margin: 4px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoHtml ? `<div class="logo">${logoHtml}</div>` : ''}
          <div class="empresa">${cpeData.razon_social_emisor || 'NEON SYSTEM'}</div>
          <div class="ruc">RUC: ${cpeData.ruc_emisor || '20000000001'}</div>
          <div class="tipo-doc">${getDocumentTypeName()}</div>
          <div class="numero">${numeroFormateado}</div>
          <div class="fecha">${formatDate(cpeData.created_at)}</div>
        </div>
        
        <div class="seccion">
          <div class="label">CLIENTE:</div>
          <div class="valor">${cpeData.razon_social_receptor || 'Cliente General'}</div>
          <div class="valor">${cpeData.tipo_documento_receptor === '6' ? 'RUC' : 'DNI'}: ${cpeData.documento_receptor || '-'}</div>
        </div>
        
        <div class="items">
          <div style="display:flex;justify-content:space-between;font-size:9px;font-weight:bold;border-bottom:1px solid #000;padding-bottom:2px;margin-bottom:4px;">
            <span>DESCRIPCIÓN</span>
            <span>TOTAL</span>
          </div>
          ${itemsHtml}
        </div>
        
        <div class="totales">
          <div class="total-row"><span>Subtotal:</span><span>${formatMoney(cpeData.total_gravadas || 0)}</span></div>
          <div class="total-row"><span>IGV (18%):</span><span>${formatMoney(cpeData.total_igv || 0)}</span></div>
          <div class="total-row total-final"><span>TOTAL:</span><span>${formatMoney(cpeData.total_venta || 0)}</span></div>
        </div>
        
        <div class="footer">
          <div class="hash">Hash: ${cpeData.hash || 'N/A'}</div>
          <div>Representación impresa del CPE</div>
          <div style="margin-top:4px;">¡Gracias por su compra!</div>
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

  const getDocumentTypeName = () => {
    switch (documentType) {
      case '01':
        return 'FACTURA ELECTRÓNICA'
      case '03':
        return 'BOLETA DE VENTA ELECTRÓNICA'
      case '07':
        return 'NOTA DE CRÉDITO ELECTRÓNICA'
      case '08':
        return 'NOTA DE DÉBITO ELECTRÓNICA'
      default:
        return 'COMPROBANTE ELECTRÓNICO'
    }
  }

  const getDocumentColor = () => {
    switch (documentType) {
      case '01':
        return '#dc2626'
      case '03':
        return '#2563eb'
      case '07':
        return '#ea580c'
      case '08':
        return '#7c3aed'
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
        padding: '20px',
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
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            backgroundColor: getDocumentColor(),
            color: 'white',
            padding: '16px',
            borderRadius: '8px 8px 0 0',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>{getDocumentTypeName()}</h2>
              <p style={{ fontSize: '14px', margin: '4px 0 0 0', opacity: 0.9 }}>
                {cpeData
                  ? `${cpeData.serie}-${(typeof cpeData.numero === 'number'
                      ? cpeData.numero
                      : parseInt(String(cpeData.numero || '0'), 10)
                    )
                      .toString()
                      .padStart(8, '0')}`
                  : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                  gap: '4px',
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
                  padding: 0,
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '24px' }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '400px',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  border: '4px solid #f3f4f6',
                  borderTop: '4px solid #3b82f6',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <p style={{ color: '#6b7280', fontSize: '16px' }}>Cargando comprobante...</p>
            </div>
          ) : cpeData ? (
            <div
              style={{
                fontFamily: 'Arial, sans-serif',
                fontSize: '14px',
                lineHeight: '1.5',
                color: '#000',
                backgroundColor: 'white',
              }}
            >
              {/* Encabezado con emisor y doc */}
              <div style={{ marginBottom: '24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000' }}>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '16px', width: '65%' }}>
                        <div style={{ textAlign: 'center' }}>
                          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 8px 0' }}>NEON SYSTEM</h1>
                          <p style={{ fontSize: '14px', margin: '4px 0' }}>Sistema Empresarial Integrado</p>
                          <p style={{ fontSize: '14px', margin: '4px 0' }}>
                            <strong>RUC:</strong> {cpeData.ruc_emisor}
                          </p>
                          <p style={{ fontSize: '14px', margin: '4px 0' }}>
                            <strong>Razón Social:</strong> {cpeData.razon_social_emisor}
                          </p>
                          <p style={{ fontSize: '14px', margin: '4px 0' }}>Dirección: Lima, Perú</p>
                        </div>
                      </td>
                      <td style={{ border: '1px solid #000', padding: '16px', width: '35%' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ border: '2px solid #000', padding: '12px', marginBottom: '12px' }}>
                            <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 8px 0' }}>
                              {getDocumentTypeName()}
                            </h2>
                            <p style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>
                              {cpeData.serie} -{' '}
                              {(typeof cpeData.numero === 'number'
                                ? cpeData.numero
                                : parseInt(String(cpeData.numero || '0'), 10)
                              )
                                .toString()
                                .padStart(8, '0')}
                            </p>
                          </div>
                          <div style={{ fontSize: '14px' }}>
                            <p style={{ margin: '4px 0' }}>
                              <strong>Fecha:</strong>{' '}
                              {new Date(cpeData.created_at).toLocaleDateString('es-PE')}
                            </p>
                            <p style={{ margin: '4px 0' }}>
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

              {/* Datos del cliente */}
              <div style={{ marginBottom: '24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
                  <thead>
                    <tr>
                      <th
                        style={{
                          border: '1px solid #000',
                          backgroundColor: '#f3f4f6',
                          padding: '8px',
                          textAlign: 'left',
                          fontWeight: 'bold',
                        }}
                      >
                        DATOS DEL CLIENTE
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '12px' }}>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '16px',
                            fontSize: '14px',
                          }}
                        >
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
                              <strong>Tipo de Documento:</strong>{' '}
                              {cpeData.tipo_documento_receptor === '1'
                                ? 'DNI'
                                : cpeData.tipo_documento_receptor === '6'
                                ? 'RUC'
                                : 'Otro'}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Detalle de productos */}
              <div style={{ marginBottom: '24px' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    border: '1px solid #000',
                    fontSize: '14px',
                  }}
                >
                  <thead>
                    <tr style={{ backgroundColor: '#f3f4f6' }}>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                        #
                      </th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>
                        DESCRIPCIÓN
                      </th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                        CANTIDAD
                      </th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>
                        PRECIO UNIT.
                      </th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>
                        TOTAL
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(cpeData.items) && cpeData.items.length > 0 ? (
                      cpeData.items.map((item, index) => {
                        const qty = item.cantidad ?? 1
                        const unit = item.precio_unitario ?? 0
                        return (
                          <tr key={`${index}-${item.nombre_producto ?? item.descripcion ?? 'item'}`}>
                            <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>
                              {index + 1}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '8px' }}>
                              {item.nombre_producto || item.descripcion || 'Producto'}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>{qty}</td>
                            <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>
                              {cpeData.moneda} {unit.toFixed(2)}
                            </td>
                            <td
                              style={{
                                border: '1px solid #000',
                                padding: '8px',
                                textAlign: 'right',
                                fontWeight: 'bold',
                              }}
                            >
                              {cpeData.moneda} {(qty * unit).toFixed(2)}
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={5}
                          style={{ border: '1px solid #000', padding: '16px', textAlign: 'center', color: '#6b7280' }}
                        >
                          No hay productos disponibles
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totales */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', marginBottom: '24px' }}>
                <div>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      border: '1px solid #000',
                      fontSize: '14px',
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            border: '1px solid #000',
                            backgroundColor: '#f3f4f6',
                            padding: '8px',
                            textAlign: 'left',
                            fontWeight: 'bold',
                          }}
                        >
                          INFORMACIÓN DE SEGURIDAD
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ border: '1px solid #000', padding: '12px' }}>
                          <p style={{ fontWeight: 'bold', margin: '0 0 8px 0' }}>Hash de Seguridad:</p>
                          <p
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '12px',
                              wordBreak: 'break-all',
                              margin: '0 0 12px 0',
                            }}
                          >
                            {cpeData.hash || 'N/A'}
                          </p>
                          <p style={{ fontSize: '12px', margin: 0 }}>Representación impresa del {getDocumentTypeName()}</p>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      border: '1px solid #000',
                      fontSize: '14px',
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            border: '1px solid #000',
                            backgroundColor: '#f3f4f6',
                            padding: '8px',
                            textAlign: 'left',
                            fontWeight: 'bold',
                          }}
                        >
                          RESUMEN DE TOTALES
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ border: '1px solid #000', padding: '12px' }}>
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
                            <div
                              style={{
                                borderTop: '1px solid #000',
                                paddingTop: '8px',
                                display: 'flex',
                                justifyContent: 'space-between',
                              }}
                            >
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

              {/* Footer */}
              <div
                style={{
                  textAlign: 'center',
                  fontSize: '12px',
                  color: '#374151',
                  borderTop: '1px solid #d1d5db',
                  paddingTop: '16px',
                }}
              >
                <p style={{ fontWeight: 'bold', margin: '0 0 4px 0' }}>NEON SYSTEM - Sistema Empresarial Integrado</p>
                <p style={{ margin: '0 0 4px 0' }}>
                  Documento generado automáticamente el {new Date().toLocaleDateString('es-PE')}
                </p>
                <p style={{ margin: 0 }}>
                  Para consultas sobre este documento, contacte al emisor • Sistema certificado por SUNAT
                </p>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
              <p style={{ fontSize: '16px' }}>No se pudo cargar el comprobante</p>
            </div>
          )}
        </div>

        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  )
}
