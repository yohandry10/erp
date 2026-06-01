'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext'
import { fetchApi } from '@/lib/api-fetch';

interface DemoStatus {
  is_demo: boolean;
  is_expired: boolean;
  expires_at: string;
  created_at: string;
  dias_restantes: number;
  can_extend: boolean;
  conversion_attempted: boolean;
}

export function useDemoStatus() {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth()

  const fetchStatus = useCallback(async () => {
    try {
      if (!session?.user) {
        setLoading(false);
        return;
      }

      const response = await fetchApi('/api/demo/status');

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        setError(null);
      } else if (response.status === 401) {
        // Token inválido o expirado
        setError('Sesión expirada');
      } else {
        setError('Error al obtener estado de demo');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    loading,
    error,
    isDemoTenant: status?.is_demo || false,
    isExpired: status?.is_expired || false,
    diasRestantes: status?.dias_restantes || 0,
    canExtend: status?.can_extend || false,
    refetch: fetchStatus,
  };
}
