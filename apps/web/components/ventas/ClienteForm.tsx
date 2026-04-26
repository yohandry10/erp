'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { TipoCliente, TipoDocumento, Cliente } from '@/types/ventas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { toast } from '@/components/ui/use-toast'

// Validation schema with Zod
const clienteSchema = z.object({
  tipo: z.nativeEnum(TipoCliente, {
    errorMap: () => ({ message: 'Seleccione un tipo de cliente' })
  }),
  documento_tipo: z.nativeEnum(TipoDocumento, {
    errorMap: () => ({ message: 'Seleccione un tipo de documento' })
  }),
  documento_numero: z.string()
    .min(8, 'El documento debe tener al menos 8 caracteres')
    .max(20, 'El documento no puede exceder 20 caracteres')
    .regex(/^[0-9A-Z]+$/, 'Solo se permiten números y letras mayúsculas'),
  razon_social: z.string()
    .min(3, 'La razón social debe tener al menos 3 caracteres')
    .max(255, 'La razón social no puede exceder 255 caracteres'),
  nombre_comercial: z.string().max(255).optional().or(z.literal('')),
  direccion: z.string().max(500).optional().or(z.literal('')),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  telefono: z.string()
    .min(6, 'El teléfono debe tener al menos 6 caracteres')
    .max(20, 'El teléfono no puede exceder 20 caracteres')
    .optional()
    .or(z.literal(''))
}).refine((data) => {
  // RUC validation: must be 11 digits
  if (data.documento_tipo === TipoDocumento.RUC) {
    return data.documento_numero.length === 11 && /^\d+$/.test(data.documento_numero)
  }
  // DNI validation: must be 8 digits
  if (data.documento_tipo === TipoDocumento.DNI) {
    return data.documento_numero.length === 8 && /^\d+$/.test(data.documento_numero)
  }
  return true
}, {
  message: 'RUC debe tener 11 dígitos y DNI debe tener 8 dígitos',
  path: ['documento_numero']
})

type ClienteFormData = z.infer<typeof clienteSchema>

interface ClienteFormProps {
  initialData?: Partial<Cliente>
  onSubmit: (data: ClienteFormData) => Promise<void>
  onCancel?: () => void
  submitLabel?: string
  loading?: boolean
}

export default function ClienteForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = 'Guardar Cliente',
  loading: externalLoading = false
}: ClienteFormProps) {
  const { post } = useApi()
  const [validatingRuc, setValidatingRuc] = useState(false)
  const [rucValidated, setRucValidated] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      tipo: initialData?.tipo || TipoCliente.PERSONA,
      documento_tipo: initialData?.documento_tipo || TipoDocumento.DNI,
      documento_numero: initialData?.documento_numero || '',
      razon_social: initialData?.razon_social || '',
      nombre_comercial: initialData?.nombre_comercial || '',
      direccion: initialData?.direccion || '',
      email: initialData?.email || '',
      telefono: initialData?.telefono || ''
    }
  })

  const documentoTipo = watch('documento_tipo')
  const documentoNumero = watch('documento_numero')
  const loading = isSubmitting || externalLoading

  const handleValidarRuc = async () => {
    if (documentoTipo !== TipoDocumento.RUC) {
      toast({
        title: 'Error',
        description: 'Solo se puede validar RUC',
        variant: 'destructive'
      })
      return
    }

    if (documentoNumero.length !== 11) {
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
        // Auto-fill form with SUNAT data
        if (response.data.razon_social) {
          setValue('razon_social', response.data.razon_social)
        }
        if (response.data.direccion) {
          setValue('direccion', response.data.direccion)
        }
        if (response.data.nombre_comercial) {
          setValue('nombre_comercial', response.data.nombre_comercial)
        }
        
        setRucValidated(true)
        toast({
          title: 'RUC Validado',
          description: 'Datos obtenidos de SUNAT correctamente'
        })
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo validar el RUC con SUNAT',
        variant: 'destructive'
      })
    } finally {
      setValidatingRuc(false)
    }
  }

  const onFormSubmit = async (data: ClienteFormData) => {
    try {
      await onSubmit(data)
    } catch (error) {
      // Error handling is done in parent component
      console.error('Form submission error:', error)
    }
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Tipo de Cliente y Documento */}
      <div style={{
        background: 'var(--primary-50)',
        padding: '1.5rem',
        borderRadius: 'var(--border-radius)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <h3 style={{
          fontSize: '1.125rem',
          fontWeight: '600',
          color: 'var(--primary-900)',
          margin: 0
        }}>Información Básica</h3>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1rem'
        }}>
          {/* Tipo de Cliente */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label htmlFor="tipo">Tipo de Cliente *</Label>
            <select
              id="tipo"
              {...register('tipo')}
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                border: '1px solid var(--primary-300)',
                borderRadius: 'var(--border-radius)',
                fontSize: '1rem',
                background: 'white',
                color: 'var(--primary-800)',
                cursor: 'pointer'
              }}
              disabled={loading}
            >
              <option value={TipoCliente.PERSONA}>Persona Natural</option>
              <option value={TipoCliente.EMPRESA}>Empresa</option>
            </select>
            {errors.tipo && (
              <p style={{ fontSize: '0.875rem', color: 'var(--red-600)', margin: 0 }}>
                {errors.tipo.message}
              </p>
            )}
          </div>

          {/* Tipo de Documento */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label htmlFor="documento_tipo">Tipo de Documento *</Label>
            <select
              id="documento_tipo"
              {...register('documento_tipo')}
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                border: '1px solid var(--primary-300)',
                borderRadius: 'var(--border-radius)',
                fontSize: '1rem',
                background: 'white',
                color: 'var(--primary-800)',
                cursor: 'pointer'
              }}
              disabled={loading}
              onChange={() => setRucValidated(false)}
            >
              <option value={TipoDocumento.DNI}>DNI</option>
              <option value={TipoDocumento.RUC}>RUC</option>
              <option value={TipoDocumento.CE}>Carné de Extranjería</option>
              <option value={TipoDocumento.PASAPORTE}>Pasaporte</option>
            </select>
            {errors.documento_tipo && (
              <p style={{ fontSize: '0.875rem', color: 'var(--red-600)', margin: 0 }}>
                {errors.documento_tipo.message}
              </p>
            )}
          </div>
        </div>

        {/* Número de Documento con Validación SUNAT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Label htmlFor="documento_numero">
            Número de Documento *
            {documentoTipo === TipoDocumento.RUC && ' (11 dígitos)'}
            {documentoTipo === TipoDocumento.DNI && ' (8 dígitos)'}
          </Label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1 }}>
              <Input
                id="documento_numero"
                {...register('documento_numero')}
                placeholder={
                  documentoTipo === TipoDocumento.RUC ? '20123456789' :
                  documentoTipo === TipoDocumento.DNI ? '12345678' :
                  'Número de documento'
                }
                disabled={loading}
                onChange={() => setRucValidated(false)}
              />
            </div>
            {documentoTipo === TipoDocumento.RUC && (
              <Button
                type="button"
                variant="outline"
                onClick={handleValidarRuc}
                disabled={loading || validatingRuc || documentoNumero.length !== 11}
                style={{ whiteSpace: 'nowrap' }}
              >
                {validatingRuc ? (
                  <>
                    <Loader2 style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} className="animate-spin" />
                    Validando...
                  </>
                ) : rucValidated ? (
                  <>
                    <CheckCircle2 style={{ width: '1rem', height: '1rem', marginRight: '0.5rem', color: 'var(--emerald-600)' }} />
                    Validado
                  </>
                ) : (
                  'Validar con SUNAT'
                )}
              </Button>
            )}
          </div>
          {errors.documento_numero && (
            <p style={{ fontSize: '0.875rem', color: 'var(--red-600)', margin: 0 }}>
              {errors.documento_numero.message}
            </p>
          )}
          {documentoTipo === TipoDocumento.RUC && (
            <p style={{ fontSize: '0.75rem', color: 'var(--primary-500)', margin: 0 }}>
              Opcional: Valida el RUC con SUNAT para autocompletar datos
            </p>
          )}
        </div>
      </div>

      {/* Datos del Cliente */}
      <div style={{
        background: 'var(--primary-50)',
        padding: '1.5rem',
        borderRadius: 'var(--border-radius)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <h3 style={{
          fontSize: '1.125rem',
          fontWeight: '600',
          color: 'var(--primary-900)',
          margin: 0
        }}>Datos del Cliente</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Razón Social */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label htmlFor="razon_social">Razón Social / Nombre Completo *</Label>
            <Input
              id="razon_social"
              {...register('razon_social')}
              placeholder="Nombre completo o razón social de la empresa"
              disabled={loading}
            />
            {errors.razon_social && (
              <p style={{ fontSize: '0.875rem', color: 'var(--red-600)', margin: 0 }}>
                {errors.razon_social.message}
              </p>
            )}
          </div>

          {/* Nombre Comercial */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label htmlFor="nombre_comercial">Nombre Comercial (Opcional)</Label>
            <Input
              id="nombre_comercial"
              {...register('nombre_comercial')}
              placeholder="Nombre comercial o marca"
              disabled={loading}
            />
            {errors.nombre_comercial && (
              <p style={{ fontSize: '0.875rem', color: 'var(--red-600)', margin: 0 }}>
                {errors.nombre_comercial.message}
              </p>
            )}
          </div>

          {/* Dirección */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label htmlFor="direccion">Dirección (Opcional)</Label>
            <Textarea
              id="direccion"
              {...register('direccion')}
              placeholder="Dirección completa"
              rows={3}
              disabled={loading}
            />
            {errors.direccion && (
              <p style={{ fontSize: '0.875rem', color: 'var(--red-600)', margin: 0 }}>
                {errors.direccion.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Datos de Contacto */}
      <div style={{
        background: 'var(--primary-50)',
        padding: '1.5rem',
        borderRadius: 'var(--border-radius)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <h3 style={{
          fontSize: '1.125rem',
          fontWeight: '600',
          color: 'var(--primary-900)',
          margin: 0
        }}>Datos de Contacto</h3>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1rem'
        }}>
          {/* Email */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label htmlFor="email">Email (Opcional)</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              placeholder="correo@ejemplo.com"
              disabled={loading}
            />
            {errors.email && (
              <p style={{ fontSize: '0.875rem', color: 'var(--red-600)', margin: 0 }}>
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Teléfono */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label htmlFor="telefono">Teléfono (Opcional)</Label>
            <Input
              id="telefono"
              {...register('telefono')}
              placeholder="999 999 999"
              disabled={loading}
            />
            {errors.telefono && (
              <p style={{ fontSize: '0.875rem', color: 'var(--red-600)', margin: 0 }}>
                {errors.telefono.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '0.75rem',
        paddingTop: '1rem',
        borderTop: '1px solid var(--primary-200)'
      }}>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </Button>
        )}
        <Button
          type="submit"
          disabled={loading}
          style={{
            background: 'var(--gradient-primary)',
            color: 'white'
          }}
        >
          {loading ? (
            <>
              <Loader2 style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} className="animate-spin" />
              Guardando...
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  )
}
