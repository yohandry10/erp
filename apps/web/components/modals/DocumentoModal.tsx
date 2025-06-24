'use client'

import { useState, useEffect, useCallback } from 'react'
import { useApiCall } from '@/hooks/use-api'

interface DocumentoModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  documento?: any
}

interface DetalleTipo {
  codigo_producto: string
  descripcion: string
  unidad_medida: string
  cantidad: number
  precio_unitario: number
  descuento_unitario: number
  valor_venta: number
  impuesto_igv: number
  total_item: number
}

export default function DocumentoModal({ isOpen, onClose, onSuccess, documento }: DocumentoModalProps) {
  const [formData, setFormData] = useState({
    tipo_documento: 'FACTURA',
    serie: '',
    receptor_tipo_doc: 'RUC',
    receptor_numero_doc: '',
    receptor_razon_social: '',
    receptor_direccion: '',
    receptor_email: '',
    fecha_emision: new Date().toISOString().slice(0, 10),
    fecha_vencimiento: '',
    moneda: 'PEN',
    subtotal: 0,
    descuentos: 0,
    impuesto_igv: 0,
    total: 0,
    observaciones: ''
  })

  const [detalles, setDetalles] = useState<DetalleTipo[]>([
    {
      codigo_producto: '',
      descripcion: '',
      unidad_medida: 'NIU',
      cantidad: 1,
      precio_unitario: 0,
      descuento_unitario: 0,
      valor_venta: 0,
      impuesto_igv: 0,
      total_item: 0
    }
  ])

  const [validandoRUC, setValidandoRUC] = useState(false)
  const [erroresValidacion, setErroresValidacion] = useState<string[]>([])

  const api = useApiCall()

  useEffect(() => {
    if (documento) {
      // Cargar datos del documento para edición
      setFormData({
        tipo_documento: documento.tipo_documento || 'FACTURA',
        serie: documento.serie || '',
        receptor_tipo_doc: documento.receptor_tipo_doc || 'RUC',
        receptor_numero_doc: documento.receptor_numero_doc || '',
        receptor_razon_social: documento.receptor_razon_social || '',
        receptor_direccion: documento.receptor_direccion || '',
        receptor_email: documento.receptor_email || '',
        fecha_emision: documento.fecha_emision?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        fecha_vencimiento: documento.fecha_vencimiento?.slice(0, 10) || '',
        moneda: documento.moneda || 'PEN',
        subtotal: documento.subtotal || 0,
        descuentos: documento.descuentos || 0,
        impuesto_igv: documento.impuesto_igv || 0,
        total: documento.total || 0,
        observaciones: documento.observaciones || ''
      })

      // Cargar detalles si existen
      if (documento.documento_detalles && documento.documento_detalles.length > 0) {
        setDetalles(documento.documento_detalles.map(d => ({
          codigo_producto: d.codigo_producto || '',
          descripcion: d.descripcion || '',
          unidad_medida: d.unidad_medida || 'NIU',
          cantidad: d.cantidad || 1,
          precio_unitario: d.precio_unitario || 0,
          descuento_unitario: d.descuento_unitario || 0,
          valor_venta: d.valor_venta || 0,
          impuesto_igv: d.impuesto_igv || 0,
          total_item: d.total_item || 0
        })))
      }
    } else {
      // Reset form for new document
      setFormData({
        tipo_documento: 'FACTURA',
        serie: '',
        receptor_tipo_doc: 'RUC',
        receptor_numero_doc: '',
        receptor_razon_social: '',
        receptor_direccion: '',
        receptor_email: '',
        fecha_emision: new Date().toISOString().slice(0, 10),
        fecha_vencimiento: '',
        moneda: 'PEN',
        subtotal: 0,
        descuentos: 0,
        impuesto_igv: 0,
        total: 0,
        observaciones: ''
      })
      setDetalles([{
        codigo_producto: '',
        descripcion: '',
        unidad_medida: 'NIU',
        cantidad: 1,
        precio_unitario: 0,
        descuento_unitario: 0,
        valor_venta: 0,
        impuesto_igv: 0,
        total_item: 0
      }])
    }
  }, [documento])

  // Validar RUC automáticamente
  const validarRUC = async (ruc: string) => {
    if (ruc.length === 11 && /^\d+$/.test(ruc)) {
      setValidandoRUC(true)
      try {
        const response = await api.post('/api/documentos/validar-ruc', { ruc })
        if (response && response.success && response.data) {
          setFormData(prev => ({
            ...prev,
            receptor_razon_social: response.data.razon_social,
            receptor_direccion: response.data.direccion
          }))
          showSuccessToast('RUC validado correctamente')
        } else {
          showErrorToast('RUC no encontrado o inválido')
        }
      } catch (error) {
        console.error('Error validando RUC:', error)
        showErrorToast('Error al validar RUC')
      } finally {
        setValidandoRUC(false)
      }
    }
  }

  // Calcular totales manualmente cuando sea necesario
  const calcularTotales = () => {
    const subtotalCalculado = detalles.reduce((sum, detalle) => {
      const valorVenta = (detalle.cantidad * detalle.precio_unitario) - detalle.descuento_unitario
      return sum + valorVenta
    }, 0)

    const igvCalculado = subtotalCalculado * 0.18 // 18% IGV
    const totalCalculado = subtotalCalculado + igvCalculado

    setFormData(prev => ({
      ...prev,
      subtotal: subtotalCalculado,
      impuesto_igv: igvCalculado,
      total: totalCalculado
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validar documento antes de enviar
    const datosParaValidar = {
      ...formData,
      detalles: detalles
    }

    const validationResponse = await api.post('/api/documentos/validar-documento', datosParaValidar)
    
    if (validationResponse && !validationResponse.data.valido) {
      setErroresValidacion(validationResponse.data.errores)
      showErrorToast(`Errores de validación: ${validationResponse.data.errores.join(', ')}`)
      return
    }

    setErroresValidacion([])

    // Crear o actualizar documento
    console.log('📊 Enviando datos del documento:', { ...formData, detalles })
    
    let response
    if (documento) {
      // Actualizar documento existente
      response = await api.put(`/api/documentos/${documento.id}`, { ...formData, detalles })
    } else {
      // Crear nuevo documento
      response = await api.post('/api/documentos/crear', { ...formData, detalles })
    }
    
    if (response && response.success) {
      console.log('✅ Documento guardado exitosamente:', response.data)
      
      showSuccessToast(response.message || `Documento ${documento ? 'actualizado' : 'creado'} exitosamente`)
      
      onSuccess()
      onClose()
    } else {
      console.log('❌ Error al guardar documento:', response)
      showErrorToast(response?.message || 'Error al guardar documento')
    }
  }

  const agregarDetalle = () => {
    setDetalles([...detalles, {
      codigo_producto: '',
      descripcion: '',
      unidad_medida: 'UND',
      cantidad: 1,
      precio_unitario: 0,
      descuento_unitario: 0,
      valor_venta: 0,
      impuesto_igv: 0,
      total_item: 0
    }])
    
    // Calcular totales después de agregar
    setTimeout(() => {
      calcularTotales()
    }, 0)
  }

  const eliminarDetalle = (index: number) => {
    if (detalles.length > 1) {
      setDetalles(detalles.filter((_, i) => i !== index))
      
      // Calcular totales después de eliminar
      setTimeout(() => {
        calcularTotales()
      }, 0)
    }
  }

  const actualizarDetalle = (index: number, campo: string, valor: any) => {
    const nuevosDetalles = [...detalles]
    nuevosDetalles[index] = { ...nuevosDetalles[index], [campo]: valor }
    setDetalles(nuevosDetalles)
    
    // Calcular totales automáticamente cuando cambien valores relevantes
    if (campo === 'cantidad' || campo === 'precio_unitario' || campo === 'descuento_unitario') {
      // Usar setTimeout para asegurar que el estado se actualice primero
      setTimeout(() => {
        calcularTotales()
      }, 0)
    }
  }

  const showSuccessToast = (message: string) => {
    if (typeof window !== 'undefined') {
      const toast = document.createElement('div')
      toast.innerHTML = `
        <div style="
          position: fixed;
          top: 20px;
          right: 20px;
          background: #10b981;
          color: white;
          padding: 1rem 1.5rem;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 9999;
          font-weight: 600;
          animation: slideIn 0.3s ease-out;
        ">
          ✅ ${message}
        </div>
        <style>
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        </style>
      `
      document.body.appendChild(toast)
      setTimeout(() => {
        document.body.removeChild(toast)
      }, 3000)
    }
  }

  const showErrorToast = (message: string) => {
    if (typeof window !== 'undefined') {
      const toast = document.createElement('div')
      toast.innerHTML = `
        <div style="
          position: fixed;
          top: 20px;
          right: 20px;
          background: #ef4444;
          color: white;
          padding: 1rem 1.5rem;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 9999;
          font-weight: 600;
          animation: slideIn 0.3s ease-out;
        ">
          ❌ ${message}
        </div>
        <style>
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        </style>
      `
      document.body.appendChild(toast)
      setTimeout(() => {
        document.body.removeChild(toast)
      }, 3000)
    }
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '2rem',
        width: '100%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '2rem',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '1rem'
        }}>
          <h2 style={{ margin: 0, color: '#1f2937', fontSize: '1.5rem' }}>
            {documento ? 'Editar Documento' : 'Crear Nuevo Documento'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.5rem'
            }}
          >
            ×
          </button>
        </div>

        {erroresValidacion.length > 0 && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem'
          }}>
            <h4 style={{ color: '#dc2626', margin: '0 0 0.5rem 0' }}>Errores de Validación:</h4>
            <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#dc2626' }}>
              {erroresValidacion.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Información del Documento */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1rem', color: '#374151' }}>Información del Documento</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Tipo de Documento *
                </label>
                <select
                  value={formData.tipo_documento}
                  onChange={(e) => setFormData(prev => ({ ...prev, tipo_documento: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="FACTURA">Factura</option>
                  <option value="BOLETA">Boleta</option>
                  <option value="NOTA_CREDITO">Nota de Crédito</option>
                  <option value="NOTA_DEBITO">Nota de Débito</option>
                  <option value="CONTRATO">Contrato</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Serie
                </label>
                <input
                  type="text"
                  value={formData.serie}
                  onChange={(e) => setFormData(prev => ({ ...prev, serie: e.target.value }))}
                  placeholder="Ej: F001, B001"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Fecha de Emisión *
                </label>
                <input
                  type="date"
                  value={formData.fecha_emision}
                  onChange={(e) => setFormData(prev => ({ ...prev, fecha_emision: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Fecha de Vencimiento
                </label>
                <input
                  type="date"
                  value={formData.fecha_vencimiento}
                  onChange={(e) => setFormData(prev => ({ ...prev, fecha_vencimiento: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Moneda
                </label>
                <select
                  value={formData.moneda}
                  onChange={(e) => setFormData(prev => ({ ...prev, moneda: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="PEN">Soles (PEN)</option>
                  <option value="USD">Dólares (USD)</option>
                  <option value="EUR">Euros (EUR)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Información del Cliente */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1rem', color: '#374151' }}>Información del Cliente</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Tipo de Documento
                </label>
                <select
                  value={formData.receptor_tipo_doc}
                  onChange={(e) => setFormData(prev => ({ ...prev, receptor_tipo_doc: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="RUC">RUC</option>
                  <option value="DNI">DNI</option>
                  <option value="CE">Carnet de Extranjería</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Número de Documento *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={formData.receptor_numero_doc}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, receptor_numero_doc: e.target.value }))
                      if (formData.receptor_tipo_doc === 'RUC') {
                        validarRUC(e.target.value)
                      }
                    }}
                    placeholder="Ingrese RUC/DNI"
                    required
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                  {validandoRUC && (
                    <div style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#3b82f6'
                    }}>
                      Validando...
                    </div>
                  )}
                </div>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Razón Social / Nombre *
                </label>
                <input
                  type="text"
                  value={formData.receptor_razon_social}
                  onChange={(e) => setFormData(prev => ({ ...prev, receptor_razon_social: e.target.value }))}
                  placeholder="Nombre o razón social del cliente"
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Dirección
                </label>
                <input
                  type="text"
                  value={formData.receptor_direccion}
                  onChange={(e) => setFormData(prev => ({ ...prev, receptor_direccion: e.target.value }))}
                  placeholder="Dirección del cliente"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={formData.receptor_email}
                  onChange={(e) => setFormData(prev => ({ ...prev, receptor_email: e.target.value }))}
                  placeholder="email@cliente.com"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Detalles del Documento */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#374151' }}>Detalles del Documento</h3>
              <button
                type="button"
                onClick={agregarDetalle}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                + Agregar Línea
              </button>
            </div>

            {detalles.map((detalle, index) => (
              <div key={index} style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1rem',
                background: '#f9fafb'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ margin: 0, color: '#374151' }}>Línea {index + 1}</h4>
                  {detalles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => eliminarDetalle(index)}
                      style={{
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.25rem 0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      Eliminar
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                      Código
                    </label>
                    <input
                      type="text"
                      value={detalle.codigo_producto}
                      onChange={(e) => actualizarDetalle(index, 'codigo_producto', e.target.value)}
                      placeholder="COD001"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                      Descripción *
                    </label>
                    <input
                      type="text"
                      value={detalle.descripcion}
                      onChange={(e) => actualizarDetalle(index, 'descripcion', e.target.value)}
                      placeholder="Descripción del producto/servicio"
                      required
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                      U.M.
                    </label>
                    <select
                      value={detalle.unidad_medida}
                      onChange={(e) => actualizarDetalle(index, 'unidad_medida', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.875rem'
                      }}
                    >
                      <option value="NIU">Unidad</option>
                      <option value="KGM">Kilogramo</option>
                      <option value="MTR">Metro</option>
                      <option value="LTR">Litro</option>
                      <option value="ZZ">Servicio</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                      Cantidad *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={detalle.cantidad}
                      onChange={(e) => actualizarDetalle(index, 'cantidad', parseFloat(e.target.value) || 0)}
                      required
                      min="0"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                      Precio Unit. *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={detalle.precio_unitario}
                      onChange={(e) => actualizarDetalle(index, 'precio_unitario', parseFloat(e.target.value) || 0)}
                      required
                      min="0"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                      Descuento
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={detalle.descuento_unitario}
                      onChange={(e) => actualizarDetalle(index, 'descuento_unitario', parseFloat(e.target.value) || 0)}
                      min="0"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                      Total Línea
                    </label>
                    <input
                      type="number"
                      value={detalle.total_item.toFixed(2)}
                      readOnly
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        background: '#f3f4f6',
                        color: '#6b7280'
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Totales */}
          <div style={{ marginBottom: '2rem', background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
            <h3 style={{ marginBottom: '1rem', color: '#374151' }}>Totales</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Subtotal</label>
                <input
                  type="number"
                  value={formData.subtotal.toFixed(2)}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: '#f3f4f6',
                    color: '#6b7280'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>IGV (18%)</label>
                <input
                  type="number"
                  value={formData.impuesto_igv.toFixed(2)}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: '#f3f4f6',
                    color: '#6b7280'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Descuentos</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.descuentos}
                  onChange={(e) => setFormData(prev => ({ ...prev, descuentos: parseFloat(e.target.value) || 0 }))}
                  min="0"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#059669' }}>
                  Total Final
                </label>
                <input
                  type="number"
                  value={(formData.total - formData.descuentos).toFixed(2)}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #059669',
                    borderRadius: '6px',
                    background: '#ecfdf5',
                    color: '#059669',
                    fontWeight: '600',
                    fontSize: '1.1rem'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Observaciones */}
          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Observaciones
            </label>
            <textarea
              value={formData.observaciones}
              onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
              placeholder="Observaciones adicionales del documento..."
              rows={3}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                resize: 'vertical',
                fontSize: '0.875rem'
              }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: 'white',
                color: '#374151',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={api.loading}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '6px',
                background: api.loading ? '#9ca3af' : '#3b82f6',
                color: 'white',
                cursor: api.loading ? 'not-allowed' : 'pointer',
                fontWeight: '500'
              }}
            >
              {api.loading ? 'Guardando...' : (documento ? 'Actualizar' : 'Crear Documento')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
} 