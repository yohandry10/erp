'use client'

import { useState } from 'react'
import { useApiCall } from '@/hooks/use-api'

interface SireReportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function SireReportModal({ isOpen, onClose, onSuccess }: SireReportModalProps) {
  const [formData, setFormData] = useState({
    tipoReporte: 'REGISTRO_VENTAS',
    periodo: '',
    fechaInicio: '',
    fechaFin: '',
    formato: 'TXT',
    incluirAnulados: false
  })

  const api = useApiCall()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    console.log('📊 Enviando datos para generar reporte SIRE:', formData)
    const response = await api.post('/api/sire/generar-reporte', formData)
    
    if (response && response.success) {
      console.log('✅ Reporte SIRE generado exitosamente:', response.data)
      
      // Mostrar toast de éxito
      if (typeof window !== 'undefined') {
        const successToast = document.createElement('div')
        successToast.innerHTML = `
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
            ✅ ${response.message || 'Reporte SIRE generado exitosamente'}
          </div>
          <style>
            @keyframes slideIn {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
          </style>
        `
        document.body.appendChild(successToast)
        setTimeout(() => {
          document.body.removeChild(successToast)
        }, 3000)
      }
      
      onSuccess()
      onClose()
      setFormData({
        tipoReporte: 'REGISTRO_VENTAS',
        periodo: '',
        fechaInicio: '',
        fechaFin: '',
        formato: 'TXT',
        incluirAnulados: false
      })
      
      // Force reload after 1.5 seconds to show updated status
      setTimeout(() => {
        console.log('🔄 Recargando datos después de crear reporte...')
        onSuccess()
      }, 1500)
    } else {
      console.log('❌ Error al generar reporte SIRE:', response)
      
      // Mostrar error
      if (typeof window !== 'undefined') {
        const errorToast = document.createElement('div')
        errorToast.innerHTML = `
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
            ❌ ${response?.message || 'Error al generar reporte SIRE'}
          </div>
          <style>
            @keyframes slideIn {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
          </style>
        `
        document.body.appendChild(errorToast)
        setTimeout(() => {
          document.body.removeChild(errorToast)
        }, 3000)
      }
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
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
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '2rem',
        width: '90%',
        maxWidth: '500px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>Generar Reporte SIRE</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                Tipo de Reporte *
              </label>
              <select
                name="tipoReporte"
                value={formData.tipoReporte}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.9rem'
                }}
              >
                <option value="REGISTRO_VENTAS">Registro de Ventas</option>
                <option value="REGISTRO_COMPRAS">Registro de Compras</option>
                <option value="LIBROS_ELECTRONICOS">Libros Electrónicos</option>
                <option value="RETENCIONES">Retenciones</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                Período *
              </label>
              <input
                type="month"
                name="periodo"
                value={formData.periodo}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  Fecha Inicio
                </label>
                <input
                  type="date"
                  name="fechaInicio"
                  value={formData.fechaInicio}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  Fecha Fin
                </label>
                <input
                  type="date"
                  name="fechaFin"
                  value={formData.fechaFin}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                Formato *
              </label>
              <select
                name="formato"
                value={formData.formato}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.9rem'
                }}
              >
                <option value="TXT">TXT</option>
                <option value="XML">XML</option>
                <option value="EXCEL">Excel</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                name="incluirAnulados"
                checked={formData.incluirAnulados}
                onChange={handleChange}
                id="incluirAnulados"
                style={{ width: 'auto' }}
              />
              <label htmlFor="incluirAnulados" style={{ fontWeight: '600', color: '#374151', cursor: 'pointer' }}>
                Incluir documentos anulados
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: 'white',
                color: '#374151',
                cursor: 'pointer',
                fontWeight: '600'
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
                backgroundColor: api.loading ? '#9ca3af' : '#3b82f6',
                color: 'white',
                cursor: api.loading ? 'not-allowed' : 'pointer',
                fontWeight: '600'
              }}
            >
              {api.loading ? 'Generando...' : 'Generar Reporte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}