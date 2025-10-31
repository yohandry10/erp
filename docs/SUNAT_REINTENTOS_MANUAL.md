# Sistema de Reintentos SUNAT

## Comportamiento por Defecto: MANUAL

Por defecto, los reintentos a SUNAT están **DESHABILITADOS** y son completamente **MANUALES**.

El sistema NO reintenta automáticamente documentos rechazados. El usuario debe decidir cuándo reintentar.

## ¿Por qué Manual?

1. **Control del usuario**: El usuario decide cuándo reintentar
2. **Sin consumo de recursos**: No hay procesos en background innecesarios
3. **Sin errores de contexto**: No se ejecutan operaciones sin tenant context
4. **Transparencia**: El usuario sabe exactamente qué está pasando

## Reintentos Manuales

### Desde la UI

El usuario puede reintentar documentos rechazados desde:

- **Panel de CPEs**: Botón "Reintentar" en documentos rechazados
- **Panel de GREs**: Botón "Reintentar" en guías rechazadas
- **Vista de detalle**: Opción de reintento en el detalle del documento

### Desde la API

```typescript
// Reintentar un CPE
POST /api/cpe/:id/retry
Headers: x-tenant-id: <tenant_id>

// Reintentar una GRE
POST /api/gre/:id/retry
Headers: x-tenant-id: <tenant_id>
```

## Reintentos Automáticos (Opcional)

Si el usuario **QUIERE** habilitar reintentos automáticos, puede configurarlo:

### Configuración

En el archivo `.env`:

```bash
# Habilitar reintentos automáticos cada 5 minutos
SUNAT_AUTO_RETRY_ENABLED=true
```

### Comportamiento Automático

Cuando está habilitado:

- Se ejecuta cada 5 minutos
- Procesa máximo 20 documentos por ciclo
- Usa backoff exponencial (1s, 2s, 4s, 8s, 16s)
- Máximo 5 reintentos por documento
- Solo reintentos en las últimas 24 horas

### Backoff Exponencial

```
Intento 1: ~1 segundo
Intento 2: ~2 segundos
Intento 3: ~4 segundos
Intento 4: ~8 segundos
Intento 5: ~16 segundos
```

## Estados de Documentos

### RECHAZADO

Documento rechazado por SUNAT. Puede ser:

- **Error técnico**: Problema de conexión, timeout, etc. → Puede reintentarse
- **Error de validación**: Datos incorrectos → NO debe reintentarse (corregir datos primero)

### Campos de Reintento

```sql
retry_count: integer      -- Número de reintentos realizados
next_retry_at: timestamp  -- Cuándo se debe reintentar (backoff)
error_message: text       -- Mensaje del último error
```

## Flujo de Reintento

```
1. Usuario/Sistema detecta documento RECHAZADO
2. Verifica si es error técnico (retry_count != null)
3. Verifica que no exceda MAX_RETRIES (5)
4. Verifica que no sea muy antiguo (< 24 horas)
5. Respeta backoff (next_retry_at)
6. Reintenta envío a SUNAT
7. Actualiza estado según resultado
```

## Logs

```
ℹ️ [SunatRetry] Servicio de reintentos MANUALES (automáticos deshabilitados)
🔄 [SunatRetry] Reintentando CPE xxx (intento 2/5)
✅ [SunatRetry] CPE xxx reintentado exitosamente
⏳ [SunatRetry] CPE xxx programado para siguiente reintento en 2000ms
⚠️ [SunatRetry] CPE xxx alcanzó máximo de reintentos
```

## Recomendaciones

1. **Mantener modo manual** para la mayoría de casos
2. **Habilitar automático** solo si hay muchos errores técnicos frecuentes
3. **Monitorear logs** para detectar problemas recurrentes
4. **Corregir datos** antes de reintentar errores de validación
5. **No reintentar** documentos con errores de negocio

## Diferencia con Otros Sistemas

❌ **Otros sistemas**: Reintentan automáticamente todo
✅ **Nuestro sistema**: Reintentos manuales por defecto, automáticos opcionales

Esto da control al usuario y evita consumo innecesario de recursos.
