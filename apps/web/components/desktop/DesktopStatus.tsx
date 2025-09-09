'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useIsDesktop, useTauri } from '@/hooks/useTauri';
import { 
  Monitor, 
  Globe, 
  Shield, 
  Printer, 
  HardDrive,
  Wifi,
  WifiOff
} from 'lucide-react';

export default function DesktopStatus() {
  const isDesktop = useIsDesktop();
  const { config, loading } = useTauri();

  if (!isDesktop) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Modo Web
          </CardTitle>
          <CardDescription>
            Estás usando la versión web del ERP
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Badge variant="outline">Web Browser</Badge>
            <p className="text-sm text-muted-foreground">
              Funcionalidades limitadas. Para acceso completo, usa la app desktop.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="h-5 w-5" />
          Aplicación Desktop
        </CardTitle>
        <CardDescription>
          Estado de la aplicación desktop
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Estado de conexión */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {config?.offline_mode ? (
                <WifiOff className="h-4 w-4 text-orange-500" />
              ) : (
                <Wifi className="h-4 w-4 text-green-500" />
              )}
              <span className="text-sm">Conexión</span>
            </div>
            <Badge variant={config?.offline_mode ? "secondary" : "default"}>
              {config?.offline_mode ? "Offline" : "Online"}
            </Badge>
          </div>

          {/* Estado del certificado */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="text-sm">Certificado</span>
            </div>
            <Badge variant={config?.certificado_path ? "default" : "secondary"}>
              {config?.certificado_path ? "Configurado" : "No configurado"}
            </Badge>
          </div>

          {/* Base de datos local */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              <span className="text-sm">Base de datos</span>
            </div>
            <Badge variant="default">SQLite Local</Badge>
          </div>

          {/* Impresión */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Printer className="h-4 w-4" />
              <span className="text-sm">Impresión</span>
            </div>
            <Badge variant="default">Directa</Badge>
          </div>

          {config && (
            <div className="pt-2 border-t">
              <div className="text-xs text-muted-foreground space-y-1">
                <div>RUC: {config.ruc || 'No configurado'}</div>
                <div>Empresa: {config.razon_social || 'No configurada'}</div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}