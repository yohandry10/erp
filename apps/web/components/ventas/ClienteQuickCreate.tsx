'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { TipoCliente, TipoDocumento, Cliente } from '@/types/ventas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, CheckCircle2, Loader2 } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { toast } from '@/components/ui/use-toast'

// Simplified validation schema for quick create
const quickClienteSchema = z.object({
  tipo: z.nativeEnum(TipoCliente),
  documento_tipo: z.nativeEnum(TipoDocumento),
  documento_numero: z.string()
    .min(8, 'Mínimo 8 caracteres')
    .max(20, 'Máximo 20 caracteres')
    .regex(/^[0-9A-Z]+$/, 'Solo números y letras mayúsculas'),
  razon_social: z.string()
    .min(3, 'Mínimo 3 caracteres')
    .max(255, 'Máximo 255 caracteres')
}).refine((data) => {
  if (data.documento_tipo === TipoDocumento.RUC) {
    return data.documento_numero.length === 11 && /^\d+$/.test(data.documento_numero)
  }
  if (data.documento_tipo === TipoDocumento.DNI) {
    return data.documento_numero.length === 8 && /^\d+$/.test(data.documento_numero)
  }
  return true
}, {
  message: 'RUC debe tener 11 dígitos y DNI debe tener 8 dígitos',
  path: ['documento_numero']
})

type QuickClienteFormData = z.infer<typeof quickClienteSchema>

interface ClienteQuickCreateProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (cliente: Cliente) => void
}

export default function ClienteQuickCreate({
  isOpen,
  onClose,
  onSuccess
}: ClienteQuickCreateProps) {
  const { post } = useApi()
  const [validatingRuc, setValidatingRuc] = useState(false)
  const [rucValidated, setRucValidated] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<QuickClienteFormData>({
    resolver: zodResolver(quickClienteSchema),
    defaultValues: {
      tipo: TipoCliente.PERSONA,
      documento_tipo: TipoDocumento.DNI,
      documento_numero: '',
      razon_social: ''
    }
  })

  const documentoTipo = watch('documento_tipo')
  const documentoNumero = watch('documento_numero')

  const handleValidarRuc = async () => {
    if (documentoTipo !== TipoDocumento.RUC || documentoNumero.length !== 11) {
      toast({
        title: 'Error',
        description: 'El RUC debe tener 11 dígitos',
        variant: 'destructive'
      })
      return
    }

    try {
      setValidatingRuc(true)
      const response = await post('/api/ventas/clientes/validar-ruc', {
        ruc: documentoNumero
      })

      if (response?.success && response.data) {
        if (response.data.razon_social) {
          setValue('razon_social', response.data.razon_social)
        }
        setRucValidated(true)
        toast({
          title: 'RUC Validado',
          description: 'Datos obtenidos de SUNAT'
        })
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo validar el RUC',
        variant: 'destructive'
      })
    } finally {
      setValidatingRuc(false)
    }
  }

  const onSubmit = async (data: QuickClienteFormData) => {
    try {
      const response = await post('/api/ventas/clientes', data)
      
      if (response?.success && response.data) {
        toast({
          title: 'Cliente creado',
          description: `${data.razon_social} creado exitosamente`
        })
        onSuccess(response.data)
        handleClose()
      } else {
        throw new Error(response?.error || 'Error al crear cliente')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear el cliente',
        variant: 'destructive'
      })
    }
  }

  const handleClose = () => {
    reset()
    setRucValidated(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose()
        }
      }}
    >
      <div 
        className="bg-white rounded-lg shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Crear Cliente Rápido
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isSubmitting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {/* Tipo de Cliente */}
          <div className="space-y-2">
            <Label htmlFor="quick-tipo">Tipo de Cliente *</Label>
            <select
              id="quick-tipo"
              {...register('tipo')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSubmitting}
            >
              <option value={TipoCliente.PERSONA}>Persona Natural</option>
              <option value={TipoCliente.EMPRESA}>Empresa</option>
            </select>
            {errors.tipo && (
              <p className="text-sm text-red-600">{errors.tipo.message}</p>
            )}
          </div>

          {/* Tipo de Documento */}
          <div className="space-y-2">
            <Label htmlFor="quick-documento-tipo">Tipo de Documento *</Label>
            <select
              id="quick-documento-tipo"
              {...register('documento_tipo')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSubmitting}
              onChange={() => setRucValidated(false)}
            >
              <option value={TipoDocumento.DNI}>DNI</option>
              <option value={TipoDocumento.RUC}>RUC</option>
              <option value={TipoDocumento.CE}>Carné de Extranjería</option>
              <option value={TipoDocumento.PASAPORTE}>Pasaporte</option>
            </select>
            {errors.documento_tipo && (
              <p className="text-sm text-red-600">{errors.documento_tipo.message}</p>
            )}
          </div>

          {/* Número de Documento */}
          <div className="space-y-2">
            <Label htmlFor="quick-documento-numero">
              Número de Documento *
              {documentoTipo === TipoDocumento.RUC && ' (11 dígitos)'}
              {documentoTipo === TipoDocumento.DNI && ' (8 dígitos)'}
            </Label>
            <div className="flex gap-2">
              <Input
                id="quick-documento-numero"
                {...register('documento_numero')}
                placeholder={
                  documentoTipo === TipoDocumento.RUC ? '20123456789' :
                  documentoTipo === TipoDocumento.DNI ? '12345678' :
                  'Número de documento'
                }
                disabled={isSubmitting}
                onChange={() => setRucValidated(false)}
              />
              {documentoTipo === TipoDocumento.RUC && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleValidarRuc}
                  disabled={isSubmitting || validatingRuc || documentoNumero.length !== 11}
                  className="whitespace-nowrap"
                >
                  {validatingRuc ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : rucValidated ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : (
                    'Validar'
                  )}
                </Button>
              )}
            </div>
            {errors.documento_numero && (
              <p className="text-sm text-red-600">{errors.documento_numero.message}</p>
            )}
          </div>

          {/* Razón Social / Nombre */}
          <div className="space-y-2">
            <Label htmlFor="quick-razon-social">
              Razón Social / Nombre Completo *
            </Label>
            <Input
              id="quick-razon-social"
              {...register('razon_social')}
              placeholder="Nombre completo o razón social"
              disabled={isSubmitting}
            />
            {errors.razon_social && (
              <p className="text-sm text-red-600">{errors.razon_social.message}</p>
            )}
          </div>

          {/* Info Message */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-sm text-blue-800">
              Este formulario crea un cliente con datos mínimos. Puedes completar más información después desde el detalle del cliente.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                'Crear Cliente'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
