'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useTauri, AppConfig } from '@/hooks/useTauri';
import { toast } from 'sonner';
import { 
  Settings, 
  Shield, 
  FileKey, 
  Cloud, 
  HardDrive, 
  Printer,
  Download,
  Upload
} from 'lucide-react';

export default function DesktopConfig() {
  const { 
    isDesktop, 
    config, 
    loading,
    saveConfig, 
    selectCertificate,
    getPrinters,
    backupDatabase,
    exportSIRE
  } = useTauri();

  const [formData, setFormData] = useState<AppConfig>({
    ruc: '',
    razon_social: '',
    certificado_path: undefined,
    certificado_password: undefined,
    sunat_endpoint: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
    offline_mode: false
  });

  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  useEffect(() => {
    if (isDesktop) {
      loadPrinters();
    }
  }, [isDesktop]);

  const loadPrinters = async () => {
    const printerList = await getPrinters();
    setPrinters(printerList);
  };

  const handleSave = async () => {
    const success = await saveConfig(formData);
    if (success) {
      toast.success('Configuración guardada correctamente');
    } else {
      toast.error('Error al guardar la configuración');
    }
  };

  const handleSelectCertificate = async () => {
    const certPath = await selectCertificate();
    if (certPath) {
      setFormData(prev => ({
        ...prev,
        certificado_path: certPath
      }));
      toast.success('Certificado seleccionado');
    }
  };

  const handleBackup = async () => {
    const success = await backupDatabase();
    if (success) {
      toast.success('Backup creado correctamente');
    } else {
      toast.error('Error al crear backup');
    }
  };

  const handleExportSIRE = async () => {
    if (!selectedPeriod) {
      toast.error('Selecciona un período');
      return;
    }
    
    const filePath = await exportSIRE(selectedPeriod);
    if (filePath) {
      toast.success('Datos SIRE exportados correctamente');
    } else {
      toast.error('Error al exportar datos SIRE');
    }
  };

  if (!isDesktop) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuración Desktop
          </CardTitle>
          <CardDescription>
            Esta sección solo está disponible en la aplicación desktop
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Para acceder a las funciones avanzadas como firma digital, 
            impresión directa y modo offline, descarga la aplicación desktop.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Configuración General */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuración General
          </CardTitle>
          <CardDescription>
            Configuración básica de la empresa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ruc">RUC</Label>
              <Input
                id="ruc"
                value={formData.ruc}
                onChange={(e) => setFormData(prev => ({ ...prev, ruc: e.target.value }))}
                placeholder="20123456789"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="razon_social">Razón Social</Label>
              <Input
                id="razon_social"
                value={formData.razon_social}
                onChange={(e) => setFormData(prev => ({ ...prev, razon_social: e.target.value }))}
                placeholder="Mi Empresa S.A.C."
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="sunat_endpoint">Endpoint SUNAT</Label>
            <Input
              id="sunat_endpoint"
              value={formData.sunat_endpoint}
              onChange={(e) => setFormData(prev => ({ ...prev, sunat_endpoint: e.target.value }))}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="offline_mode"
              checked={formData.offline_mode}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, offline_mode: checked }))}
            />
            <Label htmlFor="offline_mode">Modo Offline</Label>
            {formData.offline_mode && (
              <Badge variant="secondary">Offline</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Certificado Digital */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Certificado Digital
          </CardTitle>
          <CardDescription>
            Configuración del certificado para firma digital
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button 
              onClick={handleSelectCertificate}
              variant="outline"
              className="flex items-center gap-2"
            >
              <FileKey className="h-4 w-4" />
              Seleccionar Certificado
            </Button>
            {formData.certificado_path && (
              <Badge variant="outline">
                {formData.certificado_path.split('/').pop()}
              </Badge>
            )}
          </div>
          
          {formData.certificado_path && (
            <div className="space-y-2">
              <Label htmlFor="cert_password">Contraseña del Certificado</Label>
              <Input
                id="cert_password"
                type="password"
                value={formData.certificado_password || ''}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  certificado_password: e.target.value 
                }))}
                placeholder="Contraseña del archivo .pfx"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Impresoras */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Impresoras Disponibles
          </CardTitle>
          <CardDescription>
            Impresoras detectadas en el sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {printers.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {printers.map((printer, index) => (
                <Badge key={index} variant="outline">
                  {printer}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No se encontraron impresoras</p>
          )}
          <Button 
            onClick={loadPrinters} 
            variant="outline" 
            size="sm" 
            className="mt-4"
          >
            Actualizar Lista
          </Button>
        </CardContent>
      </Card>

      {/* Herramientas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Herramientas
          </CardTitle>
          <CardDescription>
            Backup y exportación de datos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button 
              onClick={handleBackup}
              variant="outline"
              className="flex items-center gap-2"
              disabled={loading}
            >
              <Download className="h-4 w-4" />
              Crear Backup
            </Button>
          </div>

          <Separator />

          <div className="space-y-4">
            <h4 className="font-medium">Exportar SIRE</h4>
            <div className="flex gap-4 items-end">
              <div className="space-y-2">
                <Label htmlFor="period">Período (YYYY-MM)</Label>
                <Input
                  id="period"
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  placeholder="2024-01"
                  className="w-32"
                />
              </div>
              <Button 
                onClick={handleExportSIRE}
                variant="outline"
                className="flex items-center gap-2"
                disabled={loading || !selectedPeriod}
              >
                <Upload className="h-4 w-4" />
                Exportar SIRE
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Guardar Configuración */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2"
        >
          <Settings className="h-4 w-4" />
          Guardar Configuración
        </Button>
      </div>
    </div>
  );
}