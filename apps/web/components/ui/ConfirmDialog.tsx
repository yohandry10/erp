"use client";

import { type ReactNode, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ShieldAlert,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger" | "warning" | "success";
}

const variantStyles = {
  default: {
    icon: HelpCircle,
    accent: "bg-primary",
    button: "bg-primary text-primary-foreground hover:bg-primary/90",
  },
  danger: {
    icon: ShieldAlert,
    accent: "bg-destructive",
    button:
      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  },
  warning: {
    icon: AlertTriangle,
    accent: "bg-amber-500",
    button: "bg-amber-500 text-foreground hover:bg-amber-400",
  },
  success: {
    icon: CheckCircle2,
    accent: "bg-emerald-600",
    button: "bg-emerald-600 text-white hover:bg-emerald-700",
  },
} as const;

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "default",
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const appearance = variantStyles[variant];
  const Icon = appearance.icon;

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error("Error en confirmación:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isLoading) onClose();
      }}
    >
      <AlertDialogContent className="overflow-hidden border-border bg-card p-0 text-card-foreground sm:max-w-[500px]">
        <div
          className={cn("h-1 w-full", appearance.accent)}
          aria-hidden="true"
        />
        <div className="space-y-6 p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-xl">
              <Icon className="h-5 w-5" aria-hidden="true" />
              {title}
            </AlertDialogTitle>
            {/* asChild → la descripción se renderiza como <div>, no como <p>.
                message puede traer bloques (div/ul/p) y un <p> no puede
                contenerlos (causaba errores de hidratación/HTML inválido). */}
            <AlertDialogDescription asChild>
              <div className="whitespace-pre-line text-left leading-relaxed text-sm text-muted-foreground">
                {message}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              {cancelText}
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={isLoading}
              className={appearance.button}
            >
              {isLoading && (
                <span
                  className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden="true"
                />
              )}
              {isLoading ? "Procesando..." : confirmText}
            </Button>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
