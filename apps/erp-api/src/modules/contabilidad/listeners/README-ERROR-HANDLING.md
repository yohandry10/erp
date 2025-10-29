# Sistema de Manejo de Errores con Reintentos

## Descripción General

Este módulo implementa un sistema robusto de manejo de errores con reintentos automáticos para el procesamiento de eventos contables. El sistema garantiza que los eventos transitorios sean reintentados automáticamente, mientras que los errores permanentes son marcados apropiadamente para revisión manual.

## Características Principales

### 1. Reintentos Automáticos con Backoff Exponencial

- **Límite de reintentos**: 3 intentos máximo
- **Backoff exponencial**: 2^n * 1000ms (1s, 2s, 4s)
- **Jitter aleatorio**: ±20% para evitar thundering herd
- **Máximo delay**: 60 segundos

### 2. Clasificación Inteligente de Errores

#### Errores No Recuperables (No se reintentan)
- Período contable cerrado
- Período no encontrado
- Cuenta no encontrada
- El asiento no cuadra
- Datos inválidos
- Validación fallida
- Foreign key constraint
- Unique constraint

#### Errores Recuperables (Se reintentan)
- Timeout
- Connection errors
- Network errors
- ECONNREFUSED
- ENOTFOUND
- ETIMEDOUT
- Temporary errors
- Service unavailable
- Rate limit

### 3. Estados de Eventos

- **pending**: Evento pendiente de procesar
- **processed**: Evento procesado exitosamente
- **failed**: Evento fallido pero puede reintentarse
- **dead_letter**: Evento fallido permanentemente (3+ intentos)

## Flujo de Procesamiento

```
┌─────────────────┐
│  Evento Nuevo   │
│  (pending)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Procesar      │
│   Evento        │
└────┬───────┬────┘
     │       │
  ✅ │       │ ❌
     │       │
     ▼       ▼
┌─────────┐ ┌──────────────┐
│processed│ │ ¿Recuperable?│
└─────────┘ └──┬───────┬───┘
               │       │
            Sí │       │ No
               │       │
               ▼       ▼
         ┌─────────┐ ┌────────────┐
         │ failed  │ │dead_letter │
         │retry++  │ │(permanente)│
         └────┬────┘ └────────────┘
              │
              │ retry < 3
              ▼
         ┌─────────┐
         │ Esperar │
         │ Backoff │
         └────┬────┘
              │
              ▼
         ┌─────────┐
         │Reintentar│
         └─────────┘
```

## Métodos Principales

### ContabilidadEventsListener

#### `procesarEvento(evento: OutboxEvent)`
Procesa un evento individual con lógica de reintentos.

#### `isRetryableError(error: any): boolean`
Determina si un error es recuperable y debe reintentarse.

#### `calculateBackoff(retryCount: number): number`
Calcula el tiempo de espera con backoff exponencial y jitter.

### AsientosGeneratorService

#### `marcarEventoComoFallido(eventId: string, errorMessage: string)`
Marca un evento como fallido e incrementa el contador de reintentos.

#### `reiniciarEventoFallido(eventId: string): boolean`
Reinicia un evento fallido para reprocesamiento manual.

#### `obtenerEstadisticasEventosFallidos()`
Obtiene estadísticas de eventos fallidos por tipo.

### OutboxEventsService

#### `leerEventosPendientesConReintentos(maxRetries: number, limit: number)`
Lee eventos pendientes que no han excedido el límite de reintentos.

#### `leerEventosFallidos(limit: number)`
Lee eventos en estado 'failed'.

#### `leerEventosDeadLetter(limit: number)`
Lee eventos en estado 'dead_letter'.

#### `obtenerEstadisticasEventos()`
Obtiene estadísticas generales de eventos por estado.

## Endpoints API

### GET /api/contabilidad/eventos/estadisticas
Obtiene estadísticas de eventos (pendientes, procesados, fallidos, dead_letter).

### GET /api/contabilidad/eventos/fallidos
Lista eventos fallidos que pueden reintentarse.

### GET /api/contabilidad/eventos/dead-letter
Lista eventos fallidos permanentemente.

### POST /api/contabilidad/eventos/:eventId/reintentar
Reinicia un evento fallido para reprocesamiento.

### GET /api/contabilidad/eventos/estadisticas-fallidos
Obtiene estadísticas detalladas de eventos fallidos por tipo.

## Monitoreo y Alertas

### Métricas Clave
- Total de eventos pendientes
- Total de eventos fallidos
- Total de eventos dead_letter
- Tiempo promedio de procesamiento
- Tasa de éxito/fallo

### Alertas Recomendadas
- Eventos en dead_letter > 10
- Eventos fallidos > 50
- Eventos pendientes > 100
- Tiempo de procesamiento > 5 minutos

## Ejemplo de Uso

```typescript
// El listener procesa automáticamente eventos pendientes cada minuto
// No se requiere intervención manual para reintentos automáticos

// Para reintentar manualmente un evento fallido:
const resultado = await asientosGeneratorService.reiniciarEventoFallido(eventId);

// Para obtener estadísticas:
const stats = await outboxEventsService.obtenerEstadisticasEventos();
console.log(`Eventos fallidos: ${stats.failed}`);
console.log(`Eventos dead_letter: ${stats.dead_letter}`);
```

## Mejores Prácticas

1. **Monitorear eventos dead_letter**: Revisar regularmente eventos que fallaron permanentemente
2. **Investigar patrones**: Analizar tipos de errores más comunes
3. **Ajustar clasificación**: Actualizar lista de errores recuperables según experiencia
4. **Configurar alertas**: Notificar cuando hay muchos eventos fallidos
5. **Revisar logs**: Analizar mensajes de error para identificar problemas sistémicos

## Testing

Ejecutar el script de prueba:
```powershell
.\test\test-error-handling-reintentos.ps1
```

## Configuración

### Variables de Entorno
- `MAX_RETRIES`: Número máximo de reintentos (default: 3)
- `BASE_BACKOFF_MS`: Tiempo base de backoff en ms (default: 1000)
- `MAX_BACKOFF_MS`: Tiempo máximo de backoff en ms (default: 60000)

## Troubleshooting

### Problema: Eventos atascados en 'failed'
**Solución**: Verificar que el cron job esté ejecutándose correctamente.

### Problema: Muchos eventos en dead_letter
**Solución**: Revisar logs de error, corregir problema raíz, reiniciar eventos manualmente.

### Problema: Reintentos muy rápidos
**Solución**: Ajustar BASE_BACKOFF_MS para aumentar tiempo entre reintentos.

## Mantenimiento

- Revisar eventos dead_letter semanalmente
- Limpiar eventos procesados antiguos (>30 días)
- Analizar estadísticas de fallos mensualmente
- Actualizar clasificación de errores según necesidad
