'use client'

import Sidebar from '../../components/layout/sidebar'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { EmpresaConfigProvider } from '@/hooks/use-empresa-config'
import { useAuth } from '@/contexts/AuthContext'
import { DemoBanner } from '@/components/demo/DemoBanner'
import { HelpBot } from '@/components/help'
import { OnboardingProvider } from '@/components/onboarding'
import { DashboardThemeToggle } from '@/components/ui/dashboard-theme-toggle'
import { useCountryContext } from '@/hooks/use-country-context'
import { NotificationBell } from '@/components/notifications'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { session, loading: authLoading } = useAuth()
  const country = useCountryContext()
  const [dashboardTheme, setDashboardTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const storedTheme = window.localStorage.getItem('erp-dashboard-theme')
    if (storedTheme === 'light' || storedTheme === 'dark') {
      setDashboardTheme(storedTheme)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.erpTheme = dashboardTheme
    window.localStorage.setItem('erp-dashboard-theme', dashboardTheme)
  }, [dashboardTheme])

  // ✅ SOLUCIÓN: Usar AuthContext en lugar de verificación manual
  useEffect(() => {
    if (authLoading) {
      return
    }

    if (!session) {
      router.replace('/login')
      return
    }
  }, [session, authLoading, router])

  useEffect(() => {
    if (authLoading || !session) {
      return
    }

    if (country.loading) {
      return
    }

    const isWizardRoute = pathname?.startsWith('/dashboard/wizard')
    if (country.requiresSetup && !isWizardRoute) {
      router.replace('/dashboard/wizard')
    }
  }, [authLoading, session, country.loading, country.requiresSetup, pathname, router])

  if (!authLoading && !session) {
    return null
  }

  const isWizardRoute = pathname?.startsWith('/dashboard/wizard')
  if (!authLoading && session && !country.loading && country.requiresSetup && !isWizardRoute) {
    return null
  }

  return (
    <EmpresaConfigProvider>
      <OnboardingProvider>
        <div data-erp-theme={dashboardTheme} className="group/dashboard relative flex min-h-screen flex-col overflow-hidden">
          {/* 🎯 DEMO: Banner visible para tenants demo */}
          <DemoBanner />
          
          <div className="relative flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="relative ml-0 min-h-full max-w-[100vw] flex-1 overflow-auto bg-gradient-to-br from-slate-950 via-sky-950 to-slate-950 p-4 transition-[margin-left,background-color] duration-300 ease-out group-data-[erp-theme=light]/dashboard:from-slate-50 group-data-[erp-theme=light]/dashboard:via-slate-100 group-data-[erp-theme=light]/dashboard:to-slate-200 md:ml-[240px] md:max-w-[calc(100vw-240px)] md:p-6 lg:ml-[280px] lg:max-w-[calc(100vw-280px)] lg:p-8" data-theme={dashboardTheme}>
              <div className="fixed right-5 top-5 z-50 flex items-center gap-2">
                <NotificationBell />
                <DashboardThemeToggle
                  theme={dashboardTheme}
                  onToggle={() => setDashboardTheme((theme) => (theme === 'dark' ? 'light' : 'dark'))}
                  className="static"
                />
              </div>
              {children}
            </main>
          </div>
          
          {/* 🤖 Bot de Ayuda - Disponible en todo el dashboard */}
          <HelpBot />
        </div>
      </OnboardingProvider>
    </EmpresaConfigProvider>
  )
}
