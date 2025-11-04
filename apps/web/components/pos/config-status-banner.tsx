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
    <div
      style={{
        background: 'linear-gradient(135deg, #FFF3CD 0%, #FFE69C 100%)',
        border: '2px solid #FFC107',
        borderRadius: 'var(--border-radius)',
        padding: '1rem 1.5rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}
    >
      <div style={{ fontSize: '2rem' }}>⚠️</div>
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: 0, color: '#856404', fontSize: '1.1rem', fontWeight: 'bold' }}>
          Configuración Incompleta
        </h3>
        <p style={{ margin: '0.5rem 0 0 0', color: '#856404' }}>
          Las ventas pueden fallar si no se completa la configuración.
        </p>
      </div>
      <button
        onClick={onOpenWizard}
        className="btn"
        style={{
          background: '#FFC107',
          color: '#856404',
          border: 'none',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
        }}
      >
        Completar Configuración
      </button>
    </div>
  );
}
