/*
 * Script de seed para crear un Customer de testing.
 *
 * Crea auth.user + Customer en una pasada, SIN pasar por confirmación
 * de email (`email_confirm: true` en supabase.auth.admin.createUser).
 * Eso bypasea la restricción del sandbox de Resend (que solo permite
 * enviar email a la cuenta de Resend) — ideal para crear usuarios
 * dummy de testing.
 *
 * El user creado es SOLO Customer, NO AdminUser. Sirve para probar
 * que /admin/* rechaza correctamente a clientes no-admin.
 *
 * Uso (con el entorno cargado vía dotenv-cli, desde packages/db):
 *   PASSWORD=Test123! npx dotenv -e ../../.env.local -- node scripts/seed-test-customer.mjs
 *     → crea test+cliente@example.com con ese password
 *
 *   EMAIL=foo@bar.com PASSWORD=Otra123! FIRST=Pepe LAST=Pérez \
 *     npx dotenv -e ../../.env.local -- node scripts/seed-test-customer.mjs
 *     → custom
 *
 * IMPORTANTE (auditoría 2026-08-24, hallazgo G-6):
 *   - PASSWORD es OBLIGATORIO: ya no hay default en el repo y NUNCA se
 *     imprime en la salida.
 *   - Guarda de ambiente: se niega a correr si DATABASE_URL/DIRECT_URL o
 *     NEXT_PUBLIC_SUPABASE_URL apuntan a PRD (ver lib/env-guard.mjs).
 *   - Los usuarios creados aquí son SOLO para testing.
 *   - No reciben email de confirmación.
 */

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");

const SUPABASE_URL = stripQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SECRET_KEY = stripQuotes(process.env.SUPABASE_SECRET_KEY);
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("ERROR: falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY");
  process.exit(1);
}

// Guardas de ambiente (G-6): este script crea un auth.user con
// email_confirm=true — jamás contra PRD. env-guard cubre DATABASE_URL y
// DIRECT_URL; la URL pública de Supabase se chequea aparte por el ref del
// proyecto de PRD (fuente de verdad del ref: scripts/lib/env-guard.mjs).
assertDestructiveAllowed("seed-test-customer.mjs");
if (SUPABASE_URL.includes("zxkucphbsfygakgxcnik")) {
  console.error(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL apunta a PRD — prohibido sembrar usuarios de test en producción.",
  );
  process.exit(1);
}

const email = (process.env.EMAIL ?? "test+cliente@example.com").toLowerCase().trim();
// Sin default (G-6): el password llega SIEMPRE por entorno y nunca se imprime.
const password = process.env.PASSWORD;
const firstName = process.env.FIRST ?? "Test";
const lastName = process.env.LAST ?? "Cliente";

if (!password) {
  console.error(
    "ERROR: PASSWORD es obligatorio (ya no hay default en el repo). " +
      "Ej: PASSWORD=Test123! npx dotenv -e ../../.env.local -- node scripts/seed-test-customer.mjs",
  );
  process.exit(1);
}

if (password.length < 8) {
  console.error("PASSWORD debe tener al menos 8 caracteres.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const prisma = new PrismaClient();

console.log("=== seed-test-customer ===");
console.log(`Email:     ${email}`);
console.log("Password:  (el de PASSWORD — no se imprime)");
console.log(`Nombre:    ${firstName} ${lastName}`);
console.log("");

// Paso 1: crear auth.user con email_confirm=true (sin email send).
const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { source: "seed-test-customer" },
});

if (createErr) {
  if (createErr.message?.includes("already been registered")) {
    console.log(`auth.user con email ${email} ya existe — saltando create.`);
  } else {
    console.error("ERROR creando auth.user:", createErr.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Obtener el user (lo recién creado o el existente).
const { data: listed } = await supabase.auth.admin.listUsers();
const user = listed.users.find((u) => u.email === email);
if (!user) {
  console.error(`ERROR: no encontré el user ${email} tras intentar crearlo.`);
  await prisma.$disconnect();
  process.exit(1);
}
console.log(`auth.user.id: ${user.id}`);

// Paso 2: crear Customer si no existe.
const existing = await prisma.customer.findUnique({
  where: { supabaseUserId: user.id },
});

if (existing) {
  console.log(`Customer ya existe (referral ${existing.referralCode}).`);
} else {
  const created = await prisma.customer.create({
    data: {
      email,
      firstName,
      lastName,
      supabaseUserId: user.id,
      referralCode: `LCS-${randomBytes(4).toString("hex").toUpperCase()}`,
    },
  });
  console.log(`✓ Customer creado (${created.referralCode}).`);
}

console.log("");
console.log(`Listo. Login de prueba con ${email} y el password que pasaste por PASSWORD.`);
console.log("");
console.log("Probar:");
console.log("  - /login con esas credenciales → debe entrar (es cliente).");
console.log("  - /admin/login con esas credenciales → 'Credenciales incorrectas' (no es admin).");

await prisma.$disconnect();
process.exit(0);
