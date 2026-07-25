import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { SessionProvider } from '@/components/providers/session-provider'
import { QueryProvider } from '@/components/providers/query-provider'
import { AuthProvider } from '@/contexts/AuthContext'
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
    <html lang="es" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        {/* Fija el tema antes del primer paint solo en superficies que usan el
            contrato del dashboard. Las rutas públicas conservan sus propios
            estilos y no heredan accidentalmente la preferencia almacenada. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=location.pathname;var uses=p==='/dashboard'||p.indexOf('/dashboard/')===0||p==='/superadmin'||p.indexOf('/superadmin/')===0||p==='/demo/convert'||p.indexOf('/demo/convert/')===0;if(!uses){delete document.documentElement.dataset.erpTheme;return;}var t=localStorage.getItem('erp-dashboard-theme');document.documentElement.dataset.erpTheme=(t==='light')?'light':'dark';}catch(e){delete document.documentElement.dataset.erpTheme;}})();`,
          }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <div className="app-wrapper">
          <ErrorBoundary>
            <QueryProvider>
              <AuthProvider>
                <SessionProvider session={null}>
                  <TenantProvider>
                    {children}
                    <Toaster />
                    <HotToaster
                      toastOptions={{
                        style: {
                          background: 'hsl(var(--background))',
                          color: 'hsl(var(--foreground))',
                          border: '1px solid hsl(var(--border))',
                        },
                      }}
                    />
                  </TenantProvider>
                </SessionProvider>
              </AuthProvider>
            </QueryProvider>
          </ErrorBoundary>
        </div>
        <div id="modal-root" />
      </body>
    </html>
  )
}
