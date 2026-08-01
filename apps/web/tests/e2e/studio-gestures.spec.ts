import { expect, test, type Page } from "@playwright/test";
import "../setup-env";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

/*
 * Verificación INTERACTIVA de los gestos del canvas del Estudio (backlog
 * punto 5 — E3 los declaró "territorio de prueba interactiva, no de
 * screenshots"). Local, contra el dev server (:4000); NO gatea CI
 * (compañera de mobile-admin-audit / cms-edit-mode).
 *
 * Qué certifica (gesto → estado → persistencia, no píxeles):
 *   1. DRAG de 1 dedo en el preview del modal de edición → photoTransform
 *      .offsetX/offsetY cambia (pan de la foto).
 *   2. PINCH de 2 dedos separándose → photoTransform.scale SUBE (zoom).
 *   3. DOBLE TAP → photoTransform vuelve a null (reset "centrar + 100%").
 *
 * Cómo: eventos táctiles SINTÉTICOS confiables vía CDP Input.dispatchTouchEvent
 * (los handlers Konva onTouchStart/Move/End del preview los reciben como
 * eventos nativos), y como oráculo el canvasData que el auto-save (debounce
 * 2s) persiste en la fila Design del borrador invitado — leída con Prisma.
 * hasTouch: true para que el contexto acepte eventos táctiles; viewport
 * desktop para usar el modal de edición unificado.
 */

const prisma = new PrismaClient();
const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");

/**
 * Retry para flakes del pooler (pgbouncer :6543) — mismo criterio que
 * vitest.config.ts: la conexión cae a ratos por minutos; reintentar la
 * reconecta. Un bug real falla todos los intentos.
 */
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

const PRODUCT_SLUG = "set-fotoimanes-polaroid";
const PHOTO_PATH = path.resolve(__dirname, "../../../../tmp/gestures-e2e-photo.jpg");
const AUTOSAVE_WAIT = 4_500;

let productId = "";
let variantId = "";
let runStartedAt = new Date();

test.setTimeout(300_000);
test.use({ hasTouch: true });

type Transform = { offsetX?: number; offsetY?: number; scale?: number } | null;

async function readSlotTransform(): Promise<Transform> {
  const design = await withDbRetry(() =>
    prisma.design.findFirst({
      where: { productId, createdAt: { gte: runStartedAt } },
      orderBy: { createdAt: "desc" },
      select: { canvasData: true },
    }),
  );
  const slots = (design?.canvasData as { slots?: Array<{ photoTransform?: Transform }> } | null)
    ?.slots;
  return slots?.[0]?.photoTransform ?? null;
}

/** Espera a que el auto-save persista una transformación que cumpla `pred`. */
async function waitTransform(pred: (t: Transform) => boolean, label: string) {
  await expect
    .poll(async () => pred(await readSlotTransform()), {
      timeout: 30_000,
      intervals: [1500, 2000, 3000, 4000],
      message: `transform no cumple ${label}`,
    })
    .toBe(true);
}

test.beforeAll(async () => {
  runStartedAt = new Date();
  const product = await withDbRetry(() =>
    prisma.product.findFirst({
      where: { slug: PRODUCT_SLUG, isActive: true },
      select: {
        id: true,
        variants: { where: { isActive: true }, select: { id: true }, take: 1 },
      },
    }),
  );
  if (!product) throw new Error(`producto ${PRODUCT_SLUG} no disponible en esta DB`);
  productId = product.id;
  variantId = product.variants[0]?.id ?? "";

  // Foto de prueba 900×900 (mitad roja, mitad azul — inconfundible).
  fs.mkdirSync(path.dirname(PHOTO_PATH), { recursive: true });
  await sharp({
    create: {
      width: 900,
      height: 900,
      channels: 3,
      background: { r: 200, g: 30, b: 60 },
    },
  })
    .composite([
      {
        input: {
          create: { width: 450, height: 900, channels: 3, background: { r: 40, g: 90, b: 200 } },
        },
        left: 450,
        top: 0,
      },
    ])
    .jpeg({ quality: 90 })
    .toFile(PHOTO_PATH);
});

test.afterAll(async () => {
  // Limpieza: diseños del borrador invitado + assets subidos (fila + storage).
  await prisma.design
    .deleteMany({ where: { productId, createdAt: { gte: runStartedAt } } })
    .catch(() => {});
  const assets = await prisma.designAsset.findMany({
    where: { createdAt: { gte: runStartedAt } },
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
  // Tip de gestos (aparece tras la primera subida; auto-cierra a los 6.5s).
  const hint = page.locator('[role="status"] button[aria-label]');
  if (await hint.count())
    await hint
      .first()
      .click()
      .catch(() => {});
}

test("gestos del canvas: drag = pan, pinch = zoom, doble tap = reset (persistido)", async ({
  page,
}) => {
  test.slow(); // cold-compile de la ruta Konva en dev

  // ── Setup: editor montado; el onboarding puede aparecer tras el load ──
  await page.goto(`/estudio/${PRODUCT_SLUG}${variantId ? `?variant=${variantId}` : ""}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2_500); // el onboarding monta tarde (race histórica)
  await dismissOverlays(page);

  const consent = page.getByRole("checkbox", { name: /Tengo derecho a usar esta foto/i });
  if (await consent.count()) await consent.check();
  await page.locator('input[type="file"]').first().setInputFiles([PHOTO_PATH]);
  await dismissOverlays(page);

  // Oracle DB de la subida: la fila DesignAsset aparece cuando el server ya
  // validó (sharp) y guardó la foto. Con el pooler degradado el upload tarda
  // minutos — el gate es la DB; la lista cliente se entera por la respuesta
  // de la misma subida, así que el wand aparece al poco después.
  await expect
    .poll(
      async () => {
        const asset = await withDbRetry(() =>
          prisma.designAsset.findFirst({
            where: { createdAt: { gte: runStartedAt } },
            select: { id: true },
          }),
        );
        return Boolean(asset);
      },
      { timeout: 300_000, intervals: [3000, 5000, 8000, 10000] },
    )
    .toBe(true);

  // Auto-fill (el botón aparece con la foto ya lista) y verificación de la
  // asignación POR DB (oracle, no texto de UI). El locator va por TEXTO
  // visible, no por accessible name: el botón lleva aria-label
  // "Llenar {n} slots vacíos con mis fotos" ≠ su texto "Llenar slots…".
  const wand = page.getByRole("button").filter({ hasText: /Llenar slots con mis fotos/i });
  await expect(wand.first()).toBeVisible({ timeout: 60_000 });
  await wand.first().click();
  await expect
    .poll(
      async () => {
        const design = await withDbRetry(() =>
          prisma.design.findFirst({
            where: { productId, createdAt: { gte: runStartedAt } },
            orderBy: { createdAt: "desc" },
            select: { canvasData: true },
          }),
        );
        const slots = (design?.canvasData as { slots?: Array<{ assetUrl?: string | null }> } | null)
          ?.slots;
        return Boolean(slots?.[0]?.assetUrl);
      },
      { timeout: 60_000, intervals: [2000, 3000, 4000, 5000] },
    )
    .toBe(true);

  // El tip de gestos (role=status) aparece tras la asignación: fuera antes de
  // tocar el slot, que si no intercepta el click del control «Editar».
  await dismissOverlays(page);
  await page.waitForTimeout(AUTOSAVE_WAIT); // que el auto-save asiente la asignación

  const slotRoot = page.getByRole("button", { name: /con foto cargada/i }).first();
  const base = (await readSlotTransform()) ?? { offsetX: 0, offsetY: 0, scale: 1 };
  const baseX = base.offsetX ?? 0;
  const baseY = base.offsetY ?? 0;
  const baseScale = base.scale ?? 1;

  // ── Abrir el modal de edición del slot (control «Editar …», visible al hover) ──
  await slotRoot.hover();
  await page.locator('[aria-label^="Editar "]').first().click();
  const dialog = page.locator('[role="dialog"]').first();
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  // Pestaña «Foto» explícita (puede abrir en «Texto») + margen largo: el chunk
  // Konva del preview compila frío en dev y monta tarde.
  const fotoTab = dialog.getByRole("tab", { name: /Foto/i }).first();
  if (await fotoTab.count()) await fotoTab.click();
  const stage = dialog.locator(".konvajs-content").first();
  await expect(stage).toBeVisible({ timeout: 45_000 });
  const box = await stage.boundingBox();
  if (!box) throw new Error("sin bounding box del preview");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const cdp = await page.context().newCDPSession(page);
  const touch = (
    type: "touchStart" | "touchMove" | "touchEnd",
    points: Array<{ x: number; y: number; id: number }>,
  ) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });

  // ── 1. DRAG de 1 dedo → pan (offsetX/offsetY cambian) ──
  // El touchEnd lleva los puntos levantados (como Playwright touchscreen):
  // con lista vacía Chrome puede perder el tracking táctil del gesto siguiente.
  await touch("touchStart", [{ x: cx, y: cy, id: 1 }]);
  for (let i = 1; i <= 5; i++) {
    await touch("touchMove", [{ x: cx + i * 12, y: cy + i * 8, id: 1 }]);
  }
  await touch("touchEnd", [{ x: cx + 60, y: cy + 40, id: 1 }]);
  await page.waitForTimeout(AUTOSAVE_WAIT);
  await waitTransform(
    (t) =>
      t !== null &&
      (Math.abs((t.offsetX ?? 0) - baseX) > 2 || Math.abs((t.offsetY ?? 0) - baseY) > 2),
    "drag → offset distinto del baseline",
  );

  // ── 2. PINCH de 2 dedos separándose → zoom (scale sube) ──
  // Baseline ANTES del gesto (leerlo después haría imposible la aserción).
  const prePinchScale =
    ((await readSlotTransform()) as { scale?: number } | null)?.scale ?? baseScale;
  // Secuencia canónica: el 2º dedo se SUMA en un 2º touchStart (como un
  // dispositivo real) — Konva inicializa el pinch cuando touches.length === 2.
  await touch("touchStart", [{ x: cx - 40, y: cy, id: 1 }]);
  await touch("touchStart", [
    { x: cx - 40, y: cy, id: 1 },
    { x: cx + 40, y: cy, id: 2 },
  ]);
  for (let i = 1; i <= 6; i++) {
    await touch("touchMove", [
      { x: cx - 40 - i * 10, y: cy, id: 1 },
      { x: cx + 40 + i * 10, y: cy, id: 2 },
    ]);
  }
  await touch("touchEnd", [
    { x: cx - 100, y: cy, id: 1 },
    { x: cx + 100, y: cy, id: 2 },
  ]);
  await page.waitForTimeout(AUTOSAVE_WAIT);
  await waitTransform(
    (t) => t !== null && (t.scale ?? 1) > prePinchScale * 1.2,
    `pinch → scale > ${prePinchScale} × 1.2`,
  );

  // ── 3. DOBLE TAP → reset (photoTransform vuelve a null) ──
  for (let k = 0; k < 2; k++) {
    await touch("touchStart", [{ x: cx, y: cy, id: 1 }]);
    await touch("touchEnd", [{ x: cx, y: cy, id: 1 }]);
  }
  await page.waitForTimeout(AUTOSAVE_WAIT);
  await waitTransform((t) => t === null, "doble tap → photoTransform null (reset)");
});
