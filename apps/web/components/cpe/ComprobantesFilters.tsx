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
    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
      <input
        className="rounded-xl border border-cyan-400/20 bg-slate-950/75 px-3 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10"
        placeholder="Cliente / RUC"
        value={local.cliente}
        onChange={(e) => handleChange('cliente', e.target.value)}
      />
      <select
        className="rounded-xl border border-cyan-400/20 bg-slate-950/75 px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10"
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
        className="rounded-xl border border-cyan-400/20 bg-slate-950/75 px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10"
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
        className="rounded-xl border border-cyan-400/20 bg-slate-950/75 px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10"
        value={local.fechaDesde}
        onChange={(e) => handleChange('fechaDesde', e.target.value)}
      />
      <input
        type="date"
        className="rounded-xl border border-cyan-400/20 bg-slate-950/75 px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10"
        value={local.fechaHasta}
        onChange={(e) => handleChange('fechaHasta', e.target.value)}
      />
      <div className="flex gap-2">
        <button
          className="w-full rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-400/15"
          onClick={() => onExport(local)}
        >
          Exportar CSV
        </button>
      </div>
    </div>
  )
}
