'use client'

import { useEffect, useRef, useState } from 'react'
import { useApiCall } from '@/hooks/use-api'
import { useTaxConfig } from '@/hooks/useTaxConfig'
import { useCountryContext } from '@/hooks/use-country-context'
import { ConsultaRuc, type ContribuyenteConsultado } from '@/components/shared/ConsultaRuc'
import { fiscalDateForCountry } from '@/lib/fiscal-date'
import ClienteSelector from '@/components/ventas/ClienteSelector'
import type { Cliente } from '@/types/ventas'

interface CpeModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

function addDaysToFiscalDate(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return ''
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function argentinaInvoiceClass(issuerCondition: string, receiverCondition?: string): 'A' | 'B' | 'C' | null {
  const issuer = issuerCondition.trim().toUpperCase()
  const receiver = String(receiverCondition || '').trim().toUpperCase()
  if (!receiver) return null
  if (issuer === 'MONOTRIBUTO' || issuer === 'EXENTO') return 'C'
  if (issuer !== 'RESPONSABLE_INSCRIPTO') return null
  return new Set([
    'RESPONSABLE_INSCRIPTO',
    'MONOTRIBUTO',
    'MONOTRIBUTISTA_SOCIAL',
    'MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO',
  ]).has(receiver) ? 'A' : 'B'
}

function argentinaDocumentLabel(value: string): string {
  const normalized = value.trim().toUpperCase()
  return ({
    '80': 'CUIT', CUIT: 'CUIT',
    '86': 'CUIL', CUIL: 'CUIL',
    '87': 'CDI', CDI: 'CDI',
    '96': 'DNI', DNI: 'DNI',
    '99': 'Consumidor Final', CONSUMIDOR_FINAL: 'Consumidor Final', CF: 'Consumidor Final',
  } as Record<string, string>)[normalized] || normalized
}

export default function CpeModal({ isOpen, onClose, onSuccess }: CpeModalProps) {
  const country = useCountryContext()
  const isArgentina = country.paisCodigo === 'AR'
  const isColombia = country.paisCodigo === 'CO'
  const { tasaIgv, nombreImpuesto } = useTaxConfig()
  const automaticEmissionDateRef = useRef(fiscalDateForCountry(country.paisCodigo))
  const wasOpenRef = useRef(false)
  const formatMoney = (value: number, currency = country.moneda || 'PEN') =>
    new Intl.NumberFormat(country.locale || 'es-PE', {
      style: 'currency',
      currency,
    }).format(value)
  const [formData, setFormData] = useState({
    tipoComprobante: '01', // Factura por defecto
    serie: 'F001',
    clienteId: '',
    clienteTipoDocumento: 'RUC',
    clienteRuc: '',
    clienteRazonSocial: '',
    clienteDireccion: '',
    fechaEmision: automaticEmissionDateRef.current,
    fechaVencimiento: '',
    moneda: 'PEN',
    arcaConcepto: 1,
    arcaFechaServicioDesde: '',
    arcaFechaServicioHasta: '',
    arcaFechaVencimientoPago: '',
    arcaPagoMismaMoneda: 'S' as 'S' | 'N',
    arcaTributos: [] as Array<{
      id: number
      descripcion: string
      base_imponible: number
      alicuota: number
      importe: number
    }>,
    condicionPago: 'CONTADO',
    medioPago: '10',
    plazoPagoDias: 0,
    tipoOperacion: '0101',
    observaciones: '',
    items: [
      {
        codigo: '',
        descripcion: '',
        cantidad: 1,
        unidadMedida: 'NIU',
        afectacionIgv: '10',
        valorUnitario: 0,
        precioUnitario: 0,
        descuento: 0,
        igv: 0,
        total: 0
      }
    ]
  })

  // Crear y firmar un CPE puede superar el timeout genérico de lectura en un
  // cold start. La intención se conserva ante un timeout para que un reintento
  // no pueda emitir un segundo comprobante si el servidor sí alcanzó a guardar
  // el primero.
  const api = useApiCall({ throwOnError: true, timeoutMs: 30_000 })
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [selectedFiscalClient, setSelectedFiscalClient] = useState<Cliente | null>(null)
  const idempotencyKeyRef = useRef<string | null>(null)
  const resolvedArgentinaClass = isArgentina
    ? argentinaInvoiceClass(country.arcaCondicionIva, selectedFiscalClient?.arca_condicion_iva)
    : null
  const effectiveTaxRate = isArgentina && resolvedArgentinaClass === 'C' ? 0 : tasaIgv
  const taxPercent = Math.round(effectiveTaxRate * 10000) / 100

  useEffect(() => {
    const opening = isOpen && !wasOpenRef.current
    wasOpenRef.current = isOpen
    if (!country.moneda || !isOpen) return
    const fiscalToday = fiscalDateForCountry(country.paisCodigo)
    setFormData((current) => ({
      ...current,
      moneda: country.moneda,
      // Colombia no acepta una serie inventada por la pantalla: el prefijo
      // (incluido el caso válido sin prefijo) sale de la resolución DIAN que
      // el servidor reserva para el tenant.
      serie: isArgentina
        ? country.arcaPuntoVenta
          ? String(country.arcaPuntoVenta).padStart(5, '0')
          : ''
        : isColombia ? '' : current.serie,
      clienteTipoDocumento: isArgentina ? 'CUIT' : isColombia ? 'NIT' : 'RUC',
      // El contexto de país suele terminar de hidratar después del primer
      // render. Sólo reemplazamos la fecha mientras el usuario no la haya
      // editado, evitando emitir "mañana" al cruzar medianoche UTC.
      fechaEmision:
        opening || current.fechaEmision === automaticEmissionDateRef.current
          ? fiscalToday
          : current.fechaEmision,
    }))
    automaticEmissionDateRef.current = fiscalToday
  }, [country.arcaPuntoVenta, country.moneda, country.paisCodigo, isArgentina, isColombia, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (isArgentina && (!country.arcaPuntoVenta || !country.arcaCondicionIva)) {
      setSubmitError(
        'Configura el punto de venta y la condición IVA del emisor antes de emitir con ARCA.',
      )
      return
    }
    if ((isArgentina || isColombia) && !formData.clienteId) {
      setSubmitError(
        isArgentina
          ? 'Selecciona un cliente maestro con condición IVA antes de emitir.'
          : 'Selecciona un cliente maestro con perfil tributario DIAN antes de emitir.',
      )
      return
    }
    if (isArgentina && !selectedFiscalClient?.arca_condicion_iva) {
      setSubmitError('El cliente seleccionado no tiene condición frente al IVA. Edítalo antes de emitir.')
      return
    }
    if (isColombia && !selectedFiscalClient?.dian_perfil_fiscal) {
      setSubmitError('El cliente seleccionado no tiene perfil tributario DIAN. Edítalo antes de emitir.')
      return
    }

    // Calcular totales
    const subtotal = formData.items.reduce((sum, item) => sum + (item.valorUnitario * item.cantidad), 0)
    const totalIgv = formData.items.reduce((sum, item) => sum + item.igv, 0)
    const totalOtrosTributos = formData.arcaTributos.reduce(
      (sum, tribute) => sum + tribute.importe,
      0,
    )
    const total = subtotal + totalIgv + totalOtrosTributos

    // Un ref cierra también la ventana de doble clic anterior al siguiente
    // render; dos submits concurrentes comparten la misma intención.
    const currentIdempotencyKey = idempotencyKeyRef.current ?? `cpe-ui-${crypto.randomUUID()}`
    idempotencyKeyRef.current = currentIdempotencyKey

    const {
      clienteId,
      clienteTipoDocumento,
      clienteRuc,
      clienteRazonSocial,
      clienteDireccion,
      serie,
      arcaConcepto,
      arcaFechaServicioDesde,
      arcaFechaServicioHasta,
      arcaFechaVencimientoPago,
      arcaPagoMismaMoneda,
      arcaTributos,
      ...requestFormData
    } = formData
    const cpeData = {
      ...requestFormData,
      ...(!isArgentina && !isColombia ? { serie } : {}),
      ...(!isArgentina && !isColombia
        ? {
            clienteTipoDocumento,
            clienteRuc,
            clienteRazonSocial,
            clienteDireccion,
          }
        : {}),
      cliente_id: isArgentina || isColombia ? formData.clienteId : undefined,
      ...(isArgentina
        ? {
            arca_concepto: arcaConcepto,
            arca_fecha_servicio_desde:
              arcaConcepto === 1 ? undefined : arcaFechaServicioDesde,
            arca_fecha_servicio_hasta:
              arcaConcepto === 1 ? undefined : arcaFechaServicioHasta,
            arca_fecha_vencimiento_pago:
              arcaConcepto === 1 ? undefined : arcaFechaVencimientoPago,
            arca_pago_misma_moneda:
              formData.moneda === 'ARS' ? undefined : arcaPagoMismaMoneda,
            arca_tributos: arcaTributos,
          }
        : {}),
      idempotency_key: currentIdempotencyKey,
      items: formData.items.map(({ afectacionIgv, ...item }) => ({
        ...item,
        ...(isArgentina || isColombia
          ? {
              afectacion_igv: afectacionIgv,
              tipo_afectacion_igv: afectacionIgv,
            }
          : {}),
      })),
      subtotal,
      totalIgv,
      total,
    }

    try {
      const result = await api.post('/api/cpe/comprobantes', cpeData, {
        headers: { 'Idempotency-Key': currentIdempotencyKey },
      })

      if (!result) return

      idempotencyKeyRef.current = null
      setSelectedFiscalClient(null)
      onSuccess()
      onClose()
      // Reset form
      const fiscalToday = fiscalDateForCountry(country.paisCodigo)
      automaticEmissionDateRef.current = fiscalToday
      setFormData({
        tipoComprobante: '01',
        serie: isArgentina && country.arcaPuntoVenta
          ? String(country.arcaPuntoVenta).padStart(5, '0')
          : isColombia ? '' : 'F001',
        clienteId: '',
        clienteTipoDocumento: isArgentina ? 'CUIT' : isColombia ? 'NIT' : 'RUC',
        clienteRuc: '',
        clienteRazonSocial: '',
        clienteDireccion: '',
        fechaEmision: fiscalToday,
        fechaVencimiento: '',
        // Sin `|| 'PEN'`: esto es el estado inicial de un comprobante y viaja al
        // servidor. Con el país sin resolver `country.moneda` es cadena vacía, y el
        // respaldo emitía en soles para cualquier contribuyente.
        moneda: country.moneda,
        arcaConcepto: 1,
        arcaFechaServicioDesde: '',
        arcaFechaServicioHasta: '',
        arcaFechaVencimientoPago: '',
        arcaPagoMismaMoneda: 'S',
        arcaTributos: [],
        condicionPago: 'CONTADO',
        medioPago: '10',
        plazoPagoDias: 0,
        tipoOperacion: '0101',
        observaciones: '',
        items: [
          {
            codigo: '',
            descripcion: '',
            cantidad: 1,
            unidadMedida: 'NIU',
            afectacionIgv: '10',
            valorUnitario: 0,
            precioUnitario: 0,
            descuento: 0,
            igv: 0,
            total: 0
          }
        ]
      })
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'No se pudo crear el comprobante. Puedes reintentar sin duplicarlo.',
      )
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    const normalizedValue = name === 'plazoPagoDias' || name === 'arcaConcepto'
      ? Number(value)
      : value
    idempotencyKeyRef.current = null
    setSubmitError(null)
    setFormData(prev => ({
      ...prev,
      [name]: normalizedValue
    }))

    // Auto-update serie based on tipo comprobante
    if (name === 'tipoComprobante') {
      let newSerie = isArgentina && country.arcaPuntoVenta
        ? String(country.arcaPuntoVenta).padStart(5, '0')
        : isColombia ? '' : 'F001'
      if (isArgentina || isColombia) {
        setFormData(prev => ({ ...prev, serie: newSerie }))
        return
      }
      switch (value) {
        case '01': newSerie = 'F001'; break
        case '03': newSerie = 'B001'; break
      }
      setFormData(prev => ({ ...prev, serie: newSerie }))
    }
    if (name === 'condicionPago') {
      setFormData((prev) => ({
        ...prev,
        condicionPago: value,
        plazoPagoDias: value === 'CREDITO' ? 30 : 0,
        fechaVencimiento: value === 'CREDITO'
          ? addDaysToFiscalDate(prev.fechaEmision, 30)
          : '',
      }))
    }
    if (name === 'fechaEmision') {
      setFormData((prev) => ({
        ...prev,
        fechaEmision: value,
        arcaFechaServicioDesde:
          prev.arcaConcepto !== 1 && !prev.arcaFechaServicioDesde ? value : prev.arcaFechaServicioDesde,
        arcaFechaServicioHasta:
          prev.arcaConcepto !== 1 && !prev.arcaFechaServicioHasta ? value : prev.arcaFechaServicioHasta,
        arcaFechaVencimientoPago:
          prev.arcaConcepto !== 1 && !prev.arcaFechaVencimientoPago ? value : prev.arcaFechaVencimientoPago,
        fechaVencimiento: prev.condicionPago === 'CREDITO'
          ? addDaysToFiscalDate(value, prev.plazoPagoDias)
          : prev.fechaVencimiento,
      }))
    }
    if (name === 'plazoPagoDias') {
      setFormData((prev) => ({
        ...prev,
        plazoPagoDias: Number(value),
        fechaVencimiento: prev.condicionPago === 'CREDITO'
          ? addDaysToFiscalDate(prev.fechaEmision, Number(value))
          : prev.fechaVencimiento,
      }))
    }
    if (name === 'arcaConcepto') {
      setFormData((prev) => ({
        ...prev,
        arcaConcepto: Number(value),
        arcaFechaServicioDesde: Number(value) === 1 ? '' : prev.arcaFechaServicioDesde || prev.fechaEmision,
        arcaFechaServicioHasta: Number(value) === 1 ? '' : prev.arcaFechaServicioHasta || prev.fechaEmision,
        arcaFechaVencimientoPago:
          Number(value) === 1 ? '' : prev.arcaFechaVencimientoPago || prev.fechaEmision,
      }))
    }
    if (name === 'moneda' && value === 'ARS') {
      setFormData((prev) => ({ ...prev, arcaPagoMismaMoneda: 'S' }))
    }
  }

  // La fuente registral auxiliar avisa antes de emitir y propone la razón
  // social. No sustituye la validación oficial que hará SUNAT al recibir el CPE.
  const rellenarConElPadron = (dato: ContribuyenteConsultado) => {
    if (!dato.razonSocial) return
    setFormData(prev => (prev.clienteRazonSocial?.trim() ? prev : { ...prev, clienteRazonSocial: dato.razonSocial! }))
  }

  const seleccionarClienteFiscal = (clienteId: string, cliente?: Cliente) => {
    idempotencyKeyRef.current = null
    setSubmitError(null)
    setSelectedFiscalClient(cliente ?? null)
    setFormData((current) => {
      const nextClass = isArgentina
        ? argentinaInvoiceClass(country.arcaCondicionIva, cliente?.arca_condicion_iva)
        : null
      const nextTaxRate = isArgentina && nextClass === 'C' ? 0 : tasaIgv
      return {
        ...current,
        clienteId,
        clienteTipoDocumento: cliente?.documento_tipo ?? (isArgentina ? 'CUIT' : 'NIT'),
        clienteRuc: String(cliente?.documento_numero ?? cliente?.numero_documento ?? cliente?.ruc ?? ''),
        clienteRazonSocial: cliente?.razon_social ?? '',
        clienteDireccion: cliente?.direccion ?? '',
        items: current.items.map((item) => {
          const subtotalItem = item.cantidad * item.valorUnitario
          const igv = item.afectacionIgv === '10' ? subtotalItem * nextTaxRate : 0
          return {
            ...item,
            precioUnitario: isColombia
              ? item.valorUnitario
              : item.valorUnitario * (1 + nextTaxRate),
            igv,
            total: subtotalItem + igv,
          }
        }),
      }
    })
  }

  const handleItemChange = (index: number, field: string, value: any) => {
    const numericFields = new Set([
      'cantidad',
      'valorUnitario',
      'precioUnitario',
      'descuento',
      'igv',
      'total',
    ])
    const normalizedValue = numericFields.has(field) ? Number(value) : value
    const newItems = [...formData.items]
    newItems[index] = { ...newItems[index], [field]: normalizedValue }
    idempotencyKeyRef.current = null
    setSubmitError(null)

    // Recalcular totales del item
    if (field === 'cantidad' || field === 'valorUnitario' || field === 'afectacionIgv') {
      const cantidad = field === 'cantidad' ? normalizedValue : newItems[index].cantidad
      const valorUnitario = field === 'valorUnitario' ? normalizedValue : newItems[index].valorUnitario
      const afectacionIgv = field === 'afectacionIgv' ? normalizedValue : newItems[index].afectacionIgv
      const subtotalItem = cantidad * valorUnitario
      const igvItem = afectacionIgv === '10' ? subtotalItem * effectiveTaxRate : 0
      const totalItem = subtotalItem + igvItem

      newItems[index] = {
        ...newItems[index],
        // En DIAN PriceAmount es el precio base de la línea. Mantener el valor
        // con IVA aquí produciría una Invoice que declara 119 como precio y
        // 100 como extensión para una unidad gravada al 19 %.
        precioUnitario: isColombia ? valorUnitario : valorUnitario * (1 + effectiveTaxRate),
        igv: igvItem,
        total: totalItem
      }
    }

    setFormData(prev => ({ ...prev, items: newItems }))
  }

  const addItem = () => {
    idempotencyKeyRef.current = null
    setSubmitError(null)
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        codigo: '',
        descripcion: '',
        cantidad: 1,
        unidadMedida: 'NIU',
        afectacionIgv: '10',
        valorUnitario: 0,
        precioUnitario: 0,
        descuento: 0,
        igv: 0,
        total: 0
      }]
    }))
  }

  const removeItem = (index: number) => {
    if (formData.items.length > 1) {
      idempotencyKeyRef.current = null
      setSubmitError(null)
      setFormData(prev => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index)
      }))
    }
  }

  const addArcaTribute = () => {
    idempotencyKeyRef.current = null
    setFormData((prev) => ({
      ...prev,
      arcaTributos: [...prev.arcaTributos, {
        id: 1,
        descripcion: 'Impuestos nacionales',
        base_imponible: 0,
        alicuota: 0,
        importe: 0,
      }],
    }))
  }

  const updateArcaTribute = (index: number, field: string, rawValue: string) => {
    idempotencyKeyRef.current = null
    const canonicalDescriptions: Record<number, string> = {
      1: 'Impuestos nacionales',
      2: 'Impuestos provinciales',
      3: 'Impuestos municipales',
      4: 'Impuestos internos',
      99: 'Otros',
    }
    setFormData((prev) => {
      const next = [...prev.arcaTributos]
      const current = next[index]
      const numericFields = new Set(['id', 'base_imponible', 'alicuota'])
      const value = numericFields.has(field) ? Number(rawValue) : rawValue
      const updated = { ...current, [field]: value }
      if (field === 'id') updated.descripcion = canonicalDescriptions[Number(value)] || ''
      updated.importe = Math.round(updated.base_imponible * updated.alicuota) / 100
      next[index] = updated
      return { ...prev, arcaTributos: next }
    })
  }

  const removeArcaTribute = (index: number) => {
    idempotencyKeyRef.current = null
    setFormData((prev) => ({
      ...prev,
      arcaTributos: prev.arcaTributos.filter((_, current) => current !== index),
    }))
  }

  if (!isOpen) return null

  const subtotal = formData.items.reduce((sum, item) => sum + (item.valorUnitario * item.cantidad), 0)
  const totalIgv = formData.items.reduce((sum, item) => sum + item.igv, 0)
  const totalOtrosTributos = formData.arcaTributos.reduce(
    (sum, tribute) => sum + tribute.importe,
    0,
  )
  const total = subtotal + totalIgv + totalOtrosTributos

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center overflow-y-auto bg-[rgba(0,_0,_0,_0.5)] p-4">
      <div className="max-h-[calc(100dvh-2rem)] w-[95%] max-w-[900px] overflow-y-auto rounded-xl bg-card p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-foreground">Nuevo Comprobante Electrónico</h2>
          <button
            onClick={onClose} className="border-0 text-2xl cursor-pointer text-muted-foreground"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Datos del Comprobante */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-4 text-foreground/85">
              Datos del Comprobante
            </h3>
            <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4">
              <div>
                <label htmlFor="cpe-modal-tipo-comprobante" className="block mb-2 font-semibold text-foreground/85">
                  Tipo de Comprobante *
                </label>
                <select id="cpe-modal-tipo-comprobante"
                  name="tipoComprobante"
                  value={formData.tipoComprobante}
                  onChange={handleChange}
                  required className="w-[100%] p-3 border rounded-[6px] text-sm"
                >
                  <option value="01">01 - {isArgentina ? 'Factura (clase según IVA)' : isColombia ? 'Factura electrónica' : 'Factura'}</option>
                  {!isArgentina && !isColombia && (
                    <option value="03">03 - Boleta de Venta</option>
                  )}
                </select>
              </div>

              <div>
                <label htmlFor="cpe-modal-serie" className="block mb-2 font-semibold text-foreground/85">
                  {isArgentina ? 'Punto de venta ARCA' : isColombia ? 'Prefijo fiscal' : 'Serie *'}
                </label>
                <input id="cpe-modal-serie"
                  type="text"
                  name="serie"
                  value={formData.serie}
                  onChange={handleChange}
                  readOnly={isArgentina || isColombia}
                  required={!isArgentina && !isColombia}
                  placeholder={isArgentina ? 'Configurado en ARCA' : isColombia ? 'Asignado por DIAN / sin prefijo' : undefined}
                  className="w-[100%] p-3 border rounded-[6px] text-sm"
                />
                {isColombia && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    El servidor usará exactamente el prefijo de la resolución DIAN vigente; puede no existir.
                  </p>
                )}
                {isArgentina && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    El servidor usará el punto {country.arcaPuntoVenta
                      ? String(country.arcaPuntoVenta).padStart(5, '0')
                      : 'pendiente de configurar'}; no se acepta un valor del navegador.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="cpe-modal-fecha-emision" className="block mb-2 font-semibold text-foreground/85">
                  Fecha de Emisión *
                </label>
                <input id="cpe-modal-fecha-emision"
                  type="date"
                  name="fechaEmision"
                  value={formData.fechaEmision}
                  onChange={handleChange}
                  required className="w-[100%] p-3 border rounded-[6px] text-sm"
                />
              </div>

              <div>
                <label htmlFor="cpe-modal-moneda" className="block mb-2 font-semibold text-foreground/85">
                  Moneda
                </label>
                <select id="cpe-modal-moneda"
                  name="moneda"
                  value={formData.moneda}
                  onChange={handleChange} className="w-[100%] p-3 border rounded-[6px] text-sm"
                >
                  {isArgentina ? (
                    <>
                      <option value="ARS">ARS - Pesos argentinos</option>
                      <option value="USD" disabled={country.isDemo}>
                        USD - Dólares estadounidenses{country.isDemo ? ' (requiere cuenta real)' : ''}
                      </option>
                    </>
                  ) : isColombia ? (
                    <option value="COP">COP - Pesos colombianos</option>
                  ) : (
                    <option value="PEN">PEN - Soles</option>
                  )}
                </select>
                {isArgentina && formData.moneda !== 'ARS' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    La cotización se consulta y congela desde ARCA en el servidor; no puede editarse desde el navegador.
                  </p>
                )}
                {isArgentina && country.isDemo && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    La demo trabaja en ARS y no consulta servicios externos de ARCA.
                  </p>
                )}
              </div>

              {isArgentina && (
                <>
                  {formData.moneda !== 'ARS' && (
                    <div>
                      <label htmlFor="cpe-modal-arca-misma-moneda" className="block mb-2 font-semibold text-foreground/85">
                        Cobro en la misma moneda extranjera *
                      </label>
                      <select
                        id="cpe-modal-arca-misma-moneda"
                        name="arcaPagoMismaMoneda"
                        value={formData.arcaPagoMismaMoneda}
                        onChange={handleChange}
                        required
                        className="w-[100%] p-3 border rounded-[6px] text-sm"
                      >
                        <option value="S">Sí — se cobra en USD</option>
                        <option value="N">No — se cobra convertido a pesos</option>
                      </select>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Informa CanMisMonExt a WSFEv1 según la moneda efectiva de cancelación.
                      </p>
                    </div>
                  )}
                  <div>
                    <label htmlFor="cpe-modal-arca-concepto" className="block mb-2 font-semibold text-foreground/85">
                      Concepto ARCA *
                    </label>
                    <select
                      id="cpe-modal-arca-concepto"
                      name="arcaConcepto"
                      value={formData.arcaConcepto}
                      onChange={handleChange}
                      required
                      className="w-[100%] p-3 border rounded-[6px] text-sm"
                    >
                      <option value={1}>1 - Productos</option>
                      <option value={2}>2 - Servicios</option>
                      <option value={3}>3 - Productos y servicios</option>
                    </select>
                  </div>
                  {formData.arcaConcepto !== 1 && (
                    <>
                      <div>
                        <label htmlFor="cpe-modal-servicio-desde" className="block mb-2 font-semibold text-foreground/85">
                          Servicio desde *
                        </label>
                        <input
                          id="cpe-modal-servicio-desde"
                          type="date"
                          name="arcaFechaServicioDesde"
                          value={formData.arcaFechaServicioDesde}
                          onChange={handleChange}
                          required
                          className="w-[100%] p-3 border rounded-[6px] text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="cpe-modal-servicio-hasta" className="block mb-2 font-semibold text-foreground/85">
                          Servicio hasta *
                        </label>
                        <input
                          id="cpe-modal-servicio-hasta"
                          type="date"
                          name="arcaFechaServicioHasta"
                          min={formData.arcaFechaServicioDesde}
                          value={formData.arcaFechaServicioHasta}
                          onChange={handleChange}
                          required
                          className="w-[100%] p-3 border rounded-[6px] text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="cpe-modal-arca-vencimiento" className="block mb-2 font-semibold text-foreground/85">
                          Vencimiento de pago *
                        </label>
                        <input
                          id="cpe-modal-arca-vencimiento"
                          type="date"
                          name="arcaFechaVencimientoPago"
                          min={formData.fechaEmision}
                          value={formData.arcaFechaVencimientoPago}
                          onChange={handleChange}
                          required
                          className="w-[100%] p-3 border rounded-[6px] text-sm"
                        />
                      </div>
                    </>
                  )}
                </>
              )}

              {isColombia && (
                <>
                  <div>
                    <label htmlFor="cpe-modal-condicion-pago" className="block mb-2 font-semibold text-foreground/85">
                      Forma de pago *
                    </label>
                    <select
                      id="cpe-modal-condicion-pago"
                      name="condicionPago"
                      value={formData.condicionPago}
                      onChange={handleChange}
                      required
                      className="w-[100%] p-3 border rounded-[6px] text-sm"
                    >
                      <option value="CONTADO">Contado</option>
                      <option value="CREDITO">Crédito</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="cpe-modal-medio-pago" className="block mb-2 font-semibold text-foreground/85">
                      Medio de pago DIAN *
                    </label>
                    <select
                      id="cpe-modal-medio-pago"
                      name="medioPago"
                      value={formData.medioPago}
                      onChange={handleChange}
                      required
                      className="w-[100%] p-3 border rounded-[6px] text-sm"
                    >
                      <option value="10">10 - Efectivo</option>
                      <option value="42">42 - Consignación bancaria</option>
                      <option value="47">47 - Transferencia bancaria</option>
                      <option value="48">48 - Tarjeta de crédito</option>
                      <option value="49">49 - Tarjeta débito</option>
                    </select>
                  </div>
                  {formData.condicionPago === 'CREDITO' && (
                    <>
                      <div>
                        <label htmlFor="cpe-modal-plazo-pago" className="block mb-2 font-semibold text-foreground/85">
                          Plazo (días) *
                        </label>
                        <input
                          id="cpe-modal-plazo-pago"
                          type="number"
                          name="plazoPagoDias"
                          min="1"
                          step="1"
                          value={formData.plazoPagoDias}
                          onChange={handleChange}
                          required
                          className="w-[100%] p-3 border rounded-[6px] text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="cpe-modal-fecha-vencimiento" className="block mb-2 font-semibold text-foreground/85">
                          Fecha de vencimiento *
                        </label>
                        <input
                          id="cpe-modal-fecha-vencimiento"
                          type="date"
                          name="fechaVencimiento"
                          min={formData.fechaEmision}
                          value={formData.fechaVencimiento}
                          onChange={handleChange}
                          required
                          className="w-[100%] p-3 border rounded-[6px] text-sm"
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Datos del Cliente */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-4 text-foreground/85">
              Datos del Cliente
            </h3>
            {(isArgentina || isColombia) && (
              <div className="mb-4">
                <label className="block mb-2 font-semibold text-foreground/85">
                  {isArgentina ? 'Cliente maestro con condición IVA' : 'Cliente maestro con perfil DIAN'} *
                </label>
                <ClienteSelector
                  value={formData.clienteId}
                  onChange={seleccionarClienteFiscal}
                  baseEndpoint="/api/cpe/receptores"
                  error={submitError && !formData.clienteId ? submitError : undefined}
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  {isArgentina
                    ? 'El documento, nombre y condición IVA se tomarán del maestro para resolver la clase A/B/C.'
                    : 'El NIT, nombre y perfil tributario se tomarán del maestro para evitar inconsistencias ante DIAN.'}
                </p>
                {isArgentina && selectedFiscalClient?.arca_condicion_iva && (
                  <p className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                    Receptor: {selectedFiscalClient.arca_condicion_iva.replaceAll('_', ' ')} · Emisor: {(country.arcaCondicionIva || 'PENDIENTE').replaceAll('_', ' ')} · Clase resultante: {resolvedArgentinaClass || 'pendiente'}
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-4">
              <div>
                <label htmlFor="cpe-modal-cliente-tipo-documento" className="block mb-2 font-semibold text-foreground/85">
                  Tipo de identificación *
                </label>
                {isArgentina ? (
                  <input
                    id="cpe-modal-cliente-tipo-documento"
                    value={argentinaDocumentLabel(formData.clienteTipoDocumento)}
                    readOnly
                    className="w-[100%] p-3 border rounded-[6px] text-sm bg-muted"
                  />
                ) : (
                  <select
                    id="cpe-modal-cliente-tipo-documento"
                    name="clienteTipoDocumento"
                    value={formData.clienteTipoDocumento}
                    onChange={handleChange}
                    disabled={isColombia}
                    required
                    className="w-[100%] p-3 border rounded-[6px] text-sm"
                  >
                    {isColombia ? (
                    <>
                      <option value="NIT">NIT</option>
                      <option value="CC">Cédula de ciudadanía</option>
                      <option value="CE">Cédula de extranjería</option>
                      <option value="TI">Tarjeta de identidad</option>
                      <option value="PASAPORTE">Pasaporte</option>
                    </>
                  ) : (
                    <>
                      <option value="RUC">RUC</option>
                      <option value="DNI">DNI</option>
                    </>
                    )}
                  </select>
                )}
              </div>
              <div>
                <label htmlFor="cpe-modal-cliente-ruc" className="block mb-2 font-semibold text-foreground/85">
                  {isArgentina ? 'CUIT/CUIL/CDI/DNI' : isColombia ? 'NIT/CC' : 'RUC/DNI'} *
                </label>
                <input id="cpe-modal-cliente-ruc"
                  type="text"
                  name="clienteRuc"
                  value={formData.clienteRuc}
                  onChange={handleChange}
                  readOnly={isArgentina || isColombia}
                  required className="w-[100%] p-3 border rounded-[6px] text-sm"
                />
                <ConsultaRuc
                  ruc={formData.clienteRuc}
                  activo={!isArgentina && !isColombia}
                  onEncontrado={rellenarConElPadron}
                />
              </div>

              <div>
                <label htmlFor="cpe-modal-cliente-razon-social" className="block mb-2 font-semibold text-foreground/85">
                  Razón Social/Nombre *
                </label>
                <input id="cpe-modal-cliente-razon-social"
                  type="text"
                  name="clienteRazonSocial"
                  value={formData.clienteRazonSocial}
                  onChange={handleChange}
                  readOnly={isArgentina || isColombia}
                  required className="w-[100%] p-3 border rounded-[6px] text-sm"
                />
              </div>

              <div>
                <label htmlFor="cpe-modal-cliente-direccion" className="block mb-2 font-semibold text-foreground/85">
                  Dirección
                </label>
                <input id="cpe-modal-cliente-direccion"
                  type="text"
                  name="clienteDireccion"
                  value={formData.clienteDireccion}
                  onChange={handleChange}
                  readOnly={isArgentina || isColombia} className="w-[100%] p-3 border rounded-[6px] text-sm"
                />
              </div>
            </div>
          </div>

          {isArgentina && (
            <div className="mb-8">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold text-foreground/85">Otros tributos ARCA</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Agrega percepciones u otros tributos distintos del IVA sólo cuando correspondan.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addArcaTribute}
                  className="rounded-[6px] border bg-[rgba(59,_130,_246,_0.1)] px-4 py-2 text-sm text-blue-500"
                >
                  + Agregar tributo
                </button>
              </div>
              {formData.arcaTributos.map((tribute, index) => (
                <div key={index} data-testid={`arca-tributo-${index}`} className="mb-3 grid grid-cols-1 gap-3 rounded-lg border bg-muted p-4 md:grid-cols-2 xl:grid-cols-[1.1fr_1.4fr_1fr_1fr_1fr_auto]">
                  <div>
                    <label htmlFor={`arca-tributo-tipo-${index}`} className="mb-2 block text-sm font-semibold">Tipo</label>
                    <select
                      id={`arca-tributo-tipo-${index}`}
                      value={tribute.id}
                      onChange={(event) => updateArcaTribute(index, 'id', event.target.value)}
                      className="w-full rounded border p-2 text-sm"
                    >
                      <option value={1}>Nacional</option>
                      <option value={2}>Provincial</option>
                      <option value={3}>Municipal</option>
                      <option value={4}>Interno</option>
                      <option value={99}>Otro</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`arca-tributo-descripcion-${index}`} className="mb-2 block text-sm font-semibold">Descripción</label>
                    <input
                      id={`arca-tributo-descripcion-${index}`}
                      value={tribute.descripcion}
                      maxLength={80}
                      onChange={(event) => updateArcaTribute(index, 'descripcion', event.target.value)}
                      required
                      className="w-full rounded border p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor={`arca-tributo-base-${index}`} className="mb-2 block text-sm font-semibold">Base</label>
                    <input
                      id={`arca-tributo-base-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={tribute.base_imponible}
                      onChange={(event) => updateArcaTribute(index, 'base_imponible', event.target.value)}
                      required
                      className="w-full rounded border p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor={`arca-tributo-alicuota-${index}`} className="mb-2 block text-sm font-semibold">Alícuota %</label>
                    <input
                      id={`arca-tributo-alicuota-${index}`}
                      type="number"
                      min="0"
                      max="999.99"
                      step="0.01"
                      value={tribute.alicuota}
                      onChange={(event) => updateArcaTribute(index, 'alicuota', event.target.value)}
                      required
                      className="w-full rounded border p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor={`arca-tributo-importe-${index}`} className="mb-2 block text-sm font-semibold">Importe</label>
                    <input
                      id={`arca-tributo-importe-${index}`}
                      type="number"
                      value={tribute.importe.toFixed(2)}
                      readOnly
                      className="w-full rounded border bg-muted p-2 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Eliminar tributo ${index + 1}`}
                    onClick={() => removeArcaTribute(index)}
                    className="self-end rounded border bg-destructive/10 px-3 py-2 text-red-500"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Items */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-foreground/85">
                Detalle de Items
              </h3>
              <button
                type="button"
                onClick={addItem} className="py-2 px-4 rounded-[6px] border bg-[rgba(59,_130,_246,_0.1)] text-blue-500 cursor-pointer text-sm"
              >
                + Agregar Item
              </button>
            </div>

            {formData.items.map((item, index) => (
              <div
                key={index}
                data-testid={`cpe-item-${index}`}
                className="border rounded-lg p-4 mb-4 bg-muted"
              >
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-base font-semibold text-foreground/85">
                    Item {index + 1}
                  </h4>
                  {formData.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)} className="py-1 px-2 rounded-[4px] border bg-destructive/10 text-red-500 cursor-pointer text-[0.8rem]"
                    >
                      Eliminar
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-[repeat(auto-fit,_minmax(150px,_1fr))] gap-4">
                  <div>
                    <label htmlFor={`cpe-item-codigo-${index}`} className="block mb-2 font-semibold text-foreground/85">
                      Código
                    </label>
                    <input id={`cpe-item-codigo-${index}`}
                      type="text"
                      value={item.codigo}
                      onChange={(e) => handleItemChange(index, 'codigo', e.target.value)} className="w-[100%] p-2 border rounded-[4px] text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor={`cpe-item-descripcion-${index}`} className="block mb-2 font-semibold text-foreground/85">
                      Descripción *
                    </label>
                    <input id={`cpe-item-descripcion-${index}`}
                      type="text"
                      value={item.descripcion}
                      onChange={(e) => handleItemChange(index, 'descripcion', e.target.value)}
                      required className="w-[100%] p-2 border rounded-[4px] text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor={`cpe-item-cantidad-${index}`} className="block mb-2 font-semibold text-foreground/85">
                      Cantidad *
                    </label>
                    <input id={`cpe-item-cantidad-${index}`}
                      type="number"
                      value={item.cantidad}
                      onChange={(e) => handleItemChange(index, 'cantidad', parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                      required className="w-[100%] p-2 border rounded-[4px] text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor={`cpe-item-valor-unitario-${index}`} className="block mb-2 font-semibold text-foreground/85">
                      Valor Unitario *
                    </label>
                    <input id={`cpe-item-valor-unitario-${index}`}
                      type="number"
                      value={item.valorUnitario}
                      onChange={(e) => handleItemChange(index, 'valorUnitario', parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                      required className="w-[100%] p-2 border rounded-[4px] text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor={`cpe-item-impuesto-${index}`} className="block mb-2 font-semibold text-foreground/85">
                      {nombreImpuesto}
                    </label>
                    <input
                      id={`cpe-item-impuesto-${index}`}
                      type="number"
                      value={item.igv.toFixed(2)}
                      readOnly className="w-[100%] p-2 border rounded-[4px] text-sm bg-muted"
                    />
                  </div>

                  {(isArgentina || isColombia) && (
                    <div>
                      <label
                        htmlFor={`cpe-item-afectacion-${index}`}
                        className="block mb-2 font-semibold text-foreground/85"
                      >
                        {isArgentina ? 'Tratamiento IVA ARCA *' : 'Afectación IVA DIAN *'}
                      </label>
                      <select
                        id={`cpe-item-afectacion-${index}`}
                        data-testid={`cpe-item-afectacion-${index}`}
                        value={item.afectacionIgv}
                        onChange={(e) => handleItemChange(index, 'afectacionIgv', e.target.value)}
                        required
                        className="w-[100%] p-2 border rounded-[4px] text-sm"
                      >
                        <option value="10">10 - Gravado con IVA</option>
                        <option value="20">20 - Exento de IVA</option>
                        <option value="30">30 - {isArgentina ? 'No gravado' : 'Excluido de IVA'}</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label htmlFor={`cpe-item-total-${index}`} className="block mb-2 font-semibold text-foreground/85">
                      Total
                    </label>
                    <input id={`cpe-item-total-${index}`}
                      type="number"
                      value={item.total.toFixed(2)}
                      readOnly className="w-[100%] p-2 border rounded-[4px] text-sm bg-muted font-semibold"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Totales */}
          <div className="bg-muted/30 p-6 rounded-lg mb-8 border">
            <h3 className="text-xl font-semibold mb-4 text-foreground/85">
              Resumen
            </h3>
            <div className={`grid grid-cols-1 gap-4 text-right sm:grid-cols-2 ${isArgentina ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
              <div>
                <div className="font-semibold text-muted-foreground">Subtotal:</div>
                <div className="text-base font-semibold">{formatMoney(subtotal, formData.moneda)}</div>
              </div>
              <div>
                <div className="font-semibold text-muted-foreground">{nombreImpuesto} ({taxPercent}%):</div>
                <div className="text-base font-semibold">{formatMoney(totalIgv, formData.moneda)}</div>
              </div>
              {isArgentina && (
                <div>
                  <div className="font-semibold text-muted-foreground">Otros tributos:</div>
                  <div className="text-base font-semibold">{formatMoney(totalOtrosTributos, formData.moneda)}</div>
                </div>
              )}
              <div>
                <div className="font-semibold text-muted-foreground">Total:</div>
                <div className="text-[1.3rem] font-bold text-emerald-400">{formatMoney(total, formData.moneda)}</div>
              </div>
            </div>
          </div>

          {/* Observaciones */}
          <div className="mb-8">
            <label htmlFor="cpe-modal-observaciones" className="block mb-2 font-semibold text-foreground/85">
              Observaciones
            </label>
            <textarea id="cpe-modal-observaciones"
              name="observaciones"
              value={formData.observaciones}
              onChange={handleChange}
              rows={3} className="w-[100%] p-3 border rounded-[6px] text-sm"
            />
          </div>

          {submitError && (
            <div
              role="alert"
              className="mb-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800"
            >
              {submitError}
            </div>
          )}

          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={onClose} className="py-3 px-6 border rounded-[6px] bg-card text-foreground/85 cursor-pointer font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={api.loading} className="py-3 px-6 border-0 rounded-[6px] text-white font-semibold"
            >
              {api.loading ? 'Creando...' : 'Crear Comprobante'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
