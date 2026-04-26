import React, { useState } from 'react';
import { CashClosingDialog } from './CashClosingDialog';
import { CashWithdrawalDialog } from './CashWithdrawalDialog';
import { ShiftChangeDialog } from './ShiftChangeDialog';
import { CashIncomeExpenseDialog } from './CashIncomeExpenseDialog';
import { useToast } from '@/components/ui/use-toast';

interface CashOperationsPanelProps {
    sesionId: string;
    onOperationComplete: () => void;
    className?: string;
}

export function CashOperationsPanel({ sesionId, onOperationComplete, className = '' }: CashOperationsPanelProps) {
    const { toast } = useToast();
    const [showClosingDialog, setShowClosingDialog] = useState(false);
    const [showWithdrawalDialog, setShowWithdrawalDialog] = useState(false);
    const [showShiftChangeDialog, setShowShiftChangeDialog] = useState(false);
    const [showIncomeExpenseDialog, setShowIncomeExpenseDialog] = useState(false);

    return (
        <div className={`bg-white p-6 rounded-lg shadow ${className}`}>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Operaciones de Caja</h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button
                    onClick={() => setShowWithdrawalDialog(true)}
                    className="flex flex-col items-center justify-center p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors group"
                >
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-full mb-3 group-hover:bg-blue-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">Retiro de Efectivo</span>
                </button>

                <button
                    onClick={() => setShowShiftChangeDialog(true)}
                    className="flex flex-col items-center justify-center p-4 border border-gray-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-colors group"
                >
                    <div className="p-3 bg-purple-100 text-purple-600 rounded-full mb-3 group-hover:bg-purple-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700 group-hover:text-purple-700">Cambio de Turno</span>
                </button>

                <button
                    onClick={() => setShowIncomeExpenseDialog(true)}
                    className="flex flex-col items-center justify-center p-4 border border-gray-200 rounded-lg hover:bg-green-50 hover:border-green-300 transition-colors group"
                >
                    <div className="p-3 bg-green-100 text-green-600 rounded-full mb-3 group-hover:bg-green-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700 group-hover:text-green-700">Ingreso/Gasto</span>
                </button>

                <button
                    onClick={() => setShowClosingDialog(true)}
                    className="flex flex-col items-center justify-center p-4 border border-gray-200 rounded-lg hover:bg-red-50 hover:border-red-300 transition-colors group"
                >
                    <div className="p-3 bg-red-100 text-red-600 rounded-full mb-3 group-hover:bg-red-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700 group-hover:text-red-700">Cerrar Caja</span>
                </button>
            </div>

            {/* Dialogs */}
            <CashClosingDialog
                isOpen={showClosingDialog}
                onClose={() => setShowClosingDialog(false)}
                onSuccess={() => {
                    setShowClosingDialog(false);
                    toast({
                        title: '🔒 Caja Cerrada',
                        description: 'La sesión de caja se ha cerrado correctamente.',
                    });
                    onOperationComplete();
                }}
                sesionId={sesionId}
            />

            <CashWithdrawalDialog
                isOpen={showWithdrawalDialog}
                onClose={() => setShowWithdrawalDialog(false)}
                onSuccess={onOperationComplete}
                sesionId={sesionId}
            />

            <ShiftChangeDialog
                isOpen={showShiftChangeDialog}
                onClose={() => setShowShiftChangeDialog(false)}
                onSuccess={onOperationComplete}
                sesionId={sesionId}
            />

            <CashIncomeExpenseDialog
                isOpen={showIncomeExpenseDialog}
                onClose={() => setShowIncomeExpenseDialog(false)}
                onSuccess={onOperationComplete}
                sesionId={sesionId}
            />
        </div>
    );
}
