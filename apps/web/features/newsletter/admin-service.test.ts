/*
 * Test UNIT de features/newsletter/admin-service (Fase 3A, feedback Lucy 2026-09-18).
 *
 * Foco: el dedupe último-estado-por-email sobre el ledger Consent NEWSLETTER
 * (append-only: la baja es otra fila accepted=false, NO un update). Reglas:
 *   - accepted sin revocación posterior → ACTIVO.
 *   - revocación más nueva que el último accepted → DE BAJA.
 *   - re-suscripción tras baja (accepted más nuevo que la revocación) → ACTIVO,
 *     y subscribedAt es la fecha de la RE-suscripción (parte de H9).
 *   - email null (filas ancladas a phone, cotizaciones Etapa 1) se ignora.
 *   - contadores sobre el universo completo (no sobre el filtro q/status).
 *   - CSV: escape RFC 4180 + BOM.
 *
 * Prisma mockeado (mismo patrón que support/admin-service.test.ts) → offline.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn(async (): Promise<unknown[]> => []));

vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: queryRaw } }));

import {
  buildNewsletterCsv,
  groupNewsletterConsents,
  listNewsletterSubscribers,
  type NewsletterConsentRow,
} from "./admin-service";

const T = (iso: string) => new Date(iso);

/** Ledger ya ordenado acceptedAt DESC, como lo devuelve la query del service. */
function rows(...r: NewsletterConsentRow[]) {
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  queryRaw.mockResolvedValue([]);
});

describe("groupNewsletterConsents — dedupe último estado por email", () => {
  it("accepted sin revocación posterior → ACTIVO con su fecha y versión", () => {
    const [s] = groupNewsletterConsents(
      rows({
        email: "ana@example.com",
        accepted: true,
        acceptedAt: T("2026-09-01T10:00:00Z"),
        version: "v1",
      }),
    );
    expect(s).toMatchObject({
      email: "ana@example.com",
      status: "active",
      subscribedAt: T("2026-09-01T10:00:00Z"),
      unsubscribedAt: null,
      version: "v1",
    });
  });

  it("revocación posterior al alta → DE BAJA (la fila accepted original NO se voltea)", () => {
    const [s] = groupNewsletterConsents(
      rows(
        // desc: la baja primero
        {
          email: "ana@example.com",
          accepted: false,
          acceptedAt: T("2026-09-10T10:00:00Z"),
          version: "v1",
        },
        {
          email: "ana@example.com",
          accepted: true,
          acceptedAt: T("2026-09-01T10:00:00Z"),
          version: "v1",
        },
      ),
    );
    expect(s).toMatchObject({
      status: "unsubscribed",
      subscribedAt: T("2026-09-01T10:00:00Z"), // conserva la fecha del alta
      unsubscribedAt: T("2026-09-10T10:00:00Z"),
    });
  });

  it("re-suscripción tras baja → ACTIVO y subscribedAt = la re-suscripción (H9)", () => {
    const [s] = groupNewsletterConsents(
      rows(
        {
          email: "ana@example.com",
          accepted: true,
          acceptedAt: T("2026-09-15T10:00:00Z"),
          version: "v1",
        },
        {
          email: "ana@example.com",
          accepted: false,
          acceptedAt: T("2026-09-10T10:00:00Z"),
          version: "v1",
        },
        {
          email: "ana@example.com",
          accepted: true,
          acceptedAt: T("2026-09-01T10:00:00Z"),
          version: "v1",
        },
      ),
    );
    expect(s.status).toBe("active");
    expect(s.subscribedAt).toEqual(T("2026-09-15T10:00:00Z"));
    expect(s.unsubscribedAt).toBeNull();
  });

  it("deduplica: N filas del mismo email → 1 suscriptor; emails distintos no se mezclan", () => {
    const list = groupNewsletterConsents(
      rows(
        {
          email: "a@example.com",
          accepted: false,
          acceptedAt: T("2026-09-03T10:00:00Z"),
          version: "v1",
        },
        {
          email: "b@example.com",
          accepted: true,
          acceptedAt: T("2026-09-02T10:00:00Z"),
          version: "v1",
        },
        {
          email: "a@example.com",
          accepted: true,
          acceptedAt: T("2026-09-01T10:00:00Z"),
          version: "v1",
        },
      ),
    );
    expect(list).toHaveLength(2);
    expect(list.map((s) => [s.email, s.status])).toEqual([
      ["a@example.com", "unsubscribed"],
      ["b@example.com", "active"],
    ]);
  });

  it("ignora filas sin email (consent anclado a phone, cotizaciones Etapa 1)", () => {
    const list = groupNewsletterConsents(
      rows({ email: null, accepted: true, acceptedAt: T("2026-09-01T10:00:00Z"), version: "v1" }),
    );
    expect(list).toEqual([]);
  });

  it("baja importada sin alta local → DE BAJA con subscribedAt null", () => {
    const [s] = groupNewsletterConsents(
      rows({
        email: "ext@example.com",
        accepted: false,
        acceptedAt: T("2026-09-01T10:00:00Z"),
        version: "v1",
      }),
    );
    expect(s).toMatchObject({ status: "unsubscribed", subscribedAt: null, version: null });
  });
});

describe("listNewsletterSubscribers — contadores, filtros y paginación SQL (S11)", () => {
  it("devuelve contadores del universo completo y total filtrado por separado", async () => {
    queryRaw
      .mockResolvedValueOnce([{ active: 2, unsubscribed: 1, total: 3, filtered_total: 2 }])
      .mockResolvedValueOnce([
        {
          email: "ana@example.com",
          status: "active",
          subscribedAt: T("2026-09-10T10:00:00Z"),
          unsubscribedAt: null,
          version: "v1",
        },
        {
          email: "bea@example.com",
          status: "active",
          subscribedAt: T("2026-09-08T10:00:00Z"),
          unsubscribedAt: null,
          version: "v1",
        },
      ]);

    const res = await listNewsletterSubscribers({ status: "active" });

    expect(res.counters).toEqual({ active: 2, unsubscribed: 1, total: 3 });
    expect(res.total).toBe(2);
    expect(res.items.map((s) => s.email)).toEqual(["ana@example.com", "bea@example.com"]);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it("calcula totalPages sobre filtered_total y normaliza page <= 0 a 1", async () => {
    queryRaw
      .mockResolvedValueOnce([{ active: 5, unsubscribed: 0, total: 5, filtered_total: 5 }])
      .mockResolvedValueOnce([]);

    const res = await listNewsletterSubscribers({ page: 0, pageSize: 2 });

    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(2);
    expect(res.totalPages).toBe(3);
  });

  it("ejecuta CTE DISTINCT ON parametrizada en Postgres sin cargar toda la tabla en Node", async () => {
    await listNewsletterSubscribers({ q: "ANA@", status: "active", page: 2, pageSize: 10 });

    expect(queryRaw).toHaveBeenCalledTimes(2);
    const callArgs = queryRaw.mock.calls[1] ?? [];
    const serialized = JSON.stringify(callArgs);
    expect(serialized).toContain('DISTINCT ON (LOWER(\\"email\\"))');
    expect(serialized).toContain("LIMIT");
    expect(serialized).toContain("OFFSET");
    expect(serialized).toContain("%ana@%");
    expect(serialized).toContain("active");
  });
});

describe("buildNewsletterCsv", () => {
  it("cabecera + filas con BOM, estado en español y escape RFC 4180", () => {
    const csv = buildNewsletterCsv([
      {
        email: "ra,ra@example.com",
        status: "active",
        subscribedAt: T("2026-09-01T10:00:00Z"),
        unsubscribedAt: null,
        version: 'v1 "final"',
      },
      {
        email: "baja@example.com",
        status: "unsubscribed",
        subscribedAt: null,
        unsubscribedAt: T("2026-09-10T10:00:00Z"),
        version: null,
      },
    ]);

    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM para Excel
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("email,estado,fecha_suscripcion,fecha_baja,version_aviso");
    expect(lines[1]).toContain('"ra,ra@example.com"'); // coma → quoted
    expect(lines[1]).toContain('"v1 ""final"""'); // comillas → duplicadas
    expect(lines[1]).toContain("ACTIVO");
    expect(lines[2]).toContain("DE BAJA");
  });

  it("neutraliza formula injection de hojas de cálculo (L-F3): prefijo ' en celdas = + - @ tab", () => {
    const csv = buildNewsletterCsv([
      {
        email: "+1+1@example.com",
        status: "active",
        subscribedAt: null,
        unsubscribedAt: null,
        version: "=2+5",
      },
      {
        email: "normal@example.com",
        status: "active",
        subscribedAt: null,
        unsubscribedAt: null,
        version: "@cmd",
      },
    ]);
    const lines = csv.slice(1).split("\r\n");
    // Ninguna celda exportada puede empezar por un carácter de fórmula.
    expect(lines[1]).toContain("'+1+1@example.com");
    expect(lines[1]).toContain("'=2+5");
    expect(lines[2]).toContain("'@cmd");
    // Los valores normales quedan intactos.
    expect(lines[2]).toContain("normal@example.com");
  });
});
