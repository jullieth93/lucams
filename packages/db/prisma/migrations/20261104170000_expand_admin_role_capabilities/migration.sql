-- S17 (Fase 8): Perfiles administrativos granulares para RBAC por capacidades
-- y principio de mínimo privilegio sobre PII.
-- Aditivo e idempotente sobre AdminRole; conserva MANAGER y FULFILLMENT para
-- compatibilidad total con sesiones y cuentas existentes.

ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'OPERATIONS_MANAGER';
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'CUSTOMER_SUPPORT';
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'PRINT_WORKSHOP';
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'FINANCE_ANALYST';
