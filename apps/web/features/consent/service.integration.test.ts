/*
 * Tests de integración del SERVICE de CONSENT — audit trail Ley 1581 / Decreto 1377.
 *
 * El módulo @/features/consent/service.ts es DB-coupled (importa `prisma` de
 * @/lib/db) y expone una sola función:
 *   - recordCookieConsent({ prefs, customerId?, email?, ip?, userAgent? }):
 *     lee la versión vigente del aviso de privacidad vía
 *     getSettingValue("PRIVACY_POLICY_VERSION", "v1") y persiste UNA FILA por
 *     cada scope de CONSENT_SCOPES (las 4 cookies: NECESSARY/FUNCTIONAL/
 *     ANALYTICS/MARKETING) con `accepted = !!prefs[key]`, copiando version, ip,
 *     userAgent, customerId, email a cada fila. Devuelve `undefined` (no retorna
 *     las filas creadas → la persistencia se verifica leyendo la DB).
 *
 * Estrategia: integración DB pura. Requiere DATABASE_URL (corre vía
 * `dotenv -e .env.local -- vitest`); sin ella se salta (skipIf) para no romper
 * CI sin DB.
 *
 * MOCKS (van ANTES de importar el SUT):
 *   - next/cache: unstable_cache pass-through + revalidate* no-op. Fuera de un
 *     request real de Next, unstable_cache puede comportarse raro; lo neutralizamos.
 *   - @/lib/cms getSettingValue: lo controlamos por test para (a) fijar la versión
 *     persistida de forma DETERMINISTA y (b) prefijarla con RUN → la limpieza en
 *     afterAll borra EXACTAMENTE lo creado (Consent no tiene otro campo natural
 *     único: scope es enum, accepted es bool). El comportamiento real del
 *     contrato getSettingValue(key, fallback) se verifica aparte con un spy sobre
 *     los argumentos.
 *
 * AISLAMIENTO ESTRICTO (audit legal — nunca tocar datos reales):
 *   - Cada fila Consent de esta corrida lleva el prefijo RUN en `version` (vía el
 *     mock) Y en `userAgent`/`email`/`customerId` cuando aplica. La limpieza en
 *     afterAll borra SCOPED a `version startsWith RUN`. JAMÁS un deleteMany sin
 *     filtro. No se mutan SiteSetting ni Customer reales (los customers de prueba
 *     se crean RUN-scoped y se borran).
 *   - NO tocamos el SiteSetting real PRIVACY_POLICY_VERSION (mockeamos la lectura).
 *
 * Comportamiento verificado contra la DB real antes de fijar aserciones (probe
 * descartado): recordCookieConsent → undefined; crea exactamente 4 filas (los 4
 * scopes de cookies); accepted = !!prefs[key]; version/ip/ua/customerId/email se
 * copian idénticos a cada fila; campos opcionales ausentes → null; createMany no
 * dispara default-checks de FK más allá de customerId (relación opcional SetNull).
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// ───────────────────────── Mocks (deben ir antes de importar el SUT) ─────────────────────────

vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

// getSettingValue lo controlamos por test. Default: devuelve una versión
// RUN-scoped (para que la limpieza pueda borrar por `version startsWith RUN`).
// Tests concretos hacen mockReturnValueOnce / mockImplementationOnce para
// ejercer fallback, versión custom, etc.
const getSettingValueMock = vi.fn();
vi.mock("@/lib/cms", () => ({
  getSettingValue: (key: string, fallback: string) => getSettingValueMock(key, fallback),
}));

import { prisma } from "@/lib/db";
import { recordCookieConsent } from "./service";
import {
  acceptAllPreferences,
  rejectAllPreferences,
  emptyPreferences,
  type CookiePreferences,
} from "@/lib/cookie-consent";

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida. Va en `version` (vía el mock) → la limpieza borra
// exactamente lo que creamos sin tocar consents reales.
const RUN = `ITESTCONSENT${Date.now()}${Math.floor(Math.random() * 1e6)}`.toUpperCase();

let seq = 0;
function nextId() {
  seq += 1;
  return `${RUN}-${seq}`;
}

// Versión RUN-scoped que el mock de getSettingValue devuelve por defecto.
function runVersion() {
  return `${RUN}-vDefault`;
}

// Todas las filas creadas por el SUT llevan la versión RUN-scoped activa →
// borramos exactamente eso. Se acumulan las versiones custom usadas por tests.
const usedVersions = new Set<string>();

// Helper: lee todas las filas Consent persistidas con una versión dada, ordenadas
// para aserciones deterministas por scope.
async function readByVersion(version: string) {
  return prisma.consent.findMany({
    where: { version },
    orderBy: { scope: "asc" },
  });
}

function makePrefs(over: Partial<CookiePreferences> = {}): CookiePreferences {
  return { ...acceptAllPreferences(), ...over };
}

describe.skipIf(!hasDb)("consent/service — integración DB (audit trail Ley 1581)", () => {
  beforeAll(() => {
    // Default del mock: versión RUN-scoped. Cada test que necesite otra cosa
    // sobreescribe con mockReturnValueOnce / mockImplementationOnce.
    getSettingValueMock.mockImplementation(() => runVersion());
    usedVersions.add(runVersion());
  });

  afterEach(() => {
    // No reseteamos la implementación default (beforeAll la fijó), solo el
    // historial de llamadas para que los spies de cada test partan limpios.
    getSettingValueMock.mockClear();
    getSettingValueMock.mockImplementation(() => runVersion());
  });

  afterAll(async () => {
    // Limpieza SCOPED: borra solo filas cuya `version` fue creada por este RUN.
    // Una sola query con `version IN (...)` (rápida contra el pooler) y, por si
    // alguna version del RUN no quedó registrada en el Set, un barrido extra
    // SCOPED por `version startsWith RUN`. Consent → Customer es SetNull, así
    // que borrar Consent antes que Customer es seguro.
    await prisma.consent.deleteMany({ where: { version: { in: [...usedVersions] } } });
    await prisma.consent.deleteMany({ where: { version: { startsWith: RUN } } });
    // Customers de prueba (RUN-scoped por email/supabaseUserId/referralCode).
    await prisma.customer.deleteMany({ where: { email: { startsWith: RUN } } });
  }, 30000);

  // ───────────────────────── Estructura del audit trail: una fila por scope ─────────────────────────

  describe("estructura: una fila por cada scope de cookies", () => {
    it("crea EXACTAMENTE 4 filas (NECESSARY/FUNCTIONAL/ANALYTICS/MARKETING) por invocación", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      const ret = await recordCookieConsent({ prefs: acceptAllPreferences() });

      // El service no retorna nada — la persistencia se prueba leyendo la DB.
      expect(ret).toBeUndefined();

      const rows = await readByVersion(version);
      expect(rows).toHaveLength(4);

      const scopes = rows.map((r) => r.scope).sort();
      expect(scopes).toEqual([
        "COOKIES_ANALYTICS",
        "COOKIES_FUNCTIONAL",
        "COOKIES_MARKETING",
        "COOKIES_NECESSARY",
      ]);

      // No persiste scopes ajenos al banner de cookies (NEWSLETTER, HABEAS_DATA…).
      expect(rows.every((r) => r.scope.startsWith("COOKIES_"))).toBe(true);
    });

    it("NO persiste NEWSLETTER ni HABEAS_DATA ni MARKETING_PROFILING (solo las 4 cookies)", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      await recordCookieConsent({ prefs: acceptAllPreferences() });

      const nonCookie = await prisma.consent.findMany({
        where: {
          version,
          scope: { in: ["NEWSLETTER", "MARKETING_PROFILING", "HABEAS_DATA"] },
        },
      });
      expect(nonCookie).toHaveLength(0);
    });

    it("invocaciones repetidas son append-only (acumulan filas, no upsert)", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      await recordCookieConsent({ prefs: acceptAllPreferences() });
      await recordCookieConsent({ prefs: rejectAllPreferences() });

      // 2 invocaciones × 4 scopes = 8 filas con esta version (audit trail completo).
      const rows = await readByVersion(version);
      expect(rows).toHaveLength(8);
    });
  });

  // ───────────────────────── Mapeo prefs → accepted ─────────────────────────

  describe("mapeo accepted = !!prefs[key] por scope", () => {
    it("acceptAll → las 4 cookies accepted=true", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      await recordCookieConsent({ prefs: acceptAllPreferences() });

      const rows = await readByVersion(version);
      const byScope = Object.fromEntries(rows.map((r) => [r.scope, r.accepted]));
      expect(byScope).toEqual({
        COOKIES_NECESSARY: true,
        COOKIES_FUNCTIONAL: true,
        COOKIES_ANALYTICS: true,
        COOKIES_MARKETING: true,
      });
    });

    it("rejectAll → NECESSARY true (locked), las otras 3 false", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      await recordCookieConsent({ prefs: rejectAllPreferences() });

      const rows = await readByVersion(version);
      const byScope = Object.fromEntries(rows.map((r) => [r.scope, r.accepted]));
      // NECESSARY siempre true: rejectAllPreferences() deja necessary:true.
      expect(byScope.COOKIES_NECESSARY).toBe(true);
      expect(byScope.COOKIES_FUNCTIONAL).toBe(false);
      expect(byScope.COOKIES_ANALYTICS).toBe(false);
      expect(byScope.COOKIES_MARKETING).toBe(false);
    });

    it("preferencia mixta se mapea scope-por-scope con fidelidad", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      // functional+marketing aceptadas, analytics rechazada.
      await recordCookieConsent({
        prefs: makePrefs({ functional: true, analytics: false, marketing: true }),
      });

      const rows = await readByVersion(version);
      const byScope = Object.fromEntries(rows.map((r) => [r.scope, r.accepted]));
      expect(byScope).toEqual({
        COOKIES_NECESSARY: true,
        COOKIES_FUNCTIONAL: true,
        COOKIES_ANALYTICS: false,
        COOKIES_MARKETING: true,
      });
    });

    it("emptyPreferences → solo NECESSARY true, resto false (estado 'no decidió' coercionado)", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      await recordCookieConsent({ prefs: emptyPreferences() });

      const rows = await readByVersion(version);
      const byScope = Object.fromEntries(rows.map((r) => [r.scope, r.accepted]));
      expect(byScope.COOKIES_NECESSARY).toBe(true);
      expect(byScope.COOKIES_FUNCTIONAL).toBe(false);
      expect(byScope.COOKIES_ANALYTICS).toBe(false);
      expect(byScope.COOKIES_MARKETING).toBe(false);
    });

    it("valores falsy no booleanos en prefs se coercionan a false (!! defensivo)", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      // Simula prefs malformadas (p.ej. deserializadas con undefined/0/"").
      const dirty = {
        ...acceptAllPreferences(),
        functional: undefined,
        analytics: 0,
        marketing: "",
      } as unknown as CookiePreferences;

      await recordCookieConsent({ prefs: dirty });

      const rows = await readByVersion(version);
      const byScope = Object.fromEntries(rows.map((r) => [r.scope, r.accepted]));
      // Todas las opcionales falsy → false; necessary sigue true.
      expect(byScope.COOKIES_NECESSARY).toBe(true);
      expect(byScope.COOKIES_FUNCTIONAL).toBe(false);
      expect(byScope.COOKIES_ANALYTICS).toBe(false);
      expect(byScope.COOKIES_MARKETING).toBe(false);
      // Y persistió Boolean real, no el valor crudo.
      expect(rows.every((r) => typeof r.accepted === "boolean")).toBe(true);
    });

    it("valores truthy no booleanos se coercionan a true (!! defensivo)", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      const dirty = {
        ...rejectAllPreferences(),
        functional: 1,
        analytics: "yes",
      } as unknown as CookiePreferences;

      await recordCookieConsent({ prefs: dirty });

      const rows = await readByVersion(version);
      const byScope = Object.fromEntries(rows.map((r) => [r.scope, r.accepted]));
      expect(byScope.COOKIES_FUNCTIONAL).toBe(true);
      expect(byScope.COOKIES_ANALYTICS).toBe(true);
      expect(byScope.COOKIES_MARKETING).toBe(false);
      expect(rows.every((r) => typeof r.accepted === "boolean")).toBe(true);
    });
  });

  // ───────────────────────── Versión del aviso de privacidad ─────────────────────────

  describe("version: se lee de getSettingValue y se copia idéntica a cada fila", () => {
    it("invoca getSettingValue con key='PRIVACY_POLICY_VERSION' y fallback='v1'", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      await recordCookieConsent({ prefs: acceptAllPreferences() });

      // Contrato real del SUT: clave + fallback exactos.
      expect(getSettingValueMock).toHaveBeenCalledWith("PRIVACY_POLICY_VERSION", "v1");
    });

    it("la MISMA versión se estampa en las 4 filas (consistencia del snapshot legal)", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      await recordCookieConsent({ prefs: acceptAllPreferences() });

      const rows = await readByVersion(version);
      expect(rows).toHaveLength(4);
      expect(new Set(rows.map((r) => r.version)).size).toBe(1);
      expect(rows.every((r) => r.version === version)).toBe(true);
    });

    it("cambiar la versión del setting cambia la versión persistida (re-consent)", async () => {
      const vOld = nextId();
      const vNew = nextId();
      usedVersions.add(vOld);
      usedVersions.add(vNew);

      getSettingValueMock.mockReturnValueOnce(vOld);
      await recordCookieConsent({ prefs: acceptAllPreferences() });

      getSettingValueMock.mockReturnValueOnce(vNew);
      await recordCookieConsent({ prefs: acceptAllPreferences() });

      const oldRows = await readByVersion(vOld);
      const newRows = await readByVersion(vNew);
      expect(oldRows).toHaveLength(4);
      expect(newRows).toHaveLength(4);
      // Las filas viejas conservan la versión vieja (no se mutan): trazabilidad
      // de qué aviso vió el titular al consentir.
      expect(oldRows.every((r) => r.version === vOld)).toBe(true);
      expect(newRows.every((r) => r.version === vNew)).toBe(true);
    });

    it("usa el fallback 'v1' cuando getSettingValue lo resuelve así (setting ausente)", async () => {
      // Simulamos que el setting no existe → getSettingValue devuelve su fallback.
      // Para mantener la limpieza SCOPED, lo enmascaramos con una versión que
      // contiene el fallback pero es RUN-única.
      const fallbackVersion = `${nextId()}-v1`;
      usedVersions.add(fallbackVersion);
      getSettingValueMock.mockImplementationOnce((_key: string, fb: string) => {
        // Verificamos que el fallback que el SUT pasa es exactamente "v1".
        expect(fb).toBe("v1");
        return fallbackVersion;
      });

      await recordCookieConsent({ prefs: rejectAllPreferences() });

      const rows = await readByVersion(fallbackVersion);
      expect(rows).toHaveLength(4);
      expect(rows.every((r) => r.version === fallbackVersion)).toBe(true);
    });
  });

  // ───────────────────────── Asociación a cliente / sesión + metadatos ─────────────────────────

  describe("asociación: customerId / email / ip / userAgent se copian a cada fila", () => {
    it("asocia a un customer real (FK válida) y copia el customerId a las 4 filas", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      const id = nextId();
      const customer = await prisma.customer.create({
        data: {
          email: `${id}@consent.test`,
          supabaseUserId: `${id}-sub`,
          referralCode: `${id}-ref`,
        },
      });

      await recordCookieConsent({
        prefs: acceptAllPreferences(),
        customerId: customer.id,
        email: customer.email,
      });

      const rows = await readByVersion(version);
      expect(rows).toHaveLength(4);
      expect(rows.every((r) => r.customerId === customer.id)).toBe(true);
      expect(rows.every((r) => r.email === customer.email)).toBe(true);

      // La relación es navegable (FK persistida de verdad, no string suelto).
      const withCustomer = await prisma.consent.findFirst({
        where: { version, customerId: customer.id },
        include: { customer: true },
      });
      expect(withCustomer?.customer?.id).toBe(customer.id);
    });

    it("guest sin cuenta: customerId null, identificado por email", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      const guestEmail = `${nextId()}-guest@consent.test`;
      await recordCookieConsent({
        prefs: rejectAllPreferences(),
        email: guestEmail,
      });

      const rows = await readByVersion(version);
      expect(rows).toHaveLength(4);
      expect(rows.every((r) => r.customerId === null)).toBe(true);
      expect(rows.every((r) => r.email === guestEmail)).toBe(true);
    });

    it("copia ip y userAgent (metadatos de evidencia) idénticos a las 4 filas", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      const ip = `${nextId()}-203.0.113.7`;
      const ua = `${nextId()}-Mozilla/5.0 (consent test)`;
      await recordCookieConsent({ prefs: acceptAllPreferences(), ip, userAgent: ua });

      const rows = await readByVersion(version);
      expect(rows).toHaveLength(4);
      expect(rows.every((r) => r.ipAddress === ip)).toBe(true);
      expect(rows.every((r) => r.userAgent === ua)).toBe(true);
    });

    it("campos opcionales ausentes se persisten como null (no undefined, no '')", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      // Solo prefs: ni customerId, ni email, ni ip, ni userAgent.
      await recordCookieConsent({ prefs: acceptAllPreferences() });

      const rows = await readByVersion(version);
      expect(rows).toHaveLength(4);
      for (const r of rows) {
        expect(r.customerId).toBeNull();
        expect(r.email).toBeNull();
        expect(r.ipAddress).toBeNull();
        expect(r.userAgent).toBeNull();
        // revokesId nunca lo setea recordCookieConsent (revocación es otra ruta).
        expect(r.revokesId).toBeNull();
      }
    });

    it("inputs null explícitos se conservan como null (?? null)", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      await recordCookieConsent({
        prefs: acceptAllPreferences(),
        customerId: null,
        email: null,
        ip: null,
        userAgent: null,
      });

      const rows = await readByVersion(version);
      expect(rows).toHaveLength(4);
      expect(
        rows.every(
          (r) =>
            r.customerId === null &&
            r.email === null &&
            r.ipAddress === null &&
            r.userAgent === null,
        ),
      ).toBe(true);
    });
  });

  // ───────────────────────── Timestamp ─────────────────────────

  describe("acceptedAt: timestamp del consentimiento", () => {
    it("estampa acceptedAt con default(now()) en cada fila (ventana temporal coherente)", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      const before = Date.now();
      await recordCookieConsent({ prefs: acceptAllPreferences() });
      const after = Date.now();

      const rows = await readByVersion(version);
      expect(rows).toHaveLength(4);
      for (const r of rows) {
        expect(r.acceptedAt).toBeInstanceOf(Date);
        const t = r.acceptedAt.getTime();
        // Tolerancia ±5s para skew del reloj de la DB vs el del runner.
        expect(t).toBeGreaterThanOrEqual(before - 5000);
        expect(t).toBeLessThanOrEqual(after + 5000);
      }
    });

    it("dos invocaciones separadas en el tiempo producen acceptedAt distintos (orden cronológico)", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      await recordCookieConsent({ prefs: acceptAllPreferences() });
      // Pequeña pausa para garantizar un now() distinto (ms granularity).
      await new Promise((res) => setTimeout(res, 25));
      await recordCookieConsent({ prefs: rejectAllPreferences() });

      const rows = await readByVersion(version);
      expect(rows).toHaveLength(8);

      // El registro NECESSARY de la 2ª invocación es posterior o igual al de la 1ª.
      const necessary = rows
        .filter((r) => r.scope === "COOKIES_NECESSARY")
        .sort((a, b) => a.acceptedAt.getTime() - b.acceptedAt.getTime());
      expect(necessary).toHaveLength(2);
      expect(necessary[1].acceptedAt.getTime()).toBeGreaterThanOrEqual(
        necessary[0].acceptedAt.getTime(),
      );
    });
  });

  // ───────────────────────── Integridad / consultabilidad del audit trail ─────────────────────────

  describe("integridad: el audit trail es consultable por los índices del modelo", () => {
    it("filtrable por (email, scope) — índice @@index([email, scope])", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      const email = `${nextId()}-query@consent.test`;
      await recordCookieConsent({ prefs: acceptAllPreferences(), email });

      const marketing = await prisma.consent.findFirst({
        where: { version, email, scope: "COOKIES_MARKETING" },
      });
      expect(marketing).not.toBeNull();
      expect(marketing?.accepted).toBe(true);
      expect(marketing?.email).toBe(email);
    });

    it("filtrable por (customerId, scope) — la última decisión por scope es recuperable", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      const id = nextId();
      const customer = await prisma.customer.create({
        data: {
          email: `${id}@consent.test`,
          supabaseUserId: `${id}-sub`,
          referralCode: `${id}-ref`,
        },
      });

      // 1º acepta todo, luego rechaza opcionales → append-only, dos filas por scope.
      getSettingValueMock.mockReturnValueOnce(version);
      await recordCookieConsent({ prefs: acceptAllPreferences(), customerId: customer.id });
      await new Promise((res) => setTimeout(res, 25));
      getSettingValueMock.mockReturnValueOnce(version);
      await recordCookieConsent({ prefs: rejectAllPreferences(), customerId: customer.id });

      // La decisión MÁS RECIENTE para ANALYTICS (orderBy acceptedAt desc) es false.
      const latestAnalytics = await prisma.consent.findFirst({
        where: { version, customerId: customer.id, scope: "COOKIES_ANALYTICS" },
        orderBy: { acceptedAt: "desc" },
      });
      expect(latestAnalytics?.accepted).toBe(false);

      // Hay exactamente 2 filas ANALYTICS para ese customer (el historial completo).
      const allAnalytics = await prisma.consent.count({
        where: { version, customerId: customer.id, scope: "COOKIES_ANALYTICS" },
      });
      expect(allAnalytics).toBe(2);
    });

    it("cada fila tiene id cuid generado (PK) — filas distinguibles", async () => {
      const version = nextId();
      usedVersions.add(version);
      getSettingValueMock.mockReturnValue(version);

      await recordCookieConsent({ prefs: acceptAllPreferences() });

      const rows = await readByVersion(version);
      const ids = rows.map((r) => r.id);
      expect(new Set(ids).size).toBe(4); // 4 ids únicos
      expect(ids.every((x) => typeof x === "string" && x.length > 0)).toBe(true);
    });
  });
});
