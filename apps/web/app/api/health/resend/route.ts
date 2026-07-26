/*
 * GET /api/health/resend — chequea Resend API Y la coherencia del remitente.
 *
 * Hit liviano a GET /domains que retorna 401 si la key es inválida, 200 si todo bien.
 * No envía emails (sería caro y produciría spam).
 *
 * Además de la key, valida que el dominio de EMAIL_FROM esté REGISTRADO Y VERIFICADO en
 * la cuenta: una key válida apuntando a un dominio sin verificar (o al sandbox
 * `onboarding@resend.dev`) daba "ok" y sin embargo ningún correo salía con la marca de la
 * tienda. También reporta EMAIL_REPLY_TO, porque el From vive en el subdominio de envío
 * (mail.lucamsshop.com) que NO recibe: sin Reply-To las respuestas de clientes se pierden.
 *
 * `from`/`replyTo` no son secretos — viajan en la cabecera de cada correo enviado y están
 * publicados en las páginas legales.
 *
 * Si RESEND_API_KEY no está seteada (entorno dev sin keys), devolvemos 200 con
 * status="skipped" — no es un fallo crítico en dev.
 */

import { logger } from "@/lib/logger";
import { InternalError, problemResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ResendDomain = { name?: string; status?: string; region?: string };

/** Extrae el dominio de un remitente en formato `Nombre <buzon@dominio>` o `buzon@dominio`. */
export function senderDomainOf(from: string | undefined): string | null {
  if (!from) return null;
  const angle = from.match(/<([^>]+)>/);
  const address = (angle ? angle[1] : from).trim();
  const at = address.lastIndexOf("@");
  if (at < 1 || at === address.length - 1) return null;
  return address.slice(at + 1).toLowerCase();
}

type SenderReport = {
  from: string | null;
  replyTo: string | null;
  domain: string | null;
  domainStatus: string | null;
  region: string | null;
  ok: boolean;
  detail?: string;
};

/** Contrasta EMAIL_FROM/EMAIL_REPLY_TO contra los dominios reales de la cuenta. */
export function buildSenderReport(domains: ResendDomain[]): SenderReport {
  const from = process.env.EMAIL_FROM ?? null;
  const replyTo = process.env.EMAIL_REPLY_TO ?? null;
  const domain = senderDomainOf(from ?? undefined);
  const base: SenderReport = {
    from,
    replyTo,
    domain,
    domainStatus: null,
    region: null,
    ok: false,
  };

  if (!from)
    return { ...base, detail: "EMAIL_FROM no configurada: se usaría el sandbox de Resend." };
  if (!domain) return { ...base, detail: `EMAIL_FROM no tiene un correo válido: "${from}".` };

  const match = domains.find((d) => d.name?.toLowerCase() === domain);
  if (!match) {
    return {
      ...base,
      detail: `El dominio "${domain}" no está registrado en esta cuenta de Resend.`,
    };
  }

  const domainStatus = match.status ?? null;
  const region = match.region ?? null;
  if (domainStatus !== "verified") {
    return {
      ...base,
      domainStatus,
      region,
      detail: `El dominio "${domain}" está en estado "${domainStatus}", no "verified".`,
    };
  }

  if (!replyTo) {
    return {
      ...base,
      domainStatus,
      region,
      detail:
        "EMAIL_REPLY_TO no configurada: las respuestas de clientes irían al subdominio de envío, que no recibe.",
    };
  }

  return { ...base, domainStatus, region, ok: true };
}

export async function GET(req: Request): Promise<Response> {
  // Rate-limit por IP (auditoría experto 2026-07-26): healthcheck público que consulta
  // un tercero o la DB por hit → sin límite era amplificable. 30/min por IP.
  const { allowed } = await rateLimit(`health_resend:${getClientIp(req.headers)}`, 30, 60);
  if (!allowed) {
    return new Response(JSON.stringify({ status: "rate_limited" }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": "60" },
    });
  }


  const start = Date.now();
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return Response.json({
      status: "skipped",
      service: "resend",
      check: "list-domains",
      detail: "RESEND_API_KEY no configurada (dev local).",
      latencyMs: 0,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const r = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;
    if (!r.ok) {
      logger.warn({ event: "health.resend.http_fail", status: r.status, latencyMs });
      return problemResponse(new InternalError(`Resend devolvió HTTP ${r.status}.`));
    }

    const payload = (await r.json()) as { data?: ResendDomain[] };
    const sender = buildSenderReport(payload.data ?? []);
    if (!sender.ok) {
      logger.warn({ event: "health.resend.sender_misconfigured", detail: sender.detail });
    }

    return Response.json({
      status: sender.ok ? "ok" : "warn",
      service: "resend",
      check: "list-domains+sender",
      sender,
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    logger.error({
      event: "health.resend.fail",
      latencyMs,
      err: err instanceof Error ? err.message : String(err),
    });
    return problemResponse(new InternalError("Resend healthcheck falló."));
  }
}
