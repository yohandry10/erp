// Componentes específicos de funcionalidad
export { SeleccionarCxpLote } from './SeleccionarCxpLote';
export { PagoLoteWizard } from './PagoLoteWizard';
export { CxpCard } from './CxpCard';
export { default as PagoProveedorModal } from './PagoProveedorModal';
export { default as CuentaBancariaCard } from './CuentaBancariaCard';
export { ImportarExtractoCSV } from './ImportarExtractoCSV';
export { default as ConciliacionTable } from './ConciliacionTable';
export { default as ConciliacionWizard } from './ConciliacionWizard';
export { default as ConciliacionGuide } from './ConciliacionGuide';

// Componentes de UX consistente
export { default as FinanzasLayout } from './FinanzasLayout';
export { default as FinanzasStatCard } from './FinanzasStatCard';
export { default as FinanzasFilters } from './FinanzasFilters';
export { default as FinanzasFilterField } from './FinanzasFilterField';
export { default as FinanzasEmptyState } from './FinanzasEmptyState';
export { default as FinanzasTable } from './FinanzasTable';
export { default as FinanzasStatusBadge } from './FinanzasStatusBadge';
export { default as FinanzasActionButton } from './FinanzasActionButton';
export { default as FinanzasViewToggle } from './FinanzasViewToggle';
export { default as FinanzasLoadingState } from './FinanzasLoadingState';

// Flujos CxC
export { CobroModal } from './cxc/CobroModal';
export { NotaCreditoModal } from './cxc/NotaCreditoModal';
export { ReprogramarModal } from './cxc/ReprogramarModal';
export { HistorialDrawer } from './cxc/HistorialDrawer';

// NOTA: Para utilidades de formateo, fechas y validación, importar desde @/lib
// Ejemplo: import { formatCurrency, formatDate } from '@/lib'
