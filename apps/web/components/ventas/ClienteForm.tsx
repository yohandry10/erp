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
import { useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { toast } from '@/components/ui/use-toast'
import { useCountryContext } from '@/hooks/use-country-context'
import { validateArgentinaCuit, validateCountryTaxId } from '@/lib/country-tax-id'

// Validation schema with Zod
const clienteSchema = z.object({
  tipo: z.nativeEnum(TipoCliente, {
    errorMap: () => ({ message: 'Seleccione un tipo de cliente' })
  }),
  documento_tipo: z.nativeEnum(TipoDocumento, {
    errorMap: () => ({ message: 'Seleccione un tipo de documento' })
  }),
  documento_numero: z.string()
    .min(6, 'El documento debe tener al menos 6 caracteres')
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
  if ([TipoDocumento.RUC, TipoDocumento.CUIT].includes(data.documento_tipo)) {
    return data.documento_numero.length === 11 && /^\d+$/.test(data.documento_numero)
  }
  if (data.documento_tipo === TipoDocumento.NIT) {
    return data.documento_numero.length === 10 && /^\d+$/.test(data.documento_numero)
  }
  if ([TipoDocumento.CC, TipoDocumento.TI].includes(data.documento_tipo)) {
    return /^[0-9]{6,10}$/.test(data.documento_numero)
  }
  // DNI validation: must be 8 digits
  if (data.documento_tipo === TipoDocumento.DNI) {
    return data.documento_numero.length === 8 && /^\d+$/.test(data.documento_numero)
  }
  return true
}, {
  message: 'El documento no tiene la longitud o formato requerido',
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
  const country = useCountryContext()
  const isArgentina = country.paisCodigo === 'AR'
  const isColombia = country.paisCodigo === 'CO'
  const { post, unwrap } = useApi()
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
      documento_tipo: initialData?.documento_tipo || (isColombia ? TipoDocumento.CC : TipoDocumento.DNI),
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
  const documentoTipoField = register('documento_tipo')
  const documentoNumeroField = register('documento_numero')
  const loading = isSubmitting || externalLoading

  // El país llega de forma asíncrona. No dejes el DNI peruano que se usó
  // durante el primer render como valor por defecto de un tenant CO/AR.
  useEffect(() => {
    if (country.loading || initialData?.documento_tipo) return
    const expectedDefault = isColombia
      ? TipoDocumento.CC
      : isArgentina
        ? TipoDocumento.DNI
        : TipoDocumento.DNI
    setValue('documento_tipo', expectedDefault)
    setValue('documento_numero', '')
    setRucValidated(false)
  }, [country.loading, country.paisCodigo, initialData?.documento_tipo, isArgentina, isColombia, setValue])

  const handleValidarRuc = async () => {
    if (![TipoDocumento.RUC, TipoDocumento.CUIT, TipoDocumento.NIT].includes(documentoTipo)) {
      toast({
        title: 'Error',
        description: 'La validación local solo aplica a RUC/CUIT/NIT',
        variant: 'destructive'
      })
      return
    }

    const expectedLength = documentoTipo === TipoDocumento.NIT ? 10 : 11
    if (documentoNumero.length !== expectedLength) {
      toast({
        title: 'Error',
        description: `El ${isArgentina ? 'CUIT' : isColombia ? 'NIT' : 'RUC'} debe tener ${expectedLength} dígitos`,
        variant: 'destructive'
      })
      return
    }

    try {
      setValidatingRuc(true)
      if (documentoTipo === TipoDocumento.CUIT) {
        if (!validateArgentinaCuit(documentoNumero)) {
          throw new Error('El dígito verificador del CUIT no es válido')
        }
        setRucValidated(true)
        toast({
          title: 'CUIT validado',
          description: 'Formato y dígito verificador válidos. Complete los datos registrales.',
        })
        return
      }
      if (documentoTipo === TipoDocumento.NIT) {
        if (!validateCountryTaxId('CO', documentoNumero)) {
          throw new Error('El dígito de verificación del NIT no es válido')
        }
        setRucValidated(true)
        toast({
          title: 'NIT validado',
          description: 'Formato y dígito de verificación válidos. Complete los datos del RUT.',
        })
        return
      }
      const response = await post('/api/ventas/clientes/validar-ruc', {
        ruc: documentoNumero
      })
      const responseData: any = unwrap(response)

      if (responseData) {
        // Solo autocompletar si el backend confirma una consulta registral real.
        if (responseData.consulta_sunat && responseData.razon_social) {
          setValue('razon_social', responseData.razon_social)
        }
        if (responseData.consulta_sunat && responseData.direccion) {
          setValue('direccion', responseData.direccion)
        }
        if (responseData.consulta_sunat && responseData.nombre_comercial) {
          setValue('nombre_comercial', responseData.nombre_comercial)
        }

        setRucValidated(true)
        toast({
          title: 'RUC Validado',
          description: responseData.consulta_sunat
            ? 'Datos obtenidos de SUNAT correctamente'
            : 'Formato y dígito verificador válidos. Complete los datos registrales manualmente.'
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

  const onFormSubmit = async (data: ClienteFormData) => {
    try {
      const normalizedData = {
        ...data,
        nombre_comercial: data.nombre_comercial?.trim() || undefined,
        direccion: data.direccion?.trim() || undefined,
        email: data.email?.trim() || undefined,
        telefono: data.telefono?.trim() || undefined,
      }

      await onSubmit(normalizedData)
    } catch (error) {
      // Error handling is done in parent component
      console.error('Form submission error:', error)
    }
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} noValidate className="flex flex-col gap-6">
      {/* Tipo de Cliente y Documento */}
      <div className="bg-[var(--primary-50)] p-6 flex flex-col gap-4">
        <h3 className="text-[1.125rem] font-semibold text-[var(--primary-900)] m-0">Información Básica</h3>

        <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-4">
          {/* Tipo de Cliente */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="tipo">Tipo de Cliente *</Label>
            <select
              id="tipo"
              {...register('tipo')} className="w-[100%] py-[0.875rem] px-4 border text-base bg-card text-[var(--primary-800)] cursor-pointer"
              disabled={loading}
            >
              <option value={TipoCliente.PERSONA}>Persona Natural</option>
              <option value={TipoCliente.EMPRESA}>Empresa</option>
            </select>
            {errors.tipo && (
              <p className="text-[0.875rem] text-[var(--red-600)] m-0">
                {errors.tipo.message}
              </p>
            )}
          </div>

          {/* Tipo de Documento */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="documento_tipo">Tipo de Documento *</Label>
            <select
              id="documento_tipo"
              name={documentoTipoField.name}
              ref={documentoTipoField.ref}
              onBlur={documentoTipoField.onBlur} className="w-[100%] py-[0.875rem] px-4 border text-base bg-card text-[var(--primary-800)] cursor-pointer"
              disabled={loading}
              onChange={(event) => {
                documentoTipoField.onChange(event)
                setRucValidated(false)
              }}
            >
              {isColombia ? (
                <>
                  <option value={TipoDocumento.CC}>Cédula de ciudadanía</option>
                  <option value={TipoDocumento.TI}>Tarjeta de identidad</option>
                </>
              ) : (
                <option value={TipoDocumento.DNI}>DNI</option>
              )}
              {isArgentina ? (
                <option value={TipoDocumento.CUIT}>CUIT</option>
              ) : isColombia ? (
                <option value={TipoDocumento.NIT}>NIT</option>
              ) : (
                <option value={TipoDocumento.RUC}>RUC</option>
              )}
              <option value={TipoDocumento.CE}>{isColombia ? 'Cédula de extranjería' : 'Carné de Extranjería'}</option>
              <option value={TipoDocumento.PASAPORTE}>Pasaporte</option>
            </select>
            {errors.documento_tipo && (
              <p className="text-[0.875rem] text-[var(--red-600)] m-0">
                {errors.documento_tipo.message}
              </p>
            )}
          </div>
        </div>

        {/* Número de Documento con validación local de RUC */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="documento_numero">
            Número de Documento *
            {[TipoDocumento.RUC, TipoDocumento.CUIT].includes(documentoTipo) && ' (11 dígitos)'}
            {documentoTipo === TipoDocumento.NIT && ' (10 dígitos, incluido DV)'}
            {documentoTipo === TipoDocumento.DNI && ' (8 dígitos)'}
          </Label>
          <div className="flex gap-2">
            <div className="flex-[1]">
              <Input
                id="documento_numero"
                name={documentoNumeroField.name}
                ref={documentoNumeroField.ref}
                onBlur={documentoNumeroField.onBlur}
                placeholder={
                  documentoTipo === TipoDocumento.CUIT ? '30710158229' :
                  documentoTipo === TipoDocumento.NIT ? '9001234568' :
                  documentoTipo === TipoDocumento.RUC ? '20123456789' :
                  documentoTipo === TipoDocumento.DNI ? '12345678' :
                  'Número de documento'
                }
                disabled={loading}
                onChange={(event) => {
                  documentoNumeroField.onChange(event)
                  setRucValidated(false)
                }}
              />
            </div>
            {[TipoDocumento.RUC, TipoDocumento.CUIT, TipoDocumento.NIT].includes(documentoTipo) && (
              <Button
                type="button"
                variant="outline"
                onClick={handleValidarRuc}
                disabled={loading || validatingRuc || documentoNumero.length !== (documentoTipo === TipoDocumento.NIT ? 10 : 11)} className="whitespace-nowrap"
              >
                {validatingRuc ? (
                  <>
                    <Loader2 className="animate-spin w-4 h-4 mr-2" />
                    Validando...
                  </>
                ) : rucValidated ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2 text-[var(--emerald-600)]" />
                    Validado
                  </>
                ) : (
                    `Validar ${documentoTipo}`
                )}
              </Button>
            )}
          </div>
          {errors.documento_numero && (
            <p className="text-[0.875rem] text-[var(--red-600)] m-0">
              {errors.documento_numero.message}
            </p>
          )}
          {[TipoDocumento.RUC, TipoDocumento.CUIT, TipoDocumento.NIT].includes(documentoTipo) && (
            <p className="text-xs text-[var(--primary-500)] m-0">
              Valida formato y dígito verificador. No consulta el padrón de {isArgentina ? 'ARCA' : isColombia ? 'DIAN/RUT' : 'SUNAT'}.
            </p>
          )}
        </div>
      </div>

      {/* Datos del Cliente */}
      <div className="bg-[var(--primary-50)] p-6 flex flex-col gap-4">
        <h3 className="text-[1.125rem] font-semibold text-[var(--primary-900)] m-0">Datos del Cliente</h3>

        <div className="flex flex-col gap-4">
          {/* Razón Social */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="razon_social">Razón Social / Nombre Completo *</Label>
            <Input
              id="razon_social"
              {...register('razon_social')}
              placeholder="Nombre completo o razón social de la empresa"
              disabled={loading}
            />
            {errors.razon_social && (
              <p className="text-[0.875rem] text-[var(--red-600)] m-0">
                {errors.razon_social.message}
              </p>
            )}
          </div>

          {/* Nombre Comercial */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="nombre_comercial">Nombre Comercial (Opcional)</Label>
            <Input
              id="nombre_comercial"
              {...register('nombre_comercial')}
              placeholder="Nombre comercial o marca"
              disabled={loading}
            />
            {errors.nombre_comercial && (
              <p className="text-[0.875rem] text-[var(--red-600)] m-0">
                {errors.nombre_comercial.message}
              </p>
            )}
          </div>

          {/* Dirección */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="direccion">Dirección (Opcional)</Label>
            <Textarea
              id="direccion"
              {...register('direccion')}
              placeholder="Dirección completa"
              rows={3}
              disabled={loading}
            />
            {errors.direccion && (
              <p className="text-[0.875rem] text-[var(--red-600)] m-0">
                {errors.direccion.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Datos de Contacto */}
      <div className="bg-[var(--primary-50)] p-6 flex flex-col gap-4">
        <h3 className="text-[1.125rem] font-semibold text-[var(--primary-900)] m-0">Datos de Contacto</h3>

        <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-4">
          {/* Email */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email (Opcional)</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              placeholder="correo@ejemplo.com"
              disabled={loading}
            />
            {errors.email && (
              <p className="text-[0.875rem] text-[var(--red-600)] m-0">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Teléfono */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="telefono">Teléfono (Opcional)</Label>
            <Input
              id="telefono"
              {...register('telefono')}
              placeholder={isColombia ? '300 123 4567' : isArgentina ? '11 1234 5678' : '999 999 999'}
              disabled={loading}
            />
            {errors.telefono && (
              <p className="text-[0.875rem] text-[var(--red-600)] m-0">
                {errors.telefono.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
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
          disabled={loading} className="bg-[var(--gradient-primary)] text-white"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin w-4 h-4 mr-2" />
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
