"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, PenLine, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface PromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void | Promise<void>;
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger" | "warning";
  multiline?: boolean;
}

const variantStyles = {
  default: {
    icon: PenLine,
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
} as const;

export default function PromptDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  placeholder = "",
  defaultValue = "",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "default",
  multiline = false,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [isLoading, setIsLoading] = useState(false);
  const appearance = variantStyles[variant];
  const Icon = appearance.icon;

  useEffect(() => {
    if (isOpen) setValue(defaultValue);
  }, [isOpen, defaultValue]);

  const handleConfirm = async () => {
    if (!value.trim()) return;

    setIsLoading(true);
    try {
      await onConfirm(value);
      onClose();
      setValue("");
    } catch (error) {
      console.error("Error en confirmación:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isLoading) onClose();
      }}
    >
      <DialogContent
        className="overflow-hidden border-border bg-card p-0 text-card-foreground sm:max-w-[500px]"
        onEscapeKeyDown={(event) => {
          if (isLoading) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isLoading) event.preventDefault();
        }}
      >
        <div
          className={cn("h-1 w-full", appearance.accent)}
          aria-hidden="true"
        />
        <div className="space-y-6 p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Icon className="h-5 w-5" aria-hidden="true" />
              {title}
            </DialogTitle>
            {message && (
              <DialogDescription className="whitespace-pre-line text-left leading-relaxed">
                {message}
              </DialogDescription>
            )}
          </DialogHeader>

          {multiline ? (
            <Textarea aria-label={title}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              disabled={isLoading}
              rows={4}
              autoFocus
              className="min-h-28 resize-y"
            />
          ) : (
            <Input aria-label={title}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !isLoading) {
                  event.preventDefault();
                  void handleConfirm();
                }
              }}
              placeholder={placeholder}
              disabled={isLoading}
              autoFocus
            />
          )}

          <DialogFooter>
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
              disabled={isLoading || !value.trim()}
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
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
