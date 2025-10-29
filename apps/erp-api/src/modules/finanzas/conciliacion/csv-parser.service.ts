import { Injectable, BadRequestException } from '@nestjs/common';
import { 
  obtenerPlantillaBanco, 
  PlantillaCsvBanco, 
  TipoColumna,
  listarPlantillasDisponibles,
  registrarPlantillaPersonalizada,
} from './csv-templates.config';

/**
 * Formato estándar normalizado para movimientos bancarios
 * Todos los movimientos de extractos CSV se convierten a este formato unificado
 * independientemente del banco de origen
 * 
 * Especificaciones del formato estándar:
 * - fecha: Formato ISO (YYYY-MM-DD)
 * - descripcion: Texto limpio sin espacios extras
 * - referencia: Número de operación/referencia (opcional)
 * - tipo: Solo 'ABONO' (ingreso) o 'CARGO' (egreso)
 * - monto: Número positivo con hasta 2 decimales
 */
export interface MovimientoExtracto {
  /** Fecha en formato ISO (YYYY-MM-DD) */
  fecha: string;
  /** Descripción del movimiento (texto limpio) */
  descripcion: string;
  /** Número de referencia u operación (opcional) */
  referencia?: string;
  /** Tipo de movimiento: ABONO (ingreso) o CARGO (egreso) */
  tipo: 'ABONO' | 'CARGO';
  /** Monto positivo con hasta 2 decimales */
  monto: number;
}

export interface ResultadoParseoCsv {
  movimientos: MovimientoExtracto[];
  errores: string[];
  totalAbonos: number;
  totalCargos: number;
  saldoFinal: number;
}

@Injectable()
export class CsvParserService {
  /**
   * Parsea un archivo CSV de extracto bancario y normaliza a formato estándar
   * 
   * Este método es el punto de entrada principal para la importación de extractos.
   * Soporta múltiples formatos de bancos peruanos mediante plantillas configurables.
   * 
   * Proceso de normalización:
   * 1. Identifica el formato del banco mediante plantilla
   * 2. Parsea cada línea según la configuración del banco
   * 3. Normaliza fechas a formato ISO (YYYY-MM-DD)
   * 4. Normaliza tipos a 'ABONO' o 'CARGO'
   * 5. Normaliza montos a números positivos con 2 decimales
   * 6. Limpia y estandariza descripciones y referencias
   * 
   * @param contenidoCsv - Contenido del archivo CSV como string
   * @param banco - Código del banco (BCP, BBVA, INTERBANK, etc.)
   * @returns Resultado con movimientos normalizados y estadísticas
   * 
   * Bancos soportados:
   * - BCP: Banco de Crédito del Perú
   * - BBVA: BBVA Continental
   * - INTERBANK: Interbank
   * - SCOTIABANK: Scotiabank
   * - GENERICO: Formato genérico estándar
   */
  parsearExtractoBancario(
    contenidoCsv: string,
    banco: string,
  ): ResultadoParseoCsv {
    const lineas = contenidoCsv.split('\n').filter(l => l.trim());
    
    if (lineas.length === 0) {
      throw new BadRequestException('El archivo CSV está vacío');
    }

    // Obtener plantilla del banco (configurable)
    const plantilla = obtenerPlantillaBanco(banco);
    
    // Parsear y normalizar usando la plantilla
    return this.parsearConPlantilla(lineas, plantilla);
  }

  /**
   * Parsea CSV usando una plantilla configurable
   */
  private parsearConPlantilla(
    lineas: string[],
    plantilla: PlantillaCsvBanco,
  ): ResultadoParseoCsv {
    const movimientos: MovimientoExtracto[] = [];
    const errores: string[] = [];
    let totalAbonos = 0;
    let totalCargos = 0;

    // Determinar línea de inicio (saltar encabezado si existe)
    const inicioLinea = plantilla.tieneEncabezado ? 1 : 0;

    for (let i = inicioLinea; i < lineas.length; i++) {
      const linea = lineas[i].trim();
      if (!linea) continue;

      try {
        const movimientosLinea = this.parsearLineaConPlantilla(
          linea,
          plantilla,
          i + 1,
        );

        // Una línea puede generar múltiples movimientos (cargo y abono separados)
        for (const movimiento of movimientosLinea) {
          movimientos.push(movimiento);

          if (movimiento.tipo === 'ABONO') {
            totalAbonos += movimiento.monto;
          } else {
            totalCargos += movimiento.monto;
          }
        }
      } catch (error) {
        errores.push(`Línea ${i + 1}: ${error.message}`);
      }
    }

    const saldoFinal = totalAbonos - totalCargos;

    return {
      movimientos,
      errores,
      totalAbonos: this.round2(totalAbonos),
      totalCargos: this.round2(totalCargos),
      saldoFinal: this.round2(saldoFinal),
    };
  }

  /**
   * Parsea una línea usando la plantilla del banco
   */
  private parsearLineaConPlantilla(
    linea: string,
    plantilla: PlantillaCsvBanco,
    numeroLinea: number,
  ): MovimientoExtracto[] {
    // Parsear campos según el separador de la plantilla
    const campos = this.parsearLineaCsv(linea, plantilla.separador);

    // Extraer valores según el mapeo de columnas
    const valores: Record<TipoColumna, string> = {} as any;

    for (const columna of plantilla.columnas) {
      if (columna.indice < campos.length) {
        valores[columna.tipo] = campos[columna.indice];
      }
    }

    // Validar que tenemos los campos mínimos requeridos
    if (!valores.fecha) {
      throw new Error('Falta la columna de fecha');
    }

    if (!valores.descripcion) {
      throw new Error('Falta la columna de descripción');
    }

    // Normalizar a formato estándar
    return this.normalizarAFormatoEstandar(valores, plantilla);
  }

  /**
   * Normaliza los valores extraídos del CSV a formato estándar MovimientoExtracto
   * Este método convierte diferentes formatos de bancos a una estructura unificada
   */
  private normalizarAFormatoEstandar(
    valores: Record<TipoColumna, string>,
    plantilla: PlantillaCsvBanco,
  ): MovimientoExtracto[] {
    // 1. Normalizar fecha a formato ISO (YYYY-MM-DD)
    const fecha = this.normalizarFechaConFormato(
      valores.fecha,
      plantilla.formatoFecha,
    );

    // 2. Normalizar descripción (limpiar espacios extras)
    const descripcion = valores.descripcion.trim().replace(/\s+/g, ' ');

    // 3. Normalizar referencia (opcional, limpiar espacios)
    const referencia = valores.referencia?.trim().replace(/\s+/g, ' ') || undefined;

    const movimientos: MovimientoExtracto[] = [];

    // 4. Normalizar tipo y monto según el formato del banco
    if (plantilla.usaCargoAbonoSeparado) {
      // Formato: columnas separadas para cargo y abono
      // Normalizar cargo
      const cargo = this.parsearMontoConFormato(
        valores.cargo || '',
        plantilla,
      );

      // Normalizar abono
      const abono = this.parsearMontoConFormato(
        valores.abono || '',
        plantilla,
      );

      // Crear movimiento de cargo si existe
      if (cargo > 0) {
        movimientos.push({
          fecha,
          descripcion,
          referencia,
          tipo: 'CARGO',
          monto: this.round2(cargo),
        });
      }

      // Crear movimiento de abono si existe
      if (abono > 0) {
        movimientos.push({
          fecha,
          descripcion,
          referencia,
          tipo: 'ABONO',
          monto: this.round2(abono),
        });
      }

      if (movimientos.length === 0) {
        throw new Error('No se encontró cargo ni abono en la línea');
      }
    } else {
      // Formato: tipo + monto en columnas separadas
      if (!valores.tipo) {
        throw new Error('Falta la columna de tipo de movimiento');
      }

      if (!valores.monto) {
        throw new Error('Falta la columna de monto');
      }

      // Normalizar tipo a 'ABONO' o 'CARGO'
      const tipo = this.normalizarTipo(valores.tipo);

      // Normalizar monto a número positivo con 2 decimales
      const monto = this.parsearMontoConFormato(valores.monto, plantilla);

      movimientos.push({
        fecha,
        descripcion,
        referencia,
        tipo,
        monto: this.round2(monto),
      });
    }

    return movimientos;
  }

  /**
   * Lista todas las plantillas disponibles
   */
  listarPlantillas(): PlantillaCsvBanco[] {
    return listarPlantillasDisponibles();
  }

  /**
   * Registra una plantilla personalizada
   */
  registrarPlantilla(plantilla: PlantillaCsvBanco): void {
    registrarPlantillaPersonalizada(plantilla);
  }



  /**
   * Parsea una línea CSV respetando comillas y usando separador configurable
   */
  private parsearLineaCsv(linea: string, separador: string = ','): string[] {
    const campos: string[] = [];
    let campoActual = '';
    let dentroComillas = false;

    for (let i = 0; i < linea.length; i++) {
      const char = linea[i];

      if (char === '"') {
        dentroComillas = !dentroComillas;
      } else if (char === separador && !dentroComillas) {
        campos.push(campoActual.trim());
        campoActual = '';
      } else {
        campoActual += char;
      }
    }

    campos.push(campoActual.trim());
    return campos;
  }

  /**
   * Normaliza fecha a formato estándar ISO (YYYY-MM-DD)
   * Convierte diferentes formatos de fecha (DD/MM/YYYY, MM/DD/YYYY, etc.) a ISO
   * 
   * @param fecha - Fecha en formato del banco
   * @param formatoFecha - Configuración del formato de fecha del banco
   * @returns Fecha en formato ISO (YYYY-MM-DD)
   * 
   * Ejemplos:
   * - "25/12/2024" (DD/MM/YYYY) -> "2024-12-25"
   * - "12/25/2024" (MM/DD/YYYY) -> "2024-12-25"
   * - "2024-12-25" (YYYY-MM-DD) -> "2024-12-25"
   */
  private normalizarFechaConFormato(
    fecha: string,
    formatoFecha: { formato: string; separador: string },
  ): string {
    fecha = fecha.trim();

    // Si ya está en formato ISO estándar, retornar directamente
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return fecha;
    }

    const { formato, separador } = formatoFecha;
    const partes = fecha.split(separador);

    if (partes.length !== 3) {
      throw new Error(`Formato de fecha inválido: ${fecha}`);
    }

    let dia: string, mes: string, anio: string;

    // Determinar el orden según el formato del banco
    if (formato === 'DD/MM/YYYY' || formato === 'DD-MM-YYYY') {
      [dia, mes, anio] = partes;
    } else if (formato === 'MM/DD/YYYY' || formato === 'MM-DD-YYYY') {
      [mes, dia, anio] = partes;
    } else if (formato === 'YYYY-MM-DD' || formato === 'YYYY/MM/DD') {
      [anio, mes, dia] = partes;
    } else {
      throw new Error(`Formato de fecha no soportado: ${formato}`);
    }

    // Validar que sean números válidos
    const diaNum = parseInt(dia, 10);
    const mesNum = parseInt(mes, 10);
    const anioNum = parseInt(anio, 10);

    if (isNaN(diaNum) || isNaN(mesNum) || isNaN(anioNum)) {
      throw new Error(`Fecha inválida: ${fecha}`);
    }

    if (diaNum < 1 || diaNum > 31 || mesNum < 1 || mesNum > 12) {
      throw new Error(`Fecha fuera de rango: ${fecha}`);
    }

    // Formatear a ISO estándar (YYYY-MM-DD)
    return `${anioNum}-${mesNum.toString().padStart(2, '0')}-${diaNum.toString().padStart(2, '0')}`;
  }

  /**
   * Normaliza tipo de movimiento a formato estándar ('ABONO' o 'CARGO')
   * Convierte diferentes nomenclaturas de bancos a dos tipos estándar
   * 
   * @param tipo - Tipo de movimiento según el banco
   * @returns 'ABONO' para ingresos o 'CARGO' para egresos
   * 
   * Mapeo de tipos:
   * - ABONO: ABONO, INGRESO, DEPOSITO, CREDITO
   * - CARGO: CARGO, EGRESO, RETIRO, DEBITO
   */
  private normalizarTipo(tipo: string): 'ABONO' | 'CARGO' {
    tipo = tipo.trim().toUpperCase();

    // Normalizar a ABONO (ingresos)
    if (tipo === 'ABONO' || tipo === 'INGRESO' || tipo === 'DEPOSITO' || tipo === 'CREDITO') {
      return 'ABONO';
    }

    // Normalizar a CARGO (egresos)
    if (tipo === 'CARGO' || tipo === 'EGRESO' || tipo === 'RETIRO' || tipo === 'DEBITO') {
      return 'CARGO';
    }

    throw new Error(`Tipo de movimiento inválido: ${tipo}`);
  }

  /**
   * Normaliza monto a formato estándar (número positivo)
   * Convierte diferentes formatos de montos a número decimal estándar
   * 
   * @param monto - Monto en formato del banco (puede incluir símbolos, separadores)
   * @param plantilla - Configuración del formato de montos del banco
   * @returns Número positivo con decimales
   * 
   * Proceso de normalización:
   * 1. Eliminar espacios
   * 2. Eliminar símbolos de moneda (S/, $, PEN, USD, etc.)
   * 3. Eliminar separadores de miles (, o .)
   * 4. Convertir separador decimal a punto (.)
   * 5. Parsear a número
   * 6. Retornar valor absoluto (siempre positivo)
   * 
   * Ejemplos:
   * - "S/ 1,234.56" -> 1234.56
   * - "1.234,56" (formato europeo) -> 1234.56
   * - "$1,234.56" -> 1234.56
   * - "-500.00" -> 500.00 (valor absoluto)
   */
  private parsearMontoConFormato(
    monto: string,
    plantilla: PlantillaCsvBanco,
  ): number {
    if (!monto || monto.trim() === '') {
      return 0;
    }

    let montoLimpio = monto.trim();

    // 1. Eliminar espacios
    montoLimpio = montoLimpio.replace(/\s/g, '');

    // 2. Eliminar símbolos de moneda configurados
    if (plantilla.simbolosMoneda) {
      for (const simbolo of plantilla.simbolosMoneda) {
        // Escapar caracteres especiales de regex
        const simboloEscapado = simbolo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        montoLimpio = montoLimpio.replace(new RegExp(simboloEscapado, 'g'), '');
      }
    }

    // 3. Eliminar separador de miles
    if (plantilla.separadorMiles) {
      const separadorEscapado = plantilla.separadorMiles.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      montoLimpio = montoLimpio.replace(new RegExp(separadorEscapado, 'g'), '');
    }

    // 4. Normalizar separador decimal a punto estándar
    if (plantilla.separadorDecimal === ',') {
      montoLimpio = montoLimpio.replace(',', '.');
    }

    // 5. Parsear a número
    const valor = parseFloat(montoLimpio);

    if (isNaN(valor)) {
      throw new Error(`Monto inválido: ${monto}`);
    }

    // 6. Retornar valor absoluto (siempre positivo)
    return Math.abs(valor);
  }

  /**
   * Redondea a 2 decimales
   */
  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
