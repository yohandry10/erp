'use client';

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeFile, readFile } from '@tauri-apps/plugin-fs';
import { sendNotification } from '@tauri-apps/plugin-notification';

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

export const useTauri = () => {
  const [isDesktop, setIsDesktop] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Detectar si estamos en Tauri
    if (typeof window !== 'undefined' && window.__TAURI__) {
      setIsDesktop(true);
      loadConfig();
    }
  }, []);

  const loadConfig = async (): Promise<AppConfig | null> => {
    if (!isDesktop) return null;
    
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
      const response = await invoke<string>('send_to_sunat', { signedXml });
      await sendNotification({
        title: 'Enviado a SUNAT',
        body: 'El documento ha sido enviado correctamente'
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
        defaultPath: `erp_backup_${new Date().toISOString().split('T')[0]}.db`,
        filters: [{
          name: 'Database',
          extensions: ['db']
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

  return {
    isDesktop,
    config,
    loading,
    loadConfig,
    saveConfig,
    selectCertificate,
    signXML,
    sendToSUNAT,
    generatePDF,
    savePDF,
    getPrinters,
    printDocument,
    backupDatabase,
    exportSIRE
  };
};

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