/*
 * Unit — POST /api/cron/domain-watch (vigilante del dominio, L-H3/L-N1).
 *
 * El productor es el workflow domain-watch.yml de GitHub Actions (diario).
 * Garantías:
 *  - Auth igual que los demás /api/cron/*: header `x-cron-secret` timing-safe;
 *    sin secreto válido → 401 y NO se procesa nada (fail-closed sin env).
 *  - Body Zod-validado: JSON roto o tipos errados → 400 (un payload malformado
 *    no debe pisar el baseline ni disparar alertas).
 *  - Con body válido: processDomainObservation + latido `cron:domain-watch`.
 *  - Si el procesamiento FALLA → 500 a propósito: el job de GitHub sale rojo el
 *    mismo día (patrón backup-heartbeat), en vez de dejar la vigilancia muda.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { processDomainObservation, recordCronHeartbeat, captureServerError } = vi.hoisted(() => ({
  processDomainObservation: vi.fn(async () => ({ alerts: [] as string[] })),
  recordCronHeartbeat: vi.fn(async () => {}),
  captureServerError: vi.fn(async () => {}),
}));

vi.mock("@/features/observability/domain-watch", () => ({ processDomainObservation }));
vi.mock("@/features/observability/cron-heartbeat", () => ({ recordCronHeartbeat }));
vi.mock("@/lib/error-capture", () => ({ captureServerError }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { NextRequest } from "next/server";

import { POST } from "./route";

const SECRET = "cron-secret-de-prueba";

function req(opts: { secret?: string; body?: string }): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.secret !== undefined) headers["x-cron-secret"] = opts.secret;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest("https://lucamsshop.com/api/cron/domain-watch", {
    method: "POST",
    headers,
    body: opts.body,
  });
}

const VALID_BODY = JSON.stringify({
  rdapOk: true,
  expiresAt: "2027-07-19T04:00:00Z",
  daysLeft: 300,
  nameservers: ["romina.ns.cloudflare.com", "armando.ns.cloudflare.com"],
  status: ["ok"],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
  processDomainObservation.mockResolvedValue({ alerts: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/cron/domain-watch — auth (mismo patrón que los demás crons)", () => {
  it("sin header → 401 y NO procesa", async () => {
    const res = await POST(req({ body: VALID_BODY }));
    expect(res.status).toBe(401);
    expect(processDomainObservation).not.toHaveBeenCalled();
  });

  it("secreto equivocado → 401 y NO procesa", async () => {
    const res = await POST(req({ secret: "otro-secreto", body: VALID_BODY }));
    expect(res.status).toBe(401);
    expect(processDomainObservation).not.toHaveBeenCalled();
  });

  it("sin CRON_SECRET configurado en el ambiente → 401 (fail-closed)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await POST(req({ secret: SECRET, body: VALID_BODY }));
    expect(res.status).toBe(401);
    expect(processDomainObservation).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/domain-watch — validación del body (Zod)", () => {
  it("JSON roto → 400 sin procesar", async () => {
    const res = await POST(req({ secret: SECRET, body: "no-json{{" }));
    expect(res.status).toBe(400);
    expect(processDomainObservation).not.toHaveBeenCalled();
  });

  it("sin rdapOk booleano → 400", async () => {
    const res = await POST(req({ secret: SECRET, body: JSON.stringify({ daysLeft: 300 }) }));
    expect(res.status).toBe(400);
    expect(processDomainObservation).not.toHaveBeenCalled();
  });

  it("daysLeft negativo o expiresAt no-ISO → 400", async () => {
    const neg = await POST(
      req({ secret: SECRET, body: JSON.stringify({ rdapOk: true, daysLeft: -5 }) }),
    );
    expect(neg.status).toBe(400);
    const badDate = await POST(
      req({ secret: SECRET, body: JSON.stringify({ rdapOk: true, expiresAt: "2027-07-19" }) }),
    );
    expect(badDate.status).toBe(400);
    expect(processDomainObservation).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/domain-watch — observación válida", () => {
  it("procesa la observación y registra el latido con el resumen", async () => {
    const res = await POST(req({ secret: SECRET, body: VALID_BODY }));
    expect(res.status).toBe(200);
    expect(processDomainObservation).toHaveBeenCalledWith({
      rdapOk: true,
      expiresAt: "2027-07-19T04:00:00Z",
      daysLeft: 300,
      nameservers: ["romina.ns.cloudflare.com", "armando.ns.cloudflare.com"],
      status: ["ok"],
    });
    expect(recordCronHeartbeat).toHaveBeenCalledWith(
      "domain-watch",
      expect.stringContaining("300"),
    );
    const body = (await res.json()) as { ok: boolean; alerts: string[] };
    expect(body.ok).toBe(true);
    expect(body.alerts).toEqual([]);
  });

  it("rdapOk=false mínimo también es válido (corrida ciega del workflow)", async () => {
    const res = await POST(req({ secret: SECRET, body: JSON.stringify({ rdapOk: false }) }));
    expect(res.status).toBe(200);
    expect(processDomainObservation).toHaveBeenCalledWith({ rdapOk: false });
    expect(recordCronHeartbeat).toHaveBeenCalledWith(
      "domain-watch",
      expect.stringContaining("FALLA"),
    );
  });

  it("devuelve las keys de las alertas disparadas", async () => {
    processDomainObservation.mockResolvedValueOnce({ alerts: ["domain_expiry"] });
    const res = await POST(req({ secret: SECRET, body: VALID_BODY }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alerts: string[] };
    expect(body.alerts).toEqual(["domain_expiry"]);
  });

  it("si el procesamiento FALLA → 500 a propósito (el job de GitHub sale rojo el mismo día)", async () => {
    processDomainObservation.mockRejectedValueOnce(new Error("db caída"));
    const res = await POST(req({ secret: SECRET, body: VALID_BODY }));
    expect(res.status).toBe(500);
    expect(captureServerError).toHaveBeenCalled();
    expect(recordCronHeartbeat).not.toHaveBeenCalled();
  });
});
