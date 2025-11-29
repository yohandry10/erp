'use client'

import React, { useState } from 'react'
import { useApi } from '@/hooks/use-api'

type Props = {
  onCreated: (cliente: any) => void
}

export const QuickClient: React.FC<Props> = ({ onCreated }) => {
  const { post } = useApi()
  const [form, setForm] = useState({
    nombre: '',
    numero_documento: '',
    tipo_documento: 'DNI',
    email: '',
  })
  const [loading, setLoading] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)

  const handleChange = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleLookup = async () => {
    if (form.tipo_documento !== 'DNI' || form.numero_documento.length !== 8) {
      alert('Para autocompletar, selecciona DNI y escribe 8 dígitos')
      return
    }
    setLookupLoading(true)
    try {
      const resp = await post('/api/validations/dni-lookup', { dni: form.numero_documento })
      if (resp) {
        setForm(prev => ({
          ...prev,
          nombre: resp.nombreCompleto || `${resp.nombres || ''} ${resp.apellidoPaterno || ''} ${resp.apellidoMaterno || ''}`.trim(),
        }))
      } else {
        alert('No se encontró información de DNI')
      }
    } catch (e) {
      console.error('Error consultando DNI', e)
      alert('No se pudo consultar el DNI')
    } finally {
      setLookupLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!form.nombre || !form.numero_documento) {
      alert('Completa nombre y documento')
      return
    }
    setLoading(true)
    try {
      const resp = await post('/api/pos/clientes', {
        tipo_documento: form.tipo_documento,
        numero_documento: form.numero_documento,
        razon_social: form.nombre,
        nombre_comercial: form.nombre,
        email: form.email || undefined,
      })
      if (resp?.success && resp?.data) {
        onCreated(resp.data)
        setForm({ nombre: '', numero_documento: '', tipo_documento: 'DNI', email: '' })
        alert('Cliente creado rápidamente')
      } else {
        alert('No se pudo crear el cliente')
      }
    } catch (e) {
      console.error('Error creando cliente rápido', e)
      alert('Error creando cliente')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="stat-card" style={{ padding: '1rem', gap: '0.5rem', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          placeholder="Nombre/Razón Social"
          value={form.nombre}
          onChange={(e) => handleChange('nombre', e.target.value)}
          className="input"
        />
        <select
          value={form.tipo_documento}
          onChange={(e) => handleChange('tipo_documento', e.target.value)}
          className="input"
          style={{ maxWidth: '110px' }}
        >
          <option value="DNI">DNI</option>
          <option value="RUC">RUC</option>
          <option value="CE">CE</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          placeholder="Documento"
          value={form.numero_documento}
          onChange={(e) => handleChange('numero_documento', e.target.value)}
          className="input"
          style={{ flex: 1 }}
        />
      </div>
      <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
        {loading ? 'Creando...' : 'Cliente rápido'}
      </button>
    </div>
  )
}
