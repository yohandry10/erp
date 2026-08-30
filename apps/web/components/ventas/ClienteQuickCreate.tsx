'use client'

import { useEffect, useState } from 'react'
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
import { useCountryContext } from '@/hooks/use-country-context'
import { validateArgentinaCuit, validateCountryTaxId } from '@/lib/country-tax-id'

// Simplified validation schema for quick create
const quickClienteSchema = z.object({
  tipo: z.nativeEnum(TipoCliente),
  documento_tipo: z.nativeEnum(TipoDocumento),
  documento_numero: z.string()
    .min(6, 'Mínimo 6 caracteres')
    .max(20, 'Máximo 20 caracteres')
    .regex(/^[0-9A-Z]+$/, 'Solo números y letras mayúsculas'),
  razon_social: z.string()
    .min(3, 'Mínimo 3 caracteres')
    .max(255, 'Máximo 255 caracteres'),
  arca_condicion_iva: z.string().max(80).optional()
}).refine((data) => {
  if ([TipoDocumento.RUC, TipoDocumento.CUIT, TipoDocumento.CUIL, TipoDocumento.CDI].includes(data.documento_tipo)) {
    return data.documento_numero.length === 11 && /^\d+$/.test(data.documento_numero)
  }
  if (data.documento_tipo === TipoDocumento.NIT) {
    return data.documento_numero.length === 10 && /^\d+$/.test(data.documento_numero)
  }
  if ([TipoDocumento.CC, TipoDocumento.TI].includes(data.documento_tipo)) {
    return /^[0-9]{6,10}$/.test(data.documento_numero)
  }
  if (data.documento_tipo === TipoDocumento.DNI) {
    return data.documento_numero.length === 8 && /^\d+$/.test(data.documento_numero)
  }
  return true
}, {
  message: 'El documento no tiene la longitud o formato requerido',
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
  const { post, unwrap } = useApi()
  const country = useCountryContext()
  const isArgentina = country.paisCodigo === 'AR'
  const isColombia = country.paisCodigo === 'CO'
  const taxIdType = isArgentina ? TipoDocumento.CUIT : isColombia ? TipoDocumento.NIT : TipoDocumento.RUC
  const taxIdLabel = isArgentina ? 'CUIT' : isColombia ? 'NIT' : 'RUC'
  const taxIdLength = isColombia ? 10 : 11
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
      documento_tipo: isColombia ? TipoDocumento.CC : TipoDocumento.DNI,
      documento_numero: '',
      razon_social: '',
      arca_condicion_iva: isArgentina ? 'CONSUMIDOR_FINAL' : undefined
    }
  })

  const documentoTipo = watch('documento_tipo')
  const documentoNumero = watch('documento_numero')
  const argentinaTaxIdentity = [TipoDocumento.CUIT, TipoDocumento.CUIL, TipoDocumento.CDI]
    .includes(documentoTipo)

  useEffect(() => {
    if (country.loading) return
    setValue('documento_tipo', isColombia ? TipoDocumento.CC : TipoDocumento.DNI)
    setValue('documento_numero', '')
    setRucValidated(false)
  }, [country.loading, country.paisCodigo, isColombia, setValue])

  const handleValidarRuc = async () => {
    if ((!argentinaTaxIdentity && documentoTipo !== taxIdType) || documentoNumero.length !== taxIdLength) {
      toast({
        title: 'Error',
        description: `El ${taxIdLabel} debe tener ${taxIdLength} dígitos`,
        variant: 'destructive'
      })
      return
    }

    try {
      setValidatingRuc(true)
      if (isArgentina) {
        if (!validateArgentinaCuit(documentoNumero)) {
          throw new Error(`El dígito verificador del ${documentoTipo} no es válido`)
        }
        setRucValidated(true)
        toast({
          title: `${documentoTipo} validado`,
          description: 'Formato y dígito verificador válidos. Complete la condición IVA.',
        })
        return
      }
      if (isColombia) {
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
        const consultaPadron = responseData.consulta_padron ?? responseData.consulta_sunat
        if (consultaPadron && responseData.razon_social) {
          setValue('razon_social', responseData.razon_social)
        }
        setRucValidated(true)
        toast({
          title: `${taxIdLabel} validado`,
          description: consultaPadron
            ? 'Datos obtenidos de una fuente registral auxiliar; confirme en SUNAT antes de una decisión fiscal.'
            : 'Formato y dígito verificador válidos. Complete la razón social manualmente.'
        })
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || `No se pudo validar el ${taxIdLabel}`,
        variant: 'destructive'
      })
    } finally {
      setValidatingRuc(false)
    }
  }

  const onSubmit = async (data: QuickClienteFormData) => {
    try {
      const response = await post('/api/ventas/clientes', data)
      const responseData: any = unwrap(response)

      if (responseData?.id) {
        toast({
          title: 'Cliente creado',
          description: `${data.razon_social} creado exitosamente`
        })
        onSuccess(responseData)
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
        className="bg-card rounded-lg shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground">
            Crear Cliente Rápido
          </h2>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground/80 transition-colors"
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
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSubmitting}
            >
              <option value={TipoCliente.PERSONA}>Persona Natural</option>
              <option value={TipoCliente.EMPRESA}>Empresa</option>
            </select>
            {errors.tipo && (
              <p className="text-sm text-destructive">{errors.tipo.message}</p>
            )}
          </div>

          {/* Tipo de Documento */}
          <div className="space-y-2">
            <Label htmlFor="quick-documento-tipo">Tipo de Documento *</Label>
            <select
              id="quick-documento-tipo"
              {...register('documento_tipo', { onChange: () => setRucValidated(false) })}
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSubmitting}
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
                <>
                  <option value={TipoDocumento.CUIT}>CUIT</option>
                  <option value={TipoDocumento.CUIL}>CUIL</option>
                  <option value={TipoDocumento.CDI}>CDI</option>
                </>
              ) : (
                <option value={taxIdType}>{taxIdLabel}</option>
              )}
              <option value={TipoDocumento.CE}>{isColombia ? 'Cédula de extranjería' : 'Carné de Extranjería'}</option>
              <option value={TipoDocumento.PASAPORTE}>Pasaporte</option>
            </select>
            {errors.documento_tipo && (
              <p className="text-sm text-destructive">{errors.documento_tipo.message}</p>
            )}
          </div>

          {isArgentina && (
            <div className="space-y-2">
              <Label htmlFor="quick-arca-condicion-iva">Condición IVA *</Label>
              <select
                id="quick-arca-condicion-iva"
                {...register('arca_condicion_iva', { required: true })}
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
                disabled={isSubmitting}
              >
                <option value="RESPONSABLE_INSCRIPTO">Responsable inscripto</option>
                <option value="MONOTRIBUTO">Monotributo</option>
                <option value="EXENTO">Exento</option>
                <option value="CONSUMIDOR_FINAL">Consumidor final</option>
                <option value="SUJETO_NO_CATEGORIZADO">Sujeto no categorizado</option>
                <option value="CLIENTE_EXTERIOR">Cliente del exterior</option>
                <option value="IVA_NO_ALCANZADO">IVA no alcanzado</option>
              </select>
            </div>
          )}

          {/* Número de Documento */}
          <div className="space-y-2">
            <Label htmlFor="quick-documento-numero">
              Número de Documento *
              {(documentoTipo === taxIdType || argentinaTaxIdentity) && ` (${taxIdLength} dígitos)`}
              {documentoTipo === TipoDocumento.DNI && ' (8 dígitos)'}
            </Label>
            <div className="flex gap-2">
              <Input
                id="quick-documento-numero"
                {...register('documento_numero', { onChange: () => setRucValidated(false) })}
                placeholder={
                  (documentoTipo === taxIdType || argentinaTaxIdentity) ? (isArgentina ? '20301234563' : isColombia ? '9001234568' : '20123456789') :
                  documentoTipo === TipoDocumento.DNI ? '12345678' :
                  'Número de documento'
                }
                disabled={isSubmitting}
              />
              {(documentoTipo === taxIdType || argentinaTaxIdentity) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleValidarRuc}
                  disabled={isSubmitting || validatingRuc || documentoNumero.length !== taxIdLength}
                  className="whitespace-nowrap"
                >
                  {validatingRuc ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : rucValidated ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    'Validar'
                  )}
                </Button>
              )}
            </div>
            {errors.documento_numero && (
              <p className="text-sm text-destructive">{errors.documento_numero.message}</p>
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
              <p className="text-sm text-destructive">{errors.razon_social.message}</p>
            )}
          </div>

          {/* Info Message */}
          <div className="bg-primary/10 border border-blue-200 rounded-md p-3">
            <p className="text-sm text-primary">
              Este formulario crea un cliente con datos mínimos. Puedes completar más información después desde el detalle del cliente.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
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
