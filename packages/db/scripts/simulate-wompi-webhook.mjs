/*
 * Simula un webhook Wompi APPROVED contra una Order específica.
 *
 * Uso:
 *   set -a && source .env.local && set +a
 *   node packages/db/scripts/simulate-wompi-webhook.mjs LCM-2026-0001
 *
 * Construye un payload válido firmado con WOMPI_EVENTS_SECRET y lo POST-ea
 * al endpoint local /api/webhooks/wompi. Sirve para validar que:
 *   1. La firma HMAC se verifica correctamente.
 *   2. La idempotencia (WebhookEvent) funciona.
 *   3. La Order pasa de PENDING_PAYMENT → PAID.
 *   4. La saga llama createShipment y la Order pasa a FULFILLING.
 *
 * NO usa la API real de Wompi — sólo simula el webhook que Wompi enviaría
 * cuando una transacción se aprueba. Para test end-to-end con Wompi real
 * sandbox, configurar webhook URL en panel Wompi apuntando a tu ngrok/Vercel.
 */

import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const orderNumber = process.argv[2];
if (!orderNumber) {
  console.error("Uso: node simulate-wompi-webhook.mjs <ORDER_NUMBER>");
  process.exit(1);
}

const eventsSecret = process.env.WOMPI_EVENTS_SECRET?.trim();
if (!eventsSecret) {
  console.error("WOMPI_EVENTS_SECRET no configurado en env");
  process.exit(1);
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "http://localhost:4000";
const webhookUrl = `${siteUrl}/api/webhooks/wompi`;

const prisma = new PrismaClient();

const order = await prisma.order.findFirst({
  where: { number: orderNumber, deletedAt: null },
  select: { id: true, number: true, status: true, total: true, email: true },
});
if (!order) {
  console.error(`Order ${orderNumber} no encontrada`);
  process.exit(1);
}

console.log("=== Order actual ===");
console.log(JSON.stringify(order, null, 2));

// Construir payload de webhook con shape exacto que Wompi envía.
// Doc: https://docs.wompi.co/docs/colombia/eventos/
const txId = `TEST-TX-${Date.now()}`;
const timestamp = Math.floor(Date.now() / 1000);

const transaction = {
  id: txId,
  reference: order.number,
  status: "APPROVED",
  amount_in_cents: order.total,
  currency: "COP",
  customer_email: order.email,
  payment_method_type: "CARD",
  created_at: new Date().toISOString(),
  finalized_at: new Date().toISOString(),
  status_message: null,
};

// Wompi firma SHA256(propertiesValues + timestamp + eventsSecret).
const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
const concat =
  properties
    .map((p) => {
      if (p === "transaction.id") return transaction.id;
      if (p === "transaction.status") return transaction.status;
      if (p === "transaction.amount_in_cents") return String(transaction.amount_in_cents);
      return "";
    })
    .join("") +
  String(timestamp) +
  eventsSecret;
const checksum = crypto.createHash("sha256").update(concat).digest("hex");

const payload = {
  event: "transaction.updated",
  data: { transaction },
  environment: "test",
  signature: { properties, checksum },
  timestamp,
  sent_at: new Date().toISOString(),
};

console.log("\n=== POST → " + webhookUrl + " ===");
const res = await fetch(webhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
console.log("HTTP", res.status);
const body = await res.text();
console.log("Body:", body);

// Esperar un poco y verificar el estado nuevo de la Order.
await new Promise((r) => setTimeout(r, 1500));
const after = await prisma.order.findFirst({
  where: { id: order.id },
  select: {
    id: true,
    number: true,
    status: true,
    total: true,
    wompiTransactionId: true,
    trackingNumber: true,
    trackingUrl: true,
    labelUrl: true,
    shippingCarrier: true,
  },
});
console.log("\n=== Order DESPUÉS del webhook ===");
console.log(JSON.stringify(after, null, 2));

const transitioned = after?.status !== order.status;
const hasTracking = !!after?.trackingNumber;
console.log("\n=== Resultado ===");
console.log(
  transitioned ? "✓ Order transicionó" : "✗ Order NO transicionó",
  `(${order.status} → ${after?.status})`,
);
console.log(hasTracking ? "✓ Tracking creado: " + after?.trackingNumber : "✗ Sin tracking");

await prisma.$disconnect();
