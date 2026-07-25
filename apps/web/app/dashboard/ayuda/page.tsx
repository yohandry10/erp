'use client'

import { OnboardingSettings } from '@/components/onboarding'
import { BookOpen, HelpCircle, Keyboard, MessageCircle } from 'lucide-react'
import { PageShell } from '@/components/erp/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const shortcuts = [
  { label: 'Buscar producto POS', key: 'F2' },
  { label: 'Enfocar escáner POS', key: 'F4' },
  { label: 'Abrir cobro POS', key: 'F8' },
  { label: 'Salir de modo caja', key: 'Esc' },
]

export default function AyudaPage() {
  return (
    <PageShell
      title="Centro de Ayuda"
      description="Tours interactivos, asistente contextual y atajos operativos del ERP."
    >
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white group-data-[erp-theme=light]/dashboard:text-foreground">
              <BookOpen className="h-5 w-5 text-primary group-data-[erp-theme=light]/dashboard:text-blue-600" />
              Tours Interactivos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OnboardingSettings />
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white group-data-[erp-theme=light]/dashboard:text-foreground">
                <MessageCircle className="h-5 w-5 text-primary group-data-[erp-theme=light]/dashboard:text-blue-600" />
                Asistente de Ayuda
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
                Usa el botón de ayuda inferior para consultar funciones del sistema según tu rol y permisos.
              </p>
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm text-primary group-data-[erp-theme=light]/dashboard:border-blue-100 group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-800">
                El asistente debe responder con contexto del módulo activo y sin exponer datos fuera del tenant.
              </div>
            </CardContent>
          </Card>

          <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white group-data-[erp-theme=light]/dashboard:text-foreground">
                <Keyboard className="h-5 w-5 text-primary group-data-[erp-theme=light]/dashboard:text-blue-600" />
                Atajos Útiles
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {shortcuts.map((shortcut) => (
                <div
                  key={shortcut.key}
                  className="flex items-center justify-between rounded-2xl border border-cyan-400/15 bg-card/50 p-3 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted/30"
                >
                  <span className="text-sm text-foreground/90 group-data-[erp-theme=light]/dashboard:text-foreground/85">{shortcut.label}</span>
                  <Badge className="border-blue-300/25 bg-blue-300/10 font-mono text-blue-700 dark:text-blue-200 group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700">
                    {shortcut.key}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
