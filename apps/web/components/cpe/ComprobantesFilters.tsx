'use client'

import { useState } from 'react'

interface Props {
  filters: {
    tipoComprobante: string
    estado: string
    fechaDesde: string
    fechaHasta: string
    cliente: string
    serie?: string
    moneda?: string
  }
  onChange: (next: Props['filters']) => void
  onExport: (filters: Props['filters']) => void
}

export function ComprobantesFilters({ filters, onChange, onExport }: Props) {
  const [local, setLocal] = useState(filters)

  const handleChange = (field: keyof typeof local, value: string) => {
    const next = { ...local, [field]: value }
    setLocal(next)
    onChange(next)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
      <input
        className="input"
        placeholder="Cliente / RUC"
        value={local.cliente}
        onChange={(e) => handleChange('cliente', e.target.value)}
      />
      <select
        className="input"
        value={local.tipoComprobante}
        onChange={(e) => handleChange('tipoComprobante', e.target.value)}
      >
        <option value="">Todos los tipos</option>
        <option value="01">Factura</option>
        <option value="03">Boleta</option>
        <option value="07">Nota Crédito</option>
        <option value="08">Nota Débito</option>
      </select>
      <select
        className="input"
        value={local.estado}
        onChange={(e) => handleChange('estado', e.target.value)}
      >
        <option value="">Todos los estados</option>
        <option value="ACEPTADO">Aceptado</option>
        <option value="ENVIADO">Enviado</option>
        <option value="RECHAZADO">Rechazado</option>
        <option value="BORRADOR">Borrador</option>
      </select>
      <input
        type="date"
        className="input"
        value={local.fechaDesde}
        onChange={(e) => handleChange('fechaDesde', e.target.value)}
      />
      <input
        type="date"
        className="input"
        value={local.fechaHasta}
        onChange={(e) => handleChange('fechaHasta', e.target.value)}
      />
      <div className="flex gap-2">
        <button
          className="btn btn-secondary w-full"
          onClick={() => onExport(local)}
        >
          Exportar CSV
        </button>
      </div>
    </div>
  )
}
