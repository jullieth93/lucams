/*
 * Admin service — Suscriptores del newsletter (Fase 3A, feedback Lucy 2026-09-18).
 *
 * La audiencia vive en dos sitios: Resend Contacts (envío de campañas) y la tabla
 * Prisma `Consent` con scope=NEWSLETTER (prueba legal Ley 1581 — ver
 * features/newsletter/service.ts). Esta vista lee SOLO el Consent ledger, que es
 * la fuente de verdad local: Resend es el procesador y su estado se reconstruye
 * desde acá.
 *
 * El ledger es APPEND-ONLY: la baja NO voltea la fila original, es otra fila
 * accepted=false (con revokesId) — ver features/newsletter/unsubscribe.ts. Por eso
 * el estado de un email es su ÚLTIMA fila (misma regla que isNewsletterSubscribed:
 * un accepted sin revocación posterior = vigente). Al deduplicar por email nos
 * quedamos con la fila más reciente (acceptedAt desc) y reconstruimos:
 *   - ACTIVO   → última fila accepted=true  (subscribedAt = esa fila; si hubo
 *                baja previa y re-suscripción, es la fecha de la re-suscripción).
 *   - DE BAJA  → última fila accepted=false (unsubscribedAt = esa fila;
 *                subscribedAt = el último alta, si existió).
 *
 * Solo lectura + export CSV: ninguna mutación (dar de baja a un titular desde el
 * panel sería una revocación que hoy solo puede iniciar él, por su link firmado).
 */

import "server-only";
import { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 20;

export type NewsletterSubscriberStatus = "active" | "unsubscribed";

export type NewsletterSubscriber = {
  email: string;
  status: NewsletterSubscriberStatus;
  /** Último alta (re-suscripción si hubo baja previa). null si nunca hubo accepted. */
  subscribedAt: Date | null;
  /** Fecha de la baja vigente (solo cuando status = "unsubscribed"). */
  unsubscribedAt: Date | null;
  /** Versión del aviso de privacidad del último consentimiento aceptado. */
  version: string | null;
};

export type NewsletterSubscriberCounters = {
  active: number;
  unsubscribed: number;
  total: number;
};

export type NewsletterListOpts = {
  q?: string;
  /** "all" (default) | "active" | "unsubscribed" */
  status?: "all" | NewsletterSubscriberStatus;
  page?: number;
  pageSize?: number;
};

export type NewsletterListResult = {
  items: NewsletterSubscriber[];
  counters: NewsletterSubscriberCounters;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** Fila mínima del ledger que necesita el dedupe (misma proyección que la query). */
export type NewsletterConsentRow = {
  email: string | null;
  accepted: boolean;
  acceptedAt: Date;
  version: string;
};

/**
 * Dedupe último-estado-por-email. Pura (testeable sin DB): recibe las filas del
 * ledger ya ordenadas por acceptedAt DESC y devuelve un suscriptor por email,
 * en orden de evento más reciente primero.
 */
export function groupNewsletterConsents(rows: NewsletterConsentRow[]): NewsletterSubscriber[] {
  const byEmail = new Map<string, NewsletterConsentRow[]>();
  for (const row of rows) {
    if (!row.email) continue;
    const list = byEmail.get(row.email);
    if (list) list.push(row);
    else byEmail.set(row.email, [row]);
  }

  const out: NewsletterSubscriber[] = [];
  for (const [email, list] of byEmail) {
    const last = list[0]; // acceptedAt desc → la fila vigente
    const lastAccepted = list.find((r) => r.accepted) ?? null;
    out.push({
      email,
      status: last.accepted ? "active" : "unsubscribed",
      subscribedAt: lastAccepted?.acceptedAt ?? null,
      unsubscribedAt: last.accepted ? null : last.acceptedAt,
      version: lastAccepted?.version ?? null,
    });
  }
  return out;
}

function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const DEDUPED_NEWSLETTER_CTE = Prisma.sql`
  WITH latest_state AS (
    SELECT DISTINCT ON (LOWER("email"))
      LOWER("email") AS email,
      "accepted",
      "acceptedAt"
    FROM "Consent"
    WHERE "scope" = 'NEWSLETTER' AND "email" IS NOT NULL
    ORDER BY LOWER("email"), "acceptedAt" DESC, "id" DESC
  ),
  latest_accepted AS (
    SELECT DISTINCT ON (LOWER("email"))
      LOWER("email") AS email,
      "acceptedAt" AS subscribed_at,
      "version"
    FROM "Consent"
    WHERE "scope" = 'NEWSLETTER' AND "email" IS NOT NULL AND "accepted" = true
    ORDER BY LOWER("email"), "acceptedAt" DESC, "id" DESC
  ),
  deduped AS (
    SELECT
      ls.email,
      CASE WHEN ls."accepted" THEN 'active' ELSE 'unsubscribed' END AS status,
      ls."acceptedAt" AS last_event_at,
      la.subscribed_at AS "subscribedAt",
      CASE WHEN ls."accepted" THEN NULL ELSE ls."acceptedAt" END AS "unsubscribedAt",
      la."version"
    FROM latest_state ls
    LEFT JOIN latest_accepted la ON la.email = ls.email
  )
`;

/**
 * Listado paginado en SQL para /admin/marketing/suscriptores (S11).
 *
 * Deduplica directamente en Postgres mediante `DISTINCT ON (LOWER("email"))`
 * para no cargar todo el historial de `Consent` en memoria del servidor.
 */
export async function listNewsletterSubscribers(
  opts: NewsletterListOpts = {},
): Promise<NewsletterListResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const q = opts.q?.trim().toLowerCase();

  const filterClauses: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (q) {
    const pattern = `%${escapeLikePattern(q)}%`;
    filterClauses.push(Prisma.sql`email LIKE ${pattern} ESCAPE '\\'`);
  }
  if (opts.status && opts.status !== "all") {
    filterClauses.push(Prisma.sql`status = ${opts.status}`);
  }
  const whereSql = Prisma.join(filterClauses, " AND ");

  type CounterRow = {
    active: number;
    unsubscribed: number;
    total: number;
    filtered_total: number;
  };
  type ItemRow = {
    email: string;
    status: NewsletterSubscriberStatus;
    subscribedAt: Date | null;
    unsubscribedAt: Date | null;
    version: string | null;
  };

  const [counterRows, items] = await Promise.all([
    prisma.$queryRaw<CounterRow[]>`
      ${DEDUPED_NEWSLETTER_CTE}
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'unsubscribed')::int AS unsubscribed,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${whereSql})::int AS filtered_total
      FROM deduped
    `,
    prisma.$queryRaw<ItemRow[]>`
      ${DEDUPED_NEWSLETTER_CTE}
      SELECT
        email,
        status,
        "subscribedAt",
        "unsubscribedAt",
        "version"
      FROM deduped
      WHERE ${whereSql}
      ORDER BY last_event_at DESC, email ASC
      LIMIT ${pageSize}
      OFFSET ${(page - 1) * pageSize}
    `,
  ]);

  const summary = counterRows[0] ?? { active: 0, unsubscribed: 0, total: 0, filtered_total: 0 };
  const total = Number(summary.filtered_total ?? 0);
  const counters: NewsletterSubscriberCounters = {
    active: Number(summary.active ?? 0),
    unsubscribed: Number(summary.unsubscribed ?? 0),
    total: Number(summary.total ?? 0),
  };

  return {
    items,
    counters,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Todos los suscriptores deduplicados en SQL (para el export CSV, sin paginar). */
export async function listAllNewsletterSubscribers(): Promise<NewsletterSubscriber[]> {
  return prisma.$queryRaw<NewsletterSubscriber[]>`
    ${DEDUPED_NEWSLETTER_CTE}
    SELECT
      email,
      status,
      "subscribedAt",
      "unsubscribedAt",
      "version"
    FROM deduped
    ORDER BY last_event_at DESC, email ASC
  `;
}

/**
 * Escapa una celda CSV (RFC 4180): comillas dobles si trae separador, comilla o salto.
 * Además neutraliza formula injection de hojas de cálculo (L-F3, auditoría
 * 2026-09-19 — confirmado en vivo en STG): un valor que empieza por = + - @ tab CR
 * se prefija con comilla simple, así Excel/Sheets lo tratan como texto.
 */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const CSV_DATE = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Bogota",
});

/**
 * CSV del listado (descarga server-side desde /admin/marketing/suscriptores/export).
 * Con BOM UTF-8 para que Excel abra bien los acentos. Pura: la prueba el test unitario.
 */
export function buildNewsletterCsv(items: NewsletterSubscriber[]): string {
  const header = "email,estado,fecha_suscripcion,fecha_baja,version_aviso";
  const lines = items.map((s) =>
    [
      csvCell(s.email),
      s.status === "active" ? "ACTIVO" : "DE BAJA",
      s.subscribedAt ? CSV_DATE.format(s.subscribedAt) : "",
      s.unsubscribedAt ? CSV_DATE.format(s.unsubscribedAt) : "",
      csvCell(s.version ?? ""),
    ].join(","),
  );
  return "\uFEFF" + [header, ...lines].join("\r\n") + "\r\n";
}
