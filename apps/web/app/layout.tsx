import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { SessionProvider } from '@/components/providers/session-provider'
import { TenantProvider } from '@/contexts/TenantContext'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as HotToaster } from 'react-hot-toast'
import { ErrorBoundary } from '@/components/error'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ERP Suite - Sistema Tributario Peruano',
  description: 'Sistema completo para gestión tributaria con CPE, GRE y SIRE',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <div className="app-wrapper">
          <ErrorBoundary>
            <SessionProvider session={null}>
              <TenantProvider>
                {children}
                <Toaster />
                <HotToaster />
              </TenantProvider>
            </SessionProvider>
          </ErrorBoundary>
        </div>
        <div id="modal-root" />
      </body>
    </html>
  )
}