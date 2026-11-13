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
import { formatDayMonthCO, formatIsoDateCO } from "@/lib/datetime";

const PAGE_SIZE = 20;

export type NewsletterSubscriberStatus = "active" | "unsubscribed";
export type NewsletterExportScope = "active_commercial" | "audit_ledger";

export type NewsletterSubscriber = {
  email: string;
  status: NewsletterSubscriberStatus;
  /** Último alta (re-suscripción si hubo baja previa). null si nunca hubo accepted. */
  subscribedAt: Date | null;
  /** Fecha de la baja vigente (solo cuando status = "unsubscribed"). */
  unsubscribedAt: Date | null;
  /** Versión del aviso de privacidad del último consentimiento aceptado. */
  version: string | null;
  /** Ficha Contacto 360 asociada cuando existe en el grafo CRM. */
  contactId?: string | null;
  displayName?: string | null;
  /** Suprimido comercialmente por rebote duro o queja en Resend (`EmailEvent`). */
  bouncedOrComplained?: boolean;
  /** Cuenta interna del equipo (`Contact.isStaff` o `AdminUser` activo). */
  isStaff?: boolean;
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
  matched_contacts AS (
    SELECT DISTINCT ON (LOWER(c."primaryEmail"))
      LOWER(c."primaryEmail") AS email,
      c."id" AS contact_id,
      c."displayName" AS display_name,
      c."isStaff" AS contact_is_staff
    FROM "Contact" c
    WHERE c."deletedAt" IS NULL
      AND c."anonymizedAt" IS NULL
      AND c."primaryEmail" IS NOT NULL
    ORDER BY LOWER(c."primaryEmail"), c."createdAt" DESC
  ),
  deduped AS (
    SELECT
      ls.email,
      CASE WHEN ls."accepted" THEN 'active' ELSE 'unsubscribed' END AS status,
      ls."acceptedAt" AS last_event_at,
      la.subscribed_at AS "subscribedAt",
      CASE WHEN ls."accepted" THEN NULL ELSE ls."acceptedAt" END AS "unsubscribedAt",
      la."version",
      mc.contact_id AS "contactId",
      mc.display_name AS "displayName",
      EXISTS (
        SELECT 1
        FROM "EmailEvent" ev
        WHERE LOWER(ev."to") = ls.email
          AND ev."type" IN ('email.bounced', 'email.complained')
      ) AS "bouncedOrComplained",
      (
        COALESCE(mc.contact_is_staff, false)
        OR EXISTS (
          SELECT 1
          FROM "AdminUser" au
          WHERE au."isActive" = true
            AND au."deletedAt" IS NULL
            AND LOWER(au."email") = ls.email
        )
      ) AS "isStaff"
    FROM latest_state ls
    LEFT JOIN latest_accepted la ON la.email = ls.email
    LEFT JOIN matched_contacts mc ON mc.email = ls.email
  )
`;

/**
 * Listado paginado en SQL para /admin/marketing/suscriptores (S11).
 *
 * Deduplica directamente en Postgres mediante `DISTINCT ON (LOWER("email"))`
 * y excluye cuentas internas (`isStaff`) de la audiencia comercial.
 */
export async function listNewsletterSubscribers(
  opts: NewsletterListOpts = {},
): Promise<NewsletterListResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const q = opts.q?.trim().toLowerCase();

  const filterClauses: Prisma.Sql[] = [Prisma.sql`"isStaff" = false`];
  if (q) {
    const pattern = `%${escapeLikePattern(q)}%`;
    filterClauses.push(
      Prisma.sql`(
        email LIKE ${pattern} ESCAPE '\\'
        OR LOWER(COALESCE("displayName", '')) LIKE ${pattern} ESCAPE '\\'
      )`,
    );
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
    contactId?: string | null;
    displayName?: string | null;
    bouncedOrComplained?: boolean;
    isStaff?: boolean;
  };

  const [counterRows, items] = await Promise.all([
    prisma.$queryRaw<CounterRow[]>`
      ${DEDUPED_NEWSLETTER_CTE}
      SELECT
        COUNT(*) FILTER (WHERE "isStaff" = false AND status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE "isStaff" = false AND status = 'unsubscribed')::int AS unsubscribed,
        COUNT(*) FILTER (WHERE "isStaff" = false)::int AS total,
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
        "version",
        "contactId",
        "displayName",
        "bouncedOrComplained",
        "isStaff"
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

/**
 * Suscriptores deduplicados en SQL para exportación CSV:
 *   - `active_commercial` (por defecto, Ley 1581): SOLO opt-in vigente (`status = 'active'`),
 *     excluyendo staff y destinatarios con rebote duro o queja en Resend (`EmailEvent`).
 *   - `audit_ledger` (solo `SUPERADMIN`, prueba legal SIC): histórico completo deduplicado
 *     incluyendo bajas (`DE BAJA`), rebotes/quejas y cuentas internas.
 */
export async function listAllNewsletterSubscribers(opts?: {
  scope?: NewsletterExportScope;
}): Promise<NewsletterSubscriber[]> {
  const scope = opts?.scope ?? "active_commercial";
  if (scope === "audit_ledger") {
    return prisma.$queryRaw<NewsletterSubscriber[]>`
      ${DEDUPED_NEWSLETTER_CTE}
      SELECT
        email,
        status,
        "subscribedAt",
        "unsubscribedAt",
        "version",
        "bouncedOrComplained",
        "isStaff"
      FROM deduped
      ORDER BY last_event_at DESC, email ASC
    `;
  }

  return prisma.$queryRaw<NewsletterSubscriber[]>`
    ${DEDUPED_NEWSLETTER_CTE}
    SELECT
      email,
      status,
      "subscribedAt",
      "unsubscribedAt",
      "version",
      "bouncedOrComplained",
      "isStaff"
    FROM deduped
    WHERE status = 'active'
      AND "isStaff" = false
      AND "bouncedOrComplained" = false
    ORDER BY last_event_at DESC, email ASC
  `;
}

export type NewsletterDailyBucket = {
  key: string;
  label: string;
  tickLabel: string;
  optInCount: number;
  optOutCount: number;
};

/**
 * Pulso diario de 14 días (hora Colombia `-05:00`) de altas y bajas en el ledger `Consent(NEWSLETTER)`.
 */
export async function getNewsletterDailyPulse(days = 14): Promise<NewsletterDailyBucket[]> {
  const safeDays = Math.max(1, Math.min(90, Math.floor(days)));
  const todayIso = formatIsoDateCO(new Date());
  const noonToday = new Date(`${todayIso}T12:00:00.000-05:00`);
  const buckets: NewsletterDailyBucket[] = [];
  const byKey = new Map<string, NewsletterDailyBucket>();

  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(noonToday.getTime() - i * 86_400_000);
    const key = formatIsoDateCO(d);
    const bucket: NewsletterDailyBucket = {
      key,
      label: formatDayMonthCO(d),
      tickLabel: `${key.slice(8)}/${key.slice(5, 7)}`,
      optInCount: 0,
      optOutCount: 0,
    };
    buckets.push(bucket);
    byKey.set(key, bucket);
  }

  const firstKey = buckets[0]?.key ?? todayIso;
  const since = new Date(`${firstKey}T00:00:00.000-05:00`);

  const rows = await prisma.$queryRaw<Array<{ accepted: boolean; accepted_at: Date }>>`
    SELECT
      co."accepted",
      co."acceptedAt" AS accepted_at
    FROM "Consent" co
    WHERE co."scope" = 'NEWSLETTER'
      AND co."email" IS NOT NULL
      AND co."acceptedAt" >= ${since}
      AND NOT EXISTS (
        SELECT 1
        FROM "Contact" ct
        WHERE ct."deletedAt" IS NULL
          AND ct."isStaff" = true
          AND LOWER(ct."primaryEmail") = LOWER(co."email")
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "AdminUser" au
        WHERE au."isActive" = true
          AND au."deletedAt" IS NULL
          AND LOWER(au."email") = LOWER(co."email")
      )
  `;

  for (const r of rows) {
    const b = byKey.get(formatIsoDateCO(r.accepted_at));
    if (!b) continue;
    if (r.accepted) b.optInCount += 1;
    else b.optOutCount += 1;
  }

  return buckets;
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
export function buildNewsletterCsv(
  items: NewsletterSubscriber[],
  opts?: { auditLedger?: boolean },
): string {
  const auditLedger = opts?.auditLedger === true;
  const header = auditLedger
    ? "email,estado,fecha_suscripcion,fecha_baja,version_aviso,rebote_o_queja,es_staff"
    : "email,estado,fecha_suscripcion,fecha_baja,version_aviso";
  const lines = items.map((s) => {
    const base = [
      csvCell(s.email),
      s.status === "active" ? "ACTIVO" : "DE BAJA",
      s.subscribedAt ? CSV_DATE.format(s.subscribedAt) : "",
      s.unsubscribedAt ? CSV_DATE.format(s.unsubscribedAt) : "",
      csvCell(s.version ?? ""),
    ];
    if (auditLedger) {
      base.push(s.bouncedOrComplained ? "SI" : "NO", s.isStaff ? "SI" : "NO");
    }
    return base.join(",");
  });
  return "\uFEFF" + [header, ...lines].join("\r\n") + "\r\n";
}
