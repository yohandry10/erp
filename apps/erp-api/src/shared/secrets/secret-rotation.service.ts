import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import * as crypto from 'crypto';

/**
 * Servicio de Rotación Automática de Secrets
 * Q57: Implementa rotación programada con soporte dual-secret para zero-downtime
 */
@Injectable()
export class SecretRotationService implements OnModuleInit {
  private readonly logger = new Logger(SecretRotationService.name);
  
  // Almacena secrets activos y anteriores para soporte dual durante rotación
  private activeSecrets: Map<string, { current: string; previous?: string; rotatedAt?: Date }> = new Map();
  
  // Configuración de rotación por tipo de secret
  private readonly rotationConfig = {
    JWT_SECRET: { intervalDays: 90, gracePeriodHours: 24 },
    JWT_REFRESH_SECRET: { intervalDays: 90, gracePeriodHours: 48 },
    SESSION_SECRET: { intervalDays: 30, gracePeriodHours: 12 },
    CSRF_SECRET: { intervalDays: 30, gracePeriodHours: 6 },
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  async onModuleInit() {
    await this.initializeSecrets();
    this.logger.log('🔐 SecretRotationService inicializado');
  }

  /**
   * Inicializa los secrets desde la configuración o BD
   */
  private async initializeSecrets(): Promise<void> {
    // Cargar secrets desde variables de entorno
    for (const key of Object.keys(this.rotationConfig)) {
      const value = this.configService.get<string>(key);
      if (value) {
        this.activeSecrets.set(key, { current: value });
      }
    }

    // Intentar cargar estado de rotación desde BD
    try {
      const { data: rotationState } = await this.supabase.getClient()
        .from('secret_rotation_state')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (rotationState) {
        for (const state of rotationState) {
          const existing = this.activeSecrets.get(state.secret_key);
          if (existing) {
            existing.previous = state.previous_secret_hash;
            existing.rotatedAt = new Date(state.rotated_at);
          }
        }
      }
    } catch (error) {
      this.logger.warn('⚠️ No se pudo cargar estado de rotación desde BD (tabla puede no existir)');
    }
  }

  /**
   * Genera un nuevo secret seguro
   */
  generateSecret(length: number = 64): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Rota un secret específico con soporte dual
   */
  async rotateSecret(secretKey: string): Promise<{
    success: boolean;
    newSecret?: string;
    message: string;
  }> {
    const config = this.rotationConfig[secretKey];
    if (!config) {
      return { success: false, message: `Secret ${secretKey} no está configurado para rotación` };
    }

    const current = this.activeSecrets.get(secretKey);
    if (!current) {
      return { success: false, message: `Secret ${secretKey} no está inicializado` };
    }

    try {
      // Generar nuevo secret
      const newSecret = this.generateSecret();
      
      // Mover current a previous para soporte dual
      const rotationState = {
        current: newSecret,
        previous: current.current,
        rotatedAt: new Date(),
      };

      this.activeSecrets.set(secretKey, rotationState);

      // Registrar rotación en BD
      await this.logRotation(secretKey, rotationState);

      this.logger.log(`🔄 Secret ${secretKey} rotado exitosamente`);

      // Programar limpieza del secret anterior después del período de gracia
      setTimeout(() => {
        this.cleanupPreviousSecret(secretKey);
      }, config.gracePeriodHours * 60 * 60 * 1000);

      return {
        success: true,
        newSecret,
        message: `Secret rotado. Período de gracia: ${config.gracePeriodHours} horas`,
      };
    } catch (error) {
      this.logger.error(`❌ Error rotando secret ${secretKey}:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Valida un token/valor contra el secret actual o anterior (durante período de gracia)
   */
  validateWithDualSecret(secretKey: string, validateFn: (secret: string) => boolean): boolean {
    const secrets = this.activeSecrets.get(secretKey);
    if (!secrets) {
      return false;
    }

    // Primero intentar con el secret actual
    if (validateFn(secrets.current)) {
      return true;
    }

    // Si falla y hay secret anterior (período de gracia), intentar con él
    if (secrets.previous && secrets.rotatedAt) {
      const config = this.rotationConfig[secretKey];
      const gracePeriodMs = (config?.gracePeriodHours || 24) * 60 * 60 * 1000;
      const timeSinceRotation = Date.now() - secrets.rotatedAt.getTime();

      if (timeSinceRotation < gracePeriodMs) {
        if (validateFn(secrets.previous)) {
          this.logger.debug(`Token validado con secret anterior (período de gracia) para ${secretKey}`);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Obtiene el secret actual para firmar nuevos tokens
   */
  getCurrentSecret(secretKey: string): string | null {
    return this.activeSecrets.get(secretKey)?.current || null;
  }

  /**
   * Limpia el secret anterior después del período de gracia
   */
  private cleanupPreviousSecret(secretKey: string): void {
    const secrets = this.activeSecrets.get(secretKey);
    if (secrets) {
      secrets.previous = undefined;
      this.logger.log(`🧹 Secret anterior limpiado para ${secretKey}`);
    }
  }

  /**
   * Registra la rotación en la BD para auditoría
   */
  private async logRotation(secretKey: string, state: any): Promise<void> {
    try {
      await this.supabase.getClient()
        .from('secret_rotation_state')
        .insert({
          secret_key: secretKey,
          // No guardamos el secret real, solo un hash para verificación
          current_secret_hash: crypto.createHash('sha256').update(state.current).digest('hex').substring(0, 16),
          previous_secret_hash: state.previous 
            ? crypto.createHash('sha256').update(state.previous).digest('hex').substring(0, 16)
            : null,
          rotated_at: state.rotatedAt.toISOString(),
          grace_period_hours: this.rotationConfig[secretKey]?.gracePeriodHours || 24,
        });
    } catch (error) {
      this.logger.warn(`⚠️ No se pudo registrar rotación en BD: ${error.message}`);
    }
  }

  /**
   * Job programado: Verificar si algún secret necesita rotación
   * Ejecuta diariamente a las 3:00 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async checkRotationNeeded(): Promise<void> {
    if (this.configService.get('SECRET_ROTATION_ENABLED') !== 'true') {
      return;
    }

    this.logger.log('🔍 Verificando necesidad de rotación de secrets...');

    for (const [secretKey, config] of Object.entries(this.rotationConfig)) {
      const state = this.activeSecrets.get(secretKey);
      if (!state?.rotatedAt) {
        continue;
      }

      const daysSinceRotation = (Date.now() - state.rotatedAt.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceRotation >= config.intervalDays) {
        this.logger.warn(`⚠️ Secret ${secretKey} necesita rotación (${Math.floor(daysSinceRotation)} días desde última rotación)`);
        
        // Notificar (en producción, enviar alerta)
        await this.notifyRotationNeeded(secretKey, daysSinceRotation);
      } else if (daysSinceRotation >= config.intervalDays - 7) {
        this.logger.log(`ℹ️ Secret ${secretKey} rotará en ${Math.floor(config.intervalDays - daysSinceRotation)} días`);
      }
    }
  }

  /**
   * Notifica que un secret necesita rotación
   */
  private async notifyRotationNeeded(secretKey: string, daysSinceRotation: number): Promise<void> {
    // En producción, esto enviaría una alerta por email/Slack/PagerDuty
    this.logger.warn(`🚨 ALERTA: Secret ${secretKey} requiere rotación urgente (${Math.floor(daysSinceRotation)} días)`);
    
    // Registrar alerta en BD
    try {
      await this.supabase.getClient()
        .from('system_alerts')
        .insert({
          type: 'SECRET_ROTATION_NEEDED',
          severity: 'HIGH',
          message: `Secret ${secretKey} necesita rotación (${Math.floor(daysSinceRotation)} días desde última rotación)`,
          metadata: { secretKey, daysSinceRotation },
        });
    } catch (error) {
      // Ignorar si la tabla no existe
    }
  }

  /**
   * Obtiene el estado de rotación de todos los secrets
   */
  getRotationStatus(): any {
    const status = {};
    
    for (const [secretKey, config] of Object.entries(this.rotationConfig)) {
      const state = this.activeSecrets.get(secretKey);
      
      status[secretKey] = {
        configured: !!state,
        lastRotation: state?.rotatedAt?.toISOString() || 'Nunca',
        nextRotation: state?.rotatedAt 
          ? new Date(state.rotatedAt.getTime() + config.intervalDays * 24 * 60 * 60 * 1000).toISOString()
          : 'No programada',
        intervalDays: config.intervalDays,
        gracePeriodHours: config.gracePeriodHours,
        hasPreviousSecret: !!state?.previous,
      };
    }

    return status;
  }
}
