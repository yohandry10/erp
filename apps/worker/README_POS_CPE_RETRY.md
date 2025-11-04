# Worker de Retry Automático de CPE para Ventas POS

## 📋 Descripción

Este worker procesa automáticamente las ventas POS que tienen facturación electrónica (CPE) pendiente debido a errores temporales como:

- Certificado digital inválido o expirado
- Problemas de conexión con SUNAT
- Errores temporales del OSE
- Configuración incompleta del RUC

## 🔄 Funcionamiento

### Frecuencia de Ejecución

El job se ejecuta **cada 10 minutos** mediante un cron job configurado en el worker.

```typescript
// Cron: */10 * * * * (cada 10 minutos)
cron.schedule('*/10 * * * *', async () => {
  await runPosCpeRetryJob();
});
```

### Flujo de Procesamiento

1. **Consulta de Ventas Pendientes**
   - Busca ventas con `cpe_pendiente = true`
   - Filtra solo las que tienen menos de 5 intentos
   - Ordena por `ultimo_intento_facturacion` (más antiguas primero)
   - Limita a 50 ventas por ejecución

2. **Backoff Exponencial**
   - Intento 1: Inmediato
   - Intento 2: Espera 5 minutos
   - Intento 3: Espera 10 minutos
   - Intento 4: Espera 20 minutos
   - Intento 5: Espera 40 minutos

3. **Procesamiento de Cada Venta**
   - Valida que tenga `cpe_data` guardado
   - Verifica el tiempo de backoff
   - Intenta crear el CPE en la tabla `cpe`
   - Actualiza contadores y timestamps

4. **Resultado**
   - **Éxito**: Marca `cpe_pendiente = false`, limpia `error_facturacion`
   - **Error**: Incrementa `intentos_facturacion`, actualiza `error_facturacion`
   - **Máximo de intentos**: Marca `cpe_pendiente = false` (ya no reintenta)

## 📊 Estructura de Datos

### Tabla `ventas_pos`

Columnas relacionadas con el retry:

```sql
cpe_pendiente BOOLEAN DEFAULT false
intentos_facturacion INTEGER DEFAULT 0
ultimo_intento_facturacion TIMESTAMPTZ
error_facturacion TEXT
cpe_data JSONB
```

### Ejemplo de `cpe_data`

```json
{
  "tipo_documento": "03",
  "serie": "B001",
  "numero": 123,
  "ruc_emisor": "20123456789",
  "razon_social_emisor": "MI EMPRESA SAC",
  "tipo_documento_receptor": "1",
  "documento_receptor": "12345678",
  "razon_social_receptor": "CLIENTE GENERICO",
  "moneda": "PEN",
  "total_gravadas": 100.00,
  "total_igv": 18.00,
  "total_venta": 118.00,
  "items": [
    {
      "cantidad": 1,
      "codigo_producto": "PROD001",
      "descripcion": "Producto de prueba",
      "precio_unitario": 100.00,
      "valor_venta": 100.00,
      "igv": 18.00,
      "total": 118.00
    }
  ]
}
```

## 🚀 Configuración

### Variables de Entorno

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Redis (para BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
```

### Iniciar el Worker

```bash
# Desarrollo
cd apps/worker
npm run dev

# Producción
npm run build
npm start
```

## 📈 Monitoreo

### Logs

El worker genera logs detallados:

```
🔄 [POS CPE Retry] Iniciando job de retry de facturación POS
📋 [POS CPE Retry] Encontradas 5 ventas pendientes
🔄 [POS CPE Retry] Procesando venta B001-123 (intento 2/5)
✅ [POS CPE Retry] CPE creado exitosamente para venta B001-123: uuid-123
✅ [POS CPE Retry] Job completado: 4 procesadas, 1 errores, 0 omitidas
```

### Métricas

El job retorna un objeto con métricas:

```typescript
{
  success: boolean,
  procesadas: number,  // Ventas facturadas exitosamente
  errores: number,     // Ventas que fallaron en este intento
  omitidas: number     // Ventas omitidas por backoff
}
```

### Consultas SQL Útiles

```sql
-- Ver ventas pendientes de facturación
SELECT 
  id,
  numero_ticket,
  total,
  intentos_facturacion,
  ultimo_intento_facturacion,
  error_facturacion
FROM ventas_pos
WHERE cpe_pendiente = true
ORDER BY ultimo_intento_facturacion ASC;

-- Ver ventas que alcanzaron el máximo de intentos
SELECT 
  id,
  numero_ticket,
  total,
  intentos_facturacion,
  error_facturacion
FROM ventas_pos
WHERE intentos_facturacion >= 5
  AND cpe_pendiente = false
ORDER BY ultimo_intento_facturacion DESC;

-- Estadísticas de retry
SELECT 
  COUNT(*) as total_pendientes,
  AVG(intentos_facturacion) as promedio_intentos,
  MAX(intentos_facturacion) as max_intentos
FROM ventas_pos
WHERE cpe_pendiente = true;
```

## 🔧 Troubleshooting

### Problema: Ventas no se procesan

**Causa posible**: El worker no está corriendo

**Solución**:
```bash
# Verificar que el worker esté corriendo
ps aux | grep worker

# Reiniciar el worker
npm run dev
```

### Problema: Todas las ventas fallan

**Causa posible**: Certificado digital inválido o expirado

**Solución**:
1. Verificar certificado en `empresa_config`
2. Actualizar certificado si está expirado
3. Las ventas se reintentarán automáticamente

### Problema: Ventas se quedan en intento 1

**Causa posible**: Backoff exponencial está esperando

**Solución**:
- Esperar el tiempo de backoff (5 minutos para intento 2)
- O ejecutar manualmente: `POST /api/pos/reintentar-facturacion/:ventaId`

## 🎯 Mejoras Futuras

1. **Dashboard de Monitoreo**
   - Panel visual con ventas pendientes
   - Gráficos de tasa de éxito/error
   - Alertas cuando hay muchas ventas pendientes

2. **Notificaciones**
   - Email cuando una venta alcanza 5 intentos
   - Slack/Discord webhook para errores críticos

3. **Priorización**
   - Procesar primero ventas de mayor monto
   - Priorizar ventas más antiguas

4. **Retry Inteligente**
   - Detectar tipo de error y ajustar backoff
   - No reintentar errores permanentes (RUC inválido)

## 📝 Notas Importantes

- ✅ El worker respeta el límite de 5 intentos máximo
- ✅ Implementa backoff exponencial para no saturar SUNAT
- ✅ Registra logs detallados para auditoría
- ✅ No bloquea el sistema si hay errores
- ⚠️ Requiere que el worker esté corriendo 24/7
- ⚠️ Depende de Redis para BullMQ (opcional, usa cron simple)

## 🔗 Archivos Relacionados

- `apps/worker/src/jobs/pos-cpe-retry.job.ts` - Implementación del job
- `apps/worker/src/index.ts` - Configuración del cron
- `apps/erp-api/src/modules/pos/pos.service.ts` - Lógica de POS
- `supabase/migrations/061_add_cpe_retry_columns_ventas_pos.sql` - Migración de columnas

## 📞 Soporte

Para problemas o preguntas:
1. Revisar logs del worker
2. Consultar tabla `integration_logs` para errores de SUNAT
3. Verificar configuración de certificado en `empresa_config`
