'use client'

import { useCallback } from 'react'
import { useCountryContext } from '@/hooks/use-country-context'

export function useLocalizedMoney() {
  const country = useCountryContext()
  const currency = country.moneda || (country.paisCodigo === 'AR' ? 'ARS' : country.paisCodigo === 'CO' ? 'COP' : 'PEN')
  const locale = country.locale || (country.paisCodigo === 'AR' ? 'es-AR' : country.paisCodigo === 'CO' ? 'es-CO' : 'es-PE')
  const symbol = country.simboloMoneda || (country.paisCodigo === 'PE' ? 'S/' : '$')

  const formatCurrency = useCallback(
    (amount: number, selectedCurrency = currency) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: selectedCurrency,
        minimumFractionDigits: 2,
      }).format(Number(amount || 0)),
    [currency, locale],
  )

  return {
    country,
    currency,
    locale,
    symbol,
    taxIdLabel: country.paisCodigo === 'AR' ? 'CUIT' : country.paisCodigo === 'CO' ? 'NIT' : 'RUC',
    taxName: country.paisCodigo === 'PE' ? 'IGV' : 'IVA',
    formatCurrency,
  }
}
