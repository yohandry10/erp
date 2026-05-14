'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { CreateProveedorDto } from '@/types/compras'
import { Building2, Mail, Phone, MapPin, User, CreditCard, Calendar } from 'lucide-react'

// Validation schema matching backend DTO
const proveedorSchema = z.object({
  ruc: z.string()
    .min(1, 'El RUC es requerido')
    .regex(/^\d+$/, 'El RUC debe contener solo números')
    .refine((val) => val.length === 11 || val.length === 9, {
      message: 'El RUC debe tener 11 dígitos (Perú) o 9 dígitos (Colombia)'
    }),
  razon_social: z.string()
    .min(3, 'La razón social debe tener al menos 3 caracteres')
    .max(200, 'La razón social debe tener máximo 200 caracteres'),
  nombre_comercial: z.string()
    .max(200, 'El nombre comercial debe tener máximo 200 caracteres')
    .optional(),
  direccion: z.string()
    .max(500, 'La dirección debe tener máximo 500 caracteres')
    .optional(),
  telefono: z.string()
    .max(20, 'El teléfono debe tener máximo 20 caracteres')
    .optional(),
  email: z.string()
    .min(1, 'El email es requerido')
    .email('Debe proporcionar un email válido'),
  contacto: z.string()
    .max(200, 'El nombre del contacto debe tener máximo 200 caracteres')
    .optional(),
  condiciones_pago: z.enum([
    'CONTADO',
    'CREDITO_15',
    'CREDITO_30',
    'CREDITO_45',
    'CREDITO_60',
    'CREDITO_90'
  ]).optional(),
  limite_credito: z.number()
    .min(0, 'El límite de crédito no puede ser negativo')
    .optional(),
  dias_credito: z.number()
    .min(0, 'Los días de crédito no pueden ser negativos')
    .optional()
})

type ProveedorFormData = z.infer<typeof proveedorSchema>

interface ProveedorFormProps {
  initialData?: Partial<CreateProveedorDto>
  onSubmit: (data: CreateProveedorDto) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
  submitLabel?: string
}

export function ProveedorForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  submitLabel = 'Guardar Proveedor'
}: ProveedorFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch
  } = useForm<ProveedorFormData>({
    resolver: zodResolver(proveedorSchema),
    defaultValues: {
      ruc: initialData?.ruc || '',
      razon_social: initialData?.razon_social || '',
      nombre_comercial: initialData?.nombre_comercial || '',
      direccion: initialData?.direccion || '',
      telefono: initialData?.telefono || '',
      email: initialData?.email || '',
      contacto: initialData?.contacto || '',
      condiciones_pago: initialData?.condiciones_pago || 'CONTADO',
      limite_credito: initialData?.limite_credito || 0,
      dias_credito: 0
    }
  })

  const condicionesPago = watch('condiciones_pago')

  const onFormSubmit = async (data: ProveedorFormData) => {
    await onSubmit(data as CreateProveedorDto)
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6" noValidate>
      {/* Información Básica */}
      <div className="activity-card">
        <h3 style={{ 
          fontSize: '1.125rem', 
          fontWeight: '600', 
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <Building2 size={20} />
          Información Básica
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {/* RUC */}
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.875rem', 
              fontWeight: '500', 
              marginBottom: '0.5rem',
              color: '#374151'
            }}>
              RUC <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              {...register('ruc')}
              placeholder="20123456789"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: errors.ruc ? '1px solid #ef4444' : '1px solid #d1d5db',
                fontSize: '0.875rem',
                fontFamily: 'monospace'
              }}
            />
            {errors.ruc && (
              <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {errors.ruc.message}
              </p>
            )}
          </div>

          {/* Razón Social */}
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.875rem', 
              fontWeight: '500', 
              marginBottom: '0.5rem',
              color: '#374151'
            }}>
              Razón Social <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              {...register('razon_social')}
              placeholder="DISTRIBUIDORA ABC S.A.C."
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: errors.razon_social ? '1px solid #ef4444' : '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
            />
            {errors.razon_social && (
              <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {errors.razon_social.message}
              </p>
            )}
          </div>

          {/* Nombre Comercial */}
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.875rem', 
              fontWeight: '500', 
              marginBottom: '0.5rem',
              color: '#374151'
            }}>
              Nombre Comercial
            </label>
            <input
              type="text"
              {...register('nombre_comercial')}
              placeholder="ABC Distribuidora"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: errors.nombre_comercial ? '1px solid #ef4444' : '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
            />
            {errors.nombre_comercial && (
              <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {errors.nombre_comercial.message}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.875rem', 
              fontWeight: '500', 
              marginBottom: '0.5rem',
              color: '#374151'
            }}>
              Email <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <Mail 
                size={16} 
                style={{ 
                  position: 'absolute', 
                  left: '0.75rem', 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
                  color: '#9ca3af' 
                }} 
              />
              <input
                type="email"
                {...register('email')}
                placeholder="contacto@abc.com"
                style={{
                  width: '100%',
                  padding: '0.75rem 0.75rem 0.75rem 2.5rem',
                  borderRadius: '8px',
                  border: errors.email ? '1px solid #ef4444' : '1px solid #d1d5db',
                  fontSize: '0.875rem'
                }}
              />
            </div>
            {errors.email && (
              <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {errors.email.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Información de Contacto */}
      <div className="activity-card">
        <h3 style={{ 
          fontSize: '1.125rem', 
          fontWeight: '600', 
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <User size={20} />
          Información de Contacto
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {/* Contacto */}
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.875rem', 
              fontWeight: '500', 
              marginBottom: '0.5rem',
              color: '#374151'
            }}>
              Nombre del Contacto
            </label>
            <input
              type="text"
              {...register('contacto')}
              placeholder="Juan Pérez"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: errors.contacto ? '1px solid #ef4444' : '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
            />
            {errors.contacto && (
              <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {errors.contacto.message}
              </p>
            )}
          </div>

          {/* Teléfono */}
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.875rem', 
              fontWeight: '500', 
              marginBottom: '0.5rem',
              color: '#374151'
            }}>
              Teléfono
            </label>
            <div style={{ position: 'relative' }}>
              <Phone 
                size={16} 
                style={{ 
                  position: 'absolute', 
                  left: '0.75rem', 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
                  color: '#9ca3af' 
                }} 
              />
              <input
                type="text"
                {...register('telefono')}
                placeholder="+51 999 888 777"
                style={{
                  width: '100%',
                  padding: '0.75rem 0.75rem 0.75rem 2.5rem',
                  borderRadius: '8px',
                  border: errors.telefono ? '1px solid #ef4444' : '1px solid #d1d5db',
                  fontSize: '0.875rem'
                }}
              />
            </div>
            {errors.telefono && (
              <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {errors.telefono.message}
              </p>
            )}
          </div>

          {/* Dirección */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '0.875rem', 
              fontWeight: '500', 
              marginBottom: '0.5rem',
              color: '#374151'
            }}>
              Dirección
            </label>
            <div style={{ position: 'relative' }}>
              <MapPin 
                size={16} 
                style={{ 
                  position: 'absolute', 
                  left: '0.75rem', 
                  top: '0.75rem', 
                  color: '#9ca3af' 
                }} 
              />
              <textarea
                {...register('direccion')}
                placeholder="Av. Principal 123, Lima"
                rows={2}
                style={{
                  width: '100%',
                  padding: '0.75rem 0.75rem 0.75rem 2.5rem',
                  borderRadius: '8px',
                  border: errors.direccion ? '1px solid #ef4444' : '1px solid #d1d5db',
                  fontSize: '0.875rem',
                  resize: 'vertical'
                }}
              />
            </div>
            {errors.direccion && (
              <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {errors.direccion.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Condiciones Comerciales */}
      <div className="activity-card">
        <h3 style={{ 
          fontSize: '1.125rem', 
          fontWeight: '600', 
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <CreditCard size={20} />
          Condiciones Comerciales
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {/* Condiciones de Pago */}
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.875rem', 
              fontWeight: '500', 
              marginBottom: '0.5rem',
              color: '#374151'
            }}>
              Condiciones de Pago
            </label>
            <select
              {...register('condiciones_pago')}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: errors.condiciones_pago ? '1px solid #ef4444' : '1px solid #d1d5db',
                fontSize: '0.875rem',
                background: 'white'
              }}
            >
              <option value="CONTADO">Contado</option>
              <option value="CREDITO_15">Crédito 15 días</option>
              <option value="CREDITO_30">Crédito 30 días</option>
              <option value="CREDITO_45">Crédito 45 días</option>
              <option value="CREDITO_60">Crédito 60 días</option>
              <option value="CREDITO_90">Crédito 90 días</option>
            </select>
            {errors.condiciones_pago && (
              <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {errors.condiciones_pago.message}
              </p>
            )}
          </div>

          {/* Límite de Crédito */}
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.875rem', 
              fontWeight: '500', 
              marginBottom: '0.5rem',
              color: '#374151'
            }}>
              Límite de Crédito (PEN)
            </label>
            <input
              type="number"
              step="0.01"
              {...register('limite_credito', { valueAsNumber: true })}
              placeholder="0.00"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: errors.limite_credito ? '1px solid #ef4444' : '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
              disabled={condicionesPago === 'CONTADO'}
            />
            {errors.limite_credito && (
              <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {errors.limite_credito.message}
              </p>
            )}
            {condicionesPago === 'CONTADO' && (
              <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                No aplica para pagos al contado
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'flex-end', 
        gap: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid rgba(0,0,0,0.1)'
      }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            background: 'white',
            color: '#374151',
            fontSize: '0.875rem',
            fontWeight: '500',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.5 : 1
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="refresh-btn"
          style={{
            padding: '0.75rem 1.5rem',
            opacity: isLoading ? 0.7 : 1,
            cursor: isLoading ? 'not-allowed' : 'pointer'
          }}
        >
          {isLoading ? 'Guardando...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
