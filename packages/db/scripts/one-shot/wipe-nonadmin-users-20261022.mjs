#!/usr/bin/env node
/*
 * wipe-nonadmin-users-20261022.mjs — limpieza de usuarios de prueba en DEV
 * (Supabase LOCAL podman) y STG, autorizada por el owner 2026-10-22.
 *
 * Borra «como si nunca hubieran existido» a TODOS los usuarios registrados
 * EXCEPTO el admin (r.julliethhr@gmail.com) y cualquier email con fila en
 * AdminUser (staff — se reportan y se conservan), junto con TODO lo cableado:
 *   DB:      pedidos (ledger Wompi, COD, retractos), carritos, diseños con sus
 *            assets/render-jobs, direcciones, consentimientos, wishlist,
 *            puntos, cupones auto-generados, reseñas, garantías, soporte,
 *            referidos, carritos abandonados, cotizaciones, suscripciones
 *            back-in-stock y los datos de INVITADOS (sessionId/email sin
 *            Customer — residuo anónimo). Todo en UNA transacción.
 *   Auth:    auth.users no conservados (misma transacción; cascada a
 *            identities).
 *   Storage: objetos de customer-uploads / design-previews /
 *            production-assets cuyo primer segmento de path (ownerId /
 *            designId) no pertenezca a los ids conservados.
 *
 * Conserva intacto: catálogo, CMS, plantillas, lettersets, settings, cupones
 * de configuración (customerId null), buckets cms-media / product-images,
 * AdminUser y las cuentas conservadas CON sus datos (pedidos/diseños del
 * admin incluidos).
 *
 * PRD PROHIBIDO EN DURO: solo acepta --env local (.env.local) o --env stg
 * (.env.stg); si la URL clasifica como PRD aborta AUN con
 * LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1. NUNCA apuntar a .env.local.nube-backup
 * (eso ES PRD).
 *
 * DRY-RUN por defecto (conteos por tabla y por bucket, sin escribir nada);
 * APPLY exige --apply (+ LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 para STG, lo
 * evalúa el env-guard estándar).
 *
 * Uso (desde packages/db):
 *   node scripts/one-shot/wipe-nonadmin-users-20261022.mjs --env local
 *   LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 node scripts/one-shot/wipe-nonadmin-users-20261022.mjs --env stg --apply
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { assertDestructiveAllowed, classifyUrl } from "../lib/env-guard.mjs";

const SCRIPT = "wipe-nonadmin-users-20261022";
const ADMIN_EMAIL = "r.julliethhr@gmail.com";
const APPLY = process.argv.includes("--apply");
const envIdx = process.argv.indexOf("--env");
const ENV = envIdx > 0 ? process.argv[envIdx + 1] : null;
if (ENV !== "local" && ENV !== "stg") {
  console.error("✗ exige --env local|stg (PRD está prohibido en este script)");
  process.exit(2);
}

const ENV_FILE = new URL(`../../../../.env${ENV === "stg" ? ".stg" : ".local"}`, import.meta.url)
  .pathname;

// Carga el .env del ambiente SIN pisar vars de shell (mismo criterio dotenv del repo).
for (const raw of readFileSync(ENV_FILE, "utf8").split("\n")) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const idx = line.indexOf("=");
  if (idx < 1) continue;
  const key = line.slice(0, idx).trim();
  // El .env.local del repo usa comentarios inline («valor  # comentario»).
  let value = line.slice(idx + 1).trim();
  const commentIdx = value.indexOf(" #");
  if (commentIdx > 0) value = value.slice(0, commentIdx).trim();
  if (!(key in process.env)) process.env[key] = value;
}

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!DIRECT_URL || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ faltan DIRECT_URL / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY en el env");
  process.exit(2);
}
// Bloqueo DURO de PRD (ni el escape hatch del env-guard lo habilita acá).
if (classifyUrl(DIRECT_URL) === "prd" || classifyUrl(process.env.DATABASE_URL) === "prd") {
  console.error(`✗ ${SCRIPT}: la URL clasifica como PRD — este script NUNCA corre contra PRD.`);
  process.exit(1);
}
if (APPLY) assertDestructiveAllowed(SCRIPT);

const prisma = new PrismaClient({ datasources: { db: { url: DIRECT_URL } } });
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const report = { env: ENV, apply: APPLY, kept: {}, dbDeletes: {}, storage: {} };

async function listAllObjects(bucket, prefix = "") {
  const out = [];
  for (;;) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset: out.length });
    if (error) throw new Error(`storage.list ${bucket}/${prefix}: ${error.message}`);
    if (!data?.length) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) out.push(path);
      else out.push(...(await listAllObjects(bucket, path)));
    }
    if (data.length < 1000) break;
  }
  return out;
}

async function main() {
  console.log(`→ ${SCRIPT} — env=${ENV} ${APPLY ? "⚠ APPLY" : "DRY-RUN"}`);
  console.log(`  DB: ${DIRECT_URL.replace(/:[^:@]*@/, ":***@")}`);
  console.log(`  Supabase: ${SUPABASE_URL}`);

  // ── 1. Conjunto conservado ──────────────────────────────────────────────
  const adminUsers = await prisma.adminUser.findMany({ select: { email: true } });
  const keptEmails = [
    ...new Set([ADMIN_EMAIL, ...adminUsers.map((a) => a.email.toLowerCase())]),
  ];
  console.log(`  Conservados (${keptEmails.length}): ${keptEmails.join(", ")}`);
  report.kept.emails = keptEmails;

  const keptCustomers = await prisma.customer.findMany({
    where: { email: { in: keptEmails } },
    select: { id: true },
  });
  const keptCustomerIds = keptCustomers.map((c) => c.id);
  const keptOrderIds = (
    await prisma.order.findMany({
      where: { OR: [{ customerId: { in: keptCustomerIds } }, { email: { in: keptEmails } }] },
      select: { id: true },
    })
  ).map((o) => o.id);
  const keptDesignIds = (
    await prisma.design.findMany({
      where: { customerId: { in: keptCustomerIds } },
      select: { id: true },
    })
  ).map((d) => d.id);
  const keptCartIds = (
    await prisma.cart.findMany({
      where: { customerId: { in: keptCustomerIds } },
      select: { id: true },
    })
  ).map((c) => c.id);

  const authUsers = await prisma.$queryRaw`SELECT id::text AS id, email FROM auth.users`;
  const keptAuthIds = authUsers
    .filter((u) => u.email && keptEmails.includes(u.email.toLowerCase()))
    .map((u) => u.id);
  report.kept.authUsers = keptAuthIds.length;
  report.kept.customers = keptCustomerIds.length;
  console.log(
    `  Conservado: ${keptAuthIds.length} auth.users · ${keptCustomerIds.length} customers · ${keptOrderIds.length} pedidos · ${keptDesignIds.length} diseños · ${keptCartIds.length} carritos`,
  );

  // ── 2. Plan de borrado (hijos → padres; nulls = invitados, también van) ──
  // OJO: `{customerId: null}` solo es válido si la columna es NULLABLE; para
  // las requeridas (Address, WishlistItem…) Prisma lo rechaza («missing»).
  // Se decide por modelo vía el DMMF del cliente generado.
  const MODEL_OF = {
    wompiPaymentTransaction: "WompiPaymentTransaction",
    wompiPaymentAttempt: "WompiPaymentAttempt",
    codReconciliation: "CodReconciliation",
    retractRequest: "RetractRequest",
    supportTicketMessage: "SupportTicketMessage",
    warrantyClaim: "WarrantyClaim",
    review: "Review",
    couponUsage: "CouponUsage",
    orderItem: "OrderItem",
    quoteItem: "QuoteItem",
    quote: "Quote",
    abandonedCart: "AbandonedCart",
    cartItem: "CartItem",
    order: "Order",
    renderJob: "RenderJob",
    designAsset: "DesignAsset",
    design: "Design",
    cart: "Cart",
    address: "Address",
    consent: "Consent",
    backInStockSubscription: "BackInStockSubscription",
    wishlistItem: "WishlistItem",
    loyaltyTxn: "LoyaltyTxn",
    supportTicket: "SupportTicket",
    coupon: "Coupon",
    referral: "Referral",
    customer: "Customer",
  };
  const customerField = (delegate) => {
    const fields = prisma._runtimeDataModel.models[MODEL_OF[delegate]].fields;
    const f = (Array.isArray(fields) ? fields : Object.values(fields)).find(
      (x) => x.name === "customerId",
    );
    return f ?? null;
  };
  const notKeptCustomerWhere = (delegate) => {
    const f = customerField(delegate);
    if (!f) throw new Error(`modelo ${MODEL_OF[delegate]} sin customerId`);
    const base = { customerId: { notIn: keptCustomerIds } };
    const nullable = f.isNullable === true || f.isRequired === false;
    return nullable ? { OR: [base, { customerId: null }] } : base;
  };
  const plan = [
    ["wompiPaymentTransaction", { attempt: { orderId: { notIn: keptOrderIds } } }],
    ["wompiPaymentAttempt", { orderId: { notIn: keptOrderIds } }],
    ["codReconciliation", { orderId: { notIn: keptOrderIds } }],
    ["retractRequest", { orderItem: { orderId: { notIn: keptOrderIds } } }],
    ["supportTicketMessage", { ticket: notKeptCustomerWhere("supportTicket") }],
    ["warrantyClaim", notKeptCustomerWhere("warrantyClaim")],
    ["review", notKeptCustomerWhere("review")],
    ["couponUsage", notKeptCustomerWhere("couponUsage")],
    ["orderItem", { orderId: { notIn: keptOrderIds } }],
    [
      "quoteItem",
      { quote: { OR: [{ customerEmail: { notIn: keptEmails } }, { customerEmail: null }] } },
    ],
    ["quote", { OR: [{ customerEmail: { notIn: keptEmails } }, { customerEmail: null }] }],
    ["abandonedCart", { email: { notIn: keptEmails } }],
    ["cartItem", { cartId: { notIn: keptCartIds } }],
    ["order", { id: { notIn: keptOrderIds } }],
    ["renderJob", { designId: { notIn: keptDesignIds } }],
    ["designAsset", notKeptCustomerWhere("designAsset")],
    ["design", notKeptCustomerWhere("design")],
    ["cart", notKeptCustomerWhere("cart")],
    ["address", notKeptCustomerWhere("address")],
    ["consent", notKeptCustomerWhere("consent")],
    ["backInStockSubscription", notKeptCustomerWhere("backInStockSubscription")],
    ["wishlistItem", notKeptCustomerWhere("wishlistItem")],
    ["loyaltyTxn", notKeptCustomerWhere("loyaltyTxn")],
    ["supportTicket", notKeptCustomerWhere("supportTicket")],
    [
      "coupon",
      { AND: [{ customerId: { not: null } }, { customerId: { notIn: keptCustomerIds } }] },
    ],
    ["referral", { referrerId: { notIn: keptCustomerIds } }],
    ["customer", { id: { notIn: keptCustomerIds } }],
  ];

  // ── 3. DB ────────────────────────────────────────────────────────────────
  if (!APPLY) {
    console.log("\n  Filas a borrar por tabla:");
    for (const [model, where] of plan) {
      const n = await prisma[model].count({ where });
      report.dbDeletes[model] = n;
      if (n > 0) console.log(`    ${model.padEnd(26)} ${n}`);
    }
    const nAuth = authUsers.length - keptAuthIds.length;
    report.dbDeletes["auth.users"] = nAuth;
    console.log(`    ${"auth.users".padEnd(26)} ${nAuth}`);
  } else {
    console.log("\n  Ejecutando borrado DB en una transacción…");
    await prisma.$transaction(
      async (tx) => {
        for (const [model, where] of plan) {
          const res = await tx[model].deleteMany({ where });
          report.dbDeletes[model] = res.count;
          console.log(`    ${model.padEnd(26)} ${res.count}`);
        }
        // keptAuthIds vacío significaría que el admin no existe en este
        // ambiente: abortar antes de barrer TODA la tabla auth.users.
        if (!keptAuthIds.length) {
          throw new Error("keptAuthIds vacío — ¿existe el admin en este ambiente? Abortando.");
        }
        const nAuth = await tx.$executeRaw`
          DELETE FROM auth.users WHERE NOT (id::text = ANY(${keptAuthIds}::text[]))`;
        report.dbDeletes["auth.users"] = Number(nAuth);
        console.log(`    ${"auth.users".padEnd(26)} ${nAuth}`);
      },
      { timeout: 120_000 },
    );
  }

  // ── 4. Storage (customer-uploads por ownerId; previews/production por designId) ──
  const keptPrefixes = new Set([...keptCustomerIds, ...keptDesignIds, ...keptOrderIds]);
  for (const bucket of ["customer-uploads", "design-previews", "production-assets"]) {
    const objects = await listAllObjects(bucket);
    const doomed = objects.filter((p) => !keptPrefixes.has(p.split("/")[0]));
    report.storage[bucket] = { total: objects.length, delete: doomed.length };
    console.log(`  storage ${bucket}: ${doomed.length}/${objects.length} objetos a borrar`);
    if (APPLY && doomed.length) {
      for (let i = 0; i < doomed.length; i += 100) {
        const batch = doomed.slice(i, i + 100);
        const { error } = await supabase.storage.from(bucket).remove(batch);
        if (error) throw new Error(`storage.remove ${bucket}: ${error.message}`);
      }
      console.log(`    ✓ borrados`);
    }
  }

  console.log(`\n${APPLY ? "✓ APPLY completo" : "✓ DRY-RUN (sin escrituras)"}`);
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((err) => {
    console.error("✗", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
