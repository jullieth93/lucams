/*
 * POST /api/webhooks/resend — receive event notifications from Resend.
 *
 * Eventos manejados:
 *   - email.sent           → log nada más (ya logueamos al enviar)
 *   - email.delivered      → upsert EmailEvent
 *   - email.bounced        → upsert + log warn (potencial email inválido)
 *   - email.complained     → upsert + log warn (usuario marcó como spam)
 *   - email.opened         → upsert (tracking opcional)
 *   - email.clicked        → upsert (tracking opcional)
 *
 * Idempotencia: usamos `data.email_id` como `resendId` único de la
 * tabla EmailEvent. Si Resend reintenta el webhook, el upsert deja la
 * fila intacta.
 *
 * Seguridad: Resend firma cada webhook con HMAC-SHA256 usando
 * RESEND_WEBHOOK_SECRET (configurado en dashboard). Verificamos la
 * firma del header `svix-signature` antes de procesar. Sin secret en
 * env, rechazamos en prod; en dev permitimos para testing local.
 *
 * Docs: https://resend.com/docs/dashboard/webhooks
 */

import { headers } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ResendEvent = {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject?: string;
    [k: string]: unknown;
  };
};

// Tolerancia de reloj para el timestamp Svix (anti-replay). Svix recomienda 5 min.
const SVIX_TOLERANCE_SEC = 5 * 60;

/**
 * Verifica la firma Svix de Resend (esquema oficial):
 *  - secreto `whsec_<base64>` → la clave HMAC son los BYTES base64-decodificados tras el prefijo.
 *  - contenido firmado = `${svix-id}.${svix-timestamp}.${rawBody}` (no solo el body).
 *  - header `svix-signature` = lista separada por espacios de `v1,<base64>` (rotación).
 *  - se rechaza si el timestamp está fuera de la ventana de tolerancia (anti-replay).
 * Sin secreto: en prod rechaza (fail-closed); en dev permite para testing local con curl.
 */
function verifySvixSignature(
  rawBody: string,
  svixId: string | null,
  svixTimestamp: string | null,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      logger.error({ event: "webhook.resend.no_secret_in_prod" });
      return false;
    }
    // Dev: permitir sin verificación para testing manual con curl
    return true;
  }
  if (!svixId || !svixTimestamp || !signatureHeader) return false;

  // Anti-replay: el timestamp (epoch segundos) debe estar dentro de la ventana.
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > SVIX_TOLERANCE_SEC) return false;

  // La clave son los bytes del secreto base64 tras `whsec_`.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", key).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected);

  // Cualquiera de las firmas `v1,<sig>` que coincida → válido (soporta rotación).
  return signatureHeader.split(" ").some((part) => {
    const comma = part.indexOf(",");
    if (comma < 0) return false;
    if (part.slice(0, comma) !== "v1") return false;
    const value = part.slice(comma + 1);
    if (!value) return false;
    const sigBuf = Buffer.from(value);
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const hdrs = await headers();

  if (
    !verifySvixSignature(
      rawBody,
      hdrs.get("svix-id"),
      hdrs.get("svix-timestamp"),
      hdrs.get("svix-signature"),
    )
  ) {
    logger.warn({ event: "webhook.resend.invalid_signature" });
    return new Response("Invalid signature", { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!event.data?.email_id) {
    return new Response("Missing email_id", { status: 400 });
  }

  try {
    // Cast a Prisma JSON: la data del webhook es structurally compatible
    // (sólo strings/numbers/bools/arrays/objects anidados serializables).
    const metadata = JSON.parse(JSON.stringify(event.data));
    const occurredAt = new Date(event.created_at);
    // D-2: el upsert last-write-wins permitía que un evento viejo/reordenado pisara
    // email.bounced/email.complained → la supresión de lib/resend.ts dejaba de aplicar
    // y se re-escribía a direcciones rebotadas/quejadas. En transacción: un tipo
    // supresor nunca se degrada por un evento no-supresor, y un evento con occurredAt
    // más viejo que el almacenado se ignora.
    const SUPPRESSING = ["email.bounced", "email.complained"];
    await prisma.$transaction(async (tx) => {
      const existing = await tx.emailEvent.findUnique({
        where: { resendId: event.data.email_id },
      });
      if (existing && SUPPRESSING.includes(existing.type) && !SUPPRESSING.includes(event.type)) {
        return; // el rebote/queja manda: no degradar el registro
      }
      if (existing && existing.occurredAt > occurredAt) return; // evento viejo: ignorar
      await tx.emailEvent.upsert({
        where: { resendId: event.data.email_id },
        update: {
          type: event.type,
          occurredAt,
          metadata,
        },
        create: {
          resendId: event.data.email_id,
          type: event.type,
          to: Array.isArray(event.data.to) ? event.data.to.join(",") : String(event.data.to),
          fromEmail: event.data.from,
          subject: event.data.subject ?? null,
          occurredAt,
          metadata,
        },
      });
    });

    if (event.type === "email.bounced") {
      logger.warn({
        event: "email.bounce",
        emailId: event.data.email_id,
        to: event.data.to,
      });
    } else if (event.type === "email.complained") {
      logger.warn({
        event: "email.complaint",
        emailId: event.data.email_id,
        to: event.data.to,
      });
    } else {
      logger.info({ event: "email.webhook", type: event.type, emailId: event.data.email_id });
    }

    return Response.json({ ok: true });
  } catch (err) {
    logger.error({
      event: "webhook.resend.process_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    // Devolver 200 igual para que Resend no reintente indefinidamente
    return Response.json({ ok: false }, { status: 200 });
  }
}
