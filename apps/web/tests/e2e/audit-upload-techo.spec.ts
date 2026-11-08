/*
 * AUDITORÍA 2026-11-08 — verificación E2E del techo REAL de plataforma
 * (~4.5 MB por request de función en Vercel) contra el preview del PR.
 *
 * Cubre los casos límite que quedaron tras la primera tanda:
 *   1. Finalize de letter-set (×10 sets) y de nombre: las láminas 300 DPI ya
 *      NO viajan en el body de la Server Action (NEEDS_CLIENT_SLOTS → tickets
 *      firmados → PUT directo a Storage → finalize useStagedSlots).
 *   2. Galería de prediseñados cara A+B con total >4.5 MB: presupuesto
 *      COMBINADO del request (shrinkFilesToFitCombinedBudget).
 *   3. CMS (mediateca) y fichas del abecedario con archivo >4.5 MB:
 *      compresión en el navegador antes de la Server Action.
 *
 * Invariante global: NINGÚN request al origen de la app supera 4.5 MB de body
 * (los PUT directos a Supabase Storage no tienen ese techo y se miden aparte,
 * como evidencia de que el peso real va por Storage).
 *
 * Corre en LOCAL y STG/preview. En PRD PROHIBIDO (crea assets, diseños, fichas
 * y una cuenta admin efímera — todo se borra en afterAll).
 */

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";
import { enrollTotpFactor, loginAdminWithTotp } from "./_helpers/mfa";
import { resolvePersonalizationSurface } from "@/features/personalization/surface";

const MB = 1024 * 1024;
/** Techo real de plataforma por request de función (Vercel). */
const PLATFORM_BODY_LIMIT = 4.5 * MB;

test.skip(E2E_ENV === "prd", "La auditoría crea assets/diseños/admin efímero: prohibida en PRD.");
test.setTimeout(300_000);

const run = newRunId("techo");
const OUT_DIR = resolve(__dirname, "../../../../tmp/e2e-homologacion", `techo-${run}`);

// ──────────── Request spy: tamaños de TODOS los requests con body ────────────

type TrackedRequest = { url: string; method: string; size: number };

function trackRequests(page: import("@playwright/test").Page): TrackedRequest[] {
  const tracked: TrackedRequest[] = [];
  page.on("request", (req) => {
    const size = req.postDataBuffer()?.length ?? 0;
    if (size > 0) tracked.push({ url: req.url(), method: req.method(), size });
  });
  return tracked;
}

function assertNoOversizedAppRequest(tracked: TrackedRequest[], baseHost: string): void {
  const offenders = tracked.filter(
    (r) => new URL(r.url).host === baseHost && r.size > PLATFORM_BODY_LIMIT,
  );
  expect(
    offenders,
    `requests al origen de la app sobre 4.5 MB: ${offenders
      .map((o) => `${o.method} ${o.url} (${(o.size / MB).toFixed(2)} MB)`)
      .join(", ")}`,
  ).toHaveLength(0);
}

function storagePuts(tracked: TrackedRequest[]): TrackedRequest[] {
  return tracked.filter((r) => r.method === "PUT" && r.url.includes("/storage/v1/"));
}

// ──────────── Fixtures de imágenes grandes (ruido = incompresible) ────────────

/** JPEG de píxeles aleatorios ~del tamaño objetivo (ruido no comprime). */
async function bigNoiseJpeg(width: number, height: number, quality: number): Promise<Buffer> {
  const pixels = randomBytes(width * height * 3);
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality })
    .toBuffer();
}

/** PNG con alpha de píxeles aleatorios (fichas: PNG vertical con transparencia). */
async function bigNoisePng(width: number, height: number): Promise<Buffer> {
  const pixels = randomBytes(width * height * 4);
  return sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

// ──────────── Datos del ambiente ────────────

let baseHost = "";
let letterset: { slug: string; id: string; name: string } | null = null;
let nameProduct: { slug: string; id: string; name: string } | null = null;
let gallery2Faces: { tag: string; name: string } | null = null;
let letterSet: { id: string; name: string } | null = null;
let fichaChar = "Z";

// Limpieza: ids y paths creados por la corrida.
const createdDesignIds: string[] = [];
const createdGalleryImageIds: string[] = [];
const createdCmsMediaIds: string[] = [];
const createdTiles: { setId: string; char: string }[] = [];
let windowStart = 0;

// Admin efímero (patrón de admin-inventory.spec.ts).
let supabase: SupabaseClient;
const ADMIN_EMAIL = `${run}@lucams.test`;
const ADMIN_PASSWORD = "Techo-Audit-918273650";
let adminAuthUserId = "";
let adminId = "";
let totpSecret = "";

test.beforeAll(async ({ baseURL }) => {
  mkdirSync(OUT_DIR, { recursive: true });
  baseHost = new URL(baseURL ?? "http://localhost:4000").host;
  windowStart = Date.now();

  supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/^["']|["']$/g, ""),
    process.env.SUPABASE_SECRET_KEY!.replace(/^["']|["']$/g, ""),
    { auth: { persistSession: false } },
  );

  // Productos del ambiente: letterset (surface "letterset") y nombre ("name").
  const products = await db().product.findMany({
    where: { isActive: true, deletedAt: null, isPersonalizable: true },
    select: {
      id: true,
      slug: true,
      name: true,
      personalizationKind: true,
      personalizationSchema: true,
    },
  });
  for (const p of products) {
    const surface = resolvePersonalizationSurface(
      p.personalizationKind,
      (p.personalizationSchema ?? {}) as Record<string, unknown>,
    );
    if (!letterset && surface.surface === "letterset")
      letterset = { slug: p.slug, id: p.id, name: p.name };
    if (!nameProduct && surface.surface === "name")
      nameProduct = { slug: p.slug, id: p.id, name: p.name };
    // Galería 2 caras: galleryTag explícito o superficie de foto, con facesPerUnit=2.
    const schema = p.personalizationSchema as {
      galleryTag?: unknown;
      facesPerUnit?: unknown;
    } | null;
    const tag =
      typeof schema?.galleryTag === "string" && schema.galleryTag.trim() ? schema.galleryTag : null;
    if (
      !gallery2Faces &&
      schema?.facesPerUnit === 2 &&
      (tag || String(p.personalizationKind).startsWith("PHOTO"))
    ) {
      gallery2Faces = { tag: tag ?? p.slug, name: p.name };
    }
  }

  const set = await db().letterTileSet.findFirst({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true, language: true, tiles: { select: { char: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (set) {
    letterSet = { id: set.id, name: set.name };
    const taken = new Set(set.tiles.map((t) => t.char.toUpperCase()));
    const alphabet =
      set.language === "es"
        ? [..."ABCDEFGHIJKLMNÑOPQRSTUVWXYZ"]
        : [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
    fichaChar = alphabet.find((c) => !taken.has(c)) ?? "Z";
  }

  // Admin efímero con TOTP (MFA obligatorio, B-1).
  const { data, error } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`no se pudo crear el admin efímero: ${error?.message}`);
  adminAuthUserId = data.user.id;
  const admin = await db().adminUser.create({
    data: {
      supabaseUserId: adminAuthUserId,
      email: ADMIN_EMAIL,
      role: "SUPERADMIN",
      isActive: true,
    },
  });
  adminId = admin.id;
  totpSecret = await enrollTotpFactor(ADMIN_EMAIL, ADMIN_PASSWORD);
});

test.afterAll(async () => {
  const safe = (p: Promise<unknown>) => p.catch(() => {});
  // Diseños del Estudio (letterset/nombre) creados en la ventana.
  if (createdDesignIds.length > 0) {
    await safe(db().cartItem.deleteMany({ where: { designId: { in: createdDesignIds } } }));
    await safe(db().designAsset.deleteMany({ where: { designId: { in: createdDesignIds } } }));
    await safe(db().design.deleteMany({ where: { id: { in: createdDesignIds } } }));
    for (const bucket of ["design-previews", "production-assets"]) {
      for (const id of createdDesignIds) {
        const { data: objs } = await supabase.storage.from(bucket).list(id);
        if (objs && objs.length > 0) {
          await safe(supabase.storage.from(bucket).remove(objs.map((o) => `${id}/${o.name}`)));
        }
        const { data: pages } = await supabase.storage.from(bucket).list(`${id}/pages`);
        if (pages && pages.length > 0) {
          await safe(
            supabase.storage.from(bucket).remove(pages.map((o) => `${id}/pages/${o.name}`)),
          );
        }
      }
    }
  }
  // Galería: fila + objetos (masters y thumbs de A/B).
  if (createdGalleryImageIds.length > 0) {
    const rows = await db().designGalleryImage.findMany({
      where: { id: { in: createdGalleryImageIds } },
      select: { imageUrl: true, imageUrlB: true },
    });
    const paths = rows
      .flatMap((r) => [r.imageUrl, r.imageUrlB])
      .filter((u): u is string => Boolean(u))
      .map((u) => u.split("/storage/v1/object/public/product-images/")[1])
      .filter((p): p is string => Boolean(p));
    const thumbs = paths.map((p) => p.replace(/([^/]+)$/, "thumbs/$1"));
    await safe(supabase.storage.from("product-images").remove([...paths, ...thumbs]));
    await safe(
      db().designGalleryImage.deleteMany({ where: { id: { in: createdGalleryImageIds } } }),
    );
  }
  // CMS: fila + objeto.
  if (createdCmsMediaIds.length > 0) {
    const rows = await db().cmsMedia.findMany({
      where: { id: { in: createdCmsMediaIds } },
      select: { path: true },
    });
    await safe(supabase.storage.from("cms-media").remove(rows.map((r) => r.path)));
    await safe(db().cmsMedia.deleteMany({ where: { id: { in: createdCmsMediaIds } } }));
  }
  // Fichas: fila + objeto (product-images/<setId>/<uuid>.webp).
  for (const t of createdTiles) {
    const tile = await db().letterTile.findFirst({
      where: { setId: t.setId, char: t.char },
      select: { imageUrl: true },
    });
    if (tile) {
      const p = tile.imageUrl.split("/storage/v1/object/public/product-images/")[1];
      if (p) await safe(supabase.storage.from("product-images").remove([p]));
    }
    await safe(db().letterTile.deleteMany({ where: { setId: t.setId, char: t.char } }));
  }
  if (adminId) await safe(db().adminUser.deleteMany({ where: { id: adminId } }));
  if (adminAuthUserId) await safe(supabase.auth.admin.deleteUser(adminAuthUserId));
  await disconnectDb();
});

/** Banner de cookies: monta tarde (post-hidratación) y tapa CTAs. */
async function dismissCookies(page: import("@playwright/test").Page): Promise<void> {
  const accept = page.getByRole("button", { name: /Aceptar todas|Solo necesarias/i });
  const visible = await accept
    .first()
    .waitFor({ state: "visible", timeout: 6_000 })
    .then(() => true)
    .catch(() => false);
  if (visible) await accept.first().click();
}

/** Registra en cleanup los diseños del Estudio creados en la ventana. */
async function collectStudioDesigns(): Promise<void> {
  const ids = [letterset?.id, nameProduct?.id].filter((x): x is string => Boolean(x));
  if (ids.length === 0) return;
  const designs = await db().design.findMany({
    where: { productId: { in: ids }, createdAt: { gte: new Date(windowStart) } },
    select: { id: true },
  });
  for (const d of designs) {
    if (!createdDesignIds.includes(d.id)) createdDesignIds.push(d.id);
  }
}

// ──────────── 1. Finalize letter-set ×10 sets (láminas 300 DPI por tickets) ────────────

test("finalize letter-set ×10: las láminas van por Storage y NINGÚN request a la app supera 4.5 MB", async ({
  page,
}) => {
  test.skip(!letterset, "no hay producto con superficie letterset activo en el ambiente");
  const tracked = trackRequests(page);

  await page.goto(`/estudio/${letterset!.slug}?copies=10`, { waitUntil: "domcontentloaded" });
  await dismissCookies(page);
  const cta = page.getByRole("button", { name: /Ver diseño/ }).first();
  await expect(cta).toBeVisible({ timeout: 60_000 });
  await cta.click();
  const dialog = page.getByRole("dialog", { name: /Así se verá/i });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await dialog.getByRole("button", { name: /agregar al carrito/i }).click();

  await page.waitForURL(/\/carrito/, { timeout: 240_000 });

  const puts = storagePuts(tracked);
  console.log(
    `[techo] letterset ×10: ${puts.length} PUTs a Storage, total ${(puts.reduce((s, p) => s + p.size, 0) / MB).toFixed(2)} MB`,
  );
  // 10 sets → 10 láminas por tickets (el fallback NEEDS_CLIENT_SLOTS).
  expect(puts.length, "las 10 láminas subieron por tickets firmados").toBeGreaterThanOrEqual(10);
  assertNoOversizedAppRequest(tracked, baseHost);
  await collectStudioDesigns();
});

// ──────────── 2. Finalize nombre (una lámina 300 DPI por ticket) ────────────

test("finalize nombre: la lámina va por Storage y NINGÚN request a la app supera 4.5 MB", async ({
  page,
}) => {
  test.skip(!nameProduct, "no hay producto con superficie name activo en el ambiente");
  const tracked = trackRequests(page);

  await page.goto(`/estudio/${nameProduct!.slug}`, { waitUntil: "domcontentloaded" });
  await dismissCookies(page);
  const input = page.locator("input.uppercase").first();
  await expect(input).toBeVisible({ timeout: 60_000 });
  await input.fill("VALENTINA");
  const cta = page.getByRole("button", { name: /Ver diseño/ }).first();
  await cta.click();
  const dialog = page.getByRole("dialog", { name: /Así se verá/i });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await dialog.getByRole("button", { name: /agregar al carrito/i }).click();

  await page.waitForURL(/\/carrito/, { timeout: 240_000 });

  const puts = storagePuts(tracked);
  console.log(`[techo] nombre: ${puts.length} PUT(s) a Storage`);
  expect(puts.length, "la lámina del nombre subió por ticket firmado").toBeGreaterThanOrEqual(1);
  assertNoOversizedAppRequest(tracked, baseHost);
  await collectStudioDesigns();
});

// ──────────── 3. Galería A+B con total >4.5 MB (presupuesto combinado) ────────────

test("galería A+B >4.5 MB combinados: el upload entra bajo el techo y el diseño se crea", async ({
  page,
}) => {
  test.skip(!gallery2Faces, "no hay producto de 2 caras con galería en el ambiente");
  const tracked = trackRequests(page);

  // Dos caras de ruido ~5.5 MB c/u → combinado ~11 MB (muy por encima del techo).
  const faceA = await bigNoiseJpeg(4000, 2800, 92);
  const faceB = await bigNoiseJpeg(4000, 2800, 92);
  const totalMb = (faceA.length + faceB.length) / MB;
  console.log(
    `[techo] galería A+B: ${(faceA.length / MB).toFixed(2)} + ${(faceB.length / MB).toFixed(2)} = ${totalMb.toFixed(2)} MB`,
  );
  expect(totalMb).toBeGreaterThan(4.5);

  await loginAdminWithTotp(page, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    totpSecret,
  });
  await page.goto("/admin/disenos", { waitUntil: "domcontentloaded" });
  await page.locator("select").first().selectOption(gallery2Faces!.tag);
  await page.getByPlaceholder("Ej: Flores acuarela").fill(`Audit ${run}`);
  const fileInputs = page.locator('input[type="file"]');
  await fileInputs
    .nth(0)
    .setInputFiles({ name: "cara-a.jpg", mimeType: "image/jpeg", buffer: faceA });
  await fileInputs
    .nth(1)
    .setInputFiles({ name: "cara-b.jpg", mimeType: "image/jpeg", buffer: faceB });
  await page.getByRole("button", { name: /Guardar diseño/ }).click();

  // Éxito: el formulario se resetea (nombre vacío) y la fila existe en DB.
  // (La tarjeta puede quedar dentro de la sección colapsada del producto:
  // se aserta la EXISTENCIA en el DOM, no la visibilidad.)
  await expect(page.getByPlaceholder("Ej: Flores acuarela")).toHaveValue("", { timeout: 180_000 });
  await expect(page.getByText(`Audit ${run}`).first()).toHaveCount(1);
  // Sin mensaje de error del formulario.
  await expect(page.locator("p.text-rose-600")).toHaveCount(0);

  assertNoOversizedAppRequest(tracked, baseHost);

  const row = await db().designGalleryImage.findFirst({
    where: { name: `Audit ${run}`, tag: gallery2Faces!.tag },
    select: { id: true },
  });
  expect(row, "la fila de la galería existe con A+B").toBeTruthy();
  if (row) createdGalleryImageIds.push(row.id);
});

// ──────────── 4. CMS mediateca con archivo >4.5 MB ────────────

test("mediateca: un archivo >4.5 MB sube comprimido en el navegador sin tocar el techo", async ({
  page,
}) => {
  const tracked = trackRequests(page);
  const big = await bigNoiseJpeg(4200, 3200, 92);
  console.log(`[techo] mediateca: archivo original ${(big.length / MB).toFixed(2)} MB`);
  expect(big.length).toBeGreaterThan(4.5 * MB);

  await loginAdminWithTotp(page, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    totpSecret,
  });
  await page.goto("/admin/contenido/mediateca", { waitUntil: "domcontentloaded" });
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: `banner-${run}.jpg`, mimeType: "image/jpeg", buffer: big });
  await page.getByPlaceholder(/Banner del Día de la Madre/i).fill(`Banner audit ${run}`);
  await page.getByRole("button", { name: /Subir/ }).first().click();

  await expect(page.getByText("Imagen subida a la mediateca.")).toBeVisible({ timeout: 120_000 });
  assertNoOversizedAppRequest(tracked, baseHost);

  const row = await db().cmsMedia.findFirst({
    where: { alt: `Banner audit ${run}` },
    select: { id: true },
  });
  expect(row, "la fila CmsMedia existe").toBeTruthy();
  if (row) createdCmsMediaIds.push(row.id);
});

// ──────────── 5. Ficha del abecedario con archivo >4.5 MB ────────────

test("fichas: una ilustración >4.5 MB sube comprimida en el navegador sin tocar el techo", async ({
  page,
}) => {
  test.skip(!letterSet, "no hay set de fichas en el ambiente");
  const tracked = trackRequests(page);
  const big = await bigNoisePng(1400, 1800);
  console.log(`[techo] ficha: PNG original ${(big.length / MB).toFixed(2)} MB`);
  expect(big.length).toBeGreaterThan(4.5 * MB);

  await loginAdminWithTotp(page, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    totpSecret,
  });
  await page.goto("/admin/disenos?tab=fichas", { waitUntil: "domcontentloaded" });
  const cell = page.getByRole("button", { name: `Subir ficha ${fichaChar}` }).first();
  await expect(cell).toBeVisible({ timeout: 30_000 });
  await cell.click();
  // El input de la grilla usa el ATRIBUTO hidden (el de la galería, en el otro
  // tab, usa className="hidden") — sin el atributo en el selector el archivo
  // caía en el input equivocado (fallo E2E detectado en la primera corrida).
  await page
    .locator('input[type="file"][hidden]')
    .first()
    .setInputFiles({ name: `ficha-${run}.png`, mimeType: "image/png", buffer: big });

  await expect(page.getByText(`Ficha ${fichaChar} lista`, { exact: false })).toBeVisible({
    timeout: 120_000,
  });
  assertNoOversizedAppRequest(tracked, baseHost);
  createdTiles.push({ setId: letterSet!.id, char: fichaChar });
});
