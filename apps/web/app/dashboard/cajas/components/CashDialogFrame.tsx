'use client';

import type { ReactNode } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface CashDialogFrameProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description: string;
    children: ReactNode;
    className?: string;
    preventClose?: boolean;
}

export function CashDialogFrame({
    isOpen,
    onClose,
    title,
    description,
    children,
    className,
    preventClose = false,
}: CashDialogFrameProps) {
    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open && !preventClose) onClose();
            }}
        >
            <DialogContent
                className={cn(
                    'max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg gap-0 overflow-y-auto p-0 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)]',
                    className,
                )}
            >
                <DialogHeader className="sticky top-0 z-10 border-b border-border bg-background px-5 py-5 pr-12 sm:px-6">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className="p-4 sm:p-6">{children}</div>
            </DialogContent>
        </Dialog>
    );
}
