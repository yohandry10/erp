import {getActiveCountryByCode} from '../../../lib/initial-country'

// Positive isolated UI fixtures must use the same scoped envelope as the API.
// Supplied values stay intact so intentional malformed/foreign values still fail.
export function fiscalCountryFixture(tenantId: string, supplied: Record<string, any>) {
  const code = supplied.pais ?? supplied.paisCodigo
  const country = typeof code === 'string' ? getActiveCountryByCode(code) : null
  if (!tenantId || !country) throw new Error('A positive fiscal fixture requires an explicit tenant and supported country')
  const data = {
    id: 'f1cc0000-0000-4000-8000-000000000001',
    tenantId,
    pais: country.codigo_iso,
    pais_id: country.id,
    monedaDefecto: country.moneda_codigo,
    igvPorcentaje: null,
    isDemo: false,
    arcaPuntoVenta: null,
    arcaCondicionIva: null,
    ...supplied,
  }
  return {success: true, requiresSetup: data.pais == null || data.pais_id == null, data}
}
