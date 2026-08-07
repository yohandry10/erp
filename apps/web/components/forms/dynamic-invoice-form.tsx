import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DynamicField } from '@/components/ui/dynamic-field';
import { useCountryConfig } from '@/hooks/use-country-config';
import { useToast } from '@/components/ui/use-toast';

interface InvoiceData {
  tipoDocumento: string;
  serie: string;
  numero: string;
  fechaEmision: string;
  tipoDocumentoReceptor: string;
  documentoReceptor: string;
  razonSocialReceptor: string;
  moneda: string;
  totalGravadas: number;
  totalImpuestos: number;
  importeTotal: number;
}

const DynamicInvoiceForm: React.FC = () => {
  const {
    getLabel,
    formatCurrency,
    formatDate,
    country,
    loading
  } = useCountryConfig();
  const { toast } = useToast();

  const [formData, setFormData] = useState<InvoiceData>({
    tipoDocumento: '',
    serie: '',
    numero: '',
    fechaEmision: new Date().toISOString().split('T')[0],
    tipoDocumentoReceptor: '',
    documentoReceptor: '',
    razonSocialReceptor: '',
    moneda: country?.moneda || 'PEN',
    totalGravadas: 0,
    totalImpuestos: 0,
    importeTotal: 0
  });

  useEffect(() => {
    if (country?.moneda) {
      setFormData((previous) => ({ ...previous, moneda: country.moneda }));
    }
  }, [country?.moneda]);

  const updateField = (field: keyof InvoiceData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const calculateTotals = () => {
    const impuestos = formData.totalGravadas * (country?.impuestoRate || 0);
    const total = formData.totalGravadas + impuestos;

    setFormData(prev => ({
      ...prev,
      totalImpuestos: impuestos,
      importeTotal: total
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Aquí iría la lógica de envío usando el servicio fiscal apropiado
      toast({
        title: "Factura creada",
        description: `Factura ${formData.serie}-${formData.numero} creada exitosamente para ${country?.paisNombre}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al crear la factura",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return <div>Cargando configuración...</div>;
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>
          {getLabel('nueva_factura', 'Nueva Factura')} - {country?.paisNombre}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Datos del Documento */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DynamicField
              name="tipoDocumento"
              type="select"
              value={formData.tipoDocumento}
              onChange={(value) => updateField('tipoDocumento', value)}
            />
            <DynamicField
              name="serie"
              value={formData.serie}
              onChange={(value) => updateField('serie', value)}
              placeholder="F001"
            />
            <DynamicField
              name="numero"
              value={formData.numero}
              onChange={(value) => updateField('numero', value)}
              placeholder="00000001"
            />
          </div>

          {/* Datos del Receptor */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DynamicField
              name="tipoDocumentoReceptor"
              type="select"
              value={formData.tipoDocumentoReceptor}
              onChange={(value) => updateField('tipoDocumentoReceptor', value)}
            />
            <DynamicField
              name="documentoReceptor"
              value={formData.documentoReceptor}
              onChange={(value) => updateField('documentoReceptor', value)}
              placeholder={
                country?.paisCodigo === 'AR'
                  ? 'CUIT/DNI'
                  : country?.paisCodigo === 'CO'
                    ? 'NIT/CC'
                    : 'RUC/DNI'
              }
            />
            <DynamicField
              name="razonSocialReceptor"
              value={formData.razonSocialReceptor}
              onChange={(value) => updateField('razonSocialReceptor', value)}
            />
          </div>

          {/* Datos Monetarios */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <DynamicField
              name="moneda"
              type="select"
              value={formData.moneda}
              onChange={(value) => updateField('moneda', value)}
            />
            <DynamicField
              name="totalGravadas"
              type="number"
              value={formData.totalGravadas}
              onChange={(value) => {
                updateField('totalGravadas', value);
                setTimeout(calculateTotals, 100);
              }}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {getLabel('total_impuestos', 'Total Impuestos')}
              </label>
              <div className="p-2 bg-muted/30 rounded border">
                {formatCurrency(formData.totalImpuestos)}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {getLabel('importe_total', 'Importe Total')}
              </label>
              <div className="p-2 bg-primary/10 rounded border font-semibold">
                {formatCurrency(formData.importeTotal)}
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-4">
            <Button type="button" variant="outline">
              {getLabel('cancelar', 'Cancelar')}
            </Button>
            <Button type="submit">
              {getLabel('crear_factura', 'Crear Factura')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default DynamicInvoiceForm;
