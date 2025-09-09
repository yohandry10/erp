'use client'

import * as React from 'react'
import { usePaises, type Pais } from './use-paises'

type ChildrenProps = { children: React.ReactNode }

interface CountryContextType {
  selectedCountry: Pais | null
  setSelectedCountry: (country: Pais | null) => void
  isLoading: boolean
}

const defaultContextValue: CountryContextType = {
  selectedCountry: null,
  setSelectedCountry: () => {
    // eslint-disable-next-line no-console
    console.warn('CountryProvider no está montado')
  },
  isLoading: true,
}

const CountryContext = React.createContext<CountryContextType>(defaultContextValue)

export function CountryProvider({ children }: ChildrenProps) {
  const [selectedCountry, setSelectedCountryState] = React.useState<Pais | null>(null)
  const { paises, loading } = usePaises()

  // Cargar país desde localStorage cuando haya lista de países
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const savedCountryId = window.localStorage.getItem('selectedCountry')
    if (savedCountryId && paises.length > 0) {
      const country = paises.find((p) => String(p.id) === savedCountryId)
      if (country) setSelectedCountryState(country)
    }
  }, [paises])

  // Setter con persistencia
  const setSelectedCountry = React.useCallback((country: Pais | null) => {
    setSelectedCountryState(country)
    if (typeof window === 'undefined') return
    if (country) {
      window.localStorage.setItem('selectedCountry', String(country.id))
    } else {
      window.localStorage.removeItem('selectedCountry')
    }
  }, [])

  const contextValue = React.useMemo<CountryContextType>(
    () => ({
      selectedCountry,
      setSelectedCountry,
      isLoading: loading,
    }),
    [selectedCountry, setSelectedCountry, loading]
  )

  // 🔧 Sin JSX para evitar el error del Provider en tu IDE
  return React.createElement(
    CountryContext.Provider,
    { value: contextValue as CountryContextType },
    children
  )
}

export function useCountryContext(): CountryContextType {
  const context = React.useContext(CountryContext)
  return context
}
