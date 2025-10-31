# Guía de Integración de Métricas

Esta guía muestra cómo integrar métricas en los servicios existentes del ERP.

## 📊 Tipos de Métricas

### Counter
Contador que solo incrementa. Ideal para:
- Total de requests
- Total de errores
- Total de órdenes creadas

```typescript
private readonly miContador: Counter;

constructor() {
  this.miContador = new Counter({
    name: 'erp_mi_contador_total',
    help: 'Descripción del contador',
    labelNames: ['label1', 'label2'],
  });
}

// Incrementar
this.miContador.inc(); // +1
this.miContador.inc({ label1: 'valor' }, 5); // +5
```

### Gauge
Valor que puede subir o bajar. Ideal para:
- Conexiones activas
- Tamaño de cola
- Memoria usada

```typescript
private readonly miGauge: Gauge;

constructor() {
  this.miGauge = new Gauge({
    name: 'erp_mi_gauge',
    help: 'Descripción del gauge',
    labelNames: ['label1'],
  });
}

// Establecer valor
this.miGauge.set(100);
this.miGauge.set({ label1: 'valor' }, 50);

// Incrementar/decrementar
this.miGauge.inc(); // +1
this.miGauge.dec(); // -1
```

### Histogram
Distribución de valores. Ideal para:
- Latencia de requests
- Duración de queries
- Tamaño de respuestas

```typescript
private readonly miHistogram: Histogram;

constructor() {
  this.miHistogram = new Histogram({
    name: 'erp_mi_histogram_seconds',
    help: 'Descripción del histogram',
    labelNames: ['label1'],
    buckets: [0.1, 0.5, 1, 2, 5], // Buckets personalizados
  });
}

// Observar valor
this.miHistogram.observe(1.5);
this.miHistogram.observe({ label1: 'valor' }, 0.8);

// Con timer
const end = this.miHistogram.startTimer();
// ... operación ...
end(); // Registra duración automáticamente
```

## 🔧 Ejemplos de Integración

### Ejemplo 1: Servicio de Órdenes de Compra

```typescript
// apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts

import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class OrdenesCompraService {
  constructor(
    private readonly metricsService: MetricsService,
    // ... otros servicios
  ) {}

  async crearOrden(dto: CrearOrdenDto, tenantId: string) {
    try {
      // Tu lógica existente
      const orden = await this.repository.create(dto);
      
      // 📊 Registrar métrica
      this.metricsService.recordOrdenCompraCreada(
        tenantId,
        orden.estado
      );
      
      return orden;
    } catch (error) {
      // 📊 Registrar error
      this.metricsService.recordDbError(error.name);
      throw error;
    }
  }

  async aprobarOrden(ordenId: string, tenantId: string) {
    const startTime = Date.now();
    
    try {
      // Tu lógica existente
      const orden = await this.repository.aprobar(ordenId);
      
      // 📊 Registrar métrica de aprobación
      this.metricsService.recordOrdenCompraCreada(
        tenantId,
        'APROBADA'
      );
      
      // 📊 Registrar duración de la operación
      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.recordDbQuery(
        'update',
        'ordenes_compra',
        duration
      );
      
      return orden;
    } catch (error) {
      this.metricsService.recordDbError(error.name);
      throw error;
    }
  }
}
```

### Ejemplo 2: Servicio de Facturación

```typescript
// apps/erp-api/src/modules/cpe/services/facturacion.service.ts

import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class FacturacionService {
  constructor(
    private readonly metricsService: MetricsService,
    // ... otros servicios
  ) {}

  async emitirFactura(dto: EmitirFacturaDto, tenantId: string) {
    try {
      // Tu lógica existente
      const factura = await this.generarFactura(dto);
      await this.enviarSunat(factura);
      
      // 📊 Registrar métrica
      this.metricsService.recordFacturaEmitida(
        tenantId,
        factura.tipo_documento
      );
      
      return factura;
    } catch (error) {
      // 📊 Registrar error específico de SUNAT
      if (error.code === 'SUNAT_ERROR') {
        this.metricsService.recordHttpError(
          'POST',
          '/sunat/enviar',
          'SunatError'
        );
      }
      throw error;
    }
  }
}
```

### Ejemplo 3: Servicio de Pagos

```typescript
// apps/erp-api/src/modules/finanzas/tesoreria/services/pagos.service.ts

import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../metrics/metrics.service';

@Injectable()
export class PagosService {
  constructor(
    private readonly metricsService: MetricsService,
    // ... otros servicios
  ) {}

  async registrarPago(dto: RegistrarPagoDto, tenantId: string) {
    try {
      // Tu lógica existente
      const pago = await this.repository.create(dto);
      
      // 📊 Registrar métrica
      this.metricsService.recordPagoRegistrado(
        tenantId,
        dto.metodo_pago
      );
      
      return pago;
    } catch (error) {
      this.metricsService.recordDbError(error.name);
      throw error;
    }
  }
}
```

### Ejemplo 4: Servicio de Inventario

```typescript
// apps/erp-api/src/modules/inventario/services/movimientos.service.ts

import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class MovimientosService {
  constructor(
    private readonly metricsService: MetricsService,
    // ... otros servicios
  ) {}

  async registrarMovimiento(dto: MovimientoDto, tenantId: string) {
    try {
      // Tu lógica existente
      const movimiento = await this.repository.create(dto);
      
      // 📊 Registrar métrica
      this.metricsService.recordInventarioMovimiento(
        tenantId,
        dto.tipo_movimiento
      );
      
      return movimiento;
    } catch (error) {
      this.metricsService.recordDbError(error.name);
      throw error;
    }
  }
}
```

### Ejemplo 5: Servicio de Cache

```typescript
// apps/erp-api/src/shared/cache/cache.service.ts

import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../modules/metrics/metrics.service';

@Injectable()
export class CacheService {
  constructor(
    private readonly metricsService: MetricsService,
    // ... otros servicios
  ) {}

  async get(key: string): Promise<any> {
    const value = await this.redis.get(key);
    
    if (value) {
      // 📊 Cache hit
      this.metricsService.recordCacheHit(key);
    } else {
      // 📊 Cache miss
      this.metricsService.recordCacheMiss(key);
    }
    
    return value;
  }
}
```

## 🎯 Mejores Prácticas

### 1. Nombres de Métricas
- Usar prefijo `erp_`
- Usar snake_case
- Ser descriptivo pero conciso
- Incluir unidad si aplica (`_seconds`, `_bytes`, `_total`)

```typescript
// ✅ Bien
erp_http_requests_total
erp_db_query_duration_seconds
erp_cache_hits_total

// ❌ Mal
httpRequests
database_query_time
cacheHit
```

### 2. Labels
- Usar labels para dimensiones importantes
- No usar labels con alta cardinalidad (IDs únicos)
- Mantener labels consistentes

```typescript
// ✅ Bien
this.metricsService.recordOrdenCompraCreada(
  tenantId,    // Baja cardinalidad
  'APROBADA'   // Valores fijos
);

// ❌ Mal
this.metricsService.recordOrdenCompraCreada(
  ordenId,     // Alta cardinalidad - cada orden es única
  userEmail    // Alta cardinalidad - muchos usuarios
);
```

### 3. Rendimiento
- Las métricas deben ser rápidas
- No hacer operaciones costosas en registro de métricas
- Usar async solo si es necesario

```typescript
// ✅ Bien
this.metricsService.recordOrdenCompraCreada(tenantId, estado);

// ❌ Mal
const totalOrdenes = await this.repository.count(); // Query costosa
this.metricsService.setTotalOrdenes(totalOrdenes);
```

### 4. Granularidad
- No registrar métricas en loops intensivos
- Agregar métricas cuando sea posible

```typescript
// ✅ Bien
const ordenes = await this.procesarLote(items);
this.metricsService.recordOrdenesCreadas(tenantId, ordenes.length);

// ❌ Mal
for (const item of items) {
  await this.procesarItem(item);
  this.metricsService.recordOrdenCompraCreada(tenantId, 'CREADA'); // Muchas llamadas
}
```

## 🔍 Testing de Métricas

### Test Unitario

```typescript
// ordenes-compra.service.spec.ts

describe('OrdenesCompraService', () => {
  let service: OrdenesCompraService;
  let metricsService: MetricsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrdenesCompraService,
        {
          provide: MetricsService,
          useValue: {
            recordOrdenCompraCreada: jest.fn(),
            recordDbError: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OrdenesCompraService>(OrdenesCompraService);
    metricsService = module.get<MetricsService>(MetricsService);
  });

  it('debe registrar métrica al crear orden', async () => {
    const dto = { /* ... */ };
    await service.crearOrden(dto, 'tenant-123');

    expect(metricsService.recordOrdenCompraCreada).toHaveBeenCalledWith(
      'tenant-123',
      'BORRADOR'
    );
  });

  it('debe registrar error en métrica', async () => {
    jest.spyOn(service, 'crearOrden').mockRejectedValue(new Error('DB Error'));

    try {
      await service.crearOrden({}, 'tenant-123');
    } catch (error) {
      expect(metricsService.recordDbError).toHaveBeenCalled();
    }
  });
});
```

## 📈 Monitoreo de Métricas

### Verificar Métricas en Desarrollo

```bash
# Ver todas las métricas
curl http://localhost:3001/api/metrics

# Filtrar métrica específica
curl http://localhost:3001/api/metrics | grep ordenes_compra

# Ver resumen de negocio
curl http://localhost:3001/api/metrics/summary
```

### Queries en Prometheus

```promql
# Total de órdenes creadas en la última hora
sum(increase(erp_ordenes_compra_creadas_total[1h]))

# Órdenes por tenant
sum by (tenant_id) (erp_ordenes_compra_creadas_total)

# Tasa de creación de órdenes
rate(erp_ordenes_compra_creadas_total[5m])
```

## 🚀 Próximos Pasos

1. Integrar métricas en servicios críticos
2. Crear dashboards específicos por módulo
3. Configurar alertas para métricas de negocio
4. Documentar métricas personalizadas
5. Revisar y optimizar métricas existentes
