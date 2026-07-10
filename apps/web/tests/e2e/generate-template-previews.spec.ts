/*
 * Generador de PREVIEWS REALES de plantillas (Fase 3) — herramienta de operación,
 * NO parte de la suite (se salta sin GEN_PREVIEWS=1). Para cada plantilla:
 * navega a la ruta interna que la renderiza con el StudioSlot real (Konva),
 * screenshotea el <canvas> (el imán físico, sin chrome) y sube el PNG a Storage,
 * actualizando previewUrl. Reemplaza los placeholders Unsplash que Lucy rechazó.
 *
 * Correr (necesita dev server en :4000 + .env.local):
 *   GEN_PREVIEWS=1 PLAYWRIGHT_BASE_URL=http://localhost:4000 \
 *     dotenv -e ../../.env.local -- playwright test generate-template-previews.spec.ts --project=chromium
 *
 * Filtrar a un subconjunto:  GEN_SLUGS="slug1,slug2" ...
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
// PrismaClient vía @lucams/db (no @/lib/db: ese arrastra `server-only`, no
// resoluble en el contexto Node de Playwright).
import { PrismaClient } from "@lucams/db";

const prisma = new PrismaClient();

const strip = (v?: string) => v?.replace(/^["']|["']$/g, "");
const BUCKET = "product-images";
const PREFIX = "template-previews";

test.describe("generar previews de plantillas", () => {
  test.skip(!process.env.GEN_PREVIEWS, "solo con GEN_PREVIEWS=1 (herramienta de operación)");

  test("regenera previews reales desde el canvasData", async ({ page }) => {
    test.setTimeout(20 * 60 * 1000); // hasta 20 min para el lote completo

    const supabase = createClient(
      strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
      strip(process.env.SUPABASE_SECRET_KEY)!,
      { auth: { persistSession: false } },
    );

    const only = process.env.GEN_SLUGS?.split(",").map((s) => s.trim()).filter(Boolean);
    // Incluye soft-deleted a propósito: las 42 rechazadas (ADR-037) son justo las
    // que necesitan un preview REAL para que Lucy las re-evalúe y restaure las buenas.
    const raw = await prisma.personalizationTemplate.findMany({
      where: { ...(only?.length ? { slug: { in: only } } : {}) },
      select: { id: true, slug: true, canvasData: true },
      orderBy: { slug: "asc" },
    });
    // Saltar los stubs sin capas (canvasData vacío): no hay diseño que renderizar.
    const templates = raw.filter((t) => {
      const layers = (t.canvasData as { layers?: unknown[] } | null)?.layers;
      return Array.isArray(layers) && layers.length > 0;
    });
    console.log(`Plantillas a procesar: ${templates.length} (de ${raw.length}; ${raw.length - templates.length} stubs vacíos saltados)`);

    let ok = 0;
    let fail = 0;
    for (const tpl of templates) {
      try {
        await page.goto(`/internal/plantilla-preview/${tpl.slug}`, { waitUntil: "load" });
        await page.waitForSelector("[data-preview-root] canvas", { timeout: 30_000 });
        await page.waitForTimeout(900); // asentar la carga de la foto de muestra
        const canvas = page.locator("[data-preview-root] canvas").first();
        const buf = await canvas.screenshot();

        const path = `${PREFIX}/${tpl.slug}.png`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, buf, { contentType: "image/png", upsert: true });
        if (upErr) throw new Error(`upload: ${upErr.message}`);

        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        await prisma.personalizationTemplate.update({
          where: { id: tpl.id },
          data: { previewUrl: data.publicUrl },
        });
        ok++;
        console.log(`✓ ${tpl.slug}`);
      } catch (err) {
        fail++;
        console.log(`✗ ${tpl.slug}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log(`\nListo. OK=${ok} FAIL=${fail}`);
    await prisma.$disconnect();
    expect(ok).toBeGreaterThan(0);
  });
});
