import { Test, TestingModule } from '@nestjs/testing';
import { CsvParserService } from './csv-parser.service';
import { registrarPlantillaPersonalizada } from './csv-templates.config';

describe('CsvParserService - Plantillas Configurables', () => {
  let service: CsvParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CsvParserService],
    }).compile();

    service = module.get<CsvParserService>(CsvParserService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('Plantillas Predefinidas', () => {
    it('debe parsear CSV con plantilla BCP (cargo/abono separado)', () => {
      const csvBCP = `Fecha,Descripcion,Cargo,Abono,Saldo
15/10/2025,Pago proveedor ABC,1500.00,,8500.00
16/10/2025,Deposito cliente XYZ,,2500.00,11000.00
17/10/2025,Transferencia saliente,800.50,,10199.50`;

      const resultado = service.parsearExtractoBancario(csvBCP, 'BCP');

      expect(resultado.movimientos).toHaveLength(3);
      expect(resultado.totalCargos).toBe(2300.50);
      expect(resultado.totalAbonos).toBe(2500.00);
      expect(resultado.saldoFinal).toBe(199.50);
      expect(resultado.errores).toHaveLength(0);

      // Verificar primer movimiento (cargo)
      expect(resultado.movimientos[0]).toMatchObject({
        fecha: '2025-10-15',
        descripcion: 'Pago proveedor ABC',
        tipo: 'CARGO',
        monto: 1500.00,
      });

      // Verificar segundo movimiento (abono)
      expect(resultado.movimientos[1]).toMatchObject({
        fecha: '2025-10-16',
        descripcion: 'Deposito cliente XYZ',
        tipo: 'ABONO',
        monto: 2500.00,
      });
    });

    it('debe parsear CSV con plantilla INTERBANK (tipo+monto)', () => {
      const csvInterbank = `Fecha,Descripcion,Referencia,Tipo,Monto
2025-10-15,Pago proveedor,OP-12345,CARGO,1500.00
2025-10-16,Deposito cliente,DEP-67890,ABONO,2500.00`;

      const resultado = service.parsearExtractoBancario(csvInterbank, 'INTERBANK');

      expect(resultado.movimientos).toHaveLength(2);
      expect(resultado.totalCargos).toBe(1500.00);
      expect(resultado.totalAbonos).toBe(2500.00);
      expect(resultado.saldoFinal).toBe(1000.00);

      // Verificar referencia
      expect(resultado.movimientos[0].referencia).toBe('OP-12345');
      expect(resultado.movimientos[1].referencia).toBe('DEP-67890');
    });

    it('debe parsear CSV genérico', () => {
      const csvGenerico = `Fecha,Descripcion,Referencia,Tipo,Monto
2025-10-15,Pago proveedor,REF-001,CARGO,1500.00
2025-10-16,Ingreso venta,REF-002,ABONO,3000.00`;

      const resultado = service.parsearExtractoBancario(csvGenerico, 'GENERICO');

      expect(resultado.movimientos).toHaveLength(2);
      expect(resultado.totalCargos).toBe(1500.00);
      expect(resultado.totalAbonos).toBe(3000.00);
    });
  });

  describe('Formatos de Fecha', () => {
    it('debe parsear fecha en formato DD/MM/YYYY', () => {
      const csv = `Fecha,Descripcion,Cargo,Abono
15/10/2025,Test,100.00,`;

      const resultado = service.parsearExtractoBancario(csv, 'BCP');
      expect(resultado.movimientos[0].fecha).toBe('2025-10-15');
    });

    it('debe parsear fecha en formato YYYY-MM-DD', () => {
      const csv = `Fecha,Descripcion,Referencia,Tipo,Monto
2025-10-15,Test,REF,CARGO,100.00`;

      const resultado = service.parsearExtractoBancario(csv, 'GENERICO');
      expect(resultado.movimientos[0].fecha).toBe('2025-10-15');
    });
  });

  describe('Formatos de Monto', () => {
    it('debe parsear montos con símbolos de moneda', () => {
      const csv = `Fecha,Descripcion,Cargo,Abono
15/10/2025,Test,"S/ 1,500.00",`;

      const resultado = service.parsearExtractoBancario(csv, 'BCP');
      expect(resultado.movimientos[0].monto).toBe(1500.00);
    });

    it('debe parsear montos con separador de miles', () => {
      const csv = `Fecha,Descripcion,Cargo,Abono
15/10/2025,Test,"1,500.00",`;

      const resultado = service.parsearExtractoBancario(csv, 'BCP');
      expect(resultado.movimientos[0].monto).toBe(1500.00);
    });
  });

  describe('Plantillas Personalizadas', () => {
    it('debe permitir registrar y usar plantilla personalizada', () => {
      // Registrar plantilla personalizada
      registrarPlantillaPersonalizada({
        codigo: 'MI_BANCO',
        nombre: 'Mi Banco Test',
        descripcion: 'Plantilla de prueba',
        tieneEncabezado: true,
        separador: ';',
        formatoFecha: {
          formato: 'DD-MM-YYYY',
          separador: '-',
        },
        columnas: [
          { indice: 0, tipo: 'fecha' },
          { indice: 1, tipo: 'descripcion' },
          { indice: 2, tipo: 'tipo' },
          { indice: 3, tipo: 'monto' },
        ],
        usaCargoAbonoSeparado: false,
        simbolosMoneda: ['$'],
        separadorDecimal: '.',
        separadorMiles: ',',
      });

      const csvPersonalizado = `Fecha;Descripcion;Tipo;Monto
15-10-2025;Pago test;CARGO;$ 1,000.50
16-10-2025;Ingreso test;ABONO;$ 2,500.00`;

      const resultado = service.parsearExtractoBancario(csvPersonalizado, 'MI_BANCO');

      expect(resultado.movimientos).toHaveLength(2);
      expect(resultado.movimientos[0]).toMatchObject({
        fecha: '2025-10-15',
        descripcion: 'Pago test',
        tipo: 'CARGO',
        monto: 1000.50,
      });
      expect(resultado.movimientos[1]).toMatchObject({
        fecha: '2025-10-16',
        descripcion: 'Ingreso test',
        tipo: 'ABONO',
        monto: 2500.00,
      });
    });
  });

  describe('Manejo de Errores', () => {
    it('debe reportar errores en líneas inválidas sin detener el proceso', () => {
      const csvConErrores = `Fecha,Descripcion,Cargo,Abono
15/10/2025,Valido,100.00,
FECHA_INVALIDA,Error fecha,50.00,
17/10/2025,Valido 2,,200.00`;

      const resultado = service.parsearExtractoBancario(csvConErrores, 'BCP');

      expect(resultado.movimientos).toHaveLength(2); // Solo las líneas válidas
      expect(resultado.errores).toHaveLength(1); // Una línea con error
      expect(resultado.errores[0]).toContain('Línea 3');
    });

    it('debe lanzar error si el CSV está vacío', () => {
      expect(() => {
        service.parsearExtractoBancario('', 'BCP');
      }).toThrow('El archivo CSV está vacío');
    });
  });

  describe('Listar Plantillas', () => {
    it('debe listar todas las plantillas disponibles', () => {
      const plantillas = service.listarPlantillas();

      expect(plantillas.length).toBeGreaterThanOrEqual(5); // BCP, BBVA, INTERBANK, SCOTIABANK, GENERICO
      
      const codigosBancos = plantillas.map(p => p.codigo);
      expect(codigosBancos).toContain('BCP');
      expect(codigosBancos).toContain('BBVA');
      expect(codigosBancos).toContain('INTERBANK');
      expect(codigosBancos).toContain('SCOTIABANK');
      expect(codigosBancos).toContain('GENERICO');
    });
  });

  describe('Normalización a Formato Estándar', () => {
    describe('Normalización de Fechas', () => {
      it('debe normalizar fecha DD/MM/YYYY a formato ISO', () => {
        const csv = `Fecha,Descripcion,Cargo,Abono
25/12/2024,Test navidad,100.00,`;

        const resultado = service.parsearExtractoBancario(csv, 'BCP');
        expect(resultado.movimientos[0].fecha).toBe('2024-12-25');
      });

      it('debe normalizar fecha con día y mes de un dígito', () => {
        const csv = `Fecha,Descripcion,Cargo,Abono
5/3/2024,Test,100.00,`;

        const resultado = service.parsearExtractoBancario(csv, 'BCP');
        expect(resultado.movimientos[0].fecha).toBe('2024-03-05');
      });

      it('debe mantener fecha ya en formato ISO', () => {
        const csv = `Fecha,Descripcion,Referencia,Tipo,Monto
2024-12-25,Test,REF,CARGO,100.00`;

        const resultado = service.parsearExtractoBancario(csv, 'GENERICO');
        expect(resultado.movimientos[0].fecha).toBe('2024-12-25');
      });
    });

    describe('Normalización de Tipos', () => {
      it('debe normalizar INGRESO a ABONO', () => {
        const csv = `Fecha,Descripcion,Referencia,Tipo,Monto
2024-10-15,Test,REF,INGRESO,100.00`;

        const resultado = service.parsearExtractoBancario(csv, 'GENERICO');
        expect(resultado.movimientos[0].tipo).toBe('ABONO');
      });

      it('debe normalizar DEPOSITO a ABONO', () => {
        const csv = `Fecha,Descripcion,Referencia,Tipo,Monto
2024-10-15,Test,REF,DEPOSITO,100.00`;

        const resultado = service.parsearExtractoBancario(csv, 'GENERICO');
        expect(resultado.movimientos[0].tipo).toBe('ABONO');
      });

      it('debe normalizar CREDITO a ABONO', () => {
        const csv = `Fecha,Descripcion,Referencia,Tipo,Monto
2024-10-15,Test,REF,CREDITO,100.00`;

        const resultado = service.parsearExtractoBancario(csv, 'GENERICO');
        expect(resultado.movimientos[0].tipo).toBe('ABONO');
      });

      it('debe normalizar EGRESO a CARGO', () => {
        const csv = `Fecha,Descripcion,Referencia,Tipo,Monto
2024-10-15,Test,REF,EGRESO,100.00`;

        const resultado = service.parsearExtractoBancario(csv, 'GENERICO');
        expect(resultado.movimientos[0].tipo).toBe('CARGO');
      });

      it('debe normalizar RETIRO a CARGO', () => {
        const csv = `Fecha,Descripcion,Referencia,Tipo,Monto
2024-10-15,Test,REF,RETIRO,100.00`;

        const resultado = service.parsearExtractoBancario(csv, 'GENERICO');
        expect(resultado.movimientos[0].tipo).toBe('CARGO');
      });

      it('debe normalizar DEBITO a CARGO', () => {
        const csv = `Fecha,Descripcion,Referencia,Tipo,Monto
2024-10-15,Test,REF,DEBITO,100.00`;

        const resultado = service.parsearExtractoBancario(csv, 'GENERICO');
        expect(resultado.movimientos[0].tipo).toBe('CARGO');
      });

      it('debe normalizar tipos en minúsculas', () => {
        const csv = `Fecha,Descripcion,Referencia,Tipo,Monto
2024-10-15,Test,REF,ingreso,100.00`;

        const resultado = service.parsearExtractoBancario(csv, 'GENERICO');
        expect(resultado.movimientos[0].tipo).toBe('ABONO');
      });
    });

    describe('Normalización de Montos', () => {
      it('debe eliminar símbolos de moneda S/', () => {
        const csv = `Fecha,Descripcion,Cargo,Abono
15/10/2025,Test,"S/ 1,500.00",`;

        const resultado = service.parsearExtractoBancario(csv, 'BCP');
        expect(resultado.movimientos[0].monto).toBe(1500.00);
      });

      it('debe eliminar símbolos de moneda $', () => {
        const csv = `Fecha,Descripcion,Cargo,Abono
15/10/2025,Test,"$ 2,500.50",`;

        const resultado = service.parsearExtractoBancario(csv, 'BCP');
        expect(resultado.movimientos[0].monto).toBe(2500.50);
      });

      it('debe eliminar separadores de miles', () => {
        const csv = `Fecha,Descripcion,Cargo,Abono
15/10/2025,Test,"10,500.75",`;

        const resultado = service.parsearExtractoBancario(csv, 'BCP');
        expect(resultado.movimientos[0].monto).toBe(10500.75);
      });

      it('debe convertir montos negativos a positivos', () => {
        const csv = `Fecha,Descripcion,Referencia,Tipo,Monto
2024-10-15,Test,REF,CARGO,-500.00`;

        const resultado = service.parsearExtractoBancario(csv, 'GENERICO');
        expect(resultado.movimientos[0].monto).toBe(500.00);
      });

      it('debe redondear a 2 decimales', () => {
        const csv = `Fecha,Descripcion,Cargo,Abono
15/10/2025,Test,123.456,`;

        const resultado = service.parsearExtractoBancario(csv, 'BCP');
        expect(resultado.movimientos[0].monto).toBe(123.46);
      });

      it('debe eliminar espacios en montos', () => {
        const csv = `Fecha,Descripcion,Cargo,Abono
15/10/2025,Test,"1 500.00",`;

        const resultado = service.parsearExtractoBancario(csv, 'BCP');
        expect(resultado.movimientos[0].monto).toBe(1500.00);
      });
    });

    describe('Normalización de Descripciones', () => {
      it('debe limpiar espacios extras en descripciones', () => {
        const csv = `Fecha,Descripcion,Cargo,Abono
15/10/2025,"Pago   proveedor   ABC",100.00,`;

        const resultado = service.parsearExtractoBancario(csv, 'BCP');
        expect(resultado.movimientos[0].descripcion).toBe('Pago proveedor ABC');
      });

      it('debe limpiar espacios al inicio y final', () => {
        const csv = `Fecha,Descripcion,Cargo,Abono
15/10/2025,"  Pago proveedor  ",100.00,`;

        const resultado = service.parsearExtractoBancario(csv, 'BCP');
        expect(resultado.movimientos[0].descripcion).toBe('Pago proveedor');
      });
    });

    describe('Normalización de Referencias', () => {
      it('debe limpiar espacios en referencias', () => {
        const csv = `Fecha,Descripcion,Referencia,Tipo,Monto
2024-10-15,Test,"  OP-12345  ",CARGO,100.00`;

        const resultado = service.parsearExtractoBancario(csv, 'INTERBANK');
        expect(resultado.movimientos[0].referencia).toBe('OP-12345');
      });

      it('debe limpiar espacios extras en referencias', () => {
        const csv = `Fecha,Descripcion,Referencia,Tipo,Monto
2024-10-15,Test,"OP   12345",CARGO,100.00`;

        const resultado = service.parsearExtractoBancario(csv, 'INTERBANK');
        expect(resultado.movimientos[0].referencia).toBe('OP 12345');
      });
    });

    describe('Formato Estándar Completo', () => {
      it('debe producir MovimientoExtracto con todos los campos normalizados', () => {
        const csv = `Fecha,Descripcion,Referencia,Tipo,Monto
25/12/2024,"  Pago   Proveedor  ","  OP-123  ",INGRESO,"S/ 1,234.567"`;

        // Usar plantilla personalizada para este test
        registrarPlantillaPersonalizada({
          codigo: 'TEST_NORMALIZACION',
          nombre: 'Test Normalización',
          descripcion: 'Plantilla para test de normalización',
          tieneEncabezado: true,
          separador: ',',
          formatoFecha: {
            formato: 'DD/MM/YYYY',
            separador: '/',
          },
          columnas: [
            { indice: 0, tipo: 'fecha' },
            { indice: 1, tipo: 'descripcion' },
            { indice: 2, tipo: 'referencia' },
            { indice: 3, tipo: 'tipo' },
            { indice: 4, tipo: 'monto' },
          ],
          usaCargoAbonoSeparado: false,
          simbolosMoneda: ['S/', '$'],
          separadorDecimal: '.',
          separadorMiles: ',',
        });

        const resultado = service.parsearExtractoBancario(csv, 'TEST_NORMALIZACION');

        expect(resultado.movimientos).toHaveLength(1);
        expect(resultado.movimientos[0]).toMatchObject({
          fecha: '2024-12-25', // Normalizado a ISO
          descripcion: 'Pago Proveedor', // Espacios limpiados
          referencia: 'OP-123', // Espacios limpiados
          tipo: 'ABONO', // INGRESO normalizado a ABONO
          monto: 1234.57, // Símbolo eliminado, separador eliminado, redondeado a 2 decimales
        });
      });
    });
  });
});
