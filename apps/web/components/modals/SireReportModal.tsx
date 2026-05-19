'use client'

import { useState } from 'react'
import { useApiCall } from '@/hooks/use-api'

const getCurrentPeriod = () => new Date().toISOString().slice(0, 7)

interface SireReportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function SireReportModal({ isOpen, onClose, onSuccess }: SireReportModalProps) {
  const [formData, setFormData] = useState({
    tipoReporte: 'REGISTRO_VENTAS',
    periodo: getCurrentPeriod(),
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
          <div>
            ✅ ${response.message || 'Reporte SIRE generado exitosamente'}
          </div>
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
        periodo: getCurrentPeriod(),
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
          <div>
            ❌ ${response?.message || 'Error al generar reporte SIRE'}
          </div>
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
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.5)] flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-3 p-8 w-[90%] max-w-[500px] overflow-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-6 font-semibold text-gray-800">Generar Reporte SIRE</h2>
          <button
            onClick={onClose} className="border-0 text-6 cursor-pointer text-gray-500"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 mb-6">
            <div>
              <label className="block mb-2 font-semibold text-gray-700">
                Tipo de Reporte *
              </label>
              <select
                name="tipoReporte"
                value={formData.tipoReporte}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-3.5"
              >
                <option value="REGISTRO_VENTAS">Registro de Ventas</option>
                <option value="REGISTRO_COMPRAS">Registro de Compras</option>
                <option value="LIBROS_ELECTRONICOS">Libros Electrónicos</option>
                <option value="RETENCIONES">Retenciones</option>
              </select>
            </div>

            <div>
              <label className="block mb-2 font-semibold text-gray-700">
                Período *
              </label>
              <input
                type="month"
                name="periodo"
                value={formData.periodo}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-3.5"
              />
            </div>

            <div className="grid grid-cols-[1fr_1fr] gap-4">
              <div>
                <label className="block mb-2 font-semibold text-gray-700">
                  Fecha Inicio
                </label>
                <input
                  type="date"
                  name="fechaInicio"
                  value={formData.fechaInicio}
                  onChange={handleChange} className="w-[100%] p-3 border rounded-[6px] text-3.5"
                />
              </div>

              <div>
                <label className="block mb-2 font-semibold text-gray-700">
                  Fecha Fin
                </label>
                <input
                  type="date"
                  name="fechaFin"
                  value={formData.fechaFin}
                  onChange={handleChange} className="w-[100%] p-3 border rounded-[6px] text-3.5"
                />
              </div>
            </div>

            <div>
              <label className="block mb-2 font-semibold text-gray-700">
                Formato *
              </label>
              <select
                name="formato"
                value={formData.formato}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-3.5"
              >
                <option value="TXT">TXT</option>
                <option value="XML">XML</option>
                <option value="EXCEL">Excel</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="incluirAnulados"
                checked={formData.incluirAnulados}
                onChange={handleChange}
                id="incluirAnulados" className="w-auto"
              />
              <label htmlFor="incluirAnulados" className="font-semibold text-gray-700 cursor-pointer">
                Incluir documentos anulados
              </label>
            </div>
          </div>

          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={onClose} className="py-3 px-6 border rounded-[6px] bg-white text-gray-700 cursor-pointer font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={api.loading} className="py-3 px-6 border-0 rounded-[6px] text-white font-semibold"
            >
              {api.loading ? 'Generando...' : 'Generar Reporte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
