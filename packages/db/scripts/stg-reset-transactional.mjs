/*
 * stg-reset-transactional.mjs — Reset TRANSACCIONAL del ambiente de staging/local
 * (2026-11-05, a petición de la operadora: "limpiar todos los registros para pruebas
 * nuevas; lo único que no se elimina es el superadmin").
 *
 * BORRA (datos de negocio de prueba):
 *   pedidos (con items, eventos de estado, eventos de guía, pagos Wompi, COD,
 *   retractos, garantías), cotizaciones, carritos y abandonados, clientes
 *   (Customer + sus auth.users), Contact y todo su grafo (identidades, candidatos
 *   de fusión, actividades, tareas, oportunidades, organizaciones), soporte,
 *   consentimientos, fidelización, referidos, reseñas, direcciones, wishlist,
 *   alertas de stock, diseños y assets del Estudio, render jobs, y bitácoras de
 *   prueba (EmailEvent, WebhookEvent, Notification, AdminActionLog, ErrorLog,
 *   ErrorReport, SecurityEvent, WebVital, FunnelEventDaily, InventoryLog,
 *   AlertState).
 *
 * PRESERVA (configuración y catálogo — lo que NO es dato de prueba):
 *   catálogo completo (Product, ProductVariant, Category, OcasionTag, WholesaleTier,
 *   Material/ProductMaterial, PersonalizationTemplate, DesignGalleryImage,
 *   LetterTileSet/LetterTile, BlogPost, UrlRedirect), CMS v2 completo
 *   (CmsPage/Section/Field/Version, CmsListItem, CmsMedia), EmailTemplateOverride,
 *   BlockedIdentity (anti-fraude), Coupon (config comercial; CouponUsage se borra)
 *   y el/los AdminUser SUPERADMIN con su auth.users (sin ellos nadie entra al admin).
 *
 * Seguridad:
 *   - env-guard fail-closed: solo corre donde la guarda lo permite (LOCAL/STG).
 *   - Dry-run por defecto (solo conteos); --apply ejecuta dentro de UNA transacción.
 *
 * Uso:
 *   cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/stg-reset-transactional.mjs
 *   cd packages/db && npx dotenv -e ../../.env.stg -- node scripts/stg-reset-transactional.mjs --apply
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const apply = process.argv.includes("--apply");
if (apply) {
  assertDestructiveAllowed("stg-reset-transactional.mjs --apply");
}

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

/** Orden importa (hijos antes que padres). [delegate, label] */
const DELETE_PLAN = [
  ["shipmentEvent", "ShipmentEvent"],
  ["orderStatusEvent", "OrderStatusEvent"],
  ["orderItem", "OrderItem"],
  ["codReconciliation", "CodReconciliation"],
  ["wompiPaymentAttempt", "WompiPaymentAttempt"],
  ["wompiPaymentTransaction", "WompiPaymentTransaction"],
  ["retractRequest", "RetractRequest"],
  ["warrantyClaim", "WarrantyClaim"],
  ["order", "Order"],
  ["quoteItem", "QuoteItem"],
  ["quote", "Quote"],
  ["cartItem", "CartItem"],
  ["abandonedCart", "AbandonedCart"],
  ["cart", "Cart"],
  ["supportTicketMessage", "SupportTicketMessage"],
  ["supportTicket", "SupportTicket"],
  ["contactActivity", "ContactActivity"],
  ["task", "Task"],
  ["identityMergeCandidate", "IdentityMergeCandidate"],
  ["contactIdentity", "ContactIdentity"],
  ["opportunity", "Opportunity"],
  ["consent", "Consent"],
  ["loyaltyTxn", "LoyaltyTxn"],
  ["couponUsage", "CouponUsage"],
  ["referral", "Referral"],
  ["review", "Review"],
  ["address", "Address"],
  ["wishlistItem", "WishlistItem"],
  ["backInStockSubscription", "BackInStockSubscription"],
  ["renderJob", "RenderJob"],
  ["designAsset", "DesignAsset"],
  ["design", "Design"],
  ["customer", "Customer"],
  ["contact", "Contact"],
  ["organization", "Organization"],
  ["emailEvent", "EmailEvent"],
  ["webhookEvent", "WebhookEvent"],
  ["notification", "Notification"],
  ["adminActionLog", "AdminActionLog"],
  ["errorLog", "ErrorLog"],
  ["errorReport", "ErrorReport"],
  ["securityEvent", "SecurityEvent"],
  ["webVital", "WebVital"],
  ["funnelEventDaily", "FunnelEventDaily"],
  ["inventoryLog", "InventoryLog"],
  ["alertState", "AlertState"],
];

try {
  // Superadmines a preservar (sus auth.users también sobreviven).
  const superAdmins = await prisma.adminUser.findMany({
    where: { role: "SUPERADMIN", deletedAt: null },
    select: { id: true, email: true, supabaseUserId: true },
  });
  if (superAdmins.length === 0) {
    throw new Error("No hay AdminUser SUPERADMIN activo — abortando (sin él nadie entra al admin).");
  }
  const keepAuthIds = superAdmins.map((a) => a.supabaseUserId).filter(Boolean);
  console.log(
    `  Superadmin preservado: ${superAdmins.map((a) => a.email).join(", ") || "(sin email)"}`,
  );

  console.log(`\n  Conteos ANTES del reset${apply ? "" : " (DRY-RUN — nada se borra)"}:`);
  const counts = [];
  for (const [delegate, label] of DELETE_PLAN) {
    const n = await prisma[delegate].count();
    counts.push([label, n]);
    if (n > 0) console.log(`    ${label}: ${n}`);
  }
  const nonSuperAdmins = await prisma.adminUser.count({
    where: { NOT: { role: "SUPERADMIN" }, deletedAt: null },
  });
  const authUsers = await prisma.$queryRaw`
    SELECT count(*)::int AS n FROM auth.users
  `;
  const authToDelete = await prisma.$queryRaw`
    SELECT count(*)::int AS n FROM auth.users
    WHERE NOT ("id"::text = ANY(${keepAuthIds}))
  `;
  console.log(`    AdminUser no-SUPERADMIN: ${nonSuperAdmins}`);
  console.log(`    auth.users: ${authUsers[0].n} (se borrarían ${authToDelete[0].n}, se conservan ${keepAuthIds.length})`);

  if (!apply) {
    console.log("\n  DRY-RUN completo. Re-ejecuta con --apply para borrar de verdad.\n");
    process.exitCode = 0;
  } else {
    await prisma.$transaction(
      async (tx) => {
        for (const [delegate, label] of DELETE_PLAN) {
          const res = await tx[delegate].deleteMany({});
          if (res.count > 0) console.log(`    ✓ ${label}: ${res.count} borrados`);
        }
        // AdminUser no-SUPERADMIN (soft-delete duro: es STG/local de pruebas).
        const admins = await tx.adminUser.deleteMany({
          where: { NOT: { role: "SUPERADMIN" } },
        });
        if (admins.count > 0)
          console.log(`    ✓ AdminUser no-SUPERADMIN: ${admins.count} borrados`);
        // auth.users de clientes/staff borrados (los del superadmin se conservan).
        // Customer/AdminUser ya no apuntan a ellos (ver seed-clean.mjs: la Auth API HTTP
        // rompe con triggers custom en auth.users — por eso el borrado es SQL directo).
        const authDeleted = await tx.$executeRaw`
        DELETE FROM auth.users
        WHERE NOT ("id"::text = ANY(${keepAuthIds}))
      `;
        console.log(`    ✓ auth.users: ${authDeleted} borrados (superadmin intacto)`);
      },
      // WAN (STG cloud): la tx interactiva por defecto expira a los 5 s y revienta con
      // P2028 a mitad del barrido (WebVital tenía 17k filas). 10 min de margen.
      { timeout: 600_000, maxWait: 30_000 },
    );

    const remaining = await prisma.order.count();
    console.log(`\n  ✓ RESET TRANSACCIONAL COMPLETO. Orders restantes: ${remaining}\n`);
    if (remaining !== 0) process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
