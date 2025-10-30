import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { OseService } from '../ose/ose.service';
import { CpeService } from '../cpe/cpe.service';
import { GreService } from '../gre/gre.service';

/**
 * Servicio para manejar reintentos automáticos de comunicación con SUNAT
 * Implementa cola de reintentos con backoff exponencial para errores técnicos
 */
@Injectable()
export class SunatRetryService implements OnModuleInit {
  private readonly logger = new Logger(SunatRetryService.name);
  private isProcessing = false;
  private readonly MAX_RETRIES = 5;
  private readonly MAX_RETRY_AGE_HOURS = 24; // No reintentar documentos más antiguos de 24 horas

  constructor(
    private readonly supabase: SupabaseService,
    private readonly oseService: OseService,
    private readonly cpeService: CpeService,
    private readonly greService: GreService,
  ) {}

  onModuleInit() {
    this.logger.log('🚀 [SunatRetry] Servicio de reintentos SUNAT iniciado');
  }

  /**
   * 🔴 CRÍTICO FIX: Procesa documentos rechazados por errores técnicos para reintento
   * Se ejecuta cada 5 minutos
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processPendingRetries(): Promise<void> {
    if (this.isProcessing) {
      this.logger.debug('⏳ [SunatRetry] Ya hay un proceso en ejecución, saltando...');
      return;
    }

    this.isProcessing = true;

    try {
      this.logger.log('🔄 [SunatRetry] Procesando reintentos pendientes...');

      // Procesar CPEs rechazados
      await this.processFailedCpes();

      // Procesar GREs rechazadas
      await this.processFailedGres();

      this.logger.log('✅ [SunatRetry] Procesamiento de reintentos completado');
    } catch (error) {
      this.logger.error('❌ [SunatRetry] Error procesando reintentos:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Procesa CPEs rechazados por errores técnicos
   */
  private async processFailedCpes(): Promise<void> {
    const client = this.supabase.getClient();

    // Buscar CPEs rechazados que tengan errores técnicos recuperables
    // y que no hayan excedido el máximo de reintentos
    const { data: failedCpes, error } = await client
      .from('cpe')
      .select('id, tenant_id, estado, error_message, retry_count, updated_at, next_retry_at')
      .eq('estado', 'RECHAZADO')
      .not('retry_count', 'is', null) // Solo documentos con retry_count (errores técnicos)
      .lt('retry_count', this.MAX_RETRIES)
      .gte('updated_at', new Date(Date.now() - this.MAX_RETRY_AGE_HOURS * 60 * 60 * 1000).toISOString())
      .order('updated_at', { ascending: true })
      .limit(20); // Procesar máximo 20 por ciclo

    if (error) {
      this.logger.error('❌ [SunatRetry] Error obteniendo CPEs fallidos:', error);
      return;
    }

    if (!failedCpes || failedCpes.length === 0) {
      return;
    }

    this.logger.log(`📦 [SunatRetry] Encontrados ${failedCpes.length} CPEs para reintentar`);

    for (const cpe of failedCpes) {
      try {
        await this.retryCpe(cpe.id, cpe.tenant_id, cpe.retry_count || 0);
      } catch (error) {
        this.logger.error(`❌ [SunatRetry] Error reintentando CPE ${cpe.id}:`, error);
      }
    }
  }

  /**
   * Procesa GREs rechazadas por errores técnicos
   */
  private async processFailedGres(): Promise<void> {
    const client = this.supabase.getClient();

    // Buscar GREs rechazadas que tengan errores técnicos recuperables
    const { data: failedGres, error } = await client
      .from('gre_guias')
      .select('id, tenant_id, estado, error_message, retry_count, updated_at, next_retry_at')
      .eq('estado', 'RECHAZADO')
      .not('retry_count', 'is', null) // Solo documentos con retry_count (errores técnicos)
      .lt('retry_count', this.MAX_RETRIES)
      .gte('updated_at', new Date(Date.now() - this.MAX_RETRY_AGE_HOURS * 60 * 60 * 1000).toISOString())
      .order('updated_at', { ascending: true })
      .limit(20); // Procesar máximo 20 por ciclo

    if (error) {
      this.logger.error('❌ [SunatRetry] Error obteniendo GREs fallidas:', error);
      return;
    }

    if (!failedGres || failedGres.length === 0) {
      return;
    }

    this.logger.log(`📦 [SunatRetry] Encontradas ${failedGres.length} GREs para reintentar`);

    for (const gre of failedGres) {
      try {
        await this.retryGre(gre.id, gre.tenant_id, gre.retry_count || 0);
      } catch (error) {
        this.logger.error(`❌ [SunatRetry] Error reintentando GRE ${gre.id}:`, error);
      }
    }
  }

  /**
   * Reintenta enviar un CPE a SUNAT con backoff exponencial
   */
  private async retryCpe(cpeId: string, tenantId: string, currentRetryCount: number): Promise<void> {
    const client = this.supabase.getClient();

    // Calcular tiempo de espera con backoff exponencial
    const backoffMs = this.calculateBackoff(currentRetryCount);
    const nextRetryAt = new Date(Date.now() + backoffMs);

    // Verificar si es momento de reintentar (respetar backoff)
    const { data: cpe, error: fetchError } = await client
      .from('cpe')
      .select('id, estado, error_message, retry_count, updated_at, next_retry_at')
      .eq('id', cpeId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError || !cpe) {
      this.logger.warn(`⚠️ [SunatRetry] CPE ${cpeId} no encontrado`);
      return;
    }

    // Si tiene next_retry_at y aún no es momento, saltar
    if (cpe.next_retry_at && new Date(cpe.next_retry_at) > new Date()) {
      return;
    }

    // Incrementar contador de reintentos
    const newRetryCount = (cpe.retry_count || 0) + 1;

    this.logger.log(
      `🔄 [SunatRetry] Reintentando CPE ${cpeId} (intento ${newRetryCount}/${this.MAX_RETRIES})`
    );

    try {
      // Actualizar estado a ENVIADO antes de reintentar
      await client
        .from('cpe')
        .update({
          estado: 'ENVIADO',
          retry_count: newRetryCount,
          next_retry_at: null, // Se establecerá después según resultado
          updated_at: new Date().toISOString(),
        })
        .eq('id', cpeId)
        .eq('tenant_id', tenantId);

      // Reintentar envío usando el método existente del servicio
      await this.cpeService.retrySendToOse(cpeId); // Usar método público

      this.logger.log(`✅ [SunatRetry] CPE ${cpeId} reintentado exitosamente`);
    } catch (error) {
      this.logger.error(`❌ [SunatRetry] Error reintentando CPE ${cpeId}:`, error);

      // Si aún no se alcanzó el máximo, programar siguiente reintento
      if (newRetryCount < this.MAX_RETRIES) {
        await client
          .from('cpe')
          .update({
            estado: 'RECHAZADO',
            retry_count: newRetryCount,
            next_retry_at: nextRetryAt.toISOString(),
            error_message: `Error técnico (reintento ${newRetryCount}): ${error.message}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', cpeId)
          .eq('tenant_id', tenantId);

        this.logger.log(
          `⏳ [SunatRetry] CPE ${cpeId} programado para siguiente reintento en ${backoffMs}ms`
        );
      } else {
        // Máximo de reintentos alcanzado, marcar como fallido permanentemente
        await client
          .from('cpe')
          .update({
            estado: 'RECHAZADO',
            retry_count: newRetryCount,
            next_retry_at: null,
            error_message: `Error técnico: Máximo de reintentos alcanzado (${this.MAX_RETRIES}). ${error.message}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', cpeId)
          .eq('tenant_id', tenantId);

        this.logger.warn(`⚠️ [SunatRetry] CPE ${cpeId} alcanzó máximo de reintentos`);
      }
    }
  }

  /**
   * Reintenta enviar una GRE a SUNAT con backoff exponencial
   */
  private async retryGre(greId: string, tenantId: string, currentRetryCount: number): Promise<void> {
    const client = this.supabase.getClient();

    // Calcular tiempo de espera con backoff exponencial
    const backoffMs = this.calculateBackoff(currentRetryCount);
    const nextRetryAt = new Date(Date.now() + backoffMs);

    // Verificar si es momento de reintentar
    const { data: gre, error: fetchError } = await client
      .from('gre_guias')
      .select('id, estado, error_message, retry_count, updated_at, next_retry_at')
      .eq('id', greId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError || !gre) {
      this.logger.warn(`⚠️ [SunatRetry] GRE ${greId} no encontrada`);
      return;
    }

    // Si tiene next_retry_at y aún no es momento, saltar
    if (gre.next_retry_at && new Date(gre.next_retry_at) > new Date()) {
      return;
    }

    // Incrementar contador de reintentos
    const newRetryCount = (gre.retry_count || 0) + 1;

    this.logger.log(
      `🔄 [SunatRetry] Reintentando GRE ${greId} (intento ${newRetryCount}/${this.MAX_RETRIES})`
    );

    try {
      // Actualizar estado a ENVIADO antes de reintentar
      await client
        .from('gre_guias')
        .update({
          estado: 'ENVIADO',
          retry_count: newRetryCount,
          next_retry_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', greId)
        .eq('tenant_id', tenantId);

      // Reintentar envío usando el método existente del servicio
      await this.greService.retryProcesarEnvioSunat(greId); // Usar método público

      this.logger.log(`✅ [SunatRetry] GRE ${greId} reintentada exitosamente`);
    } catch (error) {
      this.logger.error(`❌ [SunatRetry] Error reintentando GRE ${greId}:`, error);

      // Si aún no se alcanzó el máximo, programar siguiente reintento
      if (newRetryCount < this.MAX_RETRIES) {
        await client
          .from('gre_guias')
          .update({
            estado: 'RECHAZADO',
            retry_count: newRetryCount,
            next_retry_at: nextRetryAt.toISOString(),
            error_message: `Error técnico (reintento ${newRetryCount}): ${error.message}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', greId)
          .eq('tenant_id', tenantId);

        this.logger.log(
          `⏳ [SunatRetry] GRE ${greId} programada para siguiente reintento en ${backoffMs}ms`
        );
      } else {
        // Máximo de reintentos alcanzado
        await client
          .from('gre_guias')
          .update({
            estado: 'RECHAZADO',
            retry_count: newRetryCount,
            next_retry_at: null,
            error_message: `Error técnico: Máximo de reintentos alcanzado (${this.MAX_RETRIES}). ${error.message}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', greId)
          .eq('tenant_id', tenantId);

        this.logger.warn(`⚠️ [SunatRetry] GRE ${greId} alcanzó máximo de reintentos`);
      }
    }
  }

  /**
   * Calcula el tiempo de espera para el siguiente reintento usando backoff exponencial
   * Formula: 2^retryCount * 1000ms (1s, 2s, 4s, 8s, 16s)
   */
  private calculateBackoff(retryCount: number): number {
    const baseDelayMs = 1000; // 1 segundo base
    const maxDelayMs = 60000; // Máximo 60 segundos
    const delayMs = Math.min(baseDelayMs * Math.pow(2, retryCount), maxDelayMs);
    
    // Agregar jitter aleatorio (±20%) para evitar thundering herd
    const jitter = delayMs * 0.2 * (Math.random() - 0.5);
    
    return Math.floor(delayMs + jitter);
  }

  /**
   * Método manual para forzar reintento de un CPE específico
   */
  async retryCpeManual(cpeId: string, tenantId: string): Promise<{ success: boolean; message: string }> {
    try {
      const client = this.supabase.getClient();

      const { data: cpe, error } = await client
        .from('cpe')
        .select('id, estado, retry_count')
        .eq('id', cpeId)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !cpe) {
        return { success: false, message: 'CPE no encontrado' };
      }

      if (cpe.estado !== 'RECHAZADO') {
        return { success: false, message: `CPE no está en estado RECHAZADO (estado actual: ${cpe.estado})` };
      }

      await this.retryCpe(cpeId, tenantId, cpe.retry_count || 0);
      return { success: true, message: 'CPE reintentado exitosamente' };
    } catch (error) {
      this.logger.error(`❌ [SunatRetry] Error en retryCpeManual:`, error);
      return { success: false, message: `Error: ${error.message}` };
    }
  }

  /**
   * Método manual para forzar reintento de una GRE específica
   */
  async retryGreManual(greId: string, tenantId: string): Promise<{ success: boolean; message: string }> {
    try {
      const client = this.supabase.getClient();

      const { data: gre, error } = await client
        .from('gre_guias')
        .select('id, estado, retry_count')
        .eq('id', greId)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !gre) {
        return { success: false, message: 'GRE no encontrada' };
      }

      if (gre.estado !== 'RECHAZADO') {
        return { success: false, message: `GRE no está en estado RECHAZADO (estado actual: ${gre.estado})` };
      }

      await this.retryGre(greId, tenantId, gre.retry_count || 0);
      return { success: true, message: 'GRE reintentada exitosamente' };
    } catch (error) {
      this.logger.error(`❌ [SunatRetry] Error en retryGreManual:`, error);
      return { success: false, message: `Error: ${error.message}` };
    }
  }
}

