import { expect, test } from '@playwright/test'
import { configurationWithoutLocalLogo } from '../../app/dashboard/wizard/wizard-logo'
import type { WizardConfiguration } from '../../app/dashboard/wizard/types'

const baseConfiguration: WizardConfiguration = {
  ruc: '20123456789',
  razonSocial: 'Empresa de prueba S.A.C.',
  direccion: 'Av. Prueba 123',
  ubigeo: '150101',
}

test.describe('Contrato del logo en el wizard', () => {
  test('excluye el archivo y la vista previa base64 del JSON principal', () => {
    const configuration = configurationWithoutLocalLogo({
      ...baseConfiguration,
      logoFile: { name: 'logo.png' } as File,
      logoBase64: 'data:image/png;base64,AAA=',
      logoUrl: 'data:image/png;base64,AAA=',
    })

    expect(configuration).toEqual(baseConfiguration)
    expect(JSON.stringify(configuration)).not.toContain('data:image')
  })

  test('excluye también una URL remota: sólo el endpoint multipart gestiona el logo', () => {
    const configuration = configurationWithoutLocalLogo({
      ...baseConfiguration,
      logoUrl: 'https://wypnbcptofqdmoynlonq.supabase.co/storage/v1/object/public/company-assets/tenant/logos/logo.png',
    })

    expect(configuration).toEqual(baseConfiguration)
    expect(JSON.stringify(configuration)).not.toContain('/storage/v1/object/public/')
  })
})
