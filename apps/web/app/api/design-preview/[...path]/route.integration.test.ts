/*
 * LUC-SEC-001 — Route Handler /api/design-preview/* (integración).
 *
 * Certifica las pruebas de aceptación del hallazgo contra Prisma real (Postgres)
 * con el I/O de Storage mockeado (mismo patrón que finalize-design.*):
 *
 *   - GET anónimo (sin cookie ni token) → 404, sin filtrar si existe.
 *   - Sesión anónima A ≠ dueño B → 404 aun conociendo el designId.
 *   - Dueño (cookie cart_session o customerId autenticado) → 200 + bytes.
 *   - Admin → 200, incluido el preview limpio.
 *   - Token de compartir /d/ y tokens de quote/order → SOLO variantes
 *     watermark; el preview limpio y el borrador responden 404.
 *   - Path traversal / shape inválido → 404 sin tocar DB ni Storage.
 *   - El bucket design-previews quedó PRIVADO (migración 046) — flag en DB.
 *
 * Fixtures RUN-prefijados, borrados en afterAll.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { hashBearerToken } from "@/lib/token-hash";

// ── I/O de Storage mockeado: bytes conocidos por path ──
const mock = vi.hoisted(() => {
  const objects = new Map<string, Buffer>();
  const from = (bucket: string) => ({
    download: async (path: string) => {
      const buf = objects.get(`${bucket}/${path}`);
      return buf
        ? { data: new Blob([new Uint8Array(buf)]), error: null }
        : { data: null, error: { message: "Object not found" } };
    },
  });
  return { objects, from };
});

// ── Auth mockeada: cada test decide quién llama ──
const authState = vi.hoisted(() => ({
  customerId: null as string | null,
  isAdmin: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  supabaseService: { storage: { from: mock.from } },
}));
vi.mock("@/lib/auth", () => ({
  getCurrentCustomer: async () =>
    authState.customerId ? { customer: { id: authState.customerId } } : null,
  getCurrentAdmin: async () => (authState.isAdmin ? { admin: { id: "admin-1" } } : null),
}));

import { prisma } from "@/lib/db";
import { GET } from "@/app/api/design-preview/[...path]/route";

const RUN = `pvx${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const hasDb = Boolean(process.env.DATABASE_URL);

const OWNER_SESSION = crypto.randomUUID();
const OTHER_SESSION = crypto.randomUUID();
const SHARE_TOKEN = `${RUN}-share-token-32hexchars0000`.slice(0, 32);
// Tokens de 32 hex ÚNICOS por corrida (un residuo de una corrida fallida
// anterior no puede colisionar por el unique de publicAccessTokenHash).
const ORDER_TOKEN = randomBytes(16).toString("hex");
const QUOTE_TOKEN = randomBytes(16).toString("hex");
const CLEAN_BYTES = Buffer.from("preview-limpio");
const WM_BYTES = Buffer.from("preview-watermark");
const DRAFT_BYTES = Buffer.from("borrador");

let designId = "";
let ownerCustomerId = "";
const cleanup: Array<Promise<unknown>> = [];

function req(path: string, opts: { session?: string; query?: string } = {}) {
  const headers = new Headers();
  if (opts.session) headers.set("cookie", `cart_session=${opts.session}`);
  return new Request(
    `http://localhost/api/design-preview/${path}${opts.query ?? ""}`,
    { headers },
  );
}

async function call(path: string, opts: Parameters<typeof req>[1] = {}) {
  const res = await GET(req(path, opts), {
    params: Promise.resolve({ path: path.split("/") }),
  });
  return res;
}

beforeAll(async () => {
  if (!hasDb) return;
  const category = await prisma.category.create({
    data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
    select: { id: true },
  });
  const product = await prisma.product.create({
    data: {
      slug: `${RUN}-prod`,
      name: `Imán ${RUN}`,
      description: "fixture preview-access",
      basePrice: 10_000,
      sku: `${RUN}-PROD`.toUpperCase(),
      categoryId: category.id,
      isPersonalizable: true,
      personalizationKind: "PHOTO_PACK",
    },
    select: { id: true },
  });
  const customer = await prisma.customer.create({
    data: {
      email: `${RUN}@lucams.test`,
      supabaseUserId: `${RUN}-sub`,
      referralCode: `${RUN}-ref`,
    },
    select: { id: true },
  });
  ownerCustomerId = customer.id;

  const design = await prisma.design.create({
    data: {
      customerId: customer.id,
      sessionId: OWNER_SESSION,
      productId: product.id,
      status: "READY",
      canvasData: { version: 2 },
      previewUrl: `/api/design-preview/PENDING/preview.png`, // se corrige abajo
      previewWatermarkedAt: new Date(),
      shareTokenHash: hashBearerToken(SHARE_TOKEN),
    },
    select: { id: true },
  });
  designId = design.id;
  await prisma.design.update({
    where: { id: designId },
    data: { previewUrl: `/api/design-preview/${designId}/preview.png` },
  });

  // Orden y cotización que referencian el diseño (capacidades ot/qt)
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, name: `Var ${RUN}`, sku: `${RUN}-V1`.toUpperCase(), price: 10_000, stock: 5, attributes: {} },
    select: { id: true },
  });
  const order = await prisma.order.create({
    data: {
      number: `${RUN}-1`,
      email: `${RUN}@lucams.test`,
      phone: "3001112233",
      shippingAddress: { fullName: "Test", city: "Bogotá", department: "Bogotá D.C." },
      subtotal: 10_000,
      shipping: 0,
      total: 10_000,
      paymentMethod: "WOMPI",
      status: "PAID",
      publicAccessTokenHash: hashBearerToken(ORDER_TOKEN),
      items: {
        create: [{ variantId: variant.id, qty: 1, unitPrice: 10_000, designId }],
      },
    },
    select: { id: true },
  });
  const quote = await prisma.quote.create({
    data: {
      number: `COT-${RUN}`,
      customerName: "Test",
      customerWhatsapp: "3001112233",
      city: "Bogotá",
      department: "Bogotá D.C.",
      status: "CONTACTED",
      subtotal: 10_000,
      total: 10_000,
      publicAccessTokenHash: hashBearerToken(QUOTE_TOKEN),
      items: {
        create: [{ productName: `Imán ${RUN}`, unitPrice: 10_000, quantity: 1, designId }],
      },
    },
    select: { id: true },
  });

  mock.objects.set(`design-previews/${designId}/preview.png`, CLEAN_BYTES);
  mock.objects.set(`design-previews/${designId}/preview-wm.webp`, WM_BYTES);
  mock.objects.set(`design-previews/${designId}/draft-preview.webp`, DRAFT_BYTES);

  cleanup.push(
    prisma.quote.deleteMany({ where: { id: quote.id } }),
    prisma.order.deleteMany({ where: { id: order.id } }),
    prisma.design.deleteMany({ where: { id: designId } }),
    prisma.productVariant.deleteMany({ where: { productId: product.id } }),
    prisma.product.deleteMany({ where: { id: product.id } }),
    prisma.category.deleteMany({ where: { slug: `${RUN}-cat` } }),
    prisma.customer.deleteMany({ where: { id: customer.id } }),
  );
});

afterAll(async () => {
  if (!hasDb) return;
  for (const p of cleanup) await p.catch(() => {});
});

describe.skipIf(!hasDb)("GET /api/design-preview — autorización (LUC-SEC-001)", () => {
  it("anónimo sin cookie ni token → 404 en TODAS las variantes (sin oráculo)", async () => {
    for (const p of [`${designId}/preview.png`, `${designId}/preview-wm.webp`, `${designId}/draft-preview.webp`]) {
      const res = await call(p);
      expect(res.status).toBe(404);
    }
  });

  it("diseño inexistente → 404", async () => {
    expect((await call("ck000000000000000000000000/preview.png")).status).toBe(404);
  });

  it("sesión anónima AJENA → 404 aun conociendo el designId", async () => {
    expect((await call(`${designId}/preview-wm.webp`, { session: OTHER_SESSION })).status).toBe(404);
  });

  it("dueño por cookie cart_session → 200 con los bytes y cache privado", async () => {
    const res = await call(`${designId}/preview.png`, { session: OWNER_SESSION });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("private");
    expect(Buffer.from(await res.arrayBuffer()).equals(CLEAN_BYTES)).toBe(true);
  });

  it("dueño por customer autenticado → 200", async () => {
    authState.customerId = ownerCustomerId;
    try {
      expect((await call(`${designId}/preview.png`)).status).toBe(200);
    } finally {
      authState.customerId = null;
    }
  });

  it("admin → 200 incluso en preview limpio ajeno", async () => {
    authState.isAdmin = true;
    try {
      expect((await call(`${designId}/preview.png`)).status).toBe(200);
    } finally {
      authState.isAdmin = false;
    }
  });

  it("share token /d/ → watermark 200, pero preview limpio y borrador 404", async () => {
    expect((await call(`${designId}/preview-wm.webp`, { query: `?st=${SHARE_TOKEN}` })).status).toBe(200);
    expect((await call(`${designId}/preview.png`, { query: `?st=${SHARE_TOKEN}` })).status).toBe(404);
    expect((await call(`${designId}/draft-preview.webp`, { query: `?st=${SHARE_TOKEN}` })).status).toBe(404);
  });

  it("share token incorrecto → 404", async () => {
    expect((await call(`${designId}/preview-wm.webp`, { query: "?st=token-mal" })).status).toBe(404);
  });

  it("order token → solo watermark; quote token → solo watermark", async () => {
    expect((await call(`${designId}/preview-wm.webp`, { query: `?ot=${ORDER_TOKEN}` })).status).toBe(200);
    expect((await call(`${designId}/preview.png`, { query: `?ot=${ORDER_TOKEN}` })).status).toBe(404);
    expect((await call(`${designId}/preview-wm.webp`, { query: `?qt=${QUOTE_TOKEN}` })).status).toBe(200);
    expect((await call(`${designId}/preview.png`, { query: `?qt=${QUOTE_TOKEN}` })).status).toBe(404);
  });

  it("order token de OTRA orden (no contiene el diseño) → 404", async () => {
    const otherOrderToken = "ffffffffffffffffffffffffffffffff";
    const other = await prisma.order.create({
      data: {
        number: `${RUN}-2`,
        email: `${RUN}@lucams.test`,
        phone: "3001112233",
        shippingAddress: { fullName: "Test", city: "Bogotá", department: "Bogotá D.C." },
        subtotal: 1_000,
        shipping: 0,
        total: 1_000,
        paymentMethod: "WOMPI",
        status: "PAID",
        publicAccessTokenHash: hashBearerToken(otherOrderToken),
      },
      select: { id: true },
    });
    try {
      expect((await call(`${designId}/preview-wm.webp`, { query: `?ot=${otherOrderToken}` })).status).toBe(404);
    } finally {
      await prisma.order.delete({ where: { id: other.id } }).catch(() => {});
    }
  });

  it("path traversal y shapes inválidos → 404 sin tocar Storage", async () => {
    for (const p of ["..%2F..%2Fetc", `${designId}/preview.exe`, `${designId}/pages/1.webp`, `${designId}/preview.png/extra`]) {
      expect((await call(p)).status).toBe(404);
    }
  });

  it("el bucket design-previews es PRIVADO en DB (migración 046)", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ public: boolean }>>(
      `SELECT public FROM storage.buckets WHERE id = 'design-previews'`,
    );
    expect(rows[0]?.public).toBe(false);
  });
});
