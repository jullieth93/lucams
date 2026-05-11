/*
 * Script de reset de testing — borra todos los users de Supabase Auth +
 * Customer + AdminUser.
 *
 * Por qué SQL directo en lugar de supabase.auth.admin.deleteUser:
 *   El SDK admin.deleteUser tira 'unexpected_failure 500' incluso con
 *   el trigger sync_auth_users_delete funcionando bien — parece ser un
 *   bug/configuración interna de Supabase con custom triggers en
 *   auth.users. El DELETE directo en auth.users SÍ funciona y dispara
 *   correctamente el trigger (verificado: Customer count 1→0 al borrar
 *   user que sí tenía Customer asociado).
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

const prisma = new PrismaClient();

const users =
  await prisma.$queryRaw`SELECT id, email FROM auth.users ORDER BY created_at ASC`;

if (users.length === 0) {
  console.log("auth.users ya está vacía. Nada que borrar.");
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

console.log(
  `Customers antes: ${customersBefore}, AdminUsers antes: ${adminsBefore}`,
);
console.log("Borrando todos los auth.users (cascade vía trigger)...");

const deleted = await prisma.$executeRaw`DELETE FROM auth.users`;
console.log(`  → ${deleted} rows borradas de auth.users`);

const customersAfter = await prisma.customer.count();
const adminsAfter = await prisma.adminUser.count();

console.log();
console.log(
  `Resultado: Customers ${customersBefore} → ${customersAfter}, ` +
    `AdminUsers ${adminsBefore} → ${adminsAfter}`,
);

if (customersAfter === 0 && adminsAfter === 0) {
  console.log("✓ Todo limpio.");
} else {
  console.log(
    "⚠ Quedan filas huérfanas. El trigger pudo no haber disparado en todos los casos.",
  );
}

await prisma.$disconnect();
process.exit(0);
