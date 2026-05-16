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
 * Uso (vía Makefile):
 *   make seed-test-customer
 *     → crea test+cliente@example.com / TestCliente2026!
 *
 *   EMAIL=foo@bar.com PASSWORD=Otra123! FIRST=Pepe \
 *     make seed-test-customer
 *     → custom
 *
 * IMPORTANTE:
 *   - Los usuarios creados aquí son SOLO para testing.
 *   - No reciben email de confirmación.
 *   - El password queda printed en la salida del script — visible en
 *     logs locales. No usar este flujo para users productivos.
 */

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");

const SUPABASE_URL = stripQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SECRET_KEY = stripQuotes(process.env.SUPABASE_SECRET_KEY);
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("ERROR: falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY");
  process.exit(1);
}

const email = (process.env.EMAIL ?? "test+cliente@example.com").toLowerCase().trim();
const password = process.env.PASSWORD ?? "TestCliente2026!";
const firstName = process.env.FIRST ?? "Test";
const lastName = process.env.LAST ?? "Cliente";

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
console.log(`Password:  ${password}`);
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
console.log("Listo. Credenciales para test:");
console.log(`  Email:    ${email}`);
console.log(`  Password: ${password}`);
console.log("");
console.log("Probar:");
console.log("  - /login con esas credenciales → debe entrar (es cliente).");
console.log("  - /admin/login con esas credenciales → 'Credenciales incorrectas' (no es admin).");

await prisma.$disconnect();
process.exit(0);
