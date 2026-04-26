# System Architecture & Context

**Date:** 2025-12-13  
**Scope:** ERP Suite Monorepo

## 1. System Overview

The ERP Suite is a multi-tenant application composed of three main applications and a shared database infrastructure.

### Components
*   **`apps/erp-api`**: Backend (NestJS). Handles business logic, EventBus, Outbox pattern, and Supabase integration.
*   **`apps/web`**: Frontend (Next.js). User interface for all modules (Ventas, Compras, Admin, Finanzas).
*   **`apps/worker`**: Background processing (Jobs). Handles fiscal retry queues, scheduled tasks, and asynchronous jobs using BullMQ.
*   **`supabase/migrations`**: Database Schema (PostgreSQL). Contains tables, RLS policies, RPCs, views, and indexes.

### Multi-tenancy & Isolation
*   **Strategy**: Row Level Security (RLS) on PostgreSQL.
*   **Context**: 
    *   `app.current_tenant_id()` / `app.current_tenant_id_safe()`: Session variables set by RPC or headers.
    *   `x-tenant-id` header: Propagated from frontend/API to database context.
*   **Critical Risk**: Isolatation depends on correct setting of these variables. See `PROJECT_STATUS.md` for known issues regarding `app.set_tenant_context`.

## 2. Core Patterns

### 2.1 Outbox Pattern
Reliable event emission for distributed consistency.
*   **Tables**: `outbox_events`
*   **Flow**: Transactional Insert (`PENDING`) -> Worker Process -> Update Status (`PROCESSED` or `AWAITING_RETRY`) -> Side Effects (Emails, Integrations).
*   **Idempotency**: 
    *   Events must have a unique `idempotency_key` (e.g., `cpe.send:{tenant}:{id}`).
    *   Consumers must handle duplicate delivery.

### 2.2 Fiscal Integration (Sunat/OSE)
*   **Modules**: CPE, GRE, SIRE.
*   **Retry Logic**: Centralized retry mechanism with exponential backoff and anti-race condition guards ("in-flight" checks).

## 3. Directory Structure
*   `apps/` - Application source code.
*   `docs/` - Documentation (consolidated in `docs/manuals/`).
*   `supabase/` - Database migrations and verification scripts.
*   `audit_reports/` - Evidence of audits and execution logs.
*   `dist/` - Compiled output (ignored).

## 4. Agents & AI Context
*   See `ACTION.md` (root) for AI instructions.
