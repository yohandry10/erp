import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatPercentage,
  formatBalanceComprobacionItem,
  formatEstadoResultados,
  formatBalanceGeneral,
} from './accounting-formatter.util';

describe('AccountingFormatterUtil', () => {
  describe('formatCurrency', () => {
    it('should format positive numbers with 2 decimals', () => {
      expect(formatCurrency(1234.56)).toBe('1,234.56');
    });

    it('should format negative numbers with parentheses', () => {
      expect(formatCurrency(-1234.56)).toBe('(1,234.56)');
    });

    it('should show currency symbol when requested', () => {
      expect(formatCurrency(1234.56, 'S/', true)).toBe('S/ 1,234.56');
    });

    it('should format zero correctly', () => {
      expect(formatCurrency(0)).toBe('0.00');
    });

    it('should handle large numbers', () => {
      expect(formatCurrency(1234567.89)).toBe('1,234,567.89');
    });
  });

  describe('formatPercentage', () => {
    it('should format decimal as percentage', () => {
      expect(formatPercentage(0.15)).toBe('15.00%');
    });

    it('should format with custom decimals', () => {
      expect(formatPercentage(0.1567, 1)).toBe('15.7%');
    });

    it('should handle zero', () => {
      expect(formatPercentage(0)).toBe('0.00%');
    });
  });

  describe('formatBalanceComprobacionItem', () => {
    it('should format balance item correctly', () => {
      const item = {
        cuenta: '101',
        nombre: 'Caja',
        saldo_inicial: 1000.50,
        debe: 500.25,
        haber: 300.75,
        saldo_final: 1200.00,
      };

      const formatted = formatBalanceComprobacionItem(item);

      expect(formatted.cuenta).toBe('101');
      expect(formatted.nombre).toBe('Caja');
      expect(formatted.saldo_inicial).toBe('1,000.50');
      expect(formatted.debe).toBe('500.25');
      expect(formatted.haber).toBe('300.75');
      expect(formatted.saldo_final).toBe('1,200.00');
    });

    it('should format negative balances with parentheses', () => {
      const item = {
        cuenta: '421',
        nombre: 'Proveedores',
        saldo_inicial: -500.00,
        debe: 100.00,
        haber: 200.00,
        saldo_final: -600.00,
      };

      const formatted = formatBalanceComprobacionItem(item);

      expect(formatted.saldo_inicial).toBe('(500.00)');
      expect(formatted.saldo_final).toBe('(600.00)');
    });
  });

  describe('formatEstadoResultados', () => {
    it('should format estado de resultados correctly', () => {
      const estado = {
        ingresos: {
          ventas: 10000.00,
          otros_ingresos: 500.00,
          total_ingresos: 10500.00,
        },
        costos: {
          costo_ventas: 6000.00,
          utilidad_bruta: 4500.00,
        },
        gastos: {
          gastos_administrativos: 1000.00,
          gastos_ventas: 800.00,
          gastos_financieros: 200.00,
          total_gastos: 2000.00,
        },
        utilidad_neta: 2500.00,
      };

      const formatted = formatEstadoResultados(estado);

      expect(formatted.ingresos.ventas).toBe('10,000.00');
      expect(formatted.ingresos.total_ingresos).toBe('10,500.00');
      expect(formatted.costos.utilidad_bruta).toBe('4,500.00');
      expect(formatted.utilidad_neta).toBe('2,500.00');
    });

    it('should format negative utilidad_neta with parentheses', () => {
      const estado = {
        ingresos: {
          ventas: 1000.00,
          otros_ingresos: 0,
          total_ingresos: 1000.00,
        },
        costos: {
          costo_ventas: 600.00,
          utilidad_bruta: 400.00,
        },
        gastos: {
          gastos_administrativos: 300.00,
          gastos_ventas: 200.00,
          gastos_financieros: 100.00,
          total_gastos: 600.00,
        },
        utilidad_neta: -200.00,
      };

      const formatted = formatEstadoResultados(estado);

      expect(formatted.utilidad_neta).toBe('(200.00)');
    });
  });

  describe('formatBalanceGeneral', () => {
    it('should format balance general correctly', () => {
      const balance = {
        activos: {
          corrientes: {
            efectivo: 5000.00,
            cuentas_por_cobrar: 3000.00,
            inventarios: 2000.00,
            otros_activos: 500.00,
            total_corrientes: 10500.00,
          },
          no_corrientes: {
            activos_fijos: 20000.00,
            depreciacion_acumulada: 5000.00,
            activos_fijos_neto: 15000.00,
            otros_activos: 1000.00,
            total_no_corrientes: 16000.00,
          },
          total_activos: 26500.00,
        },
        pasivos: {
          corrientes: {
            cuentas_por_pagar: 4000.00,
            tributos_por_pagar: 1000.00,
            remuneraciones_por_pagar: 500.00,
            otros_pasivos: 500.00,
            total_corrientes: 6000.00,
          },
          no_corrientes: {
            deudas_largo_plazo: 5000.00,
            otros_pasivos: 0,
            total_no_corrientes: 5000.00,
          },
          total_pasivos: 11000.00,
        },
        patrimonio: {
          capital: 10000.00,
          resultados_acumulados: 3000.00,
          resultado_ejercicio: 2500.00,
          total_patrimonio: 15500.00,
        },
      };

      const formatted = formatBalanceGeneral(balance);

      expect(formatted.activos.total_activos).toBe('26,500.00');
      expect(formatted.pasivos.total_pasivos).toBe('11,000.00');
      expect(formatted.patrimonio.total_patrimonio).toBe('15,500.00');
      expect(formatted.activos.corrientes.efectivo).toBe('5,000.00');
    });
  });
});
