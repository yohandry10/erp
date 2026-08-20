'use client';

import React, { useState, useRef } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Badge } from '../ui/badge';
import { Upload, FileText, AlertCircle, CheckCircle2, X, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/format-utils';
import { fetchApi } from '@/lib/api-fetch';
import { useCountryContext } from '@/hooks/use-country-context';

interface MovimientoCSV {
  fecha: string;
  tipo: 'ABONO' | 'CARGO';
  monto: number;
  descripcion: string;
  referencia?: string;
}

interface ImportarExtractoCSVProps {
  conciliacionId: string;
  cuentaBancariaId: string;
  banco: string;
  onImportSuccess: () => void;
  onCancel: () => void;
}

type BancoTemplate = 'BCP' | 'BBVA' | 'INTERBANK' | 'SCOTIABANK' | 'GENERICO';

const BANCO_TEMPLATES: Record<BancoTemplate, { name: string; description: string }> = {
  BCP: {
    name: 'BCP',
    description: 'Formato: Fecha, Descripción, Cargo, Abono, Saldo',
  },
  BBVA: {
    name: 'BBVA',
    description: 'Formato: Fecha, Concepto, Importe, Tipo',
  },
  INTERBANK: {
    name: 'Interbank',
    description: 'Formato: Fecha, Detalle, Débito, Crédito',
  },
  SCOTIABANK: {
    name: 'Scotiabank',
    description: 'Formato: Fecha, Descripción, Monto, Tipo',
  },
  GENERICO: {
    name: 'Genérico',
    description: 'Formato: Fecha, Descripción, Referencia, Tipo, Monto',
  },
};

export function ImportarExtractoCSV({
  conciliacionId,
  banco,
  onImportSuccess,
  onCancel,
}: ImportarExtractoCSVProps) {
  const country = useCountryContext();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvContent, setCsvContent] = useState('');
  const [bancoTemplate, setBancoTemplate] = useState<BancoTemplate>('GENERICO');
  const [previewData, setPreviewData] = useState<MovimientoCSV[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [saldoInicial, setSaldoInicial] = useState('');
  const [saldoFinal, setSaldoFinal] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(
    () => `recon-import:${crypto.randomUUID()}`,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detectar banco automáticamente
  React.useEffect(() => {
    const bancoUpper = banco.toUpperCase();
    if (bancoUpper.includes('BCP')) {
      setBancoTemplate('BCP');
    } else if (bancoUpper.includes('BBVA')) {
      setBancoTemplate('BBVA');
    } else if (bancoUpper.includes('INTERBANK')) {
      setBancoTemplate('INTERBANK');
    } else if (bancoUpper.includes('SCOTIA')) {
      setBancoTemplate('SCOTIABANK');
    }
  }, [banco]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tipo de archivo
    if (!file.name.endsWith('.csv')) {
      setError('Por favor seleccione un archivo CSV válido');
      return;
    }

    setSelectedFile(file);
    setIdempotencyKey(`recon-import:${crypto.randomUUID()}`);
    setCsvContent('');
    setError(null);
    setParseErrors([]);
    processCSVPreview(file);
  };

  const processCSVPreview = async (file: File) => {
    setIsProcessing(true);
    setPreviewData([]);
    setParseErrors([]);

    try {
      const text = await file.text();
      setCsvContent(text);
      const lines = text.split('\n').filter((line) => line.trim());

      if (lines.length === 0) {
        setError('El archivo CSV está vacío');
        setIsProcessing(false);
        return;
      }

      const movimientos: MovimientoCSV[] = [];
      const errors: string[] = [];

      // Saltar la primera línea (encabezados)
      for (let i = 1; i < lines.length; i++) {
        try {
          const movimiento = parseCSVLine(lines[i], bancoTemplate, i + 1);
          if (movimiento) {
            movimientos.push(movimiento);
          }
        } catch (err) {
          errors.push(`Línea ${i + 1}: ${err instanceof Error ? err.message : 'Error desconocido'}`);
        }
      }

      setPreviewData(movimientos);
      setParseErrors(errors);

      if (movimientos.length === 0 && errors.length > 0) {
        setError('No se pudieron procesar los movimientos del archivo');
      }
    } catch (err) {
      setError('Error al leer el archivo CSV');
      console.error('Error processing CSV:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const parseCSVLine = (line: string, template: BancoTemplate, lineNumber: number): MovimientoCSV | null => {
    const columns = line.split(',').map((col) => col.trim().replace(/^"|"$/g, ''));

    switch (template) {
      case 'BCP':
        return parseBCP(columns, lineNumber);
      case 'BBVA':
        return parseBBVA(columns, lineNumber);
      case 'INTERBANK':
        return parseInterbank(columns, lineNumber);
      case 'SCOTIABANK':
        return parseScotiabank(columns, lineNumber);
      case 'GENERICO':
      default:
        return parseGenerico(columns, lineNumber);
    }
  };

  const parseBCP = (columns: string[], lineNumber: number): MovimientoCSV | null => {
    // Formato BCP: Fecha, Descripción, Cargo, Abono, Saldo
    if (columns.length < 4) {
      throw new Error('Formato BCP inválido - columnas insuficientes');
    }

    const fecha = parseDate(columns[0]);
    const descripcion = columns[1] || 'Sin descripción';
    const cargo = parseFloat(columns[2]) || 0;
    const abono = parseFloat(columns[3]) || 0;

    if (cargo === 0 && abono === 0) {
      return null; // Línea sin movimiento
    }

    return {
      fecha,
      tipo: cargo > 0 ? 'CARGO' : 'ABONO',
      monto: cargo > 0 ? cargo : abono,
      descripcion,
      referencia: `BCP-${lineNumber}`,
    };
  };

  const parseBBVA = (columns: string[], lineNumber: number): MovimientoCSV | null => {
    // Formato BBVA: Fecha, Concepto, Importe, Tipo
    if (columns.length < 4) {
      throw new Error('Formato BBVA inválido - columnas insuficientes');
    }

    const fecha = parseDate(columns[0]);
    const descripcion = columns[1] || 'Sin descripción';
    const monto = Math.abs(parseFloat(columns[2]) || 0);
    const tipo = columns[3].toUpperCase().includes('ABONO') || columns[3].toUpperCase().includes('CREDITO') ? 'ABONO' : 'CARGO';

    if (monto === 0) {
      return null;
    }

    return {
      fecha,
      tipo,
      monto,
      descripcion,
      referencia: `BBVA-${lineNumber}`,
    };
  };

  const parseInterbank = (columns: string[], lineNumber: number): MovimientoCSV | null => {
    // Formato Interbank: Fecha, Detalle, Débito, Crédito
    if (columns.length < 4) {
      throw new Error('Formato Interbank inválido - columnas insuficientes');
    }

    const fecha = parseDate(columns[0]);
    const descripcion = columns[1] || 'Sin descripción';
    const debito = parseFloat(columns[2]) || 0;
    const credito = parseFloat(columns[3]) || 0;

    if (debito === 0 && credito === 0) {
      return null;
    }

    return {
      fecha,
      tipo: debito > 0 ? 'CARGO' : 'ABONO',
      monto: debito > 0 ? debito : credito,
      descripcion,
      referencia: `INTERBANK-${lineNumber}`,
    };
  };

  const parseScotiabank = (columns: string[], lineNumber: number): MovimientoCSV | null => {
    // Formato Scotiabank: Fecha, Descripción, Monto, Tipo
    if (columns.length < 4) {
      throw new Error('Formato Scotiabank inválido - columnas insuficientes');
    }

    const fecha = parseDate(columns[0]);
    const descripcion = columns[1] || 'Sin descripción';
    const monto = Math.abs(parseFloat(columns[2]) || 0);
    const tipo = columns[3].toUpperCase().includes('ABONO') || columns[3].toUpperCase().includes('CREDITO') ? 'ABONO' : 'CARGO';

    if (monto === 0) {
      return null;
    }

    return {
      fecha,
      tipo,
      monto,
      descripcion,
      referencia: `SCOTIA-${lineNumber}`,
    };
  };

  const parseGenerico = (columns: string[], lineNumber: number): MovimientoCSV | null => {
    // Formato Genérico: Fecha, Descripción, Referencia, Tipo, Monto
    if (columns.length < 4) {
      throw new Error('Formato genérico inválido - columnas insuficientes');
    }

    const fecha = parseDate(columns[0]);
    const descripcion = columns[1] || 'Sin descripción';
    const referencia = columns[2] || `REF-${lineNumber}`;
    const tipoStr = columns[3].toUpperCase();
    const tipo = tipoStr.includes('ABONO') || tipoStr.includes('CREDITO') || tipoStr.includes('INGRESO') ? 'ABONO' : 'CARGO';
    const monto = Math.abs(parseFloat(columns[4]) || 0);

    if (monto === 0) {
      return null;
    }

    return {
      fecha,
      tipo,
      monto,
      descripcion,
      referencia,
    };
  };

  const parseDate = (dateStr: string): string => {
    // Intentar varios formatos de fecha
    const formats = [
      /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
      /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
      /^(\d{2})-(\d{2})-(\d{4})$/, // DD-MM-YYYY
    ];

    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        if (format === formats[0] || format === formats[2]) {
          // DD/MM/YYYY or DD-MM-YYYY
          const [, day, month, year] = match;
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        } else {
          // YYYY-MM-DD
          return dateStr;
        }
      }
    }

    throw new Error(`Formato de fecha inválido: ${dateStr}`);
  };

  const handleImport = async () => {
    const saldoInicialNumero = Number(saldoInicial);
    const saldoFinalNumero = Number(saldoFinal);
    if (
      !selectedFile || previewData.length === 0 || parseErrors.length > 0 ||
      !Number.isFinite(saldoInicialNumero) || !Number.isFinite(saldoFinalNumero)
    ) {
      setError('Complete los saldos del extracto y corrija todas las filas inválidas');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const response = await fetchApi(
        `/api/finanzas/conciliacion/${conciliacionId}/importar-csv`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            contenidoCsv: csvContent,
            banco: bancoTemplate,
            saldo_banco_inicial: saldoInicialNumero,
            saldo_banco_final: saldoFinalNumero,
            idempotency_key: idempotencyKey,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al importar extracto');
      }

      onImportSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al importar extracto');
      console.error('Error importing CSV:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setPreviewData([]);
    setParseErrors([]);
    setError(null);
    setSaldoInicial('');
    setSaldoFinal('');
    setIdempotencyKey(`recon-import:${crypto.randomUUID()}`);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTemplateChange = (value: string) => {
    setBancoTemplate(value as BancoTemplate);
    setIdempotencyKey(`recon-import:${crypto.randomUUID()}`);
    if (selectedFile) {
      processCSVPreview(selectedFile);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(country.locale || 'es-PE', {
      style: 'currency',
      currency: country.moneda || 'PEN',
    }).format(amount);
  };

  const totalAbonos = previewData
    .filter((m) => m.tipo === 'ABONO')
    .reduce((sum, m) => sum + m.monto, 0);

  const totalCargos = previewData
    .filter((m) => m.tipo === 'CARGO')
    .reduce((sum, m) => sum + m.monto, 0);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Importar Extracto Bancario</h3>
        <p className="text-sm text-muted-foreground">
          Seleccione el archivo CSV del extracto bancario para importar los movimientos
        </p>
      </div>

      {/* Selección de plantilla */}
      <div>
        <Label htmlFor="banco-template">Plantilla del Banco</Label>
        <Select value={bancoTemplate} onValueChange={handleTemplateChange}>
          <SelectTrigger id="banco-template">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(BANCO_TEMPLATES).map(([key, template]) => (
              <SelectItem key={key} value={key}>
                <div>
                  <div className="font-semibold">{template.name}</div>
                  <div className="text-xs text-muted-foreground">{template.description}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Área de carga de archivo */}
      {!selectedFile ? (
        <Card className="border-2 border-dashed">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-center">
              <Upload className="h-12 w-12 text-muted-foreground mb-4" />
              <h4 className="text-lg font-semibold mb-2">Seleccionar archivo CSV</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Arrastre y suelte el archivo aquí o haga clic para seleccionar
              </p>
              <input
                ref={fileInputRef}
                aria-label="Archivo CSV del extracto bancario"
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
                id="csv-file-input"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileText className="mr-2 h-4 w-4" />
                Seleccionar Archivo
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <div className="font-semibold">{selectedFile.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(2)} KB
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleRemoveFile}
                disabled={isProcessing || isUploading}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Errores */}
      {error && (
        <Card className="border-red-200 bg-destructive/10">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <div className="font-semibold text-destructive">Error</div>
                <div className="text-sm text-destructive">{error}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Errores de parseo */}
      {parseErrors.length > 0 && (
        <Card className="border-yellow-200 bg-amber-500/10">
          <CardHeader>
            <CardTitle className="text-amber-400 text-base">
              Advertencias de Procesamiento ({parseErrors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {parseErrors.slice(0, 10).map((err) => (
                <div key={err} className="text-sm text-amber-400">
                  • {err}
                </div>
              ))}
              {parseErrors.length > 10 && (
                <div className="text-sm text-amber-400 font-semibold">
                  ... y {parseErrors.length - 10} advertencias más
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vista previa de datos */}
      {isProcessing && (
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Procesando archivo...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isProcessing && previewData.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Saldos informados por el banco</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="extracto-saldo-inicial">Saldo inicial *</Label>
                <input
                  id="extracto-saldo-inicial"
                  type="number"
                  step="0.01"
                  value={saldoInicial}
                  onChange={(event) => {
                    setSaldoInicial(event.target.value);
                    setIdempotencyKey(`recon-import:${crypto.randomUUID()}`);
                  }}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
                />
              </div>
              <div>
                <Label htmlFor="extracto-saldo-final">Saldo final *</Label>
                <input
                  id="extracto-saldo-final"
                  type="number"
                  step="0.01"
                  value={saldoFinal}
                  onChange={(event) => {
                    setSaldoFinal(event.target.value);
                    setIdempotencyKey(`recon-import:${crypto.randomUUID()}`);
                  }}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
                />
              </div>
              <p className="text-xs text-muted-foreground md:col-span-2">
                El servidor verifica saldo inicial + abonos − cargos = saldo final.
              </p>
            </CardContent>
          </Card>

          {/* Resumen */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Total Movimientos</div>
                <div className="text-2xl font-bold">{previewData.length}</div>
              </CardContent>
            </Card>
            <Card className="border-emerald-500/30 bg-emerald-500/10">
              <CardContent className="p-4">
                <div className="text-sm text-emerald-400">Total Abonos</div>
                <div className="text-2xl font-bold text-emerald-400">
                  {formatCurrency(totalAbonos)}
                </div>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-destructive/10">
              <CardContent className="p-4">
                <div className="text-sm text-destructive">Total Cargos</div>
                <div className="text-2xl font-bold text-destructive">
                  {formatCurrency(totalCargos)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabla de vista previa */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Vista Previa de Movimientos ({previewData.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-muted/30 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Fecha
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Tipo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Descripción
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        Monto
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Referencia
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-gray-200">
                    {previewData.map((mov) => (
                      <tr key={`${mov.fecha}:${mov.tipo}:${mov.monto}:${mov.referencia || mov.descripcion}`} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-sm text-foreground">
                          {formatDate(mov.fecha)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <Badge
                            variant={mov.tipo === 'ABONO' ? 'default' : 'destructive'}
                            className={
                              mov.tipo === 'ABONO'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-destructive/10 text-destructive'
                            }
                          >
                            {mov.tipo}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground max-w-xs truncate">
                          {mov.descripcion}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground text-right font-semibold">
                          {formatCurrency(mov.monto)}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{mov.referencia}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Acciones */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isUploading}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={handleImport}
          disabled={
            !selectedFile || previewData.length === 0 || parseErrors.length > 0 ||
            saldoInicial === '' || saldoFinal === '' || isUploading
          }
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importando...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Importar {previewData.length} Movimientos
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
