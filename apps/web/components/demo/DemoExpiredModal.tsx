'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface DemoExpiredModalProps {
  open: boolean;
  onClose: () => void;
}

export function DemoExpiredModal({ open, onClose }: DemoExpiredModalProps) {
  const router = useRouter();
  const { signOut } = useAuth();

  // Prevenir scroll cuando el modal está abierto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  if (!open) return null;

  const handleConvert = () => {
    router.push('/demo/convert');
  };

  const handleNewDemo = async () => {
    await signOut();
    router.push('/demo');
  };

  const handleContactSales = () => {
    window.location.href = 'mailto:ventas@tuerp.com?subject=Consulta sobre cuenta real';
  };

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(15,_23,_42,_0.8)] flex items-center justify-center p-4 z-[9999]">
      <div className="rounded-3xl p-10 max-w-[450px] w-[100%] shadow relative text-center">
        {/* Icono */}
        <div className="w-[80px] h-[80px] bg-[#fef2f2] rounded-full flex items-center justify-center text-[2.5rem]">
          ⚠️
        </div>

        <h2 className="text-2xl font-extrabold text-foreground mb-2">
          Tu Demo ha Expirado
        </h2>

        <p className="text-muted-foreground mb-8">
          Tu período de prueba de 14 días ha finalizado. Elige una opción para continuar:
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleConvert} className="w-[100%] p-4 text-white border-0 rounded-xl text-base font-semibold cursor-pointer shadow"
          >
            Convertir a Cuenta Real
          </button>

          <button
            onClick={handleNewDemo} className="w-[100%] p-4 bg-card text-foreground/80 rounded-xl text-base font-semibold cursor-pointer"
          >
            Iniciar Nueva Demo
          </button>

          <button
            onClick={handleContactSales} className="w-[100%] p-4 bg-transparent text-muted-foreground border-0 rounded-xl text-base cursor-pointer"
          >
            Contactar con Ventas
          </button>
        </div>

        <p className="text-xs text-muted-foreground mt-6">
          ¿Necesitas más tiempo? Contáctanos para una extensión especial
        </p>

        {/* Botón cerrar */}
        <button
          onClick={onClose} className="absolute top-4 right-4 bg-transparent border-0 text-2xl text-muted-foreground cursor-pointer p-2"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
