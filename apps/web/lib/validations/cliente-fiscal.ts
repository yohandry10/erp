import * as z from 'zod'
import { DianPerfilFiscal, TipoDocumento } from '@/types/ventas'
import { validateCountryTaxId } from '@/lib/country-tax-id'

export const dianPerfilFiscalSchema = z.nativeEnum(DianPerfilFiscal)

export function hasCapturableColombiaNitLength(value: string): boolean {
  return /^\d{10,11}$/.test(value)
}

type ClienteFiscalFormValue = {
  documento_tipo: TipoDocumento
  documento_numero: string
  dian_perfil_fiscal?: DianPerfilFiscal | ''
}

/**
 * Mantiene alineados el alta completa y el alta rápida con los constraints de
 * la migración 526 y con el validador de NIT/DV que también usa la API.
 */
export function validateClienteFiscalForm(
  data: ClienteFiscalFormValue,
  isColombia: boolean,
  context: z.RefinementCtx,
) {
  if ([TipoDocumento.RUC, TipoDocumento.CUIT, TipoDocumento.CUIL, TipoDocumento.CDI].includes(data.documento_tipo)) {
    if (!/^\d{11}$/.test(data.documento_numero)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El documento debe tener 11 dígitos',
        path: ['documento_numero'],
      })
    }
  } else if (data.documento_tipo === TipoDocumento.NIT) {
    if (
      !hasCapturableColombiaNitLength(data.documento_numero) ||
      !validateCountryTaxId('CO', data.documento_numero)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El NIT debe incluir un dígito de verificación válido',
        path: ['documento_numero'],
      })
    }
  } else if ([TipoDocumento.CC, TipoDocumento.TI].includes(data.documento_tipo)) {
    if (!/^[0-9]{6,10}$/.test(data.documento_numero)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El documento debe tener entre 6 y 10 dígitos',
        path: ['documento_numero'],
      })
    }
  } else if (data.documento_tipo === TipoDocumento.DNI && !/^\d{8}$/.test(data.documento_numero)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'El DNI debe tener 8 dígitos',
      path: ['documento_numero'],
    })
  }

  if (!isColombia) return

  if (!data.dian_perfil_fiscal) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Seleccione el perfil tributario DIAN del receptor',
      path: ['dian_perfil_fiscal'],
    })
  } else if (
    data.dian_perfil_fiscal === DianPerfilFiscal.ADQUIRIENTE_NIT_B2B &&
    data.documento_tipo !== TipoDocumento.NIT
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'El perfil adquirente NIT B2B exige documento NIT',
      path: ['dian_perfil_fiscal'],
    })
  } else if (
    data.dian_perfil_fiscal === DianPerfilFiscal.CONSUMIDOR_FINAL &&
    data.documento_tipo === TipoDocumento.NIT
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Un receptor con NIT no puede usar el perfil consumidor final',
      path: ['dian_perfil_fiscal'],
    })
  }
}
