'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { CreateProveedorDto } from '@/types/compras'
import { Building2, Mail, Phone, MapPin, User, CreditCard, Calendar } from 'lucide-react'
import { useCountryContext } from '@/hooks/use-country-context'

// Validation schema matching backend DTO
const proveedorSchema = z.object({
  ruc: z.string()
    .min(1, 'El identificador fiscal es requerido')
    .regex(
      /^(?:\d{10,11}|\d{9,10}-\d)$/,
      'Use el formato fiscal correspondiente al país (RUC, CUIT o NIT con dígito de verificación)',
    ),
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
  const country = useCountryContext()
  const taxIdLabel =
    country.paisCodigo === 'AR' ? 'CUIT' : country.paisCodigo === 'CO' ? 'NIT' : 'RUC'
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
      dias_credito: initialData?.dias_credito || 0
    }
  })

  const condicionesPago = watch('condiciones_pago')

  const onFormSubmit = async (data: ProveedorFormData) => {
    await onSubmit(data as CreateProveedorDto)
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6" noValidate>
      {/* Información Básica */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
        <h3 className="text-[1.125rem] font-semibold mb-6 flex items-center gap-2">
          <Building2 size={20} />
          Información Básica
        </h3>

        <div className="grid grid-cols-[repeat(auto-fit,_minmax(300px,_1fr))] gap-6">
          {/* RUC */}
          <div>
            <label className="block text-[0.875rem] font-medium mb-2 text-foreground/85">
              {taxIdLabel} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              {...register('ruc')}
              placeholder={country.paisCodigo === 'AR' ? '30710158229' : country.paisCodigo === 'CO' ? '900123456-8' : '20123456789'} className="w-[100%] p-3 rounded-lg text-[0.875rem]"
            />
            {errors.ruc && (
              <p className="text-red-500 text-xs mt-1">
                {errors.ruc.message}
              </p>
            )}
          </div>

          {/* Razón Social */}
          <div>
            <label className="block text-[0.875rem] font-medium mb-2 text-foreground/85">
              Razón Social <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              {...register('razon_social')}
              placeholder={country.paisCodigo === 'CO' ? 'DISTRIBUIDORA ABC S.A.S.' : country.paisCodigo === 'AR' ? 'DISTRIBUIDORA ABC S.A.' : 'DISTRIBUIDORA ABC S.A.C.'} className="w-[100%] p-3 rounded-lg text-[0.875rem]"
            />
            {errors.razon_social && (
              <p className="text-red-500 text-xs mt-1">
                {errors.razon_social.message}
              </p>
            )}
          </div>

          {/* Nombre Comercial */}
          <div>
            <label className="block text-[0.875rem] font-medium mb-2 text-foreground/85">
              Nombre Comercial
            </label>
            <input
              type="text"
              {...register('nombre_comercial')}
              placeholder="ABC Distribuidora" className="w-[100%] p-3 rounded-lg text-[0.875rem]"
            />
            {errors.nombre_comercial && (
              <p className="text-red-500 text-xs mt-1">
                {errors.nombre_comercial.message}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-[0.875rem] font-medium mb-2 text-foreground/85">
              Email <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Mail
                size={16} className="absolute left-3 top-[50%] -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="email"
                {...register('email')}
                placeholder="contacto@abc.com" className="w-[100%] pt-3 pr-3 pb-3 pl-10 rounded-lg text-[0.875rem]"
              />
            </div>
            {errors.email && (
              <p className="text-red-500 text-xs mt-1">
                {errors.email.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Información de Contacto */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
        <h3 className="text-[1.125rem] font-semibold mb-6 flex items-center gap-2">
          <User size={20} />
          Información de Contacto
        </h3>

        <div className="grid grid-cols-[repeat(auto-fit,_minmax(300px,_1fr))] gap-6">
          {/* Contacto */}
          <div>
            <label className="block text-[0.875rem] font-medium mb-2 text-foreground/85">
              Nombre del Contacto
            </label>
            <input
              type="text"
              {...register('contacto')}
              placeholder="Juan Pérez" className="w-[100%] p-3 rounded-lg text-[0.875rem]"
            />
            {errors.contacto && (
              <p className="text-red-500 text-xs mt-1">
                {errors.contacto.message}
              </p>
            )}
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-[0.875rem] font-medium mb-2 text-foreground/85">
              Teléfono
            </label>
            <div className="relative">
              <Phone
                size={16} className="absolute left-3 top-[50%] -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                {...register('telefono')}
                placeholder={country.paisCodigo === 'CO' ? '+57 300 123 4567' : country.paisCodigo === 'AR' ? '+54 11 5555 5555' : '+51 999 888 777'} className="w-[100%] pt-3 pr-3 pb-3 pl-10 rounded-lg text-[0.875rem]"
              />
            </div>
            {errors.telefono && (
              <p className="text-red-500 text-xs mt-1">
                {errors.telefono.message}
              </p>
            )}
          </div>

          {/* Dirección */}
          <div>
            <label className="block text-[0.875rem] font-medium mb-2 text-foreground/85">
              Dirección
            </label>
            <div className="relative">
              <MapPin
                size={16} className="absolute left-3 top-3 text-muted-foreground"
              />
              <textarea
                {...register('direccion')}
                placeholder={country.paisCodigo === 'CO' ? 'Carrera 7 # 72-41, Bogotá D.C.' : country.paisCodigo === 'AR' ? 'Av. Corrientes 1234, CABA' : 'Av. Principal 123, Lima'}
                rows={2} className="w-[100%] pt-3 pr-3 pb-3 pl-10 rounded-lg text-[0.875rem]"
              />
            </div>
            {errors.direccion && (
              <p className="text-red-500 text-xs mt-1">
                {errors.direccion.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Condiciones Comerciales */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
        <h3 className="text-[1.125rem] font-semibold mb-6 flex items-center gap-2">
          <CreditCard size={20} />
          Condiciones Comerciales
        </h3>

        <div className="grid grid-cols-[repeat(auto-fit,_minmax(300px,_1fr))] gap-6">
          {/* Condiciones de Pago */}
          <div>
            <label className="block text-[0.875rem] font-medium mb-2 text-foreground/85">
              Condiciones de Pago
            </label>
            <select
              {...register('condiciones_pago')} className="w-[100%] p-3 rounded-lg text-[0.875rem] bg-card"
            >
              <option value="CONTADO">Contado</option>
              <option value="CREDITO_15">Crédito 15 días</option>
              <option value="CREDITO_30">Crédito 30 días</option>
              <option value="CREDITO_45">Crédito 45 días</option>
              <option value="CREDITO_60">Crédito 60 días</option>
              <option value="CREDITO_90">Crédito 90 días</option>
            </select>
            {errors.condiciones_pago && (
              <p className="text-red-500 text-xs mt-1">
                {errors.condiciones_pago.message}
              </p>
            )}
          </div>

          {/* Límite de Crédito */}
          <div>
            <label className="block text-[0.875rem] font-medium mb-2 text-foreground/85">
              Límite de Crédito ({country.moneda})
            </label>
            <input
              type="number"
              step="0.01"
              {...register('limite_credito', { valueAsNumber: true })}
              placeholder="0.00" className="w-[100%] p-3 rounded-lg text-[0.875rem]"
              disabled={condicionesPago === 'CONTADO'}
            />
            {errors.limite_credito && (
              <p className="text-red-500 text-xs mt-1">
                {errors.limite_credito.message}
              </p>
            )}
            {condicionesPago === 'CONTADO' && (
              <p className="text-muted-foreground text-xs mt-1">
                No aplica para pagos al contado
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-4 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading} className="py-3 px-6 rounded-lg border bg-card text-foreground/85 text-[0.875rem] font-medium"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 py-3 px-6"
        >
          {isLoading ? 'Guardando...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
