import { expect, test } from '@playwright/test'
import { readWizardCompany } from '../../app/dashboard/wizard/read-contract'

const company = { ruc: '20123456789', razonSocial: 'Empresa local', direccion: 'Av. Local 123',
  pais: 'PE', tipo_empresa: 'MICRO', serieFactura: 'F001', serieBoleta: 'B001',
  serieNotaCredito: null, isDemo: false, certificateConfigured: true, igvPorcentaje: 18 }
const response = (data: unknown) => ({ success: true, data })

test('Resumen del asistente: empresa válida sin serie opcional conserva el null', () => {
  expect(readWizardCompany(response(company))).toEqual(company)
  expect(readWizardCompany(response({ ...company, serieNotaCredito: 'FC01' }))).toMatchObject({ serieNotaCredito: 'FC01' })
})

test('Resumen del asistente: ausencia de propiedad y tipos inválidos siguen rechazados', () => {
  const { serieNotaCredito: _, ...missing } = company
  expect(() => readWizardCompany(response(missing))).toThrow(/incompleta/)
  for (const serieNotaCredito of [42, {}, false]) {
    expect(() => readWizardCompany(response({ ...company, serieNotaCredito }))).toThrow(/incompleta/)
  }
  expect(() => readWizardCompany(response({ ...company, igvPorcentaje: '18' }))).toThrow(/incompleta/)
  expect(() => readWizardCompany({ success: false, data: company })).toThrow(/confirmar/)
})
