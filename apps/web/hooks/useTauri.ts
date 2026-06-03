'use client';

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeFile, readFile } from '@tauri-apps/plugin-fs';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { customAuth } from '@/lib/auth-service';
import {
  getOfflineStatus,
  listOfflineRequests,
  syncOfflineQueue,
  invalidateOfflineModeCache,
  type OfflineQueueItem,
  type OfflineStatus,
} from '@/lib/offline-store';

export interface AppConfig {
  ruc: string;
  razon_social: string;
  certificado_path?: string;
  certificado_password?: string;
  sunat_endpoint: string;
  offline_mode: boolean;
}

export interface Factura {
  id: string;
  serie: string;
  numero: number;
  fecha_emision: string;
  cliente_ruc: string;
  cliente_nombre: string;
  subtotal: number;
  igv: number;
  total: number;
  estado: string;
  xml_content?: string;
  pdf_path?: string;
  created_at: string;
}

export interface OfflineFiscalDocumentInput {
  document_type: string;
  serie?: string;
  cliente_ruc?: string;
  cliente_nombre?: string;
  moneda?: string;
  subtotal: number;
  igv: number;
  total: number;
  items: unknown[];
  source_type?: string;
  source_id?: string;
}

export interface OfflineFiscalDocument {
  id: string;
  document_type: string;
  serie: string;
  numero: number;
  estado: string;
  xml_content: string;
  signed_xml?: string | null;
  pdf_base64?: string | null;
  hash: string;
  created_at: number;
}

function isTauriRuntime() {
  return typeof window !== 'undefined' && !!window.__TAURI__;
}

export const useTauri = () => {
  const [isDesktop, setIsDesktop] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatus | null>(null);

  useEffect(() => {
    const desktop = isTauriRuntime();
    if (desktop) {
      setIsDesktop(true);
      void loadConfig(true);
      refreshOfflineStatus();
    }
  }, []);

  const loadConfig = async (forceDesktop = false): Promise<AppConfig | null> => {
    if (!forceDesktop && !isDesktop && !isTauriRuntime()) return null;
    
    try {
      const loadedConfig = await invoke<AppConfig>('load_config');
      setConfig(loadedConfig);
      return loadedConfig;
    } catch (error) {
      console.error('Error loading config:', error);
      return null;
    }
  };

  const saveConfig = async (newConfig: AppConfig): Promise<boolean> => {
    if (!isDesktop) return false;
    
    try {
      await invoke('save_config', { config: newConfig });
      setConfig(newConfig);
      // El toggle de offline_mode debe reflejarse de inmediato pese al TTL del cache.
      invalidateOfflineModeCache();
      setOfflineStatus((current) => current ? { ...current, offline_mode: newConfig.offline_mode } : current);
      await sendNotification({
        title: 'Configuración guardada',
        body: 'La configuración se ha guardado correctamente'
      });
      return true;
    } catch (error) {
      console.error('Error saving config:', error);
      await sendNotification({
        title: 'Error',
        body: 'No se pudo guardar la configuración'
      });
      return false;
    }
  };

  const selectCertificate = async (): Promise<string | null> => {
    if (!isDesktop) return null;
    
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Certificados',
          extensions: ['pfx', 'p12']
        }]
      });
      
      return selected as string | null;
    } catch (error) {
      console.error('Error selecting certificate:', error);
      return null;
    }
  };

  const signXML = async (xmlContent: string): Promise<string | null> => {
    if (!isDesktop) return null;
    
    setLoading(true);
    try {
      const signedXml = await invoke<string>('sign_xml', { xmlContent });
      await sendNotification({
        title: 'XML firmado',
        body: 'El documento XML ha sido firmado correctamente'
      });
      return signedXml;
    } catch (error) {
      console.error('Error signing XML:', error);
      await sendNotification({
        title: 'Error de firma',
        body: `Error al firmar XML: ${error}`
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const sendToSUNAT = async (signedXml: string): Promise<string | null> => {
    if (!isDesktop) return null;

    setLoading(true);
    try {
      const context = getOfflineSyncContext();
      const response = await invoke<string>('send_to_sunat', {
        signedXml,
        tenantId: context.tenantId,
        userId: context.userId,
        accessToken: context.accessToken,
      });
      const queued = response.includes('PENDIENTE_ENVIO');
      await sendNotification({
        title: queued ? 'SUNAT encolado' : 'Enviado a SUNAT',
        body: queued
          ? 'El documento queda pendiente para enviarse al reconectar'
          : 'El documento ha sido enviado correctamente'
      });
      return response;
    } catch (error) {
      console.error('Error sending to SUNAT:', error);
      await sendNotification({
        title: 'Error SUNAT',
        body: `Error al enviar a SUNAT: ${error}`
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async (xmlContent: string, template: string = ''): Promise<Uint8Array | null> => {
    if (!isDesktop) return null;
    
    setLoading(true);
    try {
      const pdfData = await invoke<number[]>('generate_pdf', { xmlContent, template });
      return new Uint8Array(pdfData);
    } catch (error) {
      console.error('Error generating PDF:', error);
      await sendNotification({
        title: 'Error PDF',
        body: `Error al generar PDF: ${error}`
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const generateOfflineFiscalDocument = async (
    document: OfflineFiscalDocumentInput,
  ): Promise<OfflineFiscalDocument | null> => {
    if (!isDesktop) return null;

    setLoading(true);
    try {
      const context = getOfflineSyncContext();
      const result = await invoke<OfflineFiscalDocument>('generate_offline_fiscal_document', {
        document,
        tenantId: context.tenantId,
        userId: context.userId,
        accessToken: context.accessToken,
      });
      await sendNotification({
        title: 'Documento fiscal local',
        body: `${result.serie}-${String(result.numero).padStart(8, '0')} queda pendiente de envio SUNAT/OSE`
      });
      return result;
    } catch (error) {
      console.error('Error generating offline fiscal document:', error);
      await sendNotification({
        title: 'Error fiscal offline',
        body: `No se pudo generar el documento local: ${error}`
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const savePDF = async (pdfData: Uint8Array, filename: string): Promise<boolean> => {
    if (!isDesktop) return false;
    
    try {
      const filePath = await save({
        defaultPath: filename,
        filters: [{
          name: 'PDF',
          extensions: ['pdf']
        }]
      });
      
      if (filePath) {
        await writeFile(filePath, pdfData);
        await sendNotification({
          title: 'PDF guardado',
          body: `PDF guardado en: ${filePath}`
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error saving PDF:', error);
      return false;
    }
  };

  const getPrinters = async (): Promise<string[]> => {
    if (!isDesktop) return [];
    
    try {
      return await invoke<string[]>('get_printers');
    } catch (error) {
      console.error('Error getting printers:', error);
      return [];
    }
  };

  const printDocument = async (pdfData: Uint8Array, printerName?: string): Promise<boolean> => {
    if (!isDesktop) return false;
    
    setLoading(true);
    try {
      await invoke('print_document', { 
        pdfData: Array.from(pdfData), 
        printerName 
      });
      await sendNotification({
        title: 'Documento impreso',
        body: 'El documento se ha enviado a la impresora'
      });
      return true;
    } catch (error) {
      console.error('Error printing:', error);
      await sendNotification({
        title: 'Error de impresión',
        body: `Error al imprimir: ${error}`
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const backupDatabase = async (): Promise<boolean> => {
    if (!isDesktop) return false;
    
    try {
      const backupPath = await save({
        defaultPath: `erp_desktop_backup_${new Date().toISOString().split('T')[0]}.json`,
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }]
      });
      
      if (backupPath) {
        await invoke('backup_database', { backupPath });
        await sendNotification({
          title: 'Backup creado',
          body: `Base de datos respaldada en: ${backupPath}`
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error creating backup:', error);
      await sendNotification({
        title: 'Error de backup',
        body: `Error al crear backup: ${error}`
      });
      return false;
    }
  };

  const exportSIRE = async (periodo: string): Promise<string | null> => {
    if (!isDesktop) return null;
    
    setLoading(true);
    try {
      const sireData = await invoke<string>('export_sire_data', { periodo });
      
      const filePath = await save({
        defaultPath: `SIRE_${periodo}.txt`,
        filters: [{
          name: 'Text',
          extensions: ['txt']
        }]
      });
      
      if (filePath) {
        await writeFile(filePath, new TextEncoder().encode(sireData));
        await sendNotification({
          title: 'SIRE exportado',
          body: `Datos SIRE exportados a: ${filePath}`
        });
        return filePath;
      }
      return null;
    } catch (error) {
      console.error('Error exporting SIRE:', error);
      await sendNotification({
        title: 'Error SIRE',
        body: `Error al exportar SIRE: ${error}`
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const refreshOfflineStatus = async (): Promise<OfflineStatus | null> => {
    try {
      const status = await getOfflineStatus();
      setOfflineStatus(status);
      return status;
    } catch (error) {
      console.error('Error loading offline status:', error);
      return null;
    }
  };

  const getOfflineQueue = async (): Promise<OfflineQueueItem[]> => {
    try {
      return await listOfflineRequests();
    } catch (error) {
      console.error('Error loading offline queue:', error);
      return [];
    }
  };

  const synchronizeOfflineQueue = async (): Promise<boolean> => {
    setLoading(true);
    try {
      const results = await syncOfflineQueue();
      await refreshOfflineStatus();
      const failed = results.filter((result) => !result.ok).length;
      await sendNotification({
        title: failed ? 'Sincronización parcial' : 'Sincronización completada',
        body: failed
          ? `${failed} operación(es) siguen pendientes o fallaron`
          : `${results.length} operación(es) sincronizadas`,
      });
      return failed === 0;
    } catch (error) {
      console.error('Error syncing offline queue:', error);
      await sendNotification({
        title: 'Error de sincronización',
        body: `No se pudo sincronizar la cola offline: ${error}`,
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    isDesktop,
    config,
    offlineStatus,
    loading,
    loadConfig,
    saveConfig,
    refreshOfflineStatus,
    getOfflineQueue,
    synchronizeOfflineQueue,
    selectCertificate,
    signXML,
    sendToSUNAT,
    generatePDF,
    generateOfflineFiscalDocument,
    savePDF,
    getPrinters,
    printDocument,
    backupDatabase,
    exportSIRE
  };
};

function getOfflineSyncContext() {
  const { session, accessToken } = customAuth.getCachedSession();
  return {
    tenantId: session?.user?.tenant_id ?? null,
    userId: session?.user?.id ?? null,
    accessToken: accessToken ?? session?.access_token ?? null,
  };
}

// Hook para detectar si estamos en modo desktop
export const useIsDesktop = () => {
  const [isDesktop, setIsDesktop] = useState(false);
  
  useEffect(() => {
    setIsDesktop(typeof window !== 'undefined' && !!window.__TAURI__);
  }, []);
  
  return isDesktop;
};

// Tipos para TypeScript
declare global {
  interface Window {
    __TAURI__?: any;
  }
}
