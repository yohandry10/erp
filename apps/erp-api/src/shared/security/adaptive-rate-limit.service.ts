import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface RateLimitConfig {
  endpoint: string;
  baseLimit: number;
  windowMs: number;
  adaptiveMultiplier: number;
  burstMultiplier: number;
}

interface UserBaseline {
  userId: string;
  tenantId: string;
  endpoint: string;
  avgRequestsPerHour: number;
  maxRequestsPerHour: number;
  stdDeviation: number;
  lastCalculated: Date;
  sampleCount: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  isAnomaly: boolean;
  anomalyReason?: string;
}

interface RequestLog {
  userId: string;
  tenantId: string;
  endpoint: string;
  timestamp: Date;
  responseTimeMs: number;
  statusCode: number;
}

@Injectable()
export class AdaptiveRateLimitService implements OnModuleInit {
  private readonly logger = new Logger(AdaptiveRateLimitService.name);
  private supabase: SupabaseClient;
  
  // In-memory cache for rate limits (Redis recommended for production)
  private requestCounts: Map<string, { count: number; windowStart: Date }> = new Map();
  private userBaselines: Map<string, UserBaseline> = new Map();
  private requestHistory: Map<string, RequestLog[]> = new Map();
  
  // Whitelist de IPs confiables
  private trustedIps: Set<string> = new Set();
  
  // Configuración por endpoint
  private endpointConfigs: Map<string, RateLimitConfig> = new Map([
    ['POST /api/auth/login', { endpoint: 'POST /api/auth/login', baseLimit: 5, windowMs: 60000, adaptiveMultiplier: 1.5, burstMultiplier: 2 }],
    ['POST /api/auth/refresh', { endpoint: 'POST /api/auth/refresh', baseLimit: 10, windowMs: 60000, adaptiveMultiplier: 2, burstMultiplier: 3 }],
    ['POST /api/pedidos', { endpoint: 'POST /api/pedidos', baseLimit: 100, windowMs: 3600000, adaptiveMultiplier: 3, burstMultiplier: 5 }],
    ['GET /api/productos', { endpoint: 'GET /api/productos', baseLimit: 1000, windowMs: 3600000, adaptiveMultiplier: 3, burstMultiplier: 5 }],
    ['POST /api/pos/ventas', { endpoint: 'POST /api/pos/ventas', baseLimit: 200, windowMs: 3600000, adaptiveMultiplier: 3, burstMultiplier: 5 }],
    ['GET /api/reportes', { endpoint: 'GET /api/reportes', baseLimit: 50, windowMs: 3600000, adaptiveMultiplier: 2, burstMultiplier: 3 }],
    ['DEFAULT', { endpoint: 'DEFAULT', baseLimit: 100, windowMs: 60000, adaptiveMultiplier: 3, burstMultiplier: 5 }],
  ]);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_KEY');
    
    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      await this.loadTrustedIps();
      await this.loadUserBaselines();
    }
  }

  /**
   * Verifica si una request está permitida según rate limiting adaptativo
   */
  async checkRateLimit(
    userId: string,
    tenantId: string,
    endpoint: string,
    ip: string,
  ): Promise<RateLimitResult> {
    // IPs confiables sin límite
    if (this.trustedIps.has(ip)) {
      return { allowed: true, remaining: Infinity, resetAt: new Date(), isAnomaly: false };
    }

    const config = this.getEndpointConfig(endpoint);
    const key = this.generateKey(userId, tenantId, endpoint);
    const now = new Date();
    
    // Obtener baseline del usuario
    const baseline = await this.getUserBaseline(userId, tenantId, endpoint);
    
    // Calcular límite adaptativo
    const adaptiveLimit = this.calculateAdaptiveLimit(config, baseline);
    
    // Obtener conteo actual
    const currentWindow = this.requestCounts.get(key);
    let count = 0;
    let windowStart = now;
    
    if (currentWindow) {
      const windowAge = now.getTime() - currentWindow.windowStart.getTime();
      if (windowAge < config.windowMs) {
        count = currentWindow.count;
        windowStart = currentWindow.windowStart;
      }
    }

    // Verificar si excede límite
    const allowed = count < adaptiveLimit;
    
    // Detectar anomalías
    const anomalyCheck = this.detectAnomaly(userId, tenantId, endpoint, count, baseline);
    
    if (allowed) {
      // Incrementar contador
      this.requestCounts.set(key, { count: count + 1, windowStart });
      
      // Registrar para historial
      this.logRequest(userId, tenantId, endpoint);
    }

    const resetAt = new Date(windowStart.getTime() + config.windowMs);
    
    return {
      allowed,
      remaining: Math.max(0, adaptiveLimit - count - 1),
      resetAt,
      isAnomaly: anomalyCheck.isAnomaly,
      anomalyReason: anomalyCheck.reason,
    };
  }


  /**
   * Calcula límite adaptativo basado en baseline del usuario
   */
  private calculateAdaptiveLimit(config: RateLimitConfig, baseline: UserBaseline | null): number {
    if (!baseline || baseline.sampleCount < 10) {
      // Sin suficiente historial, usar límite base
      return config.baseLimit;
    }

    // Límite adaptativo = promedio × multiplicador
    // Pero nunca menor que el límite base ni mayor que burst
    const adaptiveLimit = Math.ceil(baseline.avgRequestsPerHour * config.adaptiveMultiplier);
    const burstLimit = config.baseLimit * config.burstMultiplier;
    
    return Math.min(Math.max(adaptiveLimit, config.baseLimit), burstLimit);
  }

  /**
   * Detecta comportamiento anómalo
   */
  private detectAnomaly(
    userId: string,
    tenantId: string,
    endpoint: string,
    currentCount: number,
    baseline: UserBaseline | null,
  ): { isAnomaly: boolean; reason?: string } {
    if (!baseline || baseline.sampleCount < 10) {
      return { isAnomaly: false };
    }

    // Anomalía si excede 5× el promedio
    if (currentCount > baseline.avgRequestsPerHour * 5) {
      return {
        isAnomaly: true,
        reason: `Request count ${currentCount} exceeds 5x baseline (${baseline.avgRequestsPerHour})`,
      };
    }

    // Anomalía si excede promedio + 3 desviaciones estándar
    const threshold = baseline.avgRequestsPerHour + (baseline.stdDeviation * 3);
    if (currentCount > threshold) {
      return {
        isAnomaly: true,
        reason: `Request count ${currentCount} exceeds statistical threshold (${threshold.toFixed(0)})`,
      };
    }

    return { isAnomaly: false };
  }

  /**
   * Obtiene baseline del usuario para un endpoint
   */
  private async getUserBaseline(
    userId: string,
    tenantId: string,
    endpoint: string,
  ): Promise<UserBaseline | null> {
    const key = `${tenantId}:${userId}:${endpoint}`;
    
    // Primero buscar en cache
    if (this.userBaselines.has(key)) {
      return this.userBaselines.get(key)!;
    }

    // Buscar en BD
    if (this.supabase) {
      try {
        const { data } = await this.supabase
          .from('rate_limit_baselines')
          .select('*')
          .eq('user_id', userId)
          .eq('tenant_id', tenantId)
          .eq('endpoint', endpoint)
          .single();

        if (data) {
          const baseline: UserBaseline = {
            userId: data.user_id,
            tenantId: data.tenant_id,
            endpoint: data.endpoint,
            avgRequestsPerHour: data.avg_requests_per_hour,
            maxRequestsPerHour: data.max_requests_per_hour,
            stdDeviation: data.std_deviation,
            lastCalculated: new Date(data.last_calculated),
            sampleCount: data.sample_count,
          };
          this.userBaselines.set(key, baseline);
          return baseline;
        }
      } catch (error) {
        this.logger.debug(`No baseline found for ${key}`);
      }
    }

    return null;
  }

  /**
   * Registra request para cálculo de baseline
   */
  private logRequest(userId: string, tenantId: string, endpoint: string): void {
    const key = `${tenantId}:${userId}:${endpoint}`;
    const history = this.requestHistory.get(key) || [];
    
    history.push({
      userId,
      tenantId,
      endpoint,
      timestamp: new Date(),
      responseTimeMs: 0,
      statusCode: 200,
    });

    // Mantener solo últimas 24 horas
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const filtered = history.filter(r => r.timestamp > cutoff);
    
    this.requestHistory.set(key, filtered);
  }

  /**
   * Obtiene configuración para un endpoint
   */
  private getEndpointConfig(endpoint: string): RateLimitConfig {
    // Buscar configuración específica
    for (const [pattern, config] of this.endpointConfigs) {
      if (endpoint.includes(pattern) || this.matchEndpoint(endpoint, pattern)) {
        return config;
      }
    }
    return this.endpointConfigs.get('DEFAULT')!;
  }

  private matchEndpoint(endpoint: string, pattern: string): boolean {
    // Simple pattern matching
    const regexPattern = pattern
      .replace(/\//g, '\\/')
      .replace(/\*/g, '.*')
      .replace(/:[\w]+/g, '[^/]+');
    return new RegExp(`^${regexPattern}$`).test(endpoint);
  }

  private generateKey(userId: string, tenantId: string, endpoint: string): string {
    return `rate:${tenantId}:${userId}:${endpoint}`;
  }

  /**
   * Carga IPs confiables desde BD
   */
  private async loadTrustedIps(): Promise<void> {
    if (!this.supabase) return;

    try {
      const { data } = await this.supabase
        .from('trusted_ips')
        .select('ip_address')
        .eq('active', true);

      if (data) {
        data.forEach(row => this.trustedIps.add(row.ip_address));
        this.logger.log(`Loaded ${data.length} trusted IPs`);
      }
    } catch (error) {
      this.logger.warn('Could not load trusted IPs');
    }
  }

  /**
   * Carga baselines de usuarios desde BD
   */
  private async loadUserBaselines(): Promise<void> {
    if (!this.supabase) return;

    try {
      const { data } = await this.supabase
        .from('rate_limit_baselines')
        .select('*')
        .gte('last_calculated', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (data) {
        data.forEach(row => {
          const key = `${row.tenant_id}:${row.user_id}:${row.endpoint}`;
          this.userBaselines.set(key, {
            userId: row.user_id,
            tenantId: row.tenant_id,
            endpoint: row.endpoint,
            avgRequestsPerHour: row.avg_requests_per_hour,
            maxRequestsPerHour: row.max_requests_per_hour,
            stdDeviation: row.std_deviation,
            lastCalculated: new Date(row.last_calculated),
            sampleCount: row.sample_count,
          });
        });
        this.logger.log(`Loaded ${data.length} user baselines`);
      }
    } catch (error) {
      this.logger.warn('Could not load user baselines');
    }
  }


  /**
   * Job diario para recalcular baselines de usuarios
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async recalculateBaselines(): Promise<void> {
    this.logger.log('Starting baseline recalculation...');
    
    if (!this.supabase) {
      this.logger.warn('Supabase not configured, skipping baseline recalculation');
      return;
    }

    try {
      // Obtener datos de request_logs de la última semana
      const { data: logs } = await this.supabase
        .from('request_logs')
        .select('user_id, tenant_id, endpoint, created_at')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (!logs || logs.length === 0) {
        this.logger.log('No request logs found for baseline calculation');
        return;
      }

      // Agrupar por usuario/tenant/endpoint
      const grouped = new Map<string, { timestamps: Date[] }>();
      
      for (const log of logs) {
        const key = `${log.tenant_id}:${log.user_id}:${log.endpoint}`;
        if (!grouped.has(key)) {
          grouped.set(key, { timestamps: [] });
        }
        grouped.get(key)!.timestamps.push(new Date(log.created_at));
      }

      // Calcular estadísticas por grupo
      for (const [key, data] of grouped) {
        const [tenantId, userId, endpoint] = key.split(':');
        
        // Calcular requests por hora
        const hourlyBuckets = new Map<string, number>();
        for (const ts of data.timestamps) {
          const hourKey = `${ts.toISOString().slice(0, 13)}`;
          hourlyBuckets.set(hourKey, (hourlyBuckets.get(hourKey) || 0) + 1);
        }

        const hourlyCounts = Array.from(hourlyBuckets.values());
        if (hourlyCounts.length < 5) continue; // Necesitamos al menos 5 horas de datos

        const avg = hourlyCounts.reduce((a, b) => a + b, 0) / hourlyCounts.length;
        const max = Math.max(...hourlyCounts);
        const variance = hourlyCounts.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / hourlyCounts.length;
        const stdDev = Math.sqrt(variance);

        // Guardar baseline
        await this.supabase
          .from('rate_limit_baselines')
          .upsert({
            user_id: userId,
            tenant_id: tenantId,
            endpoint,
            avg_requests_per_hour: avg,
            max_requests_per_hour: max,
            std_deviation: stdDev,
            sample_count: hourlyCounts.length,
            last_calculated: new Date().toISOString(),
          }, {
            onConflict: 'user_id,tenant_id,endpoint',
          });

        // Actualizar cache
        this.userBaselines.set(key, {
          userId,
          tenantId,
          endpoint,
          avgRequestsPerHour: avg,
          maxRequestsPerHour: max,
          stdDeviation: stdDev,
          lastCalculated: new Date(),
          sampleCount: hourlyCounts.length,
        });
      }

      this.logger.log(`Recalculated baselines for ${grouped.size} user/endpoint combinations`);
    } catch (error) {
      this.logger.error('Error recalculating baselines', error);
    }
  }

  /**
   * Bloquea temporalmente un usuario por comportamiento anómalo
   */
  async blockUser(userId: string, tenantId: string, durationMinutes: number, reason: string): Promise<void> {
    if (!this.supabase) return;

    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    
    await this.supabase
      .from('rate_limit_blocks')
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        reason,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
      });

    this.logger.warn(`Blocked user ${userId} for ${durationMinutes} minutes: ${reason}`);
  }

  /**
   * Verifica si un usuario está bloqueado
   */
  async isUserBlocked(userId: string, tenantId: string): Promise<boolean> {
    if (!this.supabase) return false;

    const { data } = await this.supabase
      .from('rate_limit_blocks')
      .select('id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .gt('expires_at', new Date().toISOString())
      .limit(1);

    return data !== null && data.length > 0;
  }

  /**
   * Agrega IP a whitelist
   */
  async addTrustedIp(ip: string, description: string): Promise<void> {
    if (!this.supabase) return;

    await this.supabase
      .from('trusted_ips')
      .insert({
        ip_address: ip,
        description,
        active: true,
        created_at: new Date().toISOString(),
      });

    this.trustedIps.add(ip);
    this.logger.log(`Added trusted IP: ${ip}`);
  }

  /**
   * Obtiene estadísticas de rate limiting
   */
  async getStats(tenantId: string): Promise<{
    totalRequests: number;
    blockedRequests: number;
    anomaliesDetected: number;
    topEndpoints: { endpoint: string; count: number }[];
  }> {
    let totalRequests = 0;
    let blockedRequests = 0;
    
    // Contar desde cache
    for (const [key, value] of this.requestCounts) {
      if (key.includes(tenantId)) {
        totalRequests += value.count;
      }
    }

    // Obtener anomalías de BD
    let anomaliesDetected = 0;
    if (this.supabase) {
      const { count } = await this.supabase
        .from('rate_limit_anomalies')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      
      anomaliesDetected = count || 0;
    }

    return {
      totalRequests,
      blockedRequests,
      anomaliesDetected,
      topEndpoints: [],
    };
  }

  /**
   * Configura límite personalizado para un endpoint
   */
  setEndpointConfig(endpoint: string, config: Partial<RateLimitConfig>): void {
    const existing = this.endpointConfigs.get(endpoint) || this.endpointConfigs.get('DEFAULT')!;
    this.endpointConfigs.set(endpoint, { ...existing, ...config, endpoint });
  }

  /**
   * Limpia contadores expirados
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  cleanupExpiredCounters(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.requestCounts) {
      const config = this.endpointConfigs.get('DEFAULT')!;
      if (now - value.windowStart.getTime() > config.windowMs * 2) {
        this.requestCounts.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned ${cleaned} expired rate limit counters`);
    }
  }
}
