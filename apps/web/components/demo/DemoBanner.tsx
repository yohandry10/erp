'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface DemoStatus {
  is_demo: boolean;
  is_expired: boolean;
  dias_restantes: number;
  can_extend: boolean;
}

export function DemoBanner() {
  const router = useRouter();
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDemoStatus();
  }, []);

  const fetchDemoStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
      const response = await fetch(`${apiUrl}/api/demo/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Error fetching demo status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExtend = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
      const response = await fetch(`${apiUrl}/api/demo/extend`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dias_extension: 7 }),
      });

      if (response.ok) {
        await fetchDemoStatus();
      }
    } catch (error) {
      console.error('Error extending demo:', error);
    }
  };

  const handleConvert = () => {
    router.push('/demo/convert');
  };

  if (loading || !status || !status.is_demo || dismissed) {
    return null;
  }

  const getBannerColor = () => {
    if (status.is_expired) return 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)';
    if (status.dias_restantes <= 3) return 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)';
    return 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)';
  };

  const getMessage = () => {
    if (status.is_expired) {
      return '⚠️ Tu demo ha expirado';
    }
    if (status.dias_restantes === 1) {
      return '⏰ Tu demo expira mañana';
    }
    return `⏰ Modo Demo - Expira en ${status.dias_restantes} días`;
  };

  return (
    <div className="text-white py-3 px-6 flex items-center justify-between shadow flex-wrap gap-3 z-[1000]">
      <div className="flex items-center gap-3">
        <span className="font-medium">{getMessage()}</span>
      </div>

      <div className="flex items-center gap-2">
        {status.can_extend && !status.is_expired && (
          <button
            onClick={handleExtend} className="bg-[rgba(255,_255,_255,_0.2)] text-white border py-2 px-4 rounded-2 cursor-pointer text-[0.875rem] font-medium"
          >
            Extender 7 días
          </button>
        )}

        <button
          onClick={handleConvert} className="bg-white text-blue-600 border-0 py-2 px-4 rounded-2 cursor-pointer text-[0.875rem] font-semibold"
        >
          Convertir a cuenta real
        </button>

        <button
          onClick={() => setDismissed(true)} className="bg-transparent text-white border-0 p-2 rounded-[6px] cursor-pointer flex items-center justify-center"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
