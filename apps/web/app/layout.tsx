import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { SessionProvider } from '@/components/providers/session-provider'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as HotToaster } from 'react-hot-toast'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ERP Suite - Sistema Tributario Peruano',
  description: 'Sistema completo para gestión tributaria con CPE, GRE y SIRE',
}

export const dynamic = 'force-dynamic'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <div className="app-wrapper">
          <SessionProvider session={null}>
            {children}
            <Toaster />
            <HotToaster />
          </SessionProvider>
        </div>
      </body>
    </html>
  )
} 