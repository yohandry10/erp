'use client'

import { useState } from 'react'
import { useApiCall } from '@/hooks/use-api'

const getCurrentPeriod = () => new Date().toISOString().slice(0, 7)

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

interface SireReportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function SireReportModal({ isOpen, onClose, onSuccess }: SireReportModalProps) {
  const [formData, setFormData] = useState({
    tipoReporte: 'REGISTRO_VENTAS',
    periodo: getCurrentPeriod(),
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
      showToast(`✅ ${response.message || 'Reporte SIRE generado exitosamente'}`)

      onSuccess()
      onClose()
      setFormData({
        tipoReporte: 'REGISTRO_VENTAS',
        periodo: getCurrentPeriod(),
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
      showToast(`❌ ${response?.message || 'Error al generar reporte SIRE'}`)
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
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.5)] flex items-center justify-center z-[1100]">
      <div className="bg-card rounded-xl p-8 w-[90%] max-w-[500px] overflow-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-foreground">Generar Reporte SIRE</h2>
          <button
            onClick={onClose} className="border-0 text-2xl cursor-pointer text-muted-foreground"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 mb-6">
            <div>
              <label htmlFor="sire-report-modal-tipo-reporte" className="block mb-2 font-semibold text-foreground/85">
                Tipo de Reporte *
              </label>
              <select id="sire-report-modal-tipo-reporte"
                name="tipoReporte"
                value={formData.tipoReporte}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              >
                <option value="REGISTRO_VENTAS">Registro de Ventas</option>
                <option value="REGISTRO_COMPRAS">Registro de Compras</option>
              </select>
            </div>

            <div>
              <label htmlFor="sire-report-modal-periodo" className="block mb-2 font-semibold text-foreground/85">
                Período *
              </label>
              <input id="sire-report-modal-periodo"
                type="month"
                name="periodo"
                value={formData.periodo}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label htmlFor="sire-report-modal-formato" className="block mb-2 font-semibold text-foreground/85">
                Formato *
              </label>
              <select id="sire-report-modal-formato"
                name="formato"
                value={formData.formato}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              >
                <option value="TXT">TXT</option>
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
              <label htmlFor="incluirAnulados" className="font-semibold text-foreground/85 cursor-pointer">
                Incluir documentos anulados
              </label>
            </div>
          </div>

          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={onClose} className="py-3 px-6 border rounded-[6px] bg-card text-foreground/85 cursor-pointer font-semibold"
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
