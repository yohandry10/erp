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

export default function CpeModal({ isOpen, onClose, onSuccess }: CpeModalProps) {
  const country = useCountryContext()
  const isArgentina = country.paisCodigo === 'AR'
  const isColombia = country.paisCodigo === 'CO'
  const { tasaIgv, nombreImpuesto } = useTaxConfig()
  const taxPercent = Math.round(tasaIgv * 10000) / 100
  const automaticEmissionDateRef = useRef(fiscalDateForCountry(country.paisCodigo))
  const wasOpenRef = useRef(false)
  const formatMoney = (value: number) =>
    new Intl.NumberFormat(country.locale || 'es-PE', {
      style: 'currency',
      currency: country.moneda || 'PEN',
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
  const [selectedColombiaClient, setSelectedColombiaClient] = useState<Cliente | null>(null)
  const idempotencyKeyRef = useRef<string | null>(null)

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
      serie: isArgentina ? '00001' : isColombia ? '' : current.serie,
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
  }, [country.moneda, country.paisCodigo, isArgentina, isColombia, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (isColombia && !formData.clienteId) {
      setSubmitError('Selecciona un cliente maestro con perfil tributario DIAN antes de emitir.')
      return
    }
    if (isColombia && !selectedColombiaClient?.dian_perfil_fiscal) {
      setSubmitError('El cliente seleccionado no tiene perfil tributario DIAN. Edítalo antes de emitir.')
      return
    }

    // Calcular totales
    const subtotal = formData.items.reduce((sum, item) => sum + (item.valorUnitario * item.cantidad), 0)
    const totalIgv = formData.items.reduce((sum, item) => sum + item.igv, 0)
    const total = subtotal + totalIgv

    // Un ref cierra también la ventana de doble clic anterior al siguiente
    // render; dos submits concurrentes comparten la misma intención.
    const currentIdempotencyKey = idempotencyKeyRef.current ?? `cpe-ui-${crypto.randomUUID()}`
    idempotencyKeyRef.current = currentIdempotencyKey

    const { clienteId, serie, ...requestFormData } = formData
    const cpeData = {
      ...requestFormData,
      ...(!isColombia ? { serie } : {}),
      cliente_id: isColombia ? formData.clienteId : undefined,
      idempotency_key: currentIdempotencyKey,
      items: formData.items.map(({ afectacionIgv, ...item }) => ({
        ...item,
        ...(isColombia
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
      setSelectedColombiaClient(null)
      onSuccess()
      onClose()
      // Reset form
      const fiscalToday = fiscalDateForCountry(country.paisCodigo)
      automaticEmissionDateRef.current = fiscalToday
      setFormData({
        tipoComprobante: '01',
        serie: isArgentina ? '00001' : isColombia ? '' : 'F001',
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
    const normalizedValue = name === 'plazoPagoDias' ? Number(value) : value
    idempotencyKeyRef.current = null
    setSubmitError(null)
    setFormData(prev => ({
      ...prev,
      [name]: normalizedValue
    }))

    // Auto-update serie based on tipo comprobante
    if (name === 'tipoComprobante') {
      let newSerie = isArgentina ? '00001' : isColombia ? '' : 'F001'
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
  }

  // La fuente registral auxiliar avisa antes de emitir y propone la razón
  // social. No sustituye la validación oficial que hará SUNAT al recibir el CPE.
  const rellenarConElPadron = (dato: ContribuyenteConsultado) => {
    if (!dato.razonSocial) return
    setFormData(prev => (prev.clienteRazonSocial?.trim() ? prev : { ...prev, clienteRazonSocial: dato.razonSocial! }))
  }

  const seleccionarClienteColombia = (clienteId: string, cliente?: Cliente) => {
    idempotencyKeyRef.current = null
    setSubmitError(null)
    setSelectedColombiaClient(cliente ?? null)
    setFormData((current) => ({
      ...current,
      clienteId,
      clienteTipoDocumento: cliente?.documento_tipo ?? 'NIT',
      clienteRuc: String(cliente?.documento_numero ?? cliente?.numero_documento ?? cliente?.ruc ?? ''),
      clienteRazonSocial: cliente?.razon_social ?? '',
      clienteDireccion: cliente?.direccion ?? '',
    }))
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
      const igvItem = afectacionIgv === '10' ? subtotalItem * tasaIgv : 0
      const totalItem = subtotalItem + igvItem

      newItems[index] = {
        ...newItems[index],
        // En DIAN PriceAmount es el precio base de la línea. Mantener el valor
        // con IVA aquí produciría una Invoice que declara 119 como precio y
        // 100 como extensión para una unidad gravada al 19 %.
        precioUnitario: isColombia ? valorUnitario : valorUnitario * (1 + tasaIgv),
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

  if (!isOpen) return null

  const subtotal = formData.items.reduce((sum, item) => sum + (item.valorUnitario * item.cantidad), 0)
  const totalIgv = formData.items.reduce((sum, item) => sum + item.igv, 0)
  const total = subtotal + totalIgv

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
                  <option value="01">01 - {isArgentina ? 'Factura A' : isColombia ? 'Factura electrónica' : 'Factura'}</option>
                  {!isColombia && (
                    <option value="03">03 - {isArgentina ? 'Factura B' : 'Boleta de Venta'}</option>
                  )}
                </select>
              </div>

              <div>
                <label htmlFor="cpe-modal-serie" className="block mb-2 font-semibold text-foreground/85">
                  {isColombia ? 'Prefijo fiscal' : 'Serie *'}
                </label>
                <input id="cpe-modal-serie"
                  type="text"
                  name="serie"
                  value={formData.serie}
                  onChange={handleChange}
                  readOnly={isColombia}
                  required={!isColombia}
                  placeholder={isColombia ? 'Asignado por DIAN / sin prefijo' : undefined}
                  className="w-[100%] p-3 border rounded-[6px] text-sm"
                />
                {isColombia && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    El servidor usará exactamente el prefijo de la resolución DIAN vigente; puede no existir.
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
                    <option value="ARS">ARS - Pesos argentinos</option>
                  ) : isColombia ? (
                    <option value="COP">COP - Pesos colombianos</option>
                  ) : (
                    <option value="PEN">PEN - Soles</option>
                  )}
                </select>
              </div>

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
            {isColombia && (
              <div className="mb-4">
                <label className="block mb-2 font-semibold text-foreground/85">
                  Cliente maestro con perfil DIAN *
                </label>
                <ClienteSelector
                  value={formData.clienteId}
                  onChange={seleccionarClienteColombia}
                  baseEndpoint="/api/cpe/receptores"
                  error={submitError && !formData.clienteId ? submitError : undefined}
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  El NIT, nombre y perfil tributario se tomarán del maestro para evitar inconsistencias ante DIAN.
                </p>
              </div>
            )}
            <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-4">
              <div>
                <label htmlFor="cpe-modal-cliente-tipo-documento" className="block mb-2 font-semibold text-foreground/85">
                  Tipo de identificación *
                </label>
                <select
                  id="cpe-modal-cliente-tipo-documento"
                  name="clienteTipoDocumento"
                  value={formData.clienteTipoDocumento}
                  onChange={handleChange}
                  disabled={isColombia}
                  required
                  className="w-[100%] p-3 border rounded-[6px] text-sm"
                >
                  {isArgentina ? (
                    <>
                      <option value="CUIT">CUIT</option>
                      <option value="DNI">DNI</option>
                    </>
                  ) : isColombia ? (
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
              </div>
              <div>
                <label htmlFor="cpe-modal-cliente-ruc" className="block mb-2 font-semibold text-foreground/85">
                  {isArgentina ? 'CUIT/DNI' : isColombia ? 'NIT/CC' : 'RUC/DNI'} *
                </label>
                <input id="cpe-modal-cliente-ruc"
                  type="text"
                  name="clienteRuc"
                  value={formData.clienteRuc}
                  onChange={handleChange}
                  readOnly={isColombia}
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
                  readOnly={isColombia}
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
                  readOnly={isColombia} className="w-[100%] p-3 border rounded-[6px] text-sm"
                />
              </div>
            </div>
          </div>

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

                  {isColombia && (
                    <div>
                      <label
                        htmlFor={`cpe-item-afectacion-${index}`}
                        className="block mb-2 font-semibold text-foreground/85"
                      >
                        Afectación IVA DIAN *
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
                        <option value="30">30 - Excluido de IVA</option>
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
            <div className="grid grid-cols-[repeat(3,_1fr)] gap-4 text-right">
              <div>
                <div className="font-semibold text-muted-foreground">Subtotal:</div>
                <div className="text-base font-semibold">{formatMoney(subtotal)}</div>
              </div>
              <div>
                <div className="font-semibold text-muted-foreground">{nombreImpuesto} ({taxPercent}%):</div>
                <div className="text-base font-semibold">{formatMoney(totalIgv)}</div>
              </div>
              <div>
                <div className="font-semibold text-muted-foreground">Total:</div>
                <div className="text-[1.3rem] font-bold text-emerald-400">{formatMoney(total)}</div>
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
