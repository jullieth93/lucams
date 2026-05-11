/*
 * Script de seed para crear un AdminUser de testing.
 *
 * Estrategia:
 *   Si EMAIL=x@y.com está dado, busca el user en auth.users por email.
 *   Si no, toma el primero de auth.users (o falla si no hay).
 *   Crea fila en AdminUser con role=SUPERADMIN, isActive=true,
 *   supabaseUserId apuntando al user encontrado.
 *
 * Por qué reusar el auth.user existente en lugar de crear uno nuevo:
 *   - Resend sandbox solo permite mandar email a la cuenta de Resend.
 *     Crear un user nuevo con email diferente no se podría confirmar.
 *   - Para testing rápido, ser admin Y cliente al mismo tiempo está
 *     bien — son dos roles distintos.
 *
 * Uso (vía Makefile):
 *   make seed-admin                     toma el primer user
 *   EMAIL=r.julliethhr@gmail.com make seed-admin   user específico
 *   ROLE=MANAGER make seed-admin         role distinto a SUPERADMIN
 *
 * Idempotente: si ya hay AdminUser para ese supabaseUserId, no falla
 * — solo informa y deja la fila intacta.
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");

process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

const desiredEmail = process.env.EMAIL?.toLowerCase().trim();
const desiredRole = process.env.ROLE ?? "SUPERADMIN";

if (!["SUPERADMIN", "MANAGER", "FULFILLMENT"].includes(desiredRole)) {
  console.error(`ROLE inválido: ${desiredRole}. Use SUPERADMIN | MANAGER | FULFILLMENT.`);
  process.exit(1);
}

let users;
if (desiredEmail) {
  users = await prisma.$queryRaw`
    SELECT id, email FROM auth.users WHERE email = ${desiredEmail}
  `;
} else {
  users = await prisma.$queryRaw`
    SELECT id, email FROM auth.users ORDER BY created_at ASC LIMIT 1
  `;
}

if (users.length === 0) {
  console.error(
    desiredEmail
      ? `No existe auth.user con email ${desiredEmail}. Primero registrate como cliente desde /registro, después corré este script.`
      : "auth.users está vacía. Primero registrate como cliente desde /registro.",
  );
  await prisma.$disconnect();
  process.exit(1);
}

const target = users[0];
console.log(`Target auth.user: ${target.email}  (${target.id})`);

const existing = await prisma.adminUser.findFirst({
  where: { supabaseUserId: target.id },
});

if (existing) {
  if (existing.deletedAt) {
    console.log("AdminUser existe pero está soft-deleted. Reactivando...");
    await prisma.adminUser.update({
      where: { id: existing.id },
      data: { deletedAt: null, isActive: true, role: desiredRole },
    });
    console.log(`✓ Reactivado: ${existing.email} (${desiredRole})`);
  } else if (!existing.isActive) {
    console.log("AdminUser existe pero está inactivo. Activando...");
    await prisma.adminUser.update({
      where: { id: existing.id },
      data: { isActive: true, role: desiredRole },
    });
    console.log(`✓ Activado: ${existing.email} (${desiredRole})`);
  } else if (existing.role !== desiredRole) {
    console.log(`AdminUser ya existe con role ${existing.role}. Actualizando a ${desiredRole}...`);
    await prisma.adminUser.update({
      where: { id: existing.id },
      data: { role: desiredRole },
    });
    console.log(`✓ Actualizado: ${existing.email} (${desiredRole})`);
  } else {
    console.log(`✓ AdminUser ya existe y está activo: ${existing.email} (${existing.role})`);
  }
} else {
  const created = await prisma.adminUser.create({
    data: {
      email: target.email,
      supabaseUserId: target.id,
      role: desiredRole,
      isActive: true,
    },
  });
  console.log(`✓ AdminUser creado: ${created.email} (${created.role})`);
}

console.log("");
console.log("Listo. Login en /admin/login con el mismo email + password que ya usás como cliente.");

await prisma.$disconnect();
process.exit(0);
