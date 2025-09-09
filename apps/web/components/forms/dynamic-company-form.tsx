import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { DynamicField } from '../ui/dynamic-field';
import { useCountryConfig } from '../../hooks/use-country-config';
import { useToast } from '../ui/use-toast';
import { Building2, Save, RefreshCw } from 'lucide-react';

interface CompanyFormData {
  documento_identidad: string;
  razon_social: string;
  direccion_fiscal: string;
  telefono: string;
  email: string;
  tipo_documento: string;
  moneda_principal: string;
}

export const DynamicCompanyForm: React.FC = () => {
  const { 
    config, 
    loading, 
    selectedCountry,
    getLabel,
    formatCurrency,
    formatDate 
  } = useCountryConfig();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState<CompanyFormData>({
    documento_identidad: '',
    razon_social: '',
    direccion_fiscal: '',
    telefono: '',
    email: '',
    tipo_documento: '',
    moneda_principal: ''
  });
  
  const [saving, setSaving] = useState(false);

  const handleFieldChange = (field: keyof CompanyFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      // Simular guardado
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({
        title: "Empresa guardada",
        description: `Configuración guardada para ${selectedCountry?.nombre}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar la configuración",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-6">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          Cargando configuración del país...
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-gray-500">
            No se pudo cargar la configuración del país
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Configuración de Empresa - {selectedCountry?.nombre}
        </CardTitle>
        <p className="text-sm text-gray-600">
          Formulario adaptado para {config.pais.codigo_fiscal} 
          ({config.configuracion_fiscal.moneda_principal})
        </p>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tipo de Documento */}
            <DynamicField
              name="tipo_documento"
              type="documento"
              value={formData.tipo_documento}
              onChange={(value) => handleFieldChange('tipo_documento', value)}
            />
            
            {/* Número de Documento */}
            <DynamicField
              name="documento_identidad"
              type="text"
              value={formData.documento_identidad}
              onChange={(value) => handleFieldChange('documento_identidad', value)}
            />
          </div>
          
          {/* Razón Social */}
          <DynamicField
            name="razon_social"
            type="text"
            value={formData.razon_social}
            onChange={(value) => handleFieldChange('razon_social', value)}
          />
          
          {/* Dirección Fiscal */}
          <DynamicField
            name="direccion_fiscal"
            type="text"
            value={formData.direccion_fiscal}
            onChange={(value) => handleFieldChange('direccion_fiscal', value)}
          />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Teléfono */}
            <DynamicField
              name="telefono"
              type="text"
              value={formData.telefono}
              onChange={(value) => handleFieldChange('telefono', value)}
            />
            
            {/* Email */}
            <DynamicField
              name="email"
              type="text"
              value={formData.email}
              onChange={(value) => handleFieldChange('email', value)}
            />
          </div>
          
          {/* Moneda Principal */}
          <DynamicField
            name="moneda_principal"
            type="moneda"
            value={formData.moneda_principal}
            onChange={(value) => handleFieldChange('moneda_principal', value)}
          />
          
          {/* Información de configuración */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">Configuración Fiscal Aplicada:</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Formato de fecha: {config.formato_config.formato_fecha}</div>
              <div>Separador decimal: {config.formato_config.separador_decimal}</div>
              <div>Separador de miles: {config.formato_config.separador_miles}</div>
              <div>Moneda: {config.configuracion_fiscal.moneda_principal}</div>
            </div>
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Guardar Configuración
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};