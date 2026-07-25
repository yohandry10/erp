'use client'

import React, { useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

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
      const resp = await post('/api/ventas/clientes', {
        tipo: form.tipo_documento === 'RUC' ? 'EMPRESA' : 'PERSONA',
        documento_tipo: form.tipo_documento,
        documento_numero: form.numero_documento.toUpperCase(),
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
    <Card className="border-border bg-card text-card-foreground">
      <CardContent className="flex flex-col gap-2 p-4">
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Nombre/Razón Social"
          value={form.nombre}
          onChange={(e) => handleChange('nombre', e.target.value)}
        />
        <select
          value={form.tipo_documento}
          onChange={(e) => handleChange('tipo_documento', e.target.value)}
          className="h-10 max-w-[110px] rounded-md border border-input bg-background px-3 text-sm text-foreground"
        >
          <option value="DNI">DNI</option>
          <option value="RUC">RUC</option>
          <option value="CE">CE</option>
        </select>
      </div>
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Documento"
          value={form.numero_documento}
          onChange={(e) => handleChange('numero_documento', e.target.value)}
          className="flex-1"
        />
      </div>
      <Button type="button" onClick={handleSubmit} disabled={loading}>
        {loading ? 'Creando...' : 'Cliente rápido'}
      </Button>
      </CardContent>
    </Card>
  )
}
