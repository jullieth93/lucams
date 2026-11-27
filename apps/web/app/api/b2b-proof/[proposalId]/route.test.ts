import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashBearerToken } from "@/lib/token-hash";

const mocks = vi.hoisted(() => ({
  findProposal: vi.fn(),
  download: vi.fn(),
  verifyAdminRouteAccess: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    opportunityProposal: {
      findUnique: mocks.findProposal,
    },
  },
}));
vi.mock("@/lib/supabase/service", () => ({
  supabaseService: {
    storage: {
      from: () => ({
        download: mocks.download,
      }),
    },
  },
}));
vi.mock("@/lib/admin-rbac-guard", () => ({
  verifyAdminRouteAccess: mocks.verifyAdminRouteAccess,
}));

import { GET } from "./route";

const VALID_TOKEN = "a".repeat(64);
const VALID_PROPOSAL = {
  id: "prop-1",
  tokenHash: hashBearerToken(VALID_TOKEN),
  proofAssetPath: "b2b-proofs/opp-1/proof-1.webp",
  updatedAt: new Date("2026-11-20T12:00:00.000Z"),
  opportunity: { deletedAt: null },
};

function makeReq(proposalId: string, opts: { pt?: string; ifNoneMatch?: string } = {}) {
  const query = opts.pt ? `?pt=${opts.pt}` : "";
  const headers = new Headers();
  if (opts.ifNoneMatch) headers.set("if-none-match", opts.ifNoneMatch);
  return new Request(`http://localhost/api/b2b-proof/${proposalId}${query}`, { headers });
}

describe("GET /api/b2b-proof/[proposalId] — streaming + ETag/304 (Fase 5 · #20)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findProposal.mockResolvedValue(VALID_PROPOSAL);
    mocks.verifyAdminRouteAccess.mockResolvedValue({ ok: false });
  });

  it("responde 200 en streaming (sin arrayBuffer()) con ETag, Content-Length y headers privados", async () => {
    const payload = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
    const blob = new Blob([payload], { type: "image/webp" });
    const arrayBufferSpy = vi.spyOn(blob, "arrayBuffer");
    const streamSpy = vi.spyOn(blob, "stream");
    mocks.download.mockResolvedValue({ data: blob, error: null });

    const res = await GET(makeReq("prop-1", { pt: VALID_TOKEN }), {
      params: Promise.resolve({ proposalId: "prop-1" }),
    });

    expect(res.status).toBe(200);
    expect(streamSpy).toHaveBeenCalledTimes(1);
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("vary")).toBe("Cookie");
    expect(res.headers.get("content-length")).toBe(String(payload.byteLength));
    expect(res.headers.get("etag")).toMatch(/^W\/"[a-f0-9]{24}"$/);

    const received = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(received)).toEqual(Array.from(payload));
  });

  it("responde 304 Not Modified sin descargar de Storage cuando If-None-Match coincide", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    mocks.download.mockResolvedValue({ data: blob, error: null });

    const first = await GET(makeReq("prop-1", { pt: VALID_TOKEN }), {
      params: Promise.resolve({ proposalId: "prop-1" }),
    });
    const etag = first.headers.get("etag")!;
    mocks.download.mockClear();

    const second = await GET(
      makeReq("prop-1", { pt: VALID_TOKEN, ifNoneMatch: `"stale-tag", ${etag}` }),
      { params: Promise.resolve({ proposalId: "prop-1" }) },
    );

    expect(second.status).toBe(304);
    expect(second.headers.get("etag")).toBe(etag);
    expect(second.headers.get("cache-control")).toBe("private, max-age=300");
    expect(second.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("rechaza con 404 fail-closed sin oráculo ante acceso no autorizado aunque envíe If-None-Match", async () => {
    const res = await GET(makeReq("prop-1", { ifNoneMatch: "*" }), {
      params: Promise.resolve({ proposalId: "prop-1" }),
    });

    expect(res.status).toBe(404);
    expect(res.headers.get("etag")).toBeNull();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("rechaza con 404 si proofAssetPath tiene path traversal o extensión no permitida", async () => {
    mocks.findProposal.mockResolvedValue({
      ...VALID_PROPOSAL,
      proofAssetPath: "b2b-proofs/opp-1/../../secret.svg",
    });

    const res = await GET(makeReq("prop-1", { pt: VALID_TOKEN }), {
      params: Promise.resolve({ proposalId: "prop-1" }),
    });

    expect(res.status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("autoriza a admin con capacidad OPPORTUNITIES (sin token pt)", async () => {
    mocks.verifyAdminRouteAccess.mockResolvedValue({ ok: true });
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array([9, 8])]), error: null });

    const res = await GET(makeReq("prop-1"), {
      params: Promise.resolve({ proposalId: "prop-1" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toMatch(/^W\/"[a-f0-9]{24}"$/);
  });

  it("responde 404 (no 500) ante percent-encoding malformado en proposalId", async () => {
    const res = await GET(makeReq("bad-id", { pt: VALID_TOKEN }), {
      params: Promise.resolve({ proposalId: "%E0%A4%A" }),
    });
    expect(res.status).toBe(404);
    expect(mocks.findProposal).not.toHaveBeenCalled();
  });
});
