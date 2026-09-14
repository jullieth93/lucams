/*
 * Unit — POST /api/cron/backup-heartbeat (N-19a, 2026-09-11).
 *
 * El consumidor es GitHub Actions (workflow backup.yml) tras un backup exitoso a
 * R2 — NO es un job pg_cron. Lo que estos tests GARANTIZAN:
 *  - Auth igual que los crons pg_cron: header `x-cron-secret` timing-safe; sin
 *    secreto válido (o sin CRON_SECRET en el ambiente) → 401 y NO se persiste.
 *  - Con secreto válido: upsert del latido (recordBackupHeartbeat), con el
 *    `detail` del body cuando viene — y un body ausente/inválido NO lo bloquea.
 *  - Si el upsert FALLA → 500 a propósito: el workflow sale ROJO el mismo día
 *    (un 200 falso solo lo delataría la alerta backup_stale 36h después).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordBackupHeartbeat, captureServerError } = vi.hoisted(() => ({
  recordBackupHeartbeat: vi.fn(async () => {}),
  captureServerError: vi.fn(async () => {}),
}));

vi.mock("@/features/observability/cron-heartbeat", () => ({ recordBackupHeartbeat }));
vi.mock("@/lib/error-capture", () => ({ captureServerError }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { NextRequest } from "next/server";

import { POST } from "./route";

const SECRET = "cron-secret-de-prueba";

function req(opts: { secret?: string; body?: string }): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.secret !== undefined) headers["x-cron-secret"] = opts.secret;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest("https://lucamsshop.com/api/cron/backup-heartbeat", {
    method: "POST",
    headers,
    body: opts.body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/cron/backup-heartbeat — auth (mismo patrón que los crons pg_cron)", () => {
  it("sin header → 401 y NO registra latido", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    expect(recordBackupHeartbeat).not.toHaveBeenCalled();
  });

  it("secreto equivocado → 401 y NO registra latido", async () => {
    const res = await POST(req({ secret: "otro-secreto" }));
    expect(res.status).toBe(401);
    expect(recordBackupHeartbeat).not.toHaveBeenCalled();
  });

  it("secreto de distinta longitud → 401 (timingSafeEqual protegido por length-check)", async () => {
    const res = await POST(req({ secret: "corto" }));
    expect(res.status).toBe(401);
    expect(recordBackupHeartbeat).not.toHaveBeenCalled();
  });

  it("CRON_SECRET ausente en el ambiente → 401 aunque manden header (fail-closed)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await POST(req({ secret: SECRET }));
    expect(res.status).toBe(401);
    expect(recordBackupHeartbeat).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/backup-heartbeat — latido", () => {
  it("con secreto válido registra el latido y responde ok", async () => {
    const res = await POST(req({ secret: SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(recordBackupHeartbeat).toHaveBeenCalledTimes(1);
    expect(recordBackupHeartbeat).toHaveBeenCalledWith(undefined);
  });

  it("pasa el `detail` del body (llave del dump) cuando viene", async () => {
    const res = await POST(
      req({
        secret: SECRET,
        body: JSON.stringify({ detail: "db/lucams-2026-09-11T071300Z.sql.gz.gpg" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(recordBackupHeartbeat).toHaveBeenCalledWith("db/lucams-2026-09-11T071300Z.sql.gz.gpg");
  });

  it("body inválido/ausente NO bloquea el latido (best-effort)", async () => {
    const res = await POST(req({ secret: SECRET, body: "no-es-json{" }));
    expect(res.status).toBe(200);
    expect(recordBackupHeartbeat).toHaveBeenCalledWith(undefined);
  });

  it("si el upsert FALLA → 500 (el workflow sale ROJO el mismo día, no 36h después)", async () => {
    recordBackupHeartbeat.mockRejectedValueOnce(new Error("db caída"));
    const res = await POST(req({ secret: SECRET }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "internal" });
    expect(captureServerError).toHaveBeenCalledTimes(1);
  });
});
