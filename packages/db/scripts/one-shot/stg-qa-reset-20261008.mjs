/*
 * ONE-SHOT 2026-10-08 — Reset de datos QA en STG (depuración para nuevas pruebas).
 *
 * Origen: diagnóstico de degradación STG 2026-10-08 — el owner pidió depurar
 * clientes registrados, newsletter "y demás" datos de prueba para un ciclo de
 * pruebas limpio, y de paso liberar la cuota de Storage (STG estaba en ~2.1GB
 * sobre el límite Free de 1GB, principalmente por diseños del Estudio).
 *
 * QUÉ BORRA (todo es dato generado por QA/E2E en STG):
 *   1. Bytes de Storage de TODOS los diseños: fotos crudas (customer-uploads),
 *      previews (design-previews) y renders 300-DPI (production-assets,
 *      incl. el área de paso {designId}/_client/).
 *   2. Pedidos de prueba: CodReconciliation → Order (cascadea OrderItem →
 *      RetractRequest/WarrantyClaim; CouponUsage).
 *   3. Cotizaciones: Quote (cascadea QuoteItem).
 *   4. Diseños: DesignAsset → Design (los FK CartItem/OrderItem/QuoteItem ya
 *      murieron arriba; los que queden hacen SetNull).
 *   5. Carritos: Cart (cascadea CartItem y AbandonedCart).
 *   6. Soporte: SupportTicket (cascadea SupportTicketMessage).
 *   7. Suscripciones: BackInStockSubscription, WishlistItem, LoyaltyTxn,
 *      Consent (incluye newsletter — los suscriptores son Consent scope
 *      NEWSLETTER identificados por email), Cupones personales (customerId
 *      NOT NULL — los cupones globales del catálogo se conservan).
 *   8. Customer y sus auth.users (los auth.users de AdminUser NO se tocan —
 *      los admins QA siguen pudiendo entrar al panel).
 *
 * QUÉ CONSERVA (dato del negocio / trail de observabilidad):
 *   catálogo (Category/Product/ProductVariant/Templates/OcasionTag), CMS,
 *   UrlRedirect, Reviews (contenido demo sembrado), AdminUser + sus auth.users,
 *   telemetría (WebVital/ErrorLog/ErrorReport/WebhookEvent/EmailEvent —
 *   es la línea base del diagnóstico), AdminActionLog, AlertState.
 *
 * CONVENCIONES: dry-run por defecto (solo cuenta); --apply ejecuta.
 * Env-guard fail-closed (solo local/STG; PRD bloqueado). Correr con la
 * conexión DIRECTA (lección 2026-10-09 OPERATIONS: scripts de datos contra el
 * pooler se estancan):
 *   cd packages/db && DATABASE_URL="$DIRECT_URL" \
 *     npx dotenv -e ../../.env.stg -- node scripts/one-shot/stg-qa-reset-20261008.mjs
 *   …y con --apply para ejecutar.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { assertDestructiveAllowed } from "../lib/env-guard.mjs";

assertDestructiveAllowed("stg-qa-reset-20261008.mjs");

const APPLY = process.argv.includes("--apply");
const strip = (v) => v?.replace(/^["']|["']$/g, "");

const supabaseUrl = strip(process.env.NEXT_PUBLIC_SUPABASE_URL);
const secretKey = strip(process.env.SUPABASE_SECRET_KEY);
if (!supabaseUrl || !secretKey) {
  console.error("ERROR: faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY en el env");
  process.exit(1);
}

const prisma = new PrismaClient();
const storage = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false },
}).storage;

const PREVIEWS_BUCKET = "design-previews";
const UPLOADS_BUCKET = "customer-uploads";
const PRODUCTION_BUCKET = "production-assets";

/** Extrae el path de una URL pública de previews (misma regla que retention-service). */
function pathFromPublicUrl(url, bucket) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i >= 0) return url.slice(i + marker.length);
  return url.startsWith("http") ? null : url;
}

/** Borra bytes en lotes de 100 (límite cómodo del API). Devuelve { ok, removed }. */
async function removePaths(bucket, paths) {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await storage.from(bucket).remove(batch);
    if (error) {
      console.error(`  ✗ storage ${bucket}: ${error.message}`);
      return { ok: false, removed };
    }
    removed += batch.length;
  }
  return { ok: true, removed };
}

// ── Inventario (dry-run y apply) ─────────────────────────────────────────────
const [designs, counts] = await Promise.all([
  prisma.design.findMany({
    select: {
      id: true,
      previewUrl: true,
      productionUrls: true,
      assets: { select: { storageUrl: true } },
    },
  }),
  Promise.all([
    prisma.order.count(),
    prisma.quote.count(),
    prisma.design.count(),
    prisma.designAsset.count(),
    prisma.cart.count(),
    prisma.supportTicket.count(),
    prisma.backInStockSubscription.count(),
    prisma.wishlistItem.count(),
    prisma.loyaltyTxn.count(),
    prisma.consent.count(),
    prisma.consent.count({ where: { scope: "NEWSLETTER" } }),
    prisma.coupon.count({ where: { customerId: { not: null } } }),
    prisma.customer.count(),
    prisma.codReconciliation.count(),
  ]),
]);

const [
  nOrders, nQuotes, nDesigns, nAssets, nCarts, nTickets, nBackInStock,
  nWishlist, nLoyalty, nConsents, nNewsletter, nPersonalCoupons, nCustomers,
  nCodRec,
] = counts;

// auth.users de clientes (los de AdminUser se preservan SIEMPRE — bugfix
// 2026-10-09: un correo con Customer + AdminUser perdía su auth.user y se
// quedaba sin poder entrar al admin aunque el AdminUser sobreviviera).
const adminAuthIds = new Set(
  (await prisma.adminUser.findMany({ select: { supabaseUserId: true } }))
    .map((a) => a.supabaseUserId)
    .filter(Boolean),
);
const customerAuthIds = (
  await prisma.customer.findMany({ select: { supabaseUserId: true } })
)
  .map((c) => c.supabaseUserId)
  .filter((id) => id && !adminAuthIds.has(id));

const uploadPaths = designs.flatMap((d) => d.assets.map((a) => a.storageUrl)).filter(Boolean);
const previewPaths = designs
  .map((d) => (d.previewUrl ? pathFromPublicUrl(d.previewUrl, PREVIEWS_BUCKET) : null))
  .filter(Boolean);
const productionPaths = designs.flatMap((d) => d.productionUrls).filter(Boolean);

// Área de paso {designId}/_client/ (no persistida en columnas — ADR-081)
const stagedPaths = [];
for (const d of designs) {
  const { data } = await storage.from(PRODUCTION_BUCKET).list(`${d.id}/_client`);
  if (data) for (const f of data) stagedPaths.push(`${d.id}/_client/${f.name}`);
}

console.log(`\n=== INVENTARIO STG (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
console.log(`Orders: ${nOrders} (CodReconciliation: ${nCodRec}) · Quotes: ${nQuotes}`);
console.log(`Designs: ${nDesigns} · DesignAssets: ${nAssets}`);
console.log(`Carts: ${nCarts} · SupportTickets: ${nTickets}`);
console.log(`BackInStock: ${nBackInStock} · Wishlist: ${nWishlist} · LoyaltyTxn: ${nLoyalty}`);
console.log(`Consents: ${nConsents} (newsletter: ${nNewsletter}) · Cupones personales: ${nPersonalCoupons}`);
console.log(`Customers: ${nCustomers} (auth.users a borrar: ${customerAuthIds.length})`);
console.log(`Bytes a liberar: ${UPLOADS_BUCKET}=${uploadPaths.length} obj, ${PREVIEWS_BUCKET}=${previewPaths.length}, ${PRODUCTION_BUCKET}=${productionPaths.length}+${stagedPaths.length} staged`);

if (!APPLY) {
  console.log("\nDRY-RUN. Re-ejecuta con --apply para borrar de verdad.");
  await prisma.$disconnect();
  process.exit(0);
}

// ── 1. Bytes de storage primero (si falla customer-uploads, abortamos ANTES de
//       borrar filas — misma regla que retention-service: nunca bytes sin registro).
console.log("\n[1/3] Storage…");
const up = await removePaths(UPLOADS_BUCKET, uploadPaths);
if (!up.ok) {
  console.error("ABORTO: falló customer-uploads — no borro filas (reintentable en el próximo run).");
  await prisma.$disconnect();
  process.exit(1);
}
const pv = await removePaths(PREVIEWS_BUCKET, previewPaths);
const pr = await removePaths(PRODUCTION_BUCKET, [...productionPaths, ...stagedPaths]);
console.log(`  uploads ${up.removed} · previews ${pv.removed}${pv.ok ? "" : " (parcial)"} · producción ${pr.removed}${pr.ok ? "" : " (parcial)"}`);

// ── 2. Filas en orden FK-seguro ──────────────────────────────────────────────
console.log("[2/3] Filas públicas…");
const del = {};
del.codReconciliation = (await prisma.codReconciliation.deleteMany()).count;
del.order = (await prisma.order.deleteMany()).count;
del.quote = (await prisma.quote.deleteMany()).count;
del.designAsset = (await prisma.designAsset.deleteMany()).count;
del.design = (await prisma.design.deleteMany()).count;
del.cart = (await prisma.cart.deleteMany()).count;
del.supportTicket = (await prisma.supportTicket.deleteMany()).count;
del.backInStock = (await prisma.backInStockSubscription.deleteMany()).count;
del.wishlistItem = (await prisma.wishlistItem.deleteMany()).count;
del.loyaltyTxn = (await prisma.loyaltyTxn.deleteMany()).count;
del.consent = (await prisma.consent.deleteMany()).count;
del.personalCoupons = (await prisma.coupon.deleteMany({ where: { customerId: { not: null } } })).count;
del.customer = (await prisma.customer.deleteMany()).count;
for (const [k, v] of Object.entries(del)) console.log(`  ${k}: ${v}`);

// ── 3. auth.users de los clientes (SQL directo — patrón de seed-clean; los
//       admins quedan intactos porque sus ids no están en la lista).
console.log("[3/3] auth.users de clientes…");
let authDeleted = 0;
if (customerAuthIds.length > 0) {
  authDeleted = await prisma.$executeRaw(
    Prisma.sql`DELETE FROM auth.users WHERE id::text IN (${Prisma.join(customerAuthIds)})`,
  );
}
console.log(`  auth.users borrados: ${authDeleted}`);

console.log("\n✓ Reset QA de STG completo. Catálogo/CMS/admins/telemetría intactos.");
await prisma.$disconnect();
