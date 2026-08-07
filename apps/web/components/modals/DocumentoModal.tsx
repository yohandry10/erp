'use client'

import { useState, useEffect, useCallback } from 'react'
import { useApiCall } from '@/hooks/use-api'
import { useTaxConfig } from '@/hooks/useTaxConfig'
import { AlertCircle, CheckCircle, Plus, Trash2, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useCountryContext } from '@/hooks/use-country-context'
import { normalizeTaxId, validateCountryTaxId } from '@/lib/country-tax-id'

interface DocumentoModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  documento?: any
}

interface DetalleTipo {
  codigo_producto: string
  descripcion: string
  unidad_medida: string
  cantidad: number
  precio_unitario: number
  descuento_unitario: number
  valor_venta: number
  impuesto_igv: number
  total_item: number
}

const fieldClass =
  'border-cyan-400/20 bg-card/60 text-foreground placeholder:text-muted-foreground focus-visible:ring-cyan-400/40'

const readOnlyClass = 'border-cyan-400/10 bg-card/80 text-muted-foreground'

export default function DocumentoModal({ isOpen, onClose, onSuccess, documento }: DocumentoModalProps) {
  const country = useCountryContext()
  const isArgentina = country.paisCodigo === 'AR'
  const isColombia = country.paisCodigo === 'CO'
  const defaultCurrency = country.moneda || (isArgentina ? 'ARS' : isColombia ? 'COP' : 'PEN')
  const defaultRecipientType = isArgentina ? 'CUIT' : isColombia ? 'NIT' : 'RUC'
  const fiscalDocument = country.documentoFiscal || defaultRecipientType
  const { tasaIgv, nombreImpuesto } = useTaxConfig()
  const [formData, setFormData] = useState({
    tipo_documento: 'FACTURA',
    serie: '',
    receptor_tipo_doc: defaultRecipientType,
    receptor_numero_doc: '',
    receptor_razon_social: '',
    receptor_direccion: '',
    receptor_email: '',
    fecha_emision: new Date().toISOString().slice(0, 10),
    fecha_vencimiento: '',
    moneda: defaultCurrency,
    subtotal: 0,
    descuentos: 0,
    impuesto_igv: 0,
    total: 0,
    observaciones: ''
  })

  const [detalles, setDetalles] = useState<DetalleTipo[]>([
    {
      codigo_producto: '',
      descripcion: '',
      unidad_medida: 'NIU',
      cantidad: 1,
      precio_unitario: 0,
      descuento_unitario: 0,
      valor_venta: 0,
      impuesto_igv: 0,
      total_item: 0
    }
  ])

  const [validandoRUC, setValidandoRUC] = useState(false)
  const [erroresValidacion, setErroresValidacion] = useState<string[]>([])

  const api = useApiCall()

  useEffect(() => {
    if (documento) {
      // Cargar datos del documento para edición
      setFormData({
        tipo_documento: documento.tipo_documento || 'FACTURA',
        serie: documento.serie || '',
        receptor_tipo_doc: documento.receptor_tipo_doc || defaultRecipientType,
        receptor_numero_doc: documento.receptor_numero_doc || '',
        receptor_razon_social: documento.receptor_razon_social || '',
        receptor_direccion: documento.receptor_direccion || '',
        receptor_email: documento.receptor_email || '',
        fecha_emision: documento.fecha_emision?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        fecha_vencimiento: documento.fecha_vencimiento?.slice(0, 10) || '',
        moneda: documento.moneda || defaultCurrency,
        subtotal: documento.subtotal || 0,
        descuentos: documento.descuentos || 0,
        impuesto_igv: documento.impuesto_igv || 0,
        total: documento.total || 0,
        observaciones: documento.observaciones || ''
      })

      // Cargar detalles si existen
      if (documento.documento_detalles && documento.documento_detalles.length > 0) {
        setDetalles(documento.documento_detalles.map((d: any) => ({
          codigo_producto: d.codigo_producto || '',
          descripcion: d.descripcion || '',
          unidad_medida: d.unidad_medida || 'NIU',
          cantidad: d.cantidad || 1,
          precio_unitario: d.precio_unitario || 0,
          descuento_unitario: d.descuento_unitario || 0,
          valor_venta: d.valor_venta || 0,
          impuesto_igv: d.impuesto_igv || 0,
          total_item: d.total_item || 0
        })))
      }
    } else {
      // Reset form for new document
      setFormData({
        tipo_documento: 'FACTURA',
        serie: '',
        receptor_tipo_doc: defaultRecipientType,
        receptor_numero_doc: '',
        receptor_razon_social: '',
        receptor_direccion: '',
        receptor_email: '',
        fecha_emision: new Date().toISOString().slice(0, 10),
        fecha_vencimiento: '',
        moneda: defaultCurrency,
        subtotal: 0,
        descuentos: 0,
        impuesto_igv: 0,
        total: 0,
        observaciones: ''
      })
      setDetalles([{
        codigo_producto: '',
        descripcion: '',
        unidad_medida: 'NIU',
        cantidad: 1,
        precio_unitario: 0,
        descuento_unitario: 0,
        valor_venta: 0,
        impuesto_igv: 0,
        total_item: 0
      }])
    }
  }, [defaultCurrency, defaultRecipientType, documento])

  // Validar el identificador fiscal del país automáticamente.
  const validarIdentificacionFiscal = async (value: string) => {
    const taxId = normalizeTaxId(value)
    const expectedLength = isColombia ? 10 : 11
    if (taxId.length === expectedLength && /^\d+$/.test(taxId)) {
      if (isArgentina && !validateCountryTaxId('AR', taxId)) {
        showErrorToast('CUIT inválido: revise el dígito verificador')
        return
      }
      if (isColombia && !validateCountryTaxId('CO', taxId)) {
        showErrorToast('NIT inválido: revise el dígito de verificación')
        return
      }
      setValidandoRUC(true)
      try {
        const response = await api.post('/api/documentos/validar-ruc', { ruc: taxId })
        const responseData: any = api.unwrap(response)
        if (responseData) {
          if (!isArgentina && !isColombia && responseData.consulta_sunat) {
            setFormData(prev => ({
              ...prev,
              receptor_razon_social: responseData.razon_social || prev.receptor_razon_social,
              receptor_direccion: responseData.direccion || prev.receptor_direccion
            }))
            showSuccessToast(`${isArgentina ? 'CUIT' : 'RUC'} validado${isArgentina ? '' : ' con SUNAT'}`)
          } else {
            showSuccessToast(
              `${fiscalDocument} válido por formato y dígito verificador; complete los datos registrales`,
            )
          }
        } else {
          showErrorToast(`${fiscalDocument} no encontrado o inválido`)
        }
      } catch (error) {
        console.error(`Error validando ${fiscalDocument}:`, error)
        showErrorToast(`Error al validar ${fiscalDocument}`)
      } finally {
        setValidandoRUC(false)
      }
    }
  }

  // Calcular totales manualmente cuando sea necesario
  const calcularTotales = () => {
    const subtotalCalculado = detalles.reduce((sum, detalle) => {
      const valorVenta = (detalle.cantidad * detalle.precio_unitario) - detalle.descuento_unitario
      return sum + valorVenta
    }, 0)

    const igvCalculado = subtotalCalculado * tasaIgv
    const totalCalculado = subtotalCalculado + igvCalculado

    setFormData(prev => ({
      ...prev,
      subtotal: subtotalCalculado,
      impuesto_igv: igvCalculado,
      total: totalCalculado
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validar documento antes de enviar
    const datosParaValidar = {
      ...formData,
      detalles: detalles
    }

    const validationResponse = await api.post('/api/documentos/validar-documento', datosParaValidar)

    if (validationResponse && !validationResponse.data.valido) {
      setErroresValidacion(validationResponse.data.errores)
      showErrorToast(`Errores de validación: ${validationResponse.data.errores.join(', ')}`)
      return
    }

    setErroresValidacion([])

    // Crear o actualizar documento
    console.log('📊 Enviando datos del documento:', { ...formData, detalles })

    let response
    if (documento) {
      // Actualizar documento existente
      response = await api.put(`/api/documentos/${documento.id}`, { ...formData, detalles })
    } else {
      // Crear nuevo documento
      response = await api.post('/api/documentos/crear', { ...formData, detalles })
    }

    if (response && response.success) {
      console.log('✅ Documento guardado exitosamente:', response.data)

      showSuccessToast(response.message || `Documento ${documento ? 'actualizado' : 'creado'} exitosamente`)

      onSuccess()
      onClose()
    } else {
      console.log('❌ Error al guardar documento:', response)
      showErrorToast(response?.message || 'Error al guardar documento')
    }
  }

  const agregarDetalle = () => {
    setDetalles([...detalles, {
      codigo_producto: '',
      descripcion: '',
      unidad_medida: 'UND',
      cantidad: 1,
      precio_unitario: 0,
      descuento_unitario: 0,
      valor_venta: 0,
      impuesto_igv: 0,
      total_item: 0
    }])

    // Calcular totales después de agregar
    setTimeout(() => {
      calcularTotales()
    }, 0)
  }

  const eliminarDetalle = (index: number) => {
    if (detalles.length > 1) {
      setDetalles(detalles.filter((_, i) => i !== index))

      // Calcular totales después de eliminar
      setTimeout(() => {
        calcularTotales()
      }, 0)
    }
  }

  const actualizarDetalle = (index: number, campo: string, valor: any) => {
    const nuevosDetalles = [...detalles]
    nuevosDetalles[index] = { ...nuevosDetalles[index], [campo]: valor }
    setDetalles(nuevosDetalles)

    // Calcular totales automáticamente cuando cambien valores relevantes
    if (campo === 'cantidad' || campo === 'precio_unitario' || campo === 'descuento_unitario') {
      // Usar setTimeout para asegurar que el estado se actualice primero
      setTimeout(() => {
        calcularTotales()
      }, 0)
    }
  }

  const showSuccessToast = (message: string) => {
    if (typeof window !== 'undefined') {
      const toast = document.createElement('div')
      toast.className = 'fixed right-5 top-5 z-[9999] rounded-lg border border-cyan-400/30 bg-background px-5 py-4 font-semibold text-primary shadow-2xl shadow-cyan-950/40'
      toast.textContent = `✓ ${message}`
      document.body.appendChild(toast)
      setTimeout(() => {
        document.body.removeChild(toast)
      }, 3000)
    }
  }

  const showErrorToast = (message: string) => {
    if (typeof window !== 'undefined') {
      const toast = document.createElement('div')
      toast.className = 'fixed right-5 top-5 z-[9999] rounded-lg border border-amber-300/30 bg-background px-5 py-4 font-semibold text-amber-400 dark:text-amber-200 shadow-2xl shadow-cyan-950/40'
      toast.textContent = `! ${message}`
      document.body.appendChild(toast)
      setTimeout(() => {
        document.body.removeChild(toast)
      }, 3000)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-lg border border-cyan-400/20 bg-background text-foreground shadow-2xl shadow-cyan-950/40">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-cyan-400/10 bg-card/95 px-6 py-4 backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-200/75">Documento fiscal</p>
            <h2 className="mt-1 text-xl font-semibold tracking-normal text-foreground">
            {documento ? 'Editar Documento' : 'Crear Nuevo Documento'}
          </h2>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onClose}
            className="border-cyan-400/20 bg-card/80 text-foreground/90 hover:bg-cyan-400/10"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          {erroresValidacion.length > 0 && (
            <Alert className="border-amber-300/30 bg-amber-300/10 text-amber-400 dark:text-amber-200">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <span className="font-semibold">Errores de validación:</span>
                <ul className="mt-2 list-disc pl-5">
                  {erroresValidacion.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <section className="rounded-lg border border-cyan-400/15 bg-card/50 p-4">
            <h3 className="mb-4 text-base font-semibold text-foreground">Información del documento</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Field label="Tipo de documento *">
                <select
                  value={formData.tipo_documento}
                  onChange={(e) => setFormData(prev => ({ ...prev, tipo_documento: e.target.value }))}
                  required
                  className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                >
                  <option value="FACTURA">{isArgentina ? 'Factura A' : isColombia ? 'Factura electrónica' : 'Factura'}</option>
                  <option value="BOLETA">{isArgentina ? 'Factura B' : isColombia ? 'Documento equivalente' : 'Boleta'}</option>
                  <option value="NOTA_CREDITO">Nota de Crédito</option>
                  <option value="NOTA_DEBITO">Nota de Débito</option>
                  <option value="CONTRATO">Contrato</option>
                </select>
              </Field>

              <Field label="Serie">
                <input
                  type="text"
                  value={formData.serie}
                  onChange={(e) => setFormData(prev => ({ ...prev, serie: e.target.value }))}
                  placeholder={isArgentina ? 'Ej: 00001' : isColombia ? 'Ej: FE' : 'Ej: F001, B001'}
                  className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                />
              </Field>

              <Field label="Fecha de emisión *">
                <input
                  type="date"
                  value={formData.fecha_emision}
                  onChange={(e) => setFormData(prev => ({ ...prev, fecha_emision: e.target.value }))}
                  required
                  className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                />
              </Field>

              <Field label="Fecha de vencimiento">
                <input
                  type="date"
                  value={formData.fecha_vencimiento}
                  onChange={(e) => setFormData(prev => ({ ...prev, fecha_vencimiento: e.target.value }))}
                  className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                />
              </Field>

              <Field label="Moneda">
                <select
                  value={formData.moneda}
                  onChange={(e) => setFormData(prev => ({ ...prev, moneda: e.target.value }))}
                  className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                >
                  {isArgentina ? (
                    <option value="ARS">Pesos argentinos (ARS)</option>
                  ) : isColombia ? (
                    <option value="COP">Pesos colombianos (COP)</option>
                  ) : (
                    <option value="PEN">Soles (PEN)</option>
                  )}
                  <option value="USD">Dólares (USD)</option>
                  <option value="EUR">Euros (EUR)</option>
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-lg border border-cyan-400/15 bg-card/50 p-4">
            <h3 className="mb-4 text-base font-semibold text-foreground">Información del cliente</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Tipo de documento">
                <select
                  value={formData.receptor_tipo_doc}
                  onChange={(e) => setFormData(prev => ({ ...prev, receptor_tipo_doc: e.target.value }))}
                  className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                >
                  {isArgentina ? (
                    <>
                      <option value="CUIT">CUIT</option>
                      <option value="DNI">DNI argentino</option>
                      <option value="PASAPORTE">Pasaporte</option>
                    </>
                  ) : isColombia ? (
                    <>
                      <option value="NIT">NIT</option>
                      <option value="CC">Cédula de ciudadanía</option>
                      <option value="TI">Tarjeta de identidad</option>
                      <option value="CE">Cédula de extranjería</option>
                      <option value="PASAPORTE">Pasaporte</option>
                    </>
                  ) : (
                    <>
                      <option value="RUC">RUC</option>
                      <option value="DNI">DNI</option>
                      <option value="CE">Carnet de Extranjería</option>
                    </>
                  )}
                </select>
              </Field>

              <Field label="Número de documento *">
                <div className="relative">
                  <input
                    type="text"
                    value={formData.receptor_numero_doc}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, receptor_numero_doc: e.target.value }))
                      if (['RUC', 'CUIT', 'NIT'].includes(formData.receptor_tipo_doc)) {
                        validarIdentificacionFiscal(e.target.value)
                      }
                    }}
                    placeholder={isArgentina ? 'Ingrese CUIT/DNI' : isColombia ? 'Ingrese NIT/CC' : 'Ingrese RUC/DNI'}
                    required
                    className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                  />
                  {validandoRUC && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-primary">
                      Validando...
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Razón social / nombre *" className="md:col-span-2">
                <input
                  type="text"
                  value={formData.receptor_razon_social}
                  onChange={(e) => setFormData(prev => ({ ...prev, receptor_razon_social: e.target.value }))}
                  placeholder="Nombre o razón social del cliente"
                  required
                  className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                />
              </Field>

              <Field label="Dirección" className="md:col-span-2">
                <input
                  type="text"
                  value={formData.receptor_direccion}
                  onChange={(e) => setFormData(prev => ({ ...prev, receptor_direccion: e.target.value }))}
                  placeholder="Dirección del cliente"
                  className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                />
              </Field>

              <Field label="Email" className="md:col-span-2">
                <input
                  type="email"
                  value={formData.receptor_email}
                  onChange={(e) => setFormData(prev => ({ ...prev, receptor_email: e.target.value }))}
                  placeholder="email@cliente.com"
                  className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                />
              </Field>
            </div>
          </section>

          <section className="rounded-lg border border-cyan-400/15 bg-card/50 p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-base font-semibold text-foreground">Detalles del documento</h3>
              <Button
                type="button"
                onClick={agregarDetalle}
                className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white"
              >
                <Plus className="mr-2 h-4 w-4" />
                Agregar línea
              </Button>
            </div>

            {detalles.map((detalle, index) => (
              <div key={index} className="mb-3 rounded-lg border border-cyan-400/15 bg-card/55 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-foreground/90">Línea {index + 1}</h4>
                  {detalles.length > 1 && (
                    <Button
                      type="button"
                      onClick={() => eliminarDetalle(index)}
                      variant="outline"
                      size="sm"
                      className="border-amber-300/30 bg-amber-300/10 text-amber-400 dark:text-amber-200 hover:bg-amber-300/20"
                    >
                      <Trash2 className="mr-2 h-3 w-3" />
                      Eliminar
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                  <Field label="Código">
                    <input
                      type="text"
                      value={detalle.codigo_producto}
                      onChange={(e) => actualizarDetalle(index, 'codigo_producto', e.target.value)}
                      placeholder="COD001"
                      className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                    />
                  </Field>

                  <Field label="Descripción *" className="xl:col-span-2">
                    <input
                      type="text"
                      value={detalle.descripcion}
                      onChange={(e) => actualizarDetalle(index, 'descripcion', e.target.value)}
                      placeholder="Descripción del producto/servicio"
                      required
                      className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                    />
                  </Field>

                  <Field label="U.M.">
                    <select
                      value={detalle.unidad_medida}
                      onChange={(e) => actualizarDetalle(index, 'unidad_medida', e.target.value)}
                      className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                    >
                      <option value="NIU">Unidad</option>
                      <option value="KGM">Kilogramo</option>
                      <option value="MTR">Metro</option>
                      <option value="LTR">Litro</option>
                      <option value="ZZ">Servicio</option>
                    </select>
                  </Field>

                  <Field label="Cantidad *">
                    <input
                      type="number"
                      step="0.01"
                      value={detalle.cantidad}
                      onChange={(e) => actualizarDetalle(index, 'cantidad', parseFloat(e.target.value) || 0)}
                      required
                      min="0"
                      className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                    />
                  </Field>

                  <Field label="Precio unit. *">
                    <input
                      type="number"
                      step="0.01"
                      value={detalle.precio_unitario}
                      onChange={(e) => actualizarDetalle(index, 'precio_unitario', parseFloat(e.target.value) || 0)}
                      required
                      min="0"
                      className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                    />
                  </Field>

                  <Field label="Descuento">
                    <input
                      type="number"
                      step="0.01"
                      value={detalle.descuento_unitario}
                      onChange={(e) => actualizarDetalle(index, 'descuento_unitario', parseFloat(e.target.value) || 0)}
                      min="0"
                      className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                    />
                  </Field>

                  <Field label="Total línea">
                    <input
                      type="number"
                      value={detalle.total_item.toFixed(2)}
                      readOnly
                      className={cn('h-10 w-full rounded-md px-3 text-sm', readOnlyClass)}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </section>

          <section className="rounded-lg border border-cyan-400/15 bg-card/50 p-4">
            <h3 className="mb-4 text-base font-semibold text-foreground">Totales</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Subtotal">
                <input
                  type="number"
                  value={formData.subtotal.toFixed(2)}
                  readOnly
                  className={cn('h-10 w-full rounded-md px-3 text-sm', readOnlyClass)}
                />
              </Field>

              <Field label={`${nombreImpuesto} (${Number((tasaIgv * 100).toFixed(2))}%)`}>
                <input
                  type="number"
                  value={formData.impuesto_igv.toFixed(2)}
                  readOnly
                  className={cn('h-10 w-full rounded-md px-3 text-sm', readOnlyClass)}
                />
              </Field>

              <Field label="Descuentos">
                <input
                  type="number"
                  step="0.01"
                  value={formData.descuentos}
                  onChange={(e) => setFormData(prev => ({ ...prev, descuentos: parseFloat(e.target.value) || 0 }))}
                  min="0"
                  className={cn('h-10 w-full rounded-md px-3 text-sm', fieldClass)}
                />
              </Field>

              <Field label="Total final">
                <input
                  type="number"
                  value={(formData.total - formData.descuentos).toFixed(2)}
                  readOnly
                  className="h-10 w-full rounded-md border border-cyan-300/40 bg-cyan-400/10 px-3 text-sm font-semibold text-primary"
                />
              </Field>
            </div>
          </section>

          <Field label="Observaciones">
            <textarea
              value={formData.observaciones}
              onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
              placeholder="Observaciones adicionales del documento..."
              rows={3}
              className={cn('min-h-24 w-full resize-y rounded-md px-3 py-2 text-sm', fieldClass)}
            />
          </Field>

          <div className="flex flex-col justify-end gap-3 border-t border-cyan-400/10 pt-4 sm:flex-row">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="border-cyan-400/30 bg-card/50 text-primary hover:bg-cyan-400/10"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={api.loading}
              className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white"
            >
              {api.loading ? 'Guardando...' : (documento ? 'Actualizar' : 'Crear Documento')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label className="text-xs font-semibold uppercase text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
