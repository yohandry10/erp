# Database Reference

**Schema:** Public (PostgreSQL)  
**Provider:** Supabase

> [!NOTE]
> This document consolidates table definitions from `TABLES.md`, `tables_cajas_pos.md`, and `tables_sire_gre_cpe.md`.
> RLS Policy documentation was missing at time of consolidation. Refer to `supabase/migrations/` for source of truth.

## 1. General Tables

### `empresa_config`
Configuration per tenant.
*   `tenant_id`: UUID (FK)
*   `configuracion_completa`: Boolean
*   `umbral_gre_automatico`: Decimal
*   `gre_automatico_habilitado`: Boolean

### `plan_cuentas`
Chart of accounts for accounting.
*   `codigo`, `nombre`, `tipo`, `subtipo`
*   `cuenta_padre_id`: Hierarchical relationship

### `productos`
Inventory items.
*   `stock_actual`: **Source of Truth** for inventory levels.
*   `stock_reservado`: Items reserved by orders.
*   `precio_venta`, `costo_promedio`.

## 2. POS & Cajas (`pos` / `caja`)

### `cajas`
Physical or logical cash registers.
*   `sucursal_id`, `almacen_id`.
*   `monto_inicial`, `estado`.

### `sesiones_caja`
Daily sessions (Shift).
*   `fecha_apertura`, `fecha_cierre`.
*   `total_ventas`, `total_efectivo`, `diferencia`.

### `ventas_pos`
Point of Sale transactions.
*   `numero_venta`, `total`, `estado`.
*   `cpe_pendiente`: Boolean (Needs fiscal emission).

## 3. Fiscal Tables (CPE / GRE)

### `cpe` (Comprobantes de Pago Electrónico)
*   `sunat_status`: `NOT_SENT`, `SENDING`, `ACCEPTED`, `REJECTED`, `ERROR`.
*   `xml_content`, `cdr_content`.
*   `idempotency_key`: For deduplication.

### `documentos`
Core fiscal documents (Facturas, Boletas).
*   `serie`, `numero`.
*   `cliente_id`, `items` (JSONB or relation).

## 4. Outbox

### `outbox_events`
*   `event_type`: string (e.g. `venta.registrada`)
*   `payload`: JSONB
*   `status`: `PENDING`, `PROCESSED`, `FAILED`, `DEAD_LETTER`
*   `idempotency_key`: Unique constraint target.
