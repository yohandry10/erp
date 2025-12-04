# 📘 GUÍA COMPLETA DE USO DEL ERP

## Índice
1. [Visión General del Sistema](#visión-general)
2. [Roles y Responsabilidades](#roles-y-responsabilidades)
3. [Flujos de Trabajo Diarios por Rol](#flujos-diarios)
4. [Módulos del Sistema](#módulos-del-sistema)
5. [Casos de Uso Completos](#casos-de-uso)
6. [Integraciones entre Módulos](#integraciones)

---

## 🏢 Visión General del Sistema

### ¿Qué es este ERP?
Sistema integral de gestión empresarial diseñado para empresas comerciales en Perú y Latinoamérica.
Incluye: Ventas, Inventario, Finanzas, Contabilidad, Compras, POS, RRHH y Reportes.

### Arquitectura Multi-Tenant
- Cada empresa (tenant) tiene sus datos completamente aislados
- Un SuperAdmin puede crear múltiples empresas
- Cada empresa tiene su propio administrador y usuarios

---

## 👥 Roles y Responsabilidades

### Estructura Organizacional Típica

```
┌─────────────────────────────────────────────────────────────┐
│                      ADMINISTRADOR                          │
│  • Configuración general del sistema                        │
│  • Gestión de usuarios y permisos                          │
│  • Supervisión de todas las operaciones                    │
│  • Reportes gerenciales                                    │
└─────────────────────────────────────────────────────────────┘
         │
         ├──────────────────┬──────────────────┬──────────────────┐
         ▼                  ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   SUPERVISOR    │ │    CONTADOR     │ │   ALMACENERO    │ │    VENDEDOR     │
│ • Aprobaciones  │ │ • Contabilidad  │ │ • Inventario    │ │ • Clientes      │
│ • Supervisión   │ │ • Finanzas      │ │ • Logística     │ │ • Cotizaciones  │
│ • Reportes      │ │ • Reportes      │ │ • Recepciones   │ │ • Pedidos       │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
                                                                    │
                                                                    ▼
                                                           ┌─────────────────┐
                                                           │     CAJERO      │
                                                           │ • Ventas POS    │
                                                           │ • Cobros        │
                                                           │ • Caja          │
                                                           └─────────────────┘
```


---

## 📅 Flujos de Trabajo Diarios por Rol

### 🔴 ADMINISTRADOR - Día Típico

#### 8:00 AM - Inicio del Día
```
1. Login al sistema
2. Revisar Dashboard General
   - Ventas del día anterior
   - Alertas de stock bajo
   - Pedidos pendientes de aprobación
   - Cuentas por cobrar vencidas
```

#### 9:00 AM - Gestión de Usuarios
```
1. Ir a Configuración → Usuarios
2. Revisar solicitudes de nuevos usuarios
3. Crear usuario nuevo:
   - Nombre: Juan Pérez
   - Email: juan@empresa.com
   - Rol: VENDEDOR
4. Asignar permisos adicionales si es necesario
```

#### 10:00 AM - Aprobaciones Pendientes
```
1. Ir a Ventas → Aprobaciones
2. Revisar pedidos que exceden límite de crédito
3. Aprobar o rechazar con comentarios
4. Revisar órdenes de compra pendientes
```

#### 11:00 AM - Configuración Fiscal
```
1. Ir a Configuración → Fiscal
2. Verificar series de facturación
3. Revisar configuración SUNAT
4. Actualizar certificado digital si es necesario
```

#### 3:00 PM - Reportes Gerenciales
```
1. Ir a Reportes → Dashboard
2. Generar reporte de ventas semanal
3. Revisar margen de ganancia por producto
4. Exportar a Excel para directorio
```

#### 5:00 PM - Cierre del Día
```
1. Revisar resumen de operaciones
2. Verificar que todas las cajas estén cerradas
3. Revisar alertas pendientes
```

---

### 🟢 VENDEDOR - Día Típico

#### 8:00 AM - Inicio del Día
```
1. Login al sistema
2. Revisar mis cotizaciones pendientes
3. Ver pedidos en proceso
4. Revisar clientes con seguimiento pendiente
```

#### 8:30 AM - Atención a Cliente Nuevo
```
1. Ir a Ventas → Clientes → Nuevo
2. Ingresar datos del cliente:
   - RUC: 20123456789
   - Razón Social: EMPRESA ABC SAC
   - Dirección, teléfono, email
3. Validar RUC con SUNAT (botón "Validar")
4. Guardar cliente
```

#### 9:00 AM - Crear Cotización
```
1. Ir a Ventas → Cotizaciones → Nueva
2. Seleccionar cliente: EMPRESA ABC SAC
3. Agregar productos:
   - Laptop HP 15" x 5 unidades @ S/2,500
   - Mouse Logitech x 10 unidades @ S/45
4. Aplicar descuento 5% (si está autorizado)
5. Agregar condiciones de pago: 30 días
6. Guardar y enviar PDF por email
```

#### 10:30 AM - Convertir Cotización a Pedido
```
1. Cliente confirma cotización #COT-0025
2. Ir a Ventas → Cotizaciones
3. Abrir cotización #COT-0025
4. Click "Convertir a Pedido"
5. Sistema reserva stock automáticamente
6. Pedido creado: #PED-0089
```

#### 11:00 AM - Seguimiento de Pedidos
```
1. Ir a Ventas → Pedidos
2. Filtrar por "Mis pedidos"
3. Ver estado de cada pedido:
   - PED-0085: DESPACHADO ✅
   - PED-0087: EN PREPARACIÓN 📦
   - PED-0089: PENDIENTE APROBACIÓN ⏳
```

#### 2:00 PM - Generar Factura
```
1. Pedido #PED-0085 fue entregado
2. Ir a Ventas → Pedidos → #PED-0085
3. Click "Generar Factura"
4. Seleccionar tipo: FACTURA
5. Sistema genera F001-000156
6. Envía automáticamente a SUNAT
7. PDF enviado al cliente por email
```

#### 4:00 PM - Registrar Cobro
```
1. Cliente paga factura F001-000156
2. Ir a Finanzas → Cobros → Nuevo
3. Seleccionar factura F001-000156
4. Método de pago: Transferencia
5. Referencia: OP-123456
6. Monto: S/14,750.00
7. Guardar cobro
```


---

### 🟡 CAJERO - Día Típico

#### 7:30 AM - Apertura de Caja
```
1. Login al sistema
2. Ir a POS → Cajas
3. Seleccionar "Caja Principal"
4. Click "Abrir Sesión"
5. Ingresar monto inicial: S/500.00
6. Confirmar apertura
7. Sistema registra hora y monto inicial
```

#### 8:00 AM - Primera Venta del Día
```
1. Ir a POS → Nueva Venta
2. Cliente: Consumidor Final (DNI: 00000000)
3. Escanear/buscar productos:
   - Arroz 5kg x 2 = S/36.00
   - Aceite 1L x 1 = S/12.50
   - Azúcar 1kg x 3 = S/13.50
4. Total: S/62.00
5. Método de pago: Efectivo
6. Cliente paga: S/100.00
7. Vuelto: S/38.00
8. Imprimir boleta B001-000234
```

#### 10:00 AM - Venta con Factura
```
1. Cliente empresa solicita factura
2. Buscar cliente por RUC: 20456789012
3. Agregar productos al carrito
4. Total: S/850.00
5. Método de pago: Tarjeta de crédito
6. Procesar pago con POS bancario
7. Ingresar referencia de operación
8. Generar Factura F001-000157
```

#### 12:00 PM - Devolución
```
1. Cliente trae producto defectuoso
2. Ir a POS → Devoluciones → Nueva
3. Buscar venta original: B001-000230
4. Seleccionar producto a devolver
5. Motivo: "Producto defectuoso"
6. Procesar devolución
7. Devolver dinero en efectivo
8. Sistema ajusta inventario automáticamente
```

#### 1:00 PM - Arqueo Parcial
```
1. Ir a POS → Cajas → Mi Caja
2. Click "Arqueo"
3. Contar efectivo físico: S/2,350.00
4. Sistema muestra esperado: S/2,380.00
5. Diferencia: -S/30.00
6. Registrar observación
7. Continuar operando
```

#### 6:00 PM - Cierre de Caja
```
1. Ir a POS → Cajas → Mi Caja
2. Click "Cerrar Sesión"
3. Realizar arqueo final:
   - Efectivo: S/4,850.00
   - Tarjetas: S/3,200.00
   - Yape/Plin: S/450.00
4. Sistema calcula diferencias
5. Confirmar cierre
6. Imprimir reporte de cierre
7. Entregar efectivo a supervisor
```

---

### 🔵 ALMACENERO - Día Típico

#### 7:00 AM - Inicio del Día
```
1. Login al sistema
2. Ir a Inventario → Logística
3. Ver pedidos pendientes de preparación
4. Priorizar por fecha de entrega
```

#### 7:30 AM - Preparar Pedido
```
1. Seleccionar Pedido #PED-0087
2. Ver detalle de productos:
   - Laptop HP 15" x 5 (Ubicación: A-01-03)
   - Mouse Logitech x 10 (Ubicación: B-02-15)
3. Ir físicamente a ubicaciones
4. Recoger productos
5. Verificar cantidades y estado
6. Marcar como "Preparado" en sistema
```

#### 9:00 AM - Recepción de Mercadería
```
1. Llega camión del proveedor
2. Ir a Compras → Recepciones → Nueva
3. Seleccionar Orden de Compra #OC-0045
4. Verificar productos recibidos:
   - Teclados x 50 ✅
   - Monitores x 20 ✅ (2 dañados)
5. Registrar recepción parcial:
   - Teclados: 50 de 50
   - Monitores: 18 de 20 (2 rechazados)
6. Tomar fotos de productos dañados
7. Confirmar recepción
8. Sistema actualiza stock automáticamente
```

#### 11:00 AM - Despacho de Pedido
```
1. Ir a Inventario → Logística
2. Seleccionar pedido preparado #PED-0087
3. Verificar que transportista llegó
4. Click "Confirmar Despacho"
5. Ingresar datos de transporte:
   - Transportista: Olva Courier
   - Guía: 001-0005678
   - Placa: ABC-123
6. Sistema genera GRE automáticamente
7. Imprimir guía de remisión
8. Entregar productos al transportista
```

#### 2:00 PM - Transferencia entre Almacenes
```
1. Sucursal Miraflores necesita stock
2. Ir a Inventario → Transferencias → Nueva
3. Origen: Almacén Principal
4. Destino: Almacén Sucursal
5. Productos:
   - Mouse Logitech x 20
   - Teclado Mecánico x 10
6. Guardar transferencia
7. Preparar productos
8. Confirmar salida
9. Sucursal confirma recepción
```

#### 4:00 PM - Ajuste de Inventario
```
1. Durante conteo encontré diferencia
2. Ir a Inventario → Movimientos → Nuevo
3. Tipo: AJUSTE
4. Producto: Papel Bond A4
5. Stock sistema: 200 unidades
6. Stock físico: 195 unidades
7. Diferencia: -5 unidades
8. Motivo: "Diferencia en conteo físico"
9. Adjuntar acta de inventario
10. Confirmar ajuste
```

#### 5:00 PM - Revisar Stock Bajo
```
1. Ir a Inventario → Productos
2. Filtrar por "Stock bajo mínimo"
3. Ver productos críticos:
   - Aceite 1L: 15 unidades (mín: 100)
   - Arroz 5kg: 25 unidades (mín: 80)
4. Notificar a compras para reposición
```


---

### 🟣 CONTADOR - Día Típico

#### 8:00 AM - Revisión Matutina
```
1. Login al sistema
2. Ir a Dashboard → Finanzas
3. Revisar:
   - Saldo de cuentas bancarias
   - CxC vencidas
   - CxP por vencer hoy
   - Cobros del día anterior
```

#### 8:30 AM - Conciliación Bancaria
```
1. Ir a Finanzas → Bancos → BCP
2. Click "Conciliar"
3. Importar extracto bancario (Excel/CSV)
4. Sistema hace match automático:
   - 45 movimientos conciliados ✅
   - 3 movimientos pendientes ⚠️
5. Revisar pendientes manualmente:
   - Depósito S/500 sin identificar
   - Cargo bancario S/15 (comisión)
6. Crear movimientos faltantes
7. Confirmar conciliación
```

#### 10:00 AM - Registro de Compras
```
1. Ir a Contabilidad → Asientos
2. Registrar factura de proveedor:
   - Proveedor: Tech Import SAC
   - Factura: F001-0004567
   - Monto: S/15,000 + IGV
3. Sistema sugiere asiento:
   - D: 60 Compras S/15,000
   - D: 40 IGV Crédito S/2,700
   - C: 42 CxP Comerciales S/17,700
4. Verificar y aprobar asiento
```

#### 11:00 AM - Gestión de CxC
```
1. Ir a Finanzas → CxC
2. Filtrar por "Vencidas"
3. Ver clientes morosos:
   - Cliente A: S/5,000 (15 días vencido)
   - Cliente B: S/12,000 (30 días vencido)
4. Generar reporte de aging
5. Enviar a cobranzas para gestión
```

#### 2:00 PM - Pago a Proveedores
```
1. Ir a Finanzas → CxP
2. Filtrar por "Vence esta semana"
3. Seleccionar facturas a pagar:
   - Proveedor X: F001-123 S/8,500
   - Proveedor Y: F001-456 S/3,200
4. Crear lote de pago
5. Generar archivo para banco
6. Registrar pagos en sistema
7. Sistema actualiza CxP automáticamente
```

#### 3:00 PM - Cierre Mensual
```
1. Ir a Contabilidad → Cierre
2. Verificar que todos los asientos estén aprobados
3. Ejecutar proceso de cierre:
   - Calcular depreciación
   - Provisionar CTS
   - Calcular resultado del período
4. Generar estados financieros:
   - Balance General
   - Estado de Resultados
   - Flujo de Efectivo
5. Exportar para revisión gerencial
```

#### 4:00 PM - Declaraciones SUNAT
```
1. Ir a Reportes → Fiscal
2. Generar Registro de Ventas
3. Generar Registro de Compras
4. Verificar totales con libros
5. Exportar para PDT
6. Preparar declaración mensual
```

---

### 🟠 SUPERVISOR - Día Típico

#### 8:00 AM - Revisión de Operaciones
```
1. Login al sistema
2. Ir a Dashboard
3. Revisar KPIs del día anterior:
   - Ventas totales
   - Ticket promedio
   - Productos más vendidos
   - Eficiencia de despacho
```

#### 9:00 AM - Aprobaciones Pendientes
```
1. Ir a Ventas → Aprobaciones
2. Revisar pedidos que requieren autorización:
   - Pedido con descuento > 15%
   - Pedido que excede límite de crédito
   - Pedido con producto sin stock
3. Analizar cada caso
4. Aprobar o rechazar con justificación
```

#### 10:00 AM - Supervisión de Almacén
```
1. Ir a Inventario → Logística
2. Ver métricas de preparación:
   - Pedidos preparados hoy: 15
   - Tiempo promedio: 25 min
   - Pedidos atrasados: 2
3. Identificar cuellos de botella
4. Reasignar recursos si es necesario
```

#### 11:00 AM - Autorización de Devoluciones
```
1. Ir a Ventas → RMA
2. Revisar solicitudes pendientes:
   - RMA-0023: Producto defectuoso
   - RMA-0024: Error en pedido
3. Verificar políticas de devolución
4. Aprobar y asignar acción:
   - Reemplazo de producto
   - Nota de crédito
   - Reembolso
```

#### 2:00 PM - Revisión de Precios
```
1. Ir a Inventario → Productos
2. Revisar márgenes de ganancia
3. Identificar productos con margen bajo
4. Proponer ajustes de precio
5. Coordinar con gerencia
```

#### 4:00 PM - Reportes de Gestión
```
1. Ir a Reportes
2. Generar informe semanal:
   - Ventas por vendedor
   - Cumplimiento de metas
   - Rotación de inventario
   - Eficiencia operativa
3. Preparar presentación para gerencia
```


---

## 📦 Módulos del Sistema - Detalle Completo

### 1️⃣ MÓDULO DE VENTAS

#### Submódulos:
| Submódulo | Descripción | Usuarios |
|-----------|-------------|----------|
| Clientes | Gestión de cartera de clientes | Vendedor, Admin |
| Cotizaciones | Propuestas comerciales | Vendedor |
| Pedidos | Órdenes de venta confirmadas | Vendedor, Supervisor |
| Facturas | Documentos fiscales | Vendedor, Contador |
| Notas de Crédito | Devoluciones y ajustes | Contador, Supervisor |
| RMA | Gestión de devoluciones | Vendedor, Almacenero |

#### Flujo Principal de Ventas:
```
CLIENTE → COTIZACIÓN → PEDIDO → PREPARACIÓN → DESPACHO → FACTURA → COBRO
    │          │           │          │            │          │        │
    │          │           │          │            │          │        │
    ▼          ▼           ▼          ▼            ▼          ▼        ▼
 Vendedor  Vendedor   Vendedor   Almacenero   Almacenero  Vendedor  Vendedor
                      Supervisor                          Contador  Cajero
```

#### Estados de un Pedido:
```
BORRADOR → PENDIENTE → APROBADO → EN_PREPARACION → PREPARADO → DESPACHADO → FACTURADO → COBRADO
              │
              ▼
          RECHAZADO (si no aprueba)
```

---

### 2️⃣ MÓDULO DE INVENTARIO

#### Submódulos:
| Submódulo | Descripción | Usuarios |
|-----------|-------------|----------|
| Productos | Catálogo de productos | Almacenero, Admin |
| Almacenes | Ubicaciones físicas | Almacenero, Admin |
| Stock | Niveles de inventario | Almacenero, Vendedor |
| Movimientos | Entradas/Salidas | Almacenero |
| Kardex | Historial valorizado | Contador, Almacenero |
| Logística | Preparación y despacho | Almacenero |
| Transferencias | Entre almacenes | Almacenero, Supervisor |

#### Tipos de Movimientos:
```
ENTRADA:
  - Compra (recepción de proveedor)
  - Devolución de cliente
  - Transferencia entrada
  - Ajuste positivo

SALIDA:
  - Venta (despacho)
  - Devolución a proveedor
  - Transferencia salida
  - Ajuste negativo
  - Merma/Pérdida
```

#### Flujo de Logística:
```
PEDIDO CONFIRMADO
       │
       ▼
┌──────────────────┐
│ PENDIENTE        │ ← Pedido entra a cola de preparación
│ PREPARACIÓN      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ EN PREPARACIÓN   │ ← Almacenero toma el pedido
│                  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ PREPARADO        │ ← Productos listos para despacho
│                  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ DESPACHADO       │ ← Entregado a transportista
│                  │   Stock liberado
└──────────────────┘
```

---

### 3️⃣ MÓDULO DE FINANZAS

#### Submódulos:
| Submódulo | Descripción | Usuarios |
|-----------|-------------|----------|
| CxC | Cuentas por cobrar | Contador, Vendedor |
| CxP | Cuentas por pagar | Contador |
| Cobros | Registro de ingresos | Cajero, Vendedor, Contador |
| Pagos | Registro de egresos | Contador |
| Bancos | Cuentas bancarias | Contador |
| Tesorería | Flujo de caja | Contador, Admin |

#### Flujo de Cuentas por Cobrar:
```
FACTURA EMITIDA
       │
       ▼
┌──────────────────┐
│ CxC PENDIENTE    │ ← Se crea automáticamente
│ Vence: 30 días   │
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
COBRO      VENCIDA
PARCIAL       │
    │         ▼
    │    GESTIÓN DE
    │    COBRANZA
    │         │
    ▼         ▼
┌──────────────────┐
│ CxC PAGADA       │
│ (Total o Parcial)│
└──────────────────┘
```

#### Métodos de Pago Soportados:
- Efectivo
- Tarjeta de Crédito/Débito
- Transferencia Bancaria
- Depósito
- Cheque
- Yape / Plin
- Crédito (a cuenta)


---

### 4️⃣ MÓDULO DE CONTABILIDAD

#### Submódulos:
| Submódulo | Descripción | Usuarios |
|-----------|-------------|----------|
| Plan de Cuentas | Estructura contable PCGE | Contador |
| Asientos | Registros contables | Contador |
| Reportes | Estados financieros | Contador, Admin |
| Cierre | Cierre de período | Contador |

#### Plan de Cuentas (PCGE Perú):
```
10 - EFECTIVO Y EQUIVALENTES
12 - CUENTAS POR COBRAR COMERCIALES
20 - MERCADERÍAS
33 - INMUEBLES, MAQUINARIA Y EQUIPO
39 - DEPRECIACIÓN ACUMULADA
40 - TRIBUTOS POR PAGAR
41 - REMUNERACIONES POR PAGAR
42 - CUENTAS POR PAGAR COMERCIALES
46 - CUENTAS POR PAGAR DIVERSAS
50 - CAPITAL
59 - RESULTADOS ACUMULADOS
60 - COMPRAS
62 - GASTOS DE PERSONAL
63 - GASTOS DE SERVICIOS
65 - OTROS GASTOS DE GESTIÓN
68 - VALUACIÓN DE ACTIVOS
69 - COSTO DE VENTAS
70 - VENTAS
75 - OTROS INGRESOS DE GESTIÓN
```

#### Asientos Automáticos:
El sistema genera asientos automáticamente para:
- Ventas (Factura emitida)
- Compras (Factura registrada)
- Cobros (Ingreso de dinero)
- Pagos (Egreso de dinero)
- Ajustes de inventario

---

### 5️⃣ MÓDULO DE COMPRAS

#### Submódulos:
| Submódulo | Descripción | Usuarios |
|-----------|-------------|----------|
| Proveedores | Gestión de proveedores | Almacenero, Contador |
| Órdenes de Compra | Pedidos a proveedores | Almacenero, Supervisor |
| Recepciones | Ingreso de mercadería | Almacenero |

#### Flujo de Compras:
```
NECESIDAD DE STOCK
       │
       ▼
┌──────────────────┐
│ ORDEN DE COMPRA  │ ← Almacenero crea OC
│ BORRADOR         │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ OC PENDIENTE     │ ← Enviada a aprobación
│ APROBACIÓN       │
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
APROBADA   RECHAZADA
    │
    ▼
┌──────────────────┐
│ OC ENVIADA       │ ← Enviada al proveedor
│ AL PROVEEDOR     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ RECEPCIÓN        │ ← Mercadería llega
│ (Total/Parcial)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ OC COMPLETADA    │ ← Stock actualizado
│                  │   CxP generada
└──────────────────┘
```

---

### 6️⃣ MÓDULO POS (Punto de Venta)

#### Submódulos:
| Submódulo | Descripción | Usuarios |
|-----------|-------------|----------|
| Ventas POS | Ventas rápidas | Cajero |
| Cajas | Gestión de cajas | Cajero, Supervisor |
| Turnos | Sesiones de trabajo | Cajero |
| Devoluciones | Devoluciones POS | Cajero, Supervisor |

#### Flujo de Caja:
```
INICIO DEL DÍA
       │
       ▼
┌──────────────────┐
│ ABRIR SESIÓN     │ ← Cajero abre caja
│ Monto inicial    │   con monto base
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ OPERACIONES      │ ← Ventas, cobros,
│ DEL DÍA          │   devoluciones
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ ARQUEO           │ ← Conteo de efectivo
│ (Parcial/Final)  │   vs sistema
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ CIERRE DE CAJA   │ ← Cuadre final
│ Reporte generado │   Entrega de efectivo
└──────────────────┘
```

#### Tipos de Documentos POS:
- Boleta de Venta (B001-XXXXXX)
- Factura (F001-XXXXXX)
- Nota de Crédito (BC01-XXXXXX / FC01-XXXXXX)
- Ticket (interno)


---

### 7️⃣ MÓDULO DE RRHH

#### Submódulos:
| Submódulo | Descripción | Usuarios |
|-----------|-------------|----------|
| Empleados | Gestión de personal | Admin, RRHH |
| Planillas | Cálculo de sueldos | Contador, RRHH |
| Asistencia | Control de asistencia | RRHH |

#### Flujo de Planilla:
```
INICIO DE MES
       │
       ▼
┌──────────────────┐
│ REGISTRO DE      │ ← Horas trabajadas
│ ASISTENCIA       │   Horas extra
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ CÁLCULO DE       │ ← Sistema calcula:
│ PLANILLA         │   - Sueldo bruto
│                  │   - Descuentos (AFP, ONP)
│                  │   - Aportes (EsSalud)
│                  │   - Sueldo neto
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ APROBACIÓN       │ ← Supervisor/Gerente
│                  │   revisa y aprueba
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ PAGO             │ ← Transferencia a
│                  │   empleados
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ ASIENTO          │ ← Registro contable
│ CONTABLE         │   automático
└──────────────────┘
```

---

### 8️⃣ MÓDULO DE CONFIGURACIÓN

#### Submódulos:
| Submódulo | Descripción | Usuarios |
|-----------|-------------|----------|
| Empresa | Datos de la empresa | Admin |
| Usuarios | Gestión de usuarios | Admin |
| Roles | Permisos y accesos | Admin |
| Fiscal | Configuración SUNAT | Admin, Contador |
| Integraciones | APIs externas | Admin |

#### Configuración Inicial de Empresa:
```
1. Datos Generales
   - RUC
   - Razón Social
   - Dirección Fiscal
   - Representante Legal

2. Configuración Fiscal
   - Series de facturación (F001, B001, etc.)
   - Certificado digital SUNAT
   - Usuario SOL
   - Modo: Producción/Pruebas

3. Configuración Operativa
   - Moneda por defecto
   - IGV (18%)
   - Política de inventario (FIFO/FEFO)
   - Límites de aprobación

4. Integraciones
   - SUNAT (facturación electrónica)
   - Bancos (conciliación)
   - Email (notificaciones)
```

---

### 9️⃣ MÓDULO DE REPORTES

#### Reportes Disponibles:

| Categoría | Reporte | Usuarios |
|-----------|---------|----------|
| **Ventas** | Ventas por período | Vendedor, Admin |
| | Ventas por vendedor | Supervisor, Admin |
| | Ventas por producto | Admin |
| | Ventas por cliente | Vendedor, Admin |
| **Inventario** | Stock actual | Almacenero, Admin |
| | Kardex valorizado | Contador |
| | Productos bajo mínimo | Almacenero |
| | Rotación de inventario | Admin |
| **Finanzas** | Aging CxC | Contador, Admin |
| | Aging CxP | Contador |
| | Flujo de caja | Contador, Admin |
| | Conciliación bancaria | Contador |
| **Contabilidad** | Balance General | Contador, Admin |
| | Estado de Resultados | Contador, Admin |
| | Libro Diario | Contador |
| | Libro Mayor | Contador |
| **Fiscal** | Registro de Ventas | Contador |
| | Registro de Compras | Contador |
| | Resumen de IGV | Contador |

---

## 🔄 Integraciones entre Módulos

### Flujo Completo: Venta a Crédito

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLUJO COMPLETO DE VENTA                           │
└─────────────────────────────────────────────────────────────────────────────┘

VENTAS                 INVENTARIO              FINANZAS            CONTABILIDAD
───────                ──────────              ────────            ────────────
   │                       │                      │                     │
   ▼                       │                      │                     │
┌──────────┐               │                      │                     │
│ Cotización│              │                      │                     │
└────┬─────┘               │                      │                     │
     │                     │                      │                     │
     ▼                     │                      │                     │
┌──────────┐               │                      │                     │
│ Pedido   │───────────────┼──────────────────────┼─────────────────────┤
└────┬─────┘               │                      │                     │
     │                     ▼                      │                     │
     │              ┌──────────────┐              │                     │
     │              │ Reserva Stock│              │                     │
     │              └──────┬───────┘              │                     │
     │                     │                      │                     │
     │                     ▼                      │                     │
     │              ┌──────────────┐              │                     │
     │              │ Preparación  │              │                     │
     │              └──────┬───────┘              │                     │
     │                     │                      │                     │
     │                     ▼                      │                     │
     │              ┌──────────────┐              │                     │
     │              │ Despacho     │              │                     │
     │              │ (Libera stock)│             │                     │
     │              └──────┬───────┘              │                     │
     │                     │                      │                     │
     ▼                     │                      │                     │
┌──────────┐               │                      │                     │
│ Factura  │───────────────┼──────────────────────┼─────────────────────┤
└────┬─────┘               │                      │                     │
     │                     │                      ▼                     │
     │                     │               ┌──────────────┐             │
     │                     │               │ CxC Generada │             │
     │                     │               └──────┬───────┘             │
     │                     │                      │                     ▼
     │                     │                      │              ┌──────────────┐
     │                     │                      │              │ Asiento Venta│
     │                     │                      │              │ D:12 CxC     │
     │                     │                      │              │ C:70 Ventas  │
     │                     │                      │              │ C:40 IGV     │
     │                     │                      │              └──────────────┘
     │                     │                      │
     │                     │                      ▼
     │                     │               ┌──────────────┐
     │                     │               │ Cobro        │
     │                     │               └──────┬───────┘
     │                     │                      │
     │                     │                      │              ┌──────────────┐
     │                     │                      └──────────────│ Asiento Cobro│
     │                     │                                     │ D:10 Caja    │
     │                     │                                     │ C:12 CxC     │
     │                     │                                     └──────────────┘
```


---

## 📋 Casos de Uso Completos

### Caso 1: Venta Completa B2B (Empresa a Empresa)

**Escenario:** Cliente corporativo solicita cotización de equipos de cómputo.

```
DÍA 1 - LUNES
─────────────
09:00 │ VENDEDOR recibe llamada de cliente potencial
      │ → Crea cliente nuevo en sistema (RUC, datos)
      │ → Valida RUC con SUNAT ✓
      │
10:00 │ VENDEDOR crea cotización #COT-0100
      │ → 10 Laptops HP @ S/2,500 = S/25,000
      │ → 10 Mouse @ S/45 = S/450
      │ → 10 Teclados @ S/180 = S/1,800
      │ → Subtotal: S/27,250
      │ → Descuento 5%: -S/1,362.50
      │ → IGV 18%: S/4,659.75
      │ → Total: S/30,547.25
      │ → Envía PDF por email al cliente

DÍA 2 - MARTES
──────────────
14:00 │ Cliente confirma cotización
      │
14:15 │ VENDEDOR convierte cotización a pedido #PED-0200
      │ → Sistema reserva stock automáticamente
      │ → Pedido requiere aprobación (monto > S/5,000)
      │
15:00 │ SUPERVISOR recibe notificación
      │ → Revisa pedido y cliente
      │ → Verifica límite de crédito: OK
      │ → APRUEBA pedido

DÍA 3 - MIÉRCOLES
─────────────────
07:30 │ ALMACENERO ve pedido en cola de preparación
      │ → Toma pedido #PED-0200
      │ → Estado: EN_PREPARACION
      │
08:00 │ ALMACENERO recoge productos:
      │ → Laptops: Ubicación A-01-03 ✓
      │ → Mouse: Ubicación B-02-15 ✓
      │ → Teclados: Ubicación B-03-08 ✓
      │
09:00 │ ALMACENERO marca pedido como PREPARADO
      │
10:00 │ Transportista llega
      │ ALMACENERO confirma despacho
      │ → Ingresa datos de transporte
      │ → Sistema genera GRE automáticamente
      │ → Imprime guía de remisión
      │ → Stock liberado de reserva

DÍA 4 - JUEVES
──────────────
09:00 │ Cliente confirma recepción
      │
09:30 │ VENDEDOR genera factura F001-000200
      │ → Sistema envía a SUNAT automáticamente
      │ → CDR recibido: ACEPTADO ✓
      │ → PDF enviado al cliente
      │ → CxC generada automáticamente
      │ → Asiento contable generado

DÍA 34 - (30 días después)
──────────────────────────
10:00 │ Cliente realiza transferencia bancaria
      │
14:00 │ CONTADOR ve depósito en extracto bancario
      │ → Registra cobro contra factura F001-000200
      │ → CxC marcada como PAGADA
      │ → Asiento de cobro generado
```

---

### Caso 2: Compra y Recepción de Mercadería

**Escenario:** Stock bajo de productos, necesidad de reposición.

```
DÍA 1 - LUNES
─────────────
08:00 │ ALMACENERO revisa alertas de stock bajo
      │ → Aceite 1L: 15 unidades (mín: 100)
      │ → Arroz 5kg: 25 unidades (mín: 80)
      │
09:00 │ ALMACENERO crea Orden de Compra #OC-0050
      │ → Proveedor: Alimentos del Perú SA
      │ → Aceite 1L x 200 @ S/8.00 = S/1,600
      │ → Arroz 5kg x 150 @ S/12.00 = S/1,800
      │ → Subtotal: S/3,400
      │ → IGV: S/612
      │ → Total: S/4,012
      │
10:00 │ SUPERVISOR aprueba OC
      │ → OC enviada al proveedor por email

DÍA 3 - MIÉRCOLES
─────────────────
09:00 │ Camión del proveedor llega
      │
09:15 │ ALMACENERO inicia recepción
      │ → Abre OC #OC-0050 en sistema
      │ → Click "Nueva Recepción"
      │
09:30 │ Verificación física:
      │ → Aceite 1L: 200 unidades ✓
      │ → Arroz 5kg: 150 unidades ✓
      │ → Todo conforme
      │
10:00 │ ALMACENERO confirma recepción
      │ → Stock actualizado automáticamente
      │ → Aceite: 15 + 200 = 215 unidades
      │ → Arroz: 25 + 150 = 175 unidades
      │ → Movimiento de inventario registrado
      │
10:30 │ ALMACENERO registra factura del proveedor
      │ → Factura: F001-0004567
      │ → CxP generada automáticamente
      │ → Asiento contable generado

DÍA 33 - (30 días después)
──────────────────────────
09:00 │ CONTADOR revisa CxP por vencer
      │ → Factura F001-0004567 vence hoy
      │
10:00 │ CONTADOR programa pago
      │ → Genera transferencia bancaria
      │ → Registra pago en sistema
      │ → CxP marcada como PAGADA
      │ → Asiento de pago generado
```

---

### Caso 3: Devolución de Cliente (RMA)

**Escenario:** Cliente devuelve producto defectuoso.

```
DÍA 1
─────
10:00 │ Cliente llama reportando laptop defectuosa
      │ → Comprada hace 15 días
      │ → Factura: F001-000180
      │
10:15 │ VENDEDOR crea solicitud RMA #RMA-0030
      │ → Factura origen: F001-000180
      │ → Producto: Laptop HP 15"
      │ → Motivo: "Pantalla con líneas, defecto de fábrica"
      │ → Acción solicitada: Reemplazo
      │
11:00 │ SUPERVISOR revisa RMA
      │ → Verifica política de devolución: OK (< 30 días)
      │ → APRUEBA RMA
      │ → Acción: Reemplazo de producto

DÍA 2
─────
09:00 │ Cliente trae laptop defectuosa
      │
09:15 │ ALMACENERO recibe producto
      │ → Verifica estado físico
      │ → Confirma defecto de pantalla
      │ → Registra recepción en RMA #RMA-0030
      │ → Producto ingresa a "Stock defectuoso"
      │
09:30 │ ALMACENERO prepara laptop de reemplazo
      │ → Toma del stock disponible
      │ → Entrega al cliente
      │ → Registra salida por RMA
      │
10:00 │ Sistema actualiza inventario:
      │ → Stock disponible: -1 (reemplazo entregado)
      │ → Stock defectuoso: +1 (producto recibido)
      │
10:30 │ VENDEDOR cierra RMA como "Completado"
      │ → Cliente firma conformidad
```


---

### Caso 4: Día Típico en Tienda (POS)

**Escenario:** Operación diaria de punto de venta.

```
07:30 │ CAJERO llega a tienda
      │ → Login al sistema
      │ → Abre sesión de caja
      │ → Monto inicial: S/500.00
      │ → Verifica billetes y monedas

08:00 │ Primera venta del día
      │ → Cliente: Consumidor final
      │ → Productos:
      │   - Arroz 5kg x 2 = S/36.00
      │   - Aceite 1L x 1 = S/12.50
      │ → Total: S/48.50
      │ → Pago: Efectivo S/50.00
      │ → Vuelto: S/1.50
      │ → Boleta B001-000500 impresa

09:30 │ Venta con factura
      │ → Cliente empresa: RUC 20456789012
      │ → Productos varios: S/850.00
      │ → Pago: Tarjeta de crédito
      │ → Factura F001-000201 generada
      │ → Enviada a SUNAT ✓

11:00 │ Devolución
      │ → Cliente trae producto (comprado ayer)
      │ → Boleta original: B001-000495
      │ → Producto: Aceite 1L (mal estado)
      │ → Procesa devolución
      │ → Devuelve S/12.50 en efectivo
      │ → NC generada: BC01-000015

13:00 │ Arqueo parcial (almuerzo)
      │ → Efectivo físico: S/1,250.00
      │ → Sistema espera: S/1,250.00
      │ → Diferencia: S/0.00 ✓
      │ → Continúa operando

15:00 │ Venta grande
      │ → Cliente frecuente
      │ → Total: S/2,500.00
      │ → Pago mixto:
      │   - Efectivo: S/1,000.00
      │   - Yape: S/1,500.00
      │ → Factura generada

18:00 │ Cierre de caja
      │ → Arqueo final:
      │   - Efectivo: S/4,850.00
      │   - Tarjetas: S/3,200.00
      │   - Yape/Plin: S/2,100.00
      │ → Sistema esperado:
      │   - Efectivo: S/4,850.00 ✓
      │   - Tarjetas: S/3,200.00 ✓
      │   - Yape/Plin: S/2,100.00 ✓
      │ → Diferencia: S/0.00
      │ → Cierra sesión
      │ → Imprime reporte de cierre
      │ → Entrega efectivo a supervisor
```

---

### Caso 5: Cierre Contable Mensual

**Escenario:** Proceso de cierre de mes.

```
ÚLTIMO DÍA DEL MES
──────────────────
09:00 │ CONTADOR inicia proceso de cierre
      │
      │ PASO 1: Verificar documentos pendientes
      │ → Facturas sin enviar a SUNAT: 0 ✓
      │ → Asientos sin aprobar: 3
      │ → Revisa y aprueba asientos pendientes
      │
10:00 │ PASO 2: Conciliación bancaria
      │ → Importa extractos de todos los bancos
      │ → Concilia movimientos
      │ → Registra comisiones bancarias
      │ → Diferencias: S/0.00 ✓
      │
11:00 │ PASO 3: Provisiones
      │ → Calcula depreciación del mes
      │ → Provisiona CTS
      │ → Provisiona vacaciones
      │ → Genera asientos automáticos
      │
12:00 │ PASO 4: Ajustes de inventario
      │ → Revisa diferencias de inventario
      │ → Registra mermas identificadas
      │ → Ajusta costo de ventas
      │
14:00 │ PASO 5: Verificación de saldos
      │ → CxC vs Libro Mayor: OK ✓
      │ → CxP vs Libro Mayor: OK ✓
      │ → Bancos vs Libro Mayor: OK ✓
      │ → Inventario vs Kardex: OK ✓
      │
15:00 │ PASO 6: Cierre de período
      │ → Ejecuta proceso de cierre
      │ → Sistema calcula resultado del período
      │ → Genera asiento de cierre
      │
16:00 │ PASO 7: Estados financieros
      │ → Genera Balance General
      │ → Genera Estado de Resultados
      │ → Genera Flujo de Efectivo
      │ → Exporta a Excel/PDF
      │
17:00 │ PASO 8: Reportes fiscales
      │ → Genera Registro de Ventas
      │ → Genera Registro de Compras
      │ → Verifica totales de IGV
      │ → Prepara declaración PDT
```

---

## 📊 Resumen de Accesos por Rol

| Módulo | Admin | Supervisor | Vendedor | Cajero | Almacenero | Contador |
|--------|:-----:|:----------:|:--------:|:------:|:----------:|:--------:|
| **VENTAS** |
| Clientes | ✅ | ✅ | ✅ | 👁️ | ❌ | 👁️ |
| Cotizaciones | ✅ | ✅ | ✅ | ❌ | ❌ | 👁️ |
| Pedidos | ✅ | ✅ | ⚡ | ❌ | 👁️ | 👁️ |
| Aprobaciones | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Facturas | ✅ | ✅ | ⚡ | ❌ | ❌ | ✅ |
| RMA | ✅ | ✅ | ⚡ | ❌ | ⚡ | 👁️ |
| **INVENTARIO** |
| Productos | ✅ | ✅ | 👁️ | 👁️ | ✅ | 👁️ |
| Almacenes | ✅ | ✅ | 👁️ | ❌ | ✅ | 👁️ |
| Stock | ✅ | ✅ | 👁️ | 👁️ | ✅ | 👁️ |
| Logística | ✅ | ✅ | 👁️ | ❌ | ✅ | ❌ |
| Kardex | ✅ | ✅ | ❌ | ❌ | 👁️ | ✅ |
| **FINANZAS** |
| CxC | ✅ | ✅ | 👁️ | ❌ | ❌ | ✅ |
| CxP | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Cobros | ✅ | ✅ | ⚡ | ⚡ | ❌ | ✅ |
| Bancos | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **CONTABILIDAD** |
| Asientos | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Plan Cuentas | ✅ | 👁️ | ❌ | ❌ | ❌ | ✅ |
| Reportes | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **COMPRAS** |
| Proveedores | ✅ | ✅ | ❌ | ❌ | 👁️ | 👁️ |
| Órdenes Compra | ✅ | ✅ | ❌ | ❌ | ⚡ | 👁️ |
| Recepciones | ✅ | ✅ | ❌ | ❌ | ✅ | 👁️ |
| **POS** |
| Ventas POS | ✅ | ✅ | ✅ | ✅ | ❌ | 👁️ |
| Cajas | ✅ | ✅ | ❌ | ⚡ | ❌ | 👁️ |
| Turnos | ✅ | ✅ | ❌ | ⚡ | ❌ | 👁️ |
| **CONFIGURACIÓN** |
| Empresa | ✅ | 👁️ | ❌ | ❌ | ❌ | ❌ |
| Usuarios | ✅ | 👁️ | ❌ | ❌ | ❌ | ❌ |
| Roles | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **REPORTES** |
| Dashboard | ✅ | ✅ | 👁️ | 👁️ | 👁️ | ✅ |
| Ventas | ✅ | ✅ | ✅ | 👁️ | ❌ | ✅ |
| Inventario | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Finanzas | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |

**Leyenda:**
- ✅ = Acceso completo (ver, crear, editar, eliminar)
- ⚡ = Acceso parcial (acciones específicas)
- 👁️ = Solo lectura
- ❌ = Sin acceso

---

## 📝 Notas Finales

### Mejores Prácticas
1. **Siempre cerrar sesión** al terminar el día
2. **Realizar arqueos** de caja regularmente
3. **Validar RUC** antes de crear clientes empresa
4. **Revisar stock** antes de confirmar pedidos grandes
5. **Conciliar bancos** semanalmente como mínimo

### Soporte
- Errores del sistema: Contactar al administrador
- Dudas operativas: Consultar con supervisor
- Problemas SUNAT: Contactar al contador

---

*Documento generado: 2025-11-29*
*Versión: 1.0*
*ERP Suite - Sistema de Gestión Empresarial*
