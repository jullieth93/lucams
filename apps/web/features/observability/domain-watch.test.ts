/*
 * Unit — vigilante del dominio (FASE B auditoría 2026-09-19, L-H3/L-N1).
 *
 * Prisma mockeado con un AlertState en memoria: la lógica de baseline/umbrales/
 * anti-spam es determinista y no necesita DB. notify y sendAlertEmail mockeados
 * (canal estándar: Notification in-app siempre + email solo en críticas).
 *
 * Cubre: siembra de la primera observación SIN alerta, cruce de umbrales
 * 60/30/14/7/3/1 una sola vez, recordatorio ≤3 días (>20 h), cambio de
 * nameservers/status como crítica (con normalización anti falso positivo),
 * contador de rdapOk=false (alerta a la 2ª seguida, reset con rdapOk=true) y
 * la política "email falló → no se sella el bucket" (reintento mañana).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, notify, sendAlertEmail } = vi.hoisted(() => ({
  mockPrisma: {
    alertState: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  // Tipo explícito: sin él TS infiere el tuple de args como [] y mock.calls[0][0] no compila.
  notify: vi.fn(
    async (_input: {
      type: string;
      severity: string;
      title: string;
      detail: string;
      dedupKey?: string;
    }) => {},
  ),
  sendAlertEmail: vi.fn(async (_alerts: unknown[]) => true),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/notifications/service", () => ({ notify }));
vi.mock("./alerts", () => ({ sendAlertEmail }));

import {
  DOMAIN_WATCH_KEYS,
  expiryBucket,
  normalizeList,
  processDomainObservation,
  type DomainObservation,
} from "./domain-watch";

const NOW = new Date("2026-09-20T12:00:00Z");
const NS = ["romina.ns.cloudflare.com", "armando.ns.cloudflare.com"];
const STATUS = ["ok"];

/** AlertState en memoria: findUnique/upsert con la misma forma que Prisma. */
const store = new Map<string, { lastDetail: string | null; lastSentAt: Date }>();

function okObs(over: Partial<DomainObservation> = {}): DomainObservation {
  return {
    rdapOk: true,
    expiresAt: "2027-07-19T04:00:00Z",
    daysLeft: 300,
    nameservers: NS,
    status: STATUS,
    ...over,
  };
}

/** Siembra el baseline como si ya hubiera corrido una primera observación. */
async function seedBaseline(over: Partial<DomainObservation> = {}) {
  await processDomainObservation(okObs(over), NOW);
  notify.mockClear();
  sendAlertEmail.mockClear();
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  mockPrisma.alertState.findUnique.mockImplementation(
    async ({ where: { key } }: { where: { key: string } }) => store.get(key) ?? null,
  );
  mockPrisma.alertState.upsert.mockImplementation(
    async ({
      where: { key },
      update,
    }: {
      where: { key: string };
      update: { lastDetail: string | null; lastSentAt: Date };
    }) => {
      store.set(key, { lastDetail: update.lastDetail, lastSentAt: update.lastSentAt });
    },
  );
  sendAlertEmail.mockResolvedValue(true);
});

describe("helpers puros", () => {
  it("normalizeList: minúsculas, trim, dedup y orden (RDAP no garantiza ni orden ni case)", () => {
    expect(normalizeList([" ROMINA.ns.cloudflare.com. ", "armando.ns.cloudflare.com"])).toBe(
      normalizeList(["armando.ns.cloudflare.com", "romina.ns.cloudflare.com."]),
    );
    expect(normalizeList(undefined)).toBeNull();
    expect(normalizeList(["a", "a", " "])).toBe('["a"]');
  });

  it("expiryBucket: el umbral MÁS ESTRICTO ya cruzado; null fuera de ventana", () => {
    expect(expiryBucket(300)).toBeNull();
    expect(expiryBucket(61)).toBeNull();
    expect(expiryBucket(60)).toBe(60);
    expect(expiryBucket(59)).toBe(60);
    expect(expiryBucket(29)).toBe(30);
    expect(expiryBucket(13)).toBe(14);
    expect(expiryBucket(6)).toBe(7);
    expect(expiryBucket(2)).toBe(3);
    expect(expiryBucket(1)).toBe(1);
    expect(expiryBucket(0)).toBe(1);
  });
});

describe("processDomainObservation — baseline", () => {
  it("la PRIMERA observación siembra expiresAt/nameservers/status y NO alerta", async () => {
    const res = await processDomainObservation(okObs(), NOW);

    expect(res.alerts).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
    expect(sendAlertEmail).not.toHaveBeenCalled();
    expect(store.get(DOMAIN_WATCH_KEYS.expiresAt)?.lastDetail).toBe("2027-07-19T04:00:00Z");
    expect(store.get(DOMAIN_WATCH_KEYS.nameservers)?.lastDetail).toBe(normalizeList(NS));
    expect(store.get(DOMAIN_WATCH_KEYS.status)?.lastDetail).toBe(normalizeList(STATUS));
    // El bucket queda sellado al nivel actual (300 días → "") para que la
    // segunda corrida no dispare un "cruce" retroactivo.
    expect(store.get(DOMAIN_WATCH_KEYS.lastAlertBucket)?.lastDetail).toBe("");
  });

  it("la siembra con el dominio YA dentro de ventana tampoco alerta (sella el bucket actual)", async () => {
    await processDomainObservation(okObs({ daysLeft: 25 }), NOW);

    expect(notify).not.toHaveBeenCalled();
    expect(store.get(DOMAIN_WATCH_KEYS.lastAlertBucket)?.lastDetail).toBe("30");
  });

  it("observación idéntica a la del baseline → sin alertas", async () => {
    await seedBaseline();
    const res = await processDomainObservation(okObs(), new Date(NOW.getTime() + 86400_000));
    expect(res.alerts).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("processDomainObservation — expiración (umbrales 60/30/14/7/3/1)", () => {
  it("cruzar un umbral alerta CRÍTICA una sola vez (notificación + email)", async () => {
    await seedBaseline();

    const res = await processDomainObservation(okObs({ daysLeft: 59 }), NOW);
    expect(res.alerts).toEqual(["domain_expiry"]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({
      type: "ALERT",
      severity: "critical",
      dedupKey: "domain_expiry",
    });
    expect(notify.mock.calls[0][0].title).toContain("59");
    expect(sendAlertEmail).toHaveBeenCalledTimes(1);
    expect(store.get(DOMAIN_WATCH_KEYS.lastAlertBucket)?.lastDetail).toBe("60");

    // Misma ventana al día siguiente: NO repite.
    notify.mockClear();
    sendAlertEmail.mockClear();
    const again = await processDomainObservation(
      okObs({ daysLeft: 58 }),
      new Date(NOW.getTime() + 86400_000),
    );
    expect(again.alerts).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("cruzar el SIGUIENTE umbral alerta de nuevo (60 → 30)", async () => {
    await seedBaseline();
    await processDomainObservation(okObs({ daysLeft: 45 }), NOW); // sella "60"
    notify.mockClear();

    const res = await processDomainObservation(okObs({ daysLeft: 29 }), NOW);
    expect(res.alerts).toEqual(["domain_expiry"]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(store.get(DOMAIN_WATCH_KEYS.lastAlertBucket)?.lastDetail).toBe("30");
  });

  it("con ≤3 días repite recordatorio si la última alerta tiene >20 h; si no, calla", async () => {
    await seedBaseline();
    await processDomainObservation(okObs({ daysLeft: 3 }), NOW); // sella "3" a las 12:00
    notify.mockClear();

    // 10 h después (mismo bucket): aún no.
    const early = await processDomainObservation(
      okObs({ daysLeft: 2 }),
      new Date(NOW.getTime() + 10 * 3600_000),
    );
    expect(early.alerts).toEqual([]);
    expect(notify).not.toHaveBeenCalled();

    // 21 h después: recordatorio.
    const late = await processDomainObservation(
      okObs({ daysLeft: 2 }),
      new Date(NOW.getTime() + 21 * 3600_000),
    );
    expect(late.alerts).toEqual(["domain_expiry"]);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("si el dominio se RENUEVA, los umbrales se rearman (vuelve a alertar al cruzar)", async () => {
    await seedBaseline();
    await processDomainObservation(okObs({ daysLeft: 29 }), NOW); // sella "30"
    await processDomainObservation(
      okObs({ daysLeft: 400, expiresAt: "2028-07-19T04:00:00Z" }),
      NOW,
    ); // renovado
    expect(store.get(DOMAIN_WATCH_KEYS.lastAlertBucket)?.lastDetail).toBe("");
    expect(store.get(DOMAIN_WATCH_KEYS.expiresAt)?.lastDetail).toBe("2028-07-19T04:00:00Z");
    notify.mockClear();

    const res = await processDomainObservation(okObs({ daysLeft: 59 }), NOW);
    expect(res.alerts).toEqual(["domain_expiry"]);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("si el email de la crítica FALLA, NO sella el bucket → la próxima corrida reintenta", async () => {
    await seedBaseline();
    sendAlertEmail.mockResolvedValueOnce(false);

    const res = await processDomainObservation(okObs({ daysLeft: 59 }), NOW);
    expect(res.alerts).toEqual(["domain_expiry"]); // la notificación in-app sí quedó
    expect(store.get(DOMAIN_WATCH_KEYS.lastAlertBucket)?.lastDetail).toBe(""); // sin sellar

    notify.mockClear();
    const retry = await processDomainObservation(okObs({ daysLeft: 59 }), NOW);
    expect(retry.alerts).toEqual(["domain_expiry"]);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe("processDomainObservation — cambio de nameservers / status (secuestro)", () => {
  it("nameservers distintos del baseline → CRÍTICA y baseline actualizado (alerta por CAMBIO)", async () => {
    await seedBaseline();

    const evil = ["ns1.evil.example", "ns2.evil.example"];
    const res = await processDomainObservation(okObs({ nameservers: evil }), NOW);
    expect(res.alerts).toEqual(["domain_nameservers_changed"]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({
      severity: "critical",
      dedupKey: "domain_nameservers_changed",
    });
    expect(sendAlertEmail).toHaveBeenCalledTimes(1);
    expect(store.get(DOMAIN_WATCH_KEYS.nameservers)?.lastDetail).toBe(normalizeList(evil));

    // El cambio PERSISTE al día siguiente: no re-alerta (anti-spam diario).
    notify.mockClear();
    const again = await processDomainObservation(okObs({ nameservers: evil }), NOW);
    expect(again.alerts).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("los MISMOS nameservers en otro orden/case NO alertan (normalización)", async () => {
    await seedBaseline();
    const res = await processDomainObservation(
      okObs({ nameservers: ["ARMANDO.NS.CLOUDFLARE.COM", "romina.ns.cloudflare.com"] }),
      NOW,
    );
    expect(res.alerts).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("aparece 'client hold' en el status → CRÍTICA (suspensión ICANN)", async () => {
    await seedBaseline();

    const res = await processDomainObservation(okObs({ status: ["ok", "client hold"] }), NOW);
    expect(res.alerts).toEqual(["domain_status_changed"]);
    expect(notify.mock.calls[0][0]).toMatchObject({
      severity: "critical",
      dedupKey: "domain_status_changed",
    });
    expect(notify.mock.calls[0][0].detail).toContain("client hold");
  });

  it("baseline sin el campo (sembrado antes de que el workflow lo enviara) → siembra en silencio", async () => {
    await seedBaseline({ nameservers: undefined });
    expect(store.get(DOMAIN_WATCH_KEYS.nameservers)?.lastDetail).toBeNull();

    const res = await processDomainObservation(okObs(), NOW);
    expect(res.alerts).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
    expect(store.get(DOMAIN_WATCH_KEYS.nameservers)?.lastDetail).toBe(normalizeList(NS));
  });
});

describe("processDomainObservation — RDAP caído", () => {
  it("la primera corrida con rdapOk=false NO alerta (transitoria); la 2ª seguida SÍ (alta, sin email)", async () => {
    await seedBaseline();

    const first = await processDomainObservation({ rdapOk: false }, NOW);
    expect(first.alerts).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
    expect(store.get(DOMAIN_WATCH_KEYS.rdapFailures)?.lastDetail).toBe("1");

    const second = await processDomainObservation({ rdapOk: false }, NOW);
    expect(second.alerts).toEqual(["domain_rdap_failing"]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({
      severity: "warning", // alta → in-app; NO crítica (sin email)
      dedupKey: "domain_rdap_failing",
    });
    expect(sendAlertEmail).not.toHaveBeenCalled();
  });

  it("rdapOk=true resetea el contador de fallos", async () => {
    await seedBaseline();
    await processDomainObservation({ rdapOk: false }, NOW);
    expect(store.get(DOMAIN_WATCH_KEYS.rdapFailures)?.lastDetail).toBe("1");

    await processDomainObservation(okObs(), NOW);
    expect(store.get(DOMAIN_WATCH_KEYS.rdapFailures)?.lastDetail).toBe("0");

    // Una sola falla tras el reset vuelve a NO alertar.
    const res = await processDomainObservation({ rdapOk: false }, NOW);
    expect(res.alerts).toEqual([]);
  });
});
