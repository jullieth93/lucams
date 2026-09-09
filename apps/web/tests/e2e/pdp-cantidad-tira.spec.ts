import { expect, test, type Locator, type Page } from "@playwright/test";
import "../setup-env";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

/*
 * E2E — Regla 2026-09-08b (Lucy, unificación "Unidades"): la PDP de los packs
 * de la familia separadores/tiras muestra UN concepto de cantidad — "Unidades"
 * (pack size) — y el N elegido ABRE el Estudio con ese N (una sola fuente de
 * verdad: ?variant= → merge de attributes sobre el schema → photoSlots inicial).
 *
 *   1. PDP separadores-alargados: grupo "Unidades" (stepper 1..6) + "Tamaño";
 *      NUNCA un grupo "Fotos"/"Cantidad" ni un segundo stepper de copias.
 *      Elegir tamaño 4×12 + Unidades=3 → CTA "Personalizar" lleva ?variant= de
 *      la variante qty=3 y el Estudio abre con 3 unidades (slots 3A/3B).
 *   2. PDP tiras-magneticas-fotos: "Unidades" son las fotos por tira (chips
 *      "3 fotos"/"4 fotos", photoSlots con label override) + "Tamaño".
 *   3. Estudio de tiras: CANALETA visible entre fotos (media canaleta del
 *      color del marco DENTRO de cada celda, stripPhotoRect — WYSIWYG con el
 *      render de producción, que consume la misma matemática). Oráculo de
 *      píxel: la franja inferior del canvas de contenido de la PRIMERA celda
 *      es el color de la tarjeta (blanco), no la foto (regresión: antes las
 *      fotos se tocaban, gap 0 real). La modal "¡Listo!" sin stepper "Copias"
 *      la cubre estudio-letterset.spec.ts (llega a la modal sin uploads).
 *
 * Productos reales leídos de la DB del ambiente (nada hardcodeado). Crea un
 * asset de prueba (tiras) → LOCAL/STG solamente (prohibido en PRD, como la
 * matriz de uploads). Limpieza en afterAll (designs + assets de la corrida).
 */

const prisma = new PrismaClient();
const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");

const PHOTO_PATH = path.resolve(__dirname, "../../../../tmp/pdp-cantidad-tira-photo.jpg");
const AUTOSAVE_WAIT = 4_500;

/** Retry para flakes del pooler (mismo criterio que studio-gestures.spec.ts). */
async function withDbRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2_000 * (i + 1)));
    }
  }
  throw lastErr;
}

type Ctx = {
  runStartedAt: Date;
  sepSlug: string;
  sepProductId: string;
  tirasSlug: string;
  tirasProductId: string;
  tirasVariantId: string;
};

const ctx: Ctx = {
  runStartedAt: new Date(),
  sepSlug: "",
  sepProductId: "",
  tirasSlug: "",
  tirasProductId: "",
  tirasVariantId: "",
};

test.setTimeout(300_000);
test.skip(
  (process.env.E2E_ENV ?? "local") === "prd",
  "Crea assets/objetos de storage: prohibido en PRD.",
);

test.beforeAll(async () => {
  ctx.runStartedAt = new Date();

  // Foto de prueba 3:4 (mitad turquesa, mitad púrpura — inconfundible y NUNCA blanca).
  fs.mkdirSync(path.dirname(PHOTO_PATH), { recursive: true });
  await sharp({
    create: { width: 900, height: 1200, channels: 3, background: { r: 45, g: 212, b: 191 } },
  })
    .composite([
      {
        input: {
          create: { width: 900, height: 600, channels: 3, background: { r: 124, g: 106, b: 173 } },
        },
        left: 0,
        top: 600,
      },
    ])
    .jpeg({ quality: 90 })
    .toFile(PHOTO_PATH);

  // Separadores Alargados (el producto del reporte de Lucy).
  const sep = await withDbRetry(() =>
    prisma.product.findFirst({
      where: { slug: "separadores-alargados", isActive: true, deletedAt: null },
      select: { id: true, slug: true },
    }),
  );
  if (sep) {
    ctx.sepSlug = sep.slug;
    ctx.sepProductId = sep.id;
  }

  // Tiras Magnéticas + su variante de 3 fotos (tira clásica 6.5×20).
  const tiras = await withDbRetry(() =>
    prisma.product.findFirst({
      where: { slug: "tiras-magneticas-fotos", isActive: true, deletedAt: null },
      select: {
        id: true,
        slug: true,
        variants: {
          where: { isActive: true, deletedAt: null },
          select: { id: true, attributes: true },
        },
      },
    }),
  );
  if (tiras) {
    ctx.tirasSlug = tiras.slug;
    ctx.tirasProductId = tiras.id;
    const v3 = tiras.variants.find(
      (v) => (v.attributes as { photoSlots?: number } | null)?.photoSlots === 3,
    );
    ctx.tirasVariantId = (v3 ?? tiras.variants[0])?.id ?? "";
  }
});

test.afterAll(async () => {
  // Limpieza de la ventana de la corrida (como studio-gestures / studio-ux).
  const productIds = [ctx.sepProductId, ctx.tirasProductId].filter(Boolean);
  if (productIds.length > 0) {
    await prisma.design
      .deleteMany({
        where: { productId: { in: productIds }, createdAt: { gte: ctx.runStartedAt } },
      })
      .catch(() => {});
  }
  const assets = await prisma.designAsset.findMany({
    where: { createdAt: { gte: ctx.runStartedAt } },
    select: { id: true, storageUrl: true },
  });
  if (assets.length > 0) {
    await prisma.designAsset
      .deleteMany({ where: { id: { in: assets.map((a) => a.id) } } })
      .catch(() => {});
    const service = createClient(
      strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
      strip(process.env.SUPABASE_SECRET_KEY)!,
      { auth: { persistSession: false } },
    );
    await service.storage
      .from("customer-uploads")
      .remove(assets.map((a) => a.storageUrl))
      .catch(() => {});
  }
  await prisma.$disconnect();
  fs.rmSync(PHOTO_PATH, { force: true });
});

/** Cierra lo que tape el lienzo: cookies, onboarding, tip de gestos. */
async function dismissOverlays(page: Page) {
  const accept = page.getByRole("button", { name: /Aceptar todas/i });
  if (await accept.count())
    await accept
      .first()
      .click()
      .catch(() => {});
  const onboarding = page.locator('div[role="dialog"][aria-labelledby="onboarding-title"]');
  if (await onboarding.count()) {
    await page
      .getByRole("button", { name: /Saltar/i })
      .first()
      .click()
      .catch(() => {});
    await onboarding.waitFor({ state: "detached", timeout: 4_000 }).catch(() => {});
  }
  const hint = page.locator('[role="status"] button[aria-label]');
  if (await hint.count())
    await hint
      .first()
      .click()
      .catch(() => {});
}

/** Sidebar desktop o Sheet mobile: misma área de herramientas. */
async function resolvePanel(page: Page): Promise<Locator> {
  let panel = page.locator('aside[aria-label="Herramientas del Estudio"]');
  if (!(await panel.isVisible().catch(() => false))) {
    await page
      .getByRole("button", { name: /abre las herramientas de plantillas y fotos/i })
      .click();
    panel = page.locator('[role="dialog"]');
    await expect(panel).toBeVisible({ timeout: 10_000 });
  }
  return panel;
}

test.describe("regla 2026-09-08b — PDP muestra 'Unidades' (pack size) y el Estudio abre con ese N", () => {
  test("PDP separadores-alargados: stepper Unidades 1..6 + Tamaño, sin grupo 'Fotos'/'Cantidad'", async ({
    page,
  }) => {
    test.skip(!ctx.sepSlug, "separadores-alargados no está activo en la DB");
    await page.goto(`/producto/${ctx.sepSlug}`, { waitUntil: "domcontentloaded" });
    const unidades = page.getByRole("group", { name: "Unidades" });
    await expect(unidades).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("group", { name: "Tamaño" })).toBeVisible();
    // NUNCA el grupo "Fotos" (photoSlots oculto) ni el label viejo "Cantidad";
    // y UN SOLO grupo "Unidades" (no hay stepper de copias en los packs).
    await expect(page.getByRole("group", { name: "Fotos" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Cantidad" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Unidades" })).toHaveCount(1);
    await expect(unidades.getByLabel("Aumentar unidades")).toBeVisible();
    await expect(unidades.getByLabel("Disminuir unidades")).toBeVisible();
  });

  test("PDP Unidades=3 + Tamaño 4×12 → el Estudio abre con 3 unidades (slots 3A/3B)", async ({
    page,
  }) => {
    test.skip(!ctx.sepSlug, "separadores-alargados no está activo en la DB");
    test.slow(); // cold-compile de la ruta Konva en `next dev`
    await page.goto(`/producto/${ctx.sepSlug}`, { waitUntil: "domcontentloaded" });
    await dismissOverlays(page);

    // Selección guiada: primero el tamaño, luego el stepper de Unidades hasta 3.
    const tamano = page.getByRole("group", { name: "Tamaño" });
    await expect(tamano).toBeVisible({ timeout: 15_000 });
    await tamano.getByRole("button", { name: "4×12 cm" }).click();

    const unidades = page.getByRole("group", { name: "Unidades" });
    const plus = unidades.getByLabel("Aumentar unidades");
    await expect(unidades.getByText("1 unidad")).toBeVisible();
    await plus.click();
    await expect(unidades.getByText("2 unidades")).toBeVisible();
    await plus.click();
    await expect(unidades.getByText("3 unidades")).toBeVisible();

    // El CTA lleva la variante qty=3 del tamaño elegido (deep-link ?variant=).
    const cta = page.getByRole("link", { name: /Personalizar producto/i });
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute("href");
    expect(href).toContain(`/estudio/${ctx.sepSlug}?variant=`);
    await cta.click();

    // El Estudio abre con N=3: existen las caras de la tercera unidad y el
    // control de N fotos arranca en 3 (una sola fuente de verdad).
    await expect(page).toHaveURL(new RegExp(`/estudio/${ctx.sepSlug}\\?variant=`));
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_500); // el onboarding monta tarde (race histórica)
    await dismissOverlays(page);
    await expect(page.getByText("3A", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("3B", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("4A", { exact: true })).toHaveCount(0);
    await expect(page.getByText("3 fotos", { exact: true })).toBeVisible();
  });

  test("PDP tiras: 'Unidades' son las fotos por tira (chips 3/4 fotos) + Tamaño", async ({
    page,
  }) => {
    test.skip(!ctx.tirasSlug, "tiras-magneticas-fotos no está activo en la DB");
    await page.goto(`/producto/${ctx.tirasSlug}`, { waitUntil: "domcontentloaded" });
    const unidades = page.getByRole("group", { name: "Unidades" });
    await expect(unidades).toBeVisible({ timeout: 15_000 });
    await expect(unidades.getByText("3 fotos")).toBeVisible();
    await expect(unidades.getByText("4 fotos")).toBeVisible();
    await expect(page.getByRole("group", { name: "Tamaño" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Fotos" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Cantidad" })).toHaveCount(0);
  });
});

test.describe("regla 2026-09-08 — tira: canaleta visible entre fotos (WYSIWYG con producción)", () => {
  test("la franja inferior de la celda es el color de la tarjeta, no la foto", async ({ page }) => {
    test.skip(!ctx.tirasSlug, "tiras-magneticas-fotos no está activo en la DB");
    test.slow(); // cold-compile + upload real

    await page.goto(
      `/estudio/${ctx.tirasSlug}${ctx.tirasVariantId ? `?variant=${ctx.tirasVariantId}` : ""}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_500);
    await dismissOverlays(page);

    const panel = await resolvePanel(page);
    const consent = page.getByRole("checkbox", { name: /Tengo derecho a usar esta foto/i });
    if (await consent.count()) await consent.first().check();
    await panel.locator('input[type="file"]').first().setInputFiles([PHOTO_PATH]);

    // Oracle DB: la fila DesignAsset aparece cuando el server validó y guardó.
    await expect
      .poll(
        async () => {
          const asset = await withDbRetry(() =>
            prisma.designAsset.findFirst({
              where: { createdAt: { gte: ctx.runStartedAt } },
              select: { id: true },
            }),
          );
          return Boolean(asset);
        },
        { timeout: 300_000, intervals: [3000, 5000, 8000, 10000] },
      )
      .toBe(true);

    // Reparte la foto al primer slot (celda 0 de la tira).
    const wand = page.getByRole("button").filter({ hasText: /Llenar slots con mis fotos/i });
    await expect(wand.first()).toBeVisible({ timeout: 60_000 });
    await wand.first().click();
    await expect
      .poll(
        async () => {
          const design = await withDbRetry(() =>
            prisma.design.findFirst({
              where: { productId: ctx.tirasProductId, createdAt: { gte: ctx.runStartedAt } },
              orderBy: { createdAt: "desc" },
              select: { canvasData: true },
            }),
          );
          const slots = (
            design?.canvasData as { slots?: Array<{ assetUrl?: string | null }> } | null
          )?.slots;
          return Boolean(slots?.[0]?.assetUrl);
        },
        { timeout: 60_000, intervals: [2000, 3000, 4000, 5000] },
      )
      .toBe(true);
    await page.waitForTimeout(AUTOSAVE_WAIT);
    // Mobile: el Sheet de herramientas queda abierto tras repartir y tapa el lienzo.
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);

    // Oráculo de píxel sobre el CANVAS de contenido de la celda 0 (modo tira:
    // sin capa de sombra → el primer <canvas> del Stage es la capa de contenido
    // con frame-card + foto). La franja inferior = media canaleta (8px de stage)
    // del color de la tarjeta (blanco default) — la foto termina ANTES.
    const slot0 = page.locator('[data-slot-index="0"]');
    await expect(slot0.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
    const probe = await slot0
      .locator("canvas")
      .first()
      .evaluate((el) => {
        const canvas = el as HTMLCanvasElement;
        const ctx2d = canvas.getContext("2d");
        if (!ctx2d) return null;
        const x = Math.floor(canvas.width / 2);
        const read = (y: number) => Array.from(ctx2d.getImageData(x, y, 1, 1).data.slice(0, 3));
        return {
          bottom: read(canvas.height - 2), // media canaleta (regla 2026-09-08)
          center: read(Math.floor(canvas.height / 2)), // foto (nunca blanca)
        };
      });
    expect(probe).not.toBeNull();
    const nearWhite = (rgb: number[]) => rgb.every((c) => c >= 235);
    // La canaleta es blanca (color de tarjeta default)…
    expect(nearWhite(probe!.bottom)).toBe(true);
    // …y el centro de la celda SÍ es la foto (turquesa/púrpura, nunca blanco):
    // la foto no desapareció, solo deja la canaleta visible.
    expect(nearWhite(probe!.center)).toBe(false);
  });
});
