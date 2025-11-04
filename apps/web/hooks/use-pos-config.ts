import { useState, useEffect } from 'react';

interface PosConfig {
  isConfigured: boolean;
  hasCompletedWizard: boolean;
}

const POS_CONFIG_KEY = 'pos_wizard_completed';
const POS_CONFIG_TENANT_KEY = 'pos_wizard_tenant_id';

export function usePosConfig() {
  const [config, setConfig] = useState<PosConfig>({
    isConfigured: false,
    hasCompletedWizard: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkConfiguration();
  }, []);

  const getCurrentTenantId = (): string | null => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        return user?.tenant_id || null;
      }
    } catch (error) {
      console.error('Error getting tenant ID:', error);
    }
    return null;
  };

  const checkConfiguration = () => {
    try {
      const currentTenantId = getCurrentTenantId();
      const savedTenantId = localStorage.getItem(POS_CONFIG_TENANT_KEY);
      const wizardCompleted = localStorage.getItem(POS_CONFIG_KEY) === 'true';
      
      console.log('🔍 Verificando configuración POS:', {
        currentTenantId,
        savedTenantId,
        wizardCompleted,
      });
      
      // Si el tenant cambió, resetear la configuración
      if (currentTenantId && savedTenantId && currentTenantId !== savedTenantId) {
        console.log('🔄 Tenant cambió, reseteando configuración');
        localStorage.removeItem(POS_CONFIG_KEY);
        localStorage.setItem(POS_CONFIG_TENANT_KEY, currentTenantId);
        setConfig({
          isConfigured: false,
          hasCompletedWizard: false,
        });
      } else {
        // Verificar si el wizard ya fue completado para este tenant
        console.log(`✅ Wizard ${wizardCompleted ? 'completado' : 'no completado'} para este tenant`);
        setConfig({
          isConfigured: wizardCompleted,
          hasCompletedWizard: wizardCompleted,
        });
      }
    } catch (error) {
      console.error('Error checking POS configuration:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const markWizardAsCompleted = () => {
    try {
      const currentTenantId = getCurrentTenantId();
      console.log('✅ Marcando wizard como completado para tenant:', currentTenantId);
      localStorage.setItem(POS_CONFIG_KEY, 'true');
      if (currentTenantId) {
        localStorage.setItem(POS_CONFIG_TENANT_KEY, currentTenantId);
      }
      setConfig({
        isConfigured: true,
        hasCompletedWizard: true,
      });
      console.log('✅ Configuración guardada en localStorage');
    } catch (error) {
      console.error('Error marking wizard as completed:', error);
    }
  };

  const resetConfiguration = () => {
    try {
      localStorage.removeItem(POS_CONFIG_KEY);
      localStorage.removeItem(POS_CONFIG_TENANT_KEY);
      setConfig({
        isConfigured: false,
        hasCompletedWizard: false,
      });
    } catch (error) {
      console.error('Error resetting configuration:', error);
    }
  };

  return {
    ...config,
    isLoading,
    markWizardAsCompleted,
    resetConfiguration,
    checkConfiguration,
  };
}
