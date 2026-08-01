/*
 * Script de reset de testing — borra Customer + AdminUser + auth.users.
 *
 * Por qué borramos manualmente Customer + AdminUser en lugar de
 * dejar que un trigger lo haga al borrar auth.users:
 *   Originalmente intentamos un trigger SQL (migración 00000000000004),
 *   pero la Supabase Auth API HTTP rompe con error 500 cuando hay
 *   cualquier custom trigger en auth.users. Ver explicación detallada
 *   en supabase/migrations/00000000000004_sync_auth_users_delete.sql.
 *
 * Orden de borrado (importante por FKs):
 *   1. Customer + AdminUser primero — desligamos las filas que
 *      apuntan a auth.users.id via supabaseUserId.
 *   2. auth.users — el delete principal. Como ya no hay rows en
 *      Customer/AdminUser que apunten allá, no hay drama.
 *
 *   Las cascadas internas de Prisma (Address/Order/Review/Loyalty FKs
 *   sobre Customer) corren al borrar el Customer per schema.prisma:
 *     - Address (Cascade): se borran
 *     - Order (SetNull): preservados con customerId NULL
 *     - Review (SetNull): preservadas
 *     - LoyaltyTxn (SetNull): preservadas
 *
 * Uso (vía Makefile):
 *   make seed-clean             dry-run (sólo lista)
 *   FORCE=1 make seed-clean     ejecuta el borrado real
 *
 * Variables de entorno requeridas (cargadas por dotenv-cli desde
 * .env.local del root):
 *   - DATABASE_URL (Prisma conexión)
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");

if (!stripQuotes(process.env.DATABASE_URL)) {
  console.error("ERROR: falta DATABASE_URL en .env.local");
  process.exit(1);
}

// Strip quotes en runtime si dotenv-cli no las quitó (passthrough vía Makefile).
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
if (process.env.DIRECT_URL) {
  process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);
}

// Guarda de ambiente: este script BORRA usuarios en masa — bloquea PRD/remotos no STG.
assertDestructiveAllowed("seed-clean.mjs");

const prisma = new PrismaClient();

const users = await prisma.$queryRaw`SELECT id, email FROM auth.users ORDER BY created_at ASC`;

if (users.length === 0) {
  // Aún así verificamos huérfanos en Customer/AdminUser
  const customers = await prisma.customer.count();
  const admins = await prisma.adminUser.count();
  if (customers === 0 && admins === 0) {
    console.log("auth.users + Customer + AdminUser ya están vacías.");
    await prisma.$disconnect();
    process.exit(0);
  }
  console.log(`auth.users vacía pero hay huérfanos: ${customers} Customer, ${admins} AdminUser.`);
  if (process.env.FORCE !== "1") {
    console.log("DRY-RUN. FORCE=1 para borrar los huérfanos.");
    await prisma.$disconnect();
    process.exit(0);
  }
  await prisma.customer.deleteMany();
  await prisma.adminUser.deleteMany();
  console.log("Huérfanos limpiados.");
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`Encontrados ${users.length} user(s) en auth.users:`);
for (const u of users) {
  console.log(`  - ${u.email}  (${u.id})`);
}
console.log();

if (process.env.FORCE !== "1") {
  console.log("DRY-RUN. Re-ejecuta con FORCE=1 para borrar de verdad:");
  console.log("  FORCE=1 make seed-clean");
  await prisma.$disconnect();
  process.exit(0);
}

const customersBefore = await prisma.customer.count();
const adminsBefore = await prisma.adminUser.count();

console.log(`Customers antes: ${customersBefore}, AdminUsers antes: ${adminsBefore}`);
console.log("Borrando...");

// 1. Customer + AdminUser primero (cascade Prisma maneja relaciones)
const cDeleted = await prisma.customer.deleteMany();
const aDeleted = await prisma.adminUser.deleteMany();
console.log(`  → ${cDeleted.count} Customer + ${aDeleted.count} AdminUser`);

// 2. auth.users (SQL directo — la Supabase Auth API SDK falla con triggers)
const uDeleted = await prisma.$executeRaw`DELETE FROM auth.users`;
console.log(`  → ${uDeleted} auth.users`);

const customersAfter = await prisma.customer.count();
const adminsAfter = await prisma.adminUser.count();
const usersAfter = await prisma.$queryRaw`SELECT count(*)::int as c FROM auth.users`;

console.log();
console.log(
  `Resultado: auth.users ${users.length} → ${usersAfter[0].c}, ` +
    `Customers ${customersBefore} → ${customersAfter}, ` +
    `AdminUsers ${adminsBefore} → ${adminsAfter}`,
);

if (customersAfter === 0 && adminsAfter === 0 && usersAfter[0].c === 0) {
  console.log("✓ Todo limpio.");
} else {
  console.log("⚠ Algo no quedó limpio. Revisa manualmente.");
}

await prisma.$disconnect();
process.exit(0);
