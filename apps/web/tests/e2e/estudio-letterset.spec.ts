/*
 * E2E — Estudio de sets de letras (Abecedario Completo / Pack Vocales, ADR-057).
 *
 * Reporte 2026-09-07 de Lucy (comentario ⑥): en el Estudio de los productos de
 * "Juegos y Aprendizaje" NO aparecía el selector "Con borde / Sin borde" que sí
 * existía en código. Causa raíz de aquel entonces: PRD corría código pre-7b43b1d
 * (falta de deploy — ver docs/STATE.md). Este spec es la red de regresión: fija
 * que para TODO producto con marcador `letterSet` del catálogo el radiogroup
 * "Borde de las fichas" se monta VISIBLE, debajo de "Elige los colores", con
 * "Con borde" preseleccionado (default retrocompatible) y el hint de mismo
 * precio, y que el toggle responde. Navegación + estado client, sin mutación →
 * sin cleanup. Requiere DATABASE_URL (mismo patrón que estudio.spec.ts: la
 * lista de productos se levanta en beforeAll y el test ramifica adentro, porque
 * los tests generados en un `for` durante la colección verían la lista vacía).
 *
 * Ola 26 (owner 2026-09-09): el orden quedó INVERTIDO — «Borde de las fichas»
 * va ENCIMA de «Elige los colores» (antes debajo; mismo cambio que Nombre
 * Personalizado). El spec fija el orden nuevo.
 */

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@lucams/db";

const prisma = new PrismaClient();

type LetterSetProduct = { slug: string; name: string; letterSet: "full" | "vowels" };

let products: LetterSetProduct[] = [];

test.beforeAll(async () => {
  // Los sets de letras son kind NONE + marcador letterSet en personalizationSchema
  // (enrutador de superficie, features/personalization/surface.ts). Se filtran en
  // JS para no depender de operadores JSON de Prisma.
  const candidates = await prisma.product.findMany({
    where: { isActive: true, personalizationKind: "NONE" },
    select: { slug: true, name: true, personalizationSchema: true },
  });
  products = candidates.flatMap((p): LetterSetProduct[] => {
    const s = p.personalizationSchema as { letterSet?: unknown } | null;
    return s?.letterSet === "full" || s?.letterSet === "vowels"
      ? [{ slug: p.slug, name: p.name, letterSet: s.letterSet }]
      : [];
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("estudio — sets de letras: selector «Con borde / Sin borde»", () => {
  test("el radiogroup «Borde de las fichas» aparece para cada producto letter-set activo", async ({
    page,
  }) => {
    // La categoría completa: hoy Abecedario Completo (full) + Pack Vocales (vowels).
    // Si el catálogo crece (p. ej. abecedario inglés como producto propio), el spec
    // lo cubre solo por tener el marcador — no hay gate por categoría ni por slug.
    test.skip(products.length === 0, "no hay productos letter-set activos en la DB");

    for (const product of products) {
      await page.goto(`/estudio/${product.slug}`, { waitUntil: "domcontentloaded" });

      // El radiogroup completo se monta (título + hint de mismo precio).
      const group = page.getByRole("radiogroup", { name: "Borde de las fichas" });
      await expect(group, product.name).toBeVisible();
      await expect(page.getByText("· mismo precio con o sin borde"), product.name).toBeVisible();

      // Default retrocompatible: "Con borde" arranca seleccionado (los diseños
      // guardados antes de la opción quedan válidos).
      await expect(page.getByRole("radio", { name: "Con borde" }), product.name).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await expect(page.getByRole("radio", { name: "Sin borde" }), product.name).toHaveAttribute(
        "aria-checked",
        "false",
      );

      // Ola 26 (owner 2026-09-09, reconfirmado para sets de letras 2026-09-11):
      // «Borde de las fichas» va ENCIMA de «Elige los colores» — primero se define
      // el borde; debajo queda la paleta que se desactiva con «Sin borde» (mismo
      // orden que Nombre Personalizado y la toolbar de estilo del Estudio de foto).
      // El título del ThemePicker es un <p> que incluye el hint en un span, así
      // que el match es por <p> + substring (exact fallaría por el hint; el h1
      // del editor es "Elige los colores 🎨" y es un <h1>, queda fuera).
      const colorTitle = page.locator("p", { hasText: "Elige los colores" });
      await expect(colorTitle, product.name).toBeVisible();
      const colorBox = await colorTitle.boundingBox();
      const groupBox = await group.boundingBox();
      expect(colorBox, product.name).not.toBeNull();
      expect(groupBox, product.name).not.toBeNull();
      expect(
        groupBox!.y,
        `${product.name}: el selector debe quedar ENCIMA de «Elige los colores»`,
      ).toBeLessThan(colorBox!.y);

      // El toggle responde: elegir "Sin borde" marca la opción (estado client,
      // sin mutación — el diseño solo se persiste al confirmar la vista previa).
      await page.getByRole("radio", { name: "Sin borde" }).click();
      await expect(page.getByRole("radio", { name: "Sin borde" }), product.name).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await expect(page.getByRole("radio", { name: "Con borde" }), product.name).toHaveAttribute(
        "aria-checked",
        "false",
      );

      // Lucy 2026-09-08 — con «Sin borde» las fichas no llevan el marco de color:
      // la sección «Elige los colores» se desactiva (botones disabled + aviso del
      // porqué) y el selector de borde SIEMPRE queda habilitado para poder volver.
      await expect(page.getByRole("button", { name: /Arcoíris/ }), product.name).toBeDisabled();
      await expect(page.getByRole("button", { name: /Vibrante/ }), product.name).toBeDisabled();
      await expect(page.getByRole("note"), product.name).toContainText("los colores se desactivan");
      await expect(page.getByRole("radio", { name: "Con borde" }), product.name).toBeEnabled();
      await expect(page.getByRole("radio", { name: "Sin borde" }), product.name).toBeEnabled();

      // Ola 28 (owner 2026-09-11, 1.7): con «Sin borde» TAMPOCO aplica el pintado
      // ficha a ficha — el hint "Toca una ficha…" desaparece y las fichas quedan
      // no seleccionables (disabled), igual que la paleta de temas.
      await expect(page.getByText(/Toca una ficha para darle el color/i), product.name).toHaveCount(
        0,
      );
      const fichaA = page.getByRole("button", { name: "Pintar la ficha A" }).first();
      await expect(fichaA, product.name).toBeDisabled();

      // Al volver a «Con borde» la sección se reactiva (la selección de colores se conserva).
      await page.getByRole("radio", { name: "Con borde" }).click();
      await expect(page.getByRole("button", { name: /Arcoíris/ }), product.name).toBeEnabled();
      await expect(page.getByRole("note"), product.name).toBeHidden();
      // …y el pintado ficha a ficha vuelve (hint + fichas habilitadas).
      await expect(
        page.getByText(/Toca una ficha para darle el color/i),
        product.name,
      ).toBeVisible();
      await expect(fichaA, product.name).toBeEnabled();
    }
  });
});

/*
 * Regla 2026-09-08b (Lucy, unificación "Unidades"): la modal de confirmación
 * que abre el botón "Vista previa" (antes "¡Listo!", renombrado 2026-09-09)
 * ya NO tiene stepper "Copias" — las unidades se eligen en la PDP
 * (stepper "Unidades" de los productos de composición fija) y llegan como
 * ?copies=N. Multi-unidad (2026-09-09): en los sets de letras ese N son N
 * SETS diseñables por separado (pager "Set 1 de N" + "Aplicar este diseño a
 * todas"); la modal los describe como dato ("N unidades — cada una con su
 * propio diseño"). El estudio de letter-set llega a la
 * modal sin uploads (el preview se dibuja client-side), así que es la vía
 * barata de blindarlo end-to-end. Sin mutación: se cierra con "Volver a
 * editar" (nada llega al carrito).
 */
test.describe("estudio — modal «Vista previa» sin stepper «Copias» (regla 2026-09-08b)", () => {
  test("la modal confirma sin stepper y muestra las unidades de la PDP como dato", async ({
    page,
  }) => {
    test.skip(products.length === 0, "no hay productos letter-set activos en la DB");
    const product = products[0]!;

    // El banner de cookies TAMBIÉN es role="dialog": se descarta al inicio y la
    // modal se acota por su título ("Así se verá tu pedido") para no confundirla.
    // El banner monta TARDE (tras la hidratación, después de domcontentloaded):
    // sin el waitFor corto, `count()` corre antes de que exista, no se cierra y
    // luego TAPA el botón «Vista previa» (z-[9000]) — el click queda interceptado (flake
    // mobile 2026-09-08).
    const dismissCookies = async () => {
      const accept = page.getByRole("button", { name: /Aceptar todas/i });
      try {
        await accept.first().waitFor({ state: "visible", timeout: 5_000 });
        await accept.first().click();
      } catch {
        // Sin banner (consentimiento ya persistido en este contexto).
      }
    };
    const previewDialog = page.getByRole("dialog", { name: /Así se verá/i });

    // Sin ?copies= → 1 copia (default): modal sin desglose de copias.
    await page.goto(`/estudio/${product.slug}`, { waitUntil: "domcontentloaded" });
    await dismissCookies();
    const listo = page
      .getByRole("button", { name: /Vista previa/ })
      // Ola 32 — hay dos botones «Vista previa» (header sticky + panel de
      // controles; misma acción): se usa el del panel (el CTA histórico).
      .last();
    await expect(listo).toBeVisible({ timeout: 30_000 });
    await listo.click();
    await expect(previewDialog).toBeVisible({ timeout: 30_000 });
    await expect(previewDialog.getByRole("group", { name: "Copias" })).toHaveCount(0);
    await expect(previewDialog.getByLabel("Aumentar copias")).toHaveCount(0);
    await expect(previewDialog.getByLabel("Disminuir copias")).toHaveCount(0);
    await expect(previewDialog.getByText(/copias idénticas/)).toHaveCount(0);
    await expect(previewDialog.getByRole("button", { name: /agregar al carrito/i })).toBeVisible();
    await previewDialog.getByRole("button", { name: /Volver a editar/i }).click();
    await expect(previewDialog).toBeHidden({ timeout: 10_000 });

    // Con ?copies=3 (lo que emite la PDP al elegir 3 Unidades) → la modal lo
    // muestra como DATO (no editable) y el total lo refleja. Multi-unidad
    // (2026-09-09): en los sets de letras el N son 3 SETS diseñables (cada uno
    // con sus propios colores de ficha) — la modal los describe con la línea
    // "N unidades — cada una con su propio diseño" (el concepto "copias
    // idénticas" desapareció de las superficies personalizables).
    await page.goto(`/estudio/${product.slug}?copies=3`, { waitUntil: "domcontentloaded" });
    await dismissCookies();
    await expect(listo).toBeVisible({ timeout: 30_000 });
    await listo.click();
    await expect(previewDialog).toBeVisible({ timeout: 30_000 });
    await expect(
      previewDialog.getByText("3 unidades — cada una con su propio diseño"),
    ).toBeVisible();
    await expect(previewDialog.getByText(/copias idénticas/)).toHaveCount(0);
    await expect(previewDialog.getByRole("group", { name: "Copias" })).toHaveCount(0);
    await previewDialog.getByRole("button", { name: /Volver a editar/i }).click();
    await expect(previewDialog).toBeHidden({ timeout: 10_000 });
  });
});
