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
 * N-06 (2026-09-12) — endurecimiento:
 *   - DRY-RUN por defecto; `--apply` ejecuta.
 *   - Env-guard fail-closed (bloquea PRD/remotos no reconocidos).
 *   - En --apply exige CONFIRMACIÓN INTERACTIVA del destino (imprime la
 *     clasificación del env-guard y hay que teclear el host exacto): crear
 *     o reactivar un SUPERADMIN donde no corresponde es un incidente de
 *     seguridad (lib/confirm-target.mjs).
 *
 * Uso (vía Makefile — el target pasa --apply):
 *   make seed-admin                     toma el primer user
 *   EMAIL=r.julliethhr@gmail.com make seed-admin   user específico
 *   ROLE=MANAGER make seed-admin         role distinto a SUPERADMIN
 * Directo:
 *   node scripts/seed-admin.mjs            # DRY-RUN (qué haría y contra qué destino)
 *   node scripts/seed-admin.mjs --apply    # aplica (pide confirmación)
 *
 * Idempotente: si ya hay AdminUser para ese supabaseUserId, no falla
 * — solo informa y deja la fila intacta (salvo reactivación/cambio de role,
 * que también queda cubierto por la confirmación).
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";
import { confirmTargetInteractive } from "./lib/confirm-target.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");

process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

// Guarda de ambiente: crea/reactiva SUPERADMIN — bloquea PRD/remotos no STG.
assertDestructiveAllowed("seed-admin.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const desiredEmail = process.env.EMAIL?.toLowerCase().trim();
const desiredRole = process.env.ROLE ?? "SUPERADMIN";

if (!["SUPERADMIN", "MANAGER", "FULFILLMENT", "CMS_EDITOR"].includes(desiredRole)) {
  console.error(
    `ROLE inválido: ${desiredRole}. Use SUPERADMIN | MANAGER | FULFILLMENT | CMS_EDITOR.`,
  );
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
      ? `No existe auth.user con email ${desiredEmail}. Primero regístrate como cliente desde /registro, después corre este script.`
      : "auth.users está vacía. Primero regístrate como cliente desde /registro.",
  );
  await prisma.$disconnect();
  process.exit(1);
}

const target = users[0];
console.log(`Target auth.user: ${target.email}  (${target.id})`);

const existing = await prisma.adminUser.findFirst({
  where: { supabaseUserId: target.id },
});

// Plan (qué haría) — se imprime siempre; las escrituras solo en --apply.
let action;
if (existing) {
  if (existing.deletedAt) {
    action = {
      kind: "reactivate",
      label: `Reactivar AdminUser soft-deleted ${existing.email} con role ${desiredRole}`,
      run: () =>
        prisma.adminUser.update({
          where: { id: existing.id },
          data: { deletedAt: null, isActive: true, role: desiredRole },
        }),
    };
  } else if (!existing.isActive) {
    action = {
      kind: "activate",
      label: `Activar AdminUser inactivo ${existing.email} con role ${desiredRole}`,
      run: () =>
        prisma.adminUser.update({
          where: { id: existing.id },
          data: { isActive: true, role: desiredRole },
        }),
    };
  } else if (existing.role !== desiredRole) {
    action = {
      kind: "role",
      label: `Cambiar role de ${existing.email}: ${existing.role} → ${desiredRole}`,
      run: () =>
        prisma.adminUser.update({
          where: { id: existing.id },
          data: { role: desiredRole },
        }),
    };
  } else {
    action = null;
    console.log(`✓ AdminUser ya existe y está activo: ${existing.email} (${existing.role})`);
  }
} else {
  action = {
    kind: "create",
    label: `Crear AdminUser ${target.email} con role ${desiredRole}`,
    run: () =>
      prisma.adminUser.create({
        data: {
          email: target.email,
          supabaseUserId: target.id,
          role: desiredRole,
          isActive: true,
        },
      }),
  };
}

if (action) {
  console.log(`Acción pendiente: ${action.label}`);
  if (!APPLY) {
    console.log("\nDRY-RUN (sin cambios). Para ejecutar: node scripts/seed-admin.mjs --apply");
  } else {
    // Confirmación humana del destino (crear/reactivar admin es break-glass).
    await confirmTargetInteractive("seed-admin.mjs", action.label);
    const result = await action.run();
    console.log(`✓ ${action.label} — listo (${result.email}).`);
  }
}

console.log("");
console.log("Listo. Login en /admin/login con el mismo email + password que ya usas como cliente.");

await prisma.$disconnect();
process.exit(0);
