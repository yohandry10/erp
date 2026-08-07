'use client';

import { usePosConfig } from '@/hooks/use-pos-config';
import { ConfigurationStatus } from '@/app/dashboard/hooks/useConfigurationStatus';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface ConfigStatusBannerProps {
  onOpenWizard: () => void;
  configurationStatus?: ConfigurationStatus | null;
}

export function ConfigStatusBanner({ onOpenWizard, configurationStatus }: ConfigStatusBannerProps) {
  const { isConfigured, isLoading } = usePosConfig();

  // No mostrar nada mientras carga
  if (isLoading) {
    return null;
  }

  // Si el wizard ya fue completado manualmente, no mostrar el banner
  if (isConfigured) {
    console.log('✅ Banner oculto: wizard marcado como completado');
    return null;
  }

  // Si hay configurationStatus del API y está completo, no mostrar el banner
  if (configurationStatus && (configurationStatus.isDemo || configurationStatus.isComplete)) {
    console.log('✅ Banner oculto: configuración completa según API');
    return null;
  }

  // Si hay configurationStatus pero no hay items faltantes, no mostrar el banner
  if (configurationStatus && configurationStatus.missingItems && configurationStatus.missingItems.length === 0) {
    console.log('✅ Banner oculto: no hay items faltantes');
    return null;
  }

  console.log('⚠️ Mostrando banner de configuración incompleta');

  // Mostrar banner de configuración incompleta con estilos consistentes del sistema
  return (
    <Alert className="mb-6 border-amber-500/40 bg-amber-500/10 text-foreground">
      <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
      <div className="flex flex-col gap-3 pr-0 sm:flex-row sm:items-center sm:justify-between sm:pr-2">
        <div>
        <AlertTitle>Configuración incompleta</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Las ventas pueden fallar si no se completa la configuración.
        </AlertDescription>
        </div>
        <Button type="button" variant="warning" onClick={onOpenWizard} className="shrink-0">
          Completar configuración
        </Button>
      </div>
    </Alert>
  );
}
