'use client';

import { usePosConfig } from '@/hooks/use-pos-config';
import { ConfigurationStatus } from '@/app/dashboard/hooks/useConfigurationStatus';

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
  if (configurationStatus && configurationStatus.isComplete) {
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
    <div className="py-4 px-6 mb-6 flex items-center gap-4"
    >
      <div className="text-8">⚠️</div>
      <div className="flex-[1]">
        <h3 className="m-0 text-[#856404] text-4 font-bold">
          Configuración Incompleta
        </h3>
        <p className="mt-2 mr-0 mb-0 ml-0 text-[#856404]">
          Las ventas pueden fallar si no se completa la configuración.
        </p>
      </div>
      <button
        onClick={onOpenWizard}
        className="btn bg-[#FFC107] text-[#856404] border-0 font-bold whitespace-nowrap"
      >
        Completar Configuración
      </button>
    </div>
  );
}
