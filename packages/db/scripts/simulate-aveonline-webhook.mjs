/*
 * Simula un webhook Aveonline con estado ENTREGADA.
 *
 * Uso:
 *   set -a && source .env.local && set +a
 *   node packages/db/scripts/simulate-aveonline-webhook.mjs <TRACKING_NUMBER> [ESTADO]
 *
 * Ejemplos:
 *   simulate-aveonline-webhook.mjs TEST-LCM-2026-0001-911064            # ENTREGADA
 *   simulate-aveonline-webhook.mjs TEST-LCM-2026-0001-911064 EN_TRANSITO
 */

import { PrismaClient } from "@prisma/client";

const tracking = process.argv[2];
const estadoArg = process.argv[3] ?? "ENTREGADA";
if (!tracking) {
  console.error("Uso: node simulate-aveonline-webhook.mjs <TRACKING_NUMBER> [ESTADO]");
  process.exit(1);
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "http://localhost:4000";
const secret = process.env.AVEONLINE_WEBHOOK_SECRET?.trim();
const webhookUrl = `${siteUrl}/api/webhooks/aveonline${secret ? `?secret=${encodeURIComponent(secret)}` : ""}`;

const prisma = new PrismaClient();

// Verificar Order antes
const orderBefore = await prisma.order.findFirst({
  where: { trackingNumber: tracking, deletedAt: null },
  select: { id: true, number: true, status: true, trackingNumber: true },
});
console.log("=== Order ANTES ===");
console.log(JSON.stringify(orderBefore, null, 2));

if (!orderBefore) {
  console.error(`\nNo encontré Order con trackingNumber=${tracking}`);
  await prisma.$disconnect();
  process.exit(1);
}

// Payload shape "plugin legacy" que Aveonline envía.
const payload = {
  status: "ok",
  message: "Actualización de estado",
  guia: tracking,
  pedido_id: orderBefore.number,
  estado: [
    {
      estado_id: 12,
      nombre_estado: estadoArg,
      fecha: new Date().toISOString().slice(0, 19).replace("T", " "),
    },
  ],
};

console.log("\n=== POST → " + webhookUrl + " ===");
console.log("Payload:", JSON.stringify(payload));

const res = await fetch(webhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
console.log("HTTP", res.status, "Body:", await res.text());

await new Promise((r) => setTimeout(r, 1000));

const orderAfter = await prisma.order.findFirst({
  where: { id: orderBefore.id },
  select: { number: true, status: true },
});
console.log("\n=== Order DESPUÉS ===");
console.log(JSON.stringify(orderAfter, null, 2));
console.log(
  orderBefore.status !== orderAfter?.status
    ? `✓ Transición ${orderBefore.status} → ${orderAfter?.status}`
    : `✗ Sin transición (${orderAfter?.status})`,
);

await prisma.$disconnect();
