/**
 * GUÍA DE USO: Structured Logger con Correlation IDs
 * 
 * Este archivo demuestra cómo usar el nuevo sistema de logging estructurado
 * en servicios y controladores.
 */

import { Injectable } from '@nestjs/common';
import { StructuredLogger } from './structured-logger.service';

// ========================================
// EJEMPLO 1: Uso básico en un servicio
// ========================================

@Injectable()
export class ExampleService {
    constructor(private readonly logger: StructuredLogger) {
        // IMPORTANTE: Siempre establecer el nombre del servicio
        this.logger.setService('ExampleService');
    }

    async processOrder(orderId: string, userId: string, tenantId: string) {
        // Log INFO simple
        this.logger.log('Processing order', { orderId, userId });

        try {
            // Simular procesamiento
            const result = await this.doSomething(orderId);

            // Log con contexto adicional
            this.logger.log('Order processed successfully', {
                orderId,
                result,
                processingTime: '150ms',
            });

            return result;
        } catch (error) {
            // Log ERROR con stack trace
            this.logger.error(
                `Failed to process order: ${error.message}`,
                error.stack,
                {
                    orderId,
                    errorName: error.name,
                    userId,
                    tenantId,
                },
            );

            throw error;
        }
    }

    async doSomething(orderId: string) {
        return { success: true };
    }
}

// ========================================
// EJEMPLO 2: Logging en controladores
// ========================================

import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';

@Controller('example')
export class ExampleController {
    constructor(private readonly logger: StructuredLogger) {
        this.logger.setService('ExampleController');
    }

    @Get('demo')
    async demo(@Req() req: Request) {
        // El logging interceptor ya captura request/response automáticamente
        // Pero puedes agregar logs adicionales para lógica de negocio

        // Extraer contexto del request
        this.logger.setRequest(req);

        // Log de evento de negocio
        this.logger.logBusinessEvent(
            'DEMO_ACCESSED',
            'User accessed demo endpoint',
            {
                userAgent: req.headers['user-agent'],
                ip: req.ip,
            },
        );

        return { message: 'Demo endpoint' };
    }
}

// ========================================
// EJEMPLO 3: Logging de eventos de seguridad
// ========================================

@Injectable()
export class SecurityService {
    constructor(private readonly logger: StructuredLogger) {
        this.logger.setService('SecurityService');
    }

    async detectSuspiciousActivity(userId: string, action: string) {
        // Log de seguridad con severidad
        this.logger.logSecurityEvent(
            'SUSPICIOUS_ACTIVITY',
            `Suspicious activity detected: ${action}`,
            'high', // Severidad: low, medium, high, critical
            {
                userId,
                action,
                timestamp: new Date().toISOString(),
            },
        );
    }

    async loginAttemptFailed(email: string, ip: string, attempts: number) {
        const severity = attempts >= 5 ? 'critical' : 'medium';

        this.logger.logSecurityEvent(
            'LOGIN_FAILED',
            `Failed login attempt for ${email}`,
            severity,
            {
                email,
                ip,
                attempts,
                willBlock: attempts >= 5,
            },
        );
    }
}

// ========================================
// EJEMPLO 4: Niveles de log apropiados
// ========================================

@Injectable()
export class PaymentService {
    constructor(private readonly logger: StructuredLogger) {
        this.logger.setService('PaymentService');
    }

    async processPayment(amount: number, method: string) {
        // DEBUG: Información detallada para desarrollo
        this.logger.debug('Payment processing started', {
            amount,
            method,
            timestamp: new Date().toISOString(),
        });

        // INFO: Operaciones normales
        this.logger.log('Validating payment method', { method });

        try {
            // Simular validación
            if (amount <= 0) {
                // WARN: Situación anormal pero no crítica
                this.logger.warn('Invalid payment amount detected', {
                    amount,
                    correctedAmount: 0,
                });
                throw new Error('Invalid amount');
            }

            // INFO: Operación exitosa
            this.logger.log('Payment processed successfully', {
                amount,
                method,
                transactionId: 'TXN-12345',
            });

            return { success: true };
        } catch (error) {
            // ERROR: Fallo crítico
            this.logger.error(
                `Payment processing failed: ${error.message}`,
                error.stack,
                { amount, method },
            );

            throw error;
        }
    }

    async refundPayment(transactionId: string, reason: string) {
        // Evento de negocio importante
        this.logger.logBusinessEvent(
            'REFUND_INITIATED',
            'Refund process started',
            {
                transactionId,
                reason,
            },
        );

        // ... lógica de reembolso ...
    }
}

// ========================================
// FORMATO DE SALIDA
// ========================================

/**
 * El structured logger genera logs en formato JSON:
 * 
 * {
 *   "timestamp": "2024-01-15T10:30:45.123Z",
 *   "level": "info",
 *   "message": "Order processed successfully",
 *   "context": {
 *     "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
 *     "userId": "user-123",
 *     "tenantId": "tenant-456",
 *     "service": "ExampleService",
 *     "orderId": "ORD-789",
 *     "result": { "success": true },
 *     "processingTime": "150ms"
 *   }
 * }
 * 
 * Este formato es fácil de parsear por agregadores como:
 * - AWS CloudWatch Logs
 * - Datadog
 * - Elasticsearch
 * - Splunk
 */

// ========================================
// CORRELACIÓN DE REQUESTS
// ========================================

/**
 * Cada request recibe un Correlation ID automáticamente:
 * 
 * 1. Cliente hace request → Middleware extrae/genera correlation ID
 * 2. Correlation ID se propaga en todos los logs de ese request
 * 3. Correlation ID se devuelve en response header: x-correlation-id
 * 
 * Esto permite rastrear un request completo a través de:
 * - Múltiples servicios
 * - Llamadas a base de datos
 * - Llamadas a APIs externas
 * - Procesamiento asíncrono
 * 
 * Ejemplo de búsqueda en logs:
 * grep "a1b2c3d4-e5f6-7890-abcd-ef1234567890" app.log
 * 
 * Esto mostrará TODOS los logs relacionados con ese request específico.
 */

// ========================================
// MEJORES PRÁCTICAS
// ========================================

/**
 * ✅ DO:
 * - Usar log levels apropiados (DEBUG, INFO, WARN, ERROR)
 * - Incluir contexto relevante (userId, tenantId, orderId, etc.)
 * - Loguear inicio y fin de operaciones importantes
 * - Usar logBusinessEvent para eventos de negocio
 * - Usar logSecurityEvent para eventos de seguridad
 * - Incluir tiempo de procesamiento en operaciones lentas
 * - Loguear errores con stack trace
 * 
 * ❌ DON'T:
 * - NO loguear información sensible (passwords, tokens, PII)
 * - NO usar console.log() directamente
 * - NO loguear en loops sin throttling
 * - NO usar ERROR para warnings o información
 * - NO incluir objetos enormes sin filtrar
 * - NO olvidar establecer el nombre del servicio
 */

export { };
