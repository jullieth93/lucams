// @vitest-environment jsdom
/*
 * Regresión (owner 2026-09-18) — feedback del form de producto.
 *
 * Síntoma: "edito el nombre / destaco, doy guardar, aparentemente no hace
 * nada y no se refleja el cambio". Causa raíz doble:
 *
 *   1. updateProductAction retornaba {} al guardar → cero feedback de éxito.
 *   2. Si Zod rechazaba (ej. producto legado con garantía bajo el piso
 *      informado — el schema subió min(0)→min(12) en el barrido legal
 *      ADR-072; hoy el piso es 3 meses, ver products/schemas.ts), el alert
 *      global exigía `state.error && !state.fieldErrors` → con fieldErrors
 *      NO se renderizaba nada y el campo garantía no pinta error propio:
 *      el guardado se perdía EN SILENCIO.
 *
 * Estos tests fijan que:
 *   - el error global se muestra AUNQUE haya fieldErrors, nombrando el campo
 *     con etiqueta humana + su mensaje;
 *   - al guardar OK se muestra la confirmación "Cambios guardados".
 *
 * Se mockea next/navigation (AdminTabBar usa useSearchParams/useRouter — no
 * hay App Router en jsdom). La action se inyecta como prop → stub directo.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ProductForm } from "./product-form";
import type { ProductActionState } from "./actions";
import type {
  PersonalizationAdminConfig,
  ProductPersonalizationKind,
} from "@/features/products/personalization-schema";

afterEach(cleanup);

const CATEGORIES = [{ id: "clucat0000000000000000001", name: "Imanes", slug: "imanes" }];

const INITIAL_PRODUCT = {
  id: "cluprod000000000000000001",
  name: "Imán de foto",
  slug: "iman-de-foto",
  description: "Imán personalizado con tu foto favorita.",
  basePrice: 1500000,
  compareAtPrice: null,
  cost: null,
  sku: "IMAN-FOTO",
  categoryId: "clucat0000000000000000001",
  isPersonalizable: true,
  isActive: true,
  isFeatured: false,
  seoTitle: null,
  seoDescription: null,
};

function renderForm(state: ProductActionState) {
  const action = vi.fn(async () => state);
  render(
    <ProductForm
      categories={CATEGORIES}
      initialProduct={INITIAL_PRODUCT}
      action={action}
      submitLabel="Guardar cambios"
    />,
  );
  const form = document.querySelector("form");
  if (!form) throw new Error("ProductForm no renderizó <form>");
  return form;
}

describe("ProductForm — feedback de guardado (regresión 2026-09-18)", () => {
  it("muestra el error global AUNQUE haya fieldErrors, con etiqueta humana del campo", async () => {
    const form = renderForm({
      error: "Datos inválidos.",
      fieldErrors: {
        warrantyMonths: ["Mínimo 3 meses (el término de garantía informado al consumidor)"],
      },
    });
    fireEvent.submit(form);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Datos inválidos");
    expect(alert).toHaveTextContent("Garantía (meses)");
    expect(alert).toHaveTextContent("Mínimo 3 meses");
  });

  it("muestra confirmación visible cuando el guardado aplica", async () => {
    const form = renderForm({ success: true });
    fireEvent.submit(form);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/cambios guardados/i);
  });

  it("error sin fieldErrors (fallo de servicio) también se muestra", async () => {
    const form = renderForm({ error: "Algo salió mal actualizando el producto." });
    fireEvent.submit(form);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Algo salió mal actualizando el producto");
  });
});

/*
 * Tab "Personalización" (2026-10-02) — reemplaza la sección "Estudio de
 * personalización" del tab Avanzado (2026-09-24 v2). El tipo de
 * personalización (kind) se elige en un select con panel condicional;
 * canvasBaseScale (tamaño base del lienzo — el "100%" del cliente) y
 * gridColsOverride (columnas forzadas) viven en el panel FOTO (su único
 * consumidor es la superficie photo del Estudio). isPersonalizable ya NO es
 * un checkbox: lo deriva el service (kind ≠ NONE). Cambiar a "No
 * personalizable" DESMONTA el panel → la action manda nulls → el service
 * borra esas keys del personalizationSchema (ya no hay inputs ocultos de
 * preservación; decisión documentada en features/products/service.ts).
 */
describe("ProductForm — tab Personalización (2026-10-02)", () => {
  // Shape completo de PersonalizationAdminConfig (readPersonalizationAdminConfig)
  // con todo vacío — los tests pisan solo lo que necesitan.
  const PERSONALIZATION_DEFAULTS: PersonalizationAdminConfig = {
    photoSlots: null,
    facesPerUnit: null,
    aspectRatio: null,
    galleryTag: null,
    canvasBaseScale: null,
    gridColsOverride: null,
    textOnlyVariant: "name",
    letterCountMin: null,
    letterCountMax: null,
    language: "es",
    maxChars: null,
    fontOptions: null,
    eventFields: null,
    allowPhoto: false,
    logoFields: null,
    requiresVectorFile: false,
    letterSet: null,
  };

  type InitialProduct = typeof INITIAL_PRODUCT & {
    personalizationKind?: ProductPersonalizationKind;
    personalization?: PersonalizationAdminConfig;
  };

  const STUDIO_PRODUCT: InitialProduct = {
    ...INITIAL_PRODUCT,
    personalizationKind: "PHOTO_GRID",
    personalization: {
      ...PERSONALIZATION_DEFAULTS,
      photoSlots: 6,
      canvasBaseScale: 0.5,
      gridColsOverride: 2,
    },
  };

  function renderStudioForm(product: InitialProduct) {
    const action = vi.fn(async () => ({}));
    render(
      <ProductForm
        categories={CATEGORIES}
        initialProduct={product}
        action={action}
        submitLabel="Guardar cambios"
      />,
    );
  }

  const kindHidden = () =>
    document.querySelector<HTMLInputElement>('input[type="hidden"][name="personalizationKind"]');

  it("producto con superficie foto: precarga slots, tamaño base y columnas guardadas", () => {
    renderStudioForm(STUDIO_PRODUCT);
    expect((screen.getByLabelText(/número de fotos/i) as HTMLInputElement).value).toBe("6");
    expect((screen.getByLabelText(/tamaño base del lienzo/i) as HTMLInputElement).value).toBe(
      "0.5",
    );
    expect((screen.getByLabelText(/columnas de la grilla/i) as HTMLInputElement).value).toBe("2");
    // El hint explica la semántica v2: el cliente ve este tamaño como su 100%.
    expect(
      screen.getByText(/el cliente siempre verá este tamaño como su 100%/i),
    ).toBeInTheDocument();
    // El kind viaja en el input oculto efectivo (el select es controlado).
    expect(kindHidden()?.value).toBe("PHOTO_GRID");
  });

  it("sin overrides: tamaño base muestra 1 (el estándar) y columnas vacío = automático", () => {
    // Sin canvasBaseScale guardado → el input muestra 1 (el estándar), no vacío.
    // Sin gridColsOverride → vacío con placeholder "Automático": el valor
    // automático es responsivo (1 en celular, 2-3 en computador), no un número
    // único calculable desde el admin — el hint lo documenta.
    renderStudioForm({
      ...STUDIO_PRODUCT,
      personalization: { ...PERSONALIZATION_DEFAULTS, photoSlots: 1 },
    });
    const base = screen.getByLabelText(/tamaño base del lienzo/i) as HTMLInputElement;
    const cols = screen.getByLabelText(/columnas de la grilla/i) as HTMLInputElement;
    expect(base.value).toBe("1");
    expect(cols.value).toBe("");
    expect(cols.placeholder).toBe("Automático");
    expect(screen.getByText(/vacío = automático/i)).toBeInTheDocument();
  });

  it("cambiar el tipo a «No personalizable» desmonta el panel foto y el kind efectivo pasa a NONE", () => {
    renderStudioForm(STUDIO_PRODUCT);
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "NONE" } });

    // El panel foto sale del DOM: al guardar, la action manda esos campos como
    // null y el service BORRA las keys del personalizationSchema (limpieza al
    // cambiar de tipo). Ya NO hay inputs ocultos de preservación.
    expect(screen.queryByLabelText(/tamaño base del lienzo/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/columnas de la grilla/i)).not.toBeInTheDocument();
    expect(
      document.querySelector('input[type="hidden"][name="canvasBaseScale"]'),
    ).toBeNull();
    expect(kindHidden()?.value).toBe("NONE");
    expect(screen.getByText(/compra directa — el producto se añade al carrito/i)).toBeInTheDocument();
  });

  it("isPersonalizable se deriva del kind: sin checkbox suelto, el estado se muestra read-only", () => {
    renderStudioForm(STUDIO_PRODUCT);
    // El checkbox 🎨 Personalizable ya no existe en el form.
    expect(document.querySelector('input[name="isPersonalizable"]')).toBeNull();
    // Con kind foto, el indicador derivado dice que el Estudio abre en la PDP.
    expect(
      screen.getByText(/la página del producto abre el Estudio en vivo/i),
    ).toBeInTheDocument();

    // «Set de letras» es sintético: persiste kind NONE + schema.letterSet.
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "LETTERSET" } });
    expect(kindHidden()?.value).toBe("NONE");
    expect(screen.getByLabelText(/contenido del set/i)).toBeInTheDocument();
    expect(
      document.querySelector<HTMLSelectElement>('select[name="letterSet"]')?.value,
    ).toBe("full");
    expect(
      screen.getByText(/el color del marco en el Estudio \(el set físico es fijo\)/i),
    ).toBeInTheDocument();
  });

  it("TEXT_ONLY: el sub-select alterna los campos de nombre y de frase", () => {
    renderStudioForm({
      ...STUDIO_PRODUCT,
      personalizationKind: "TEXT_ONLY",
      personalization: {
        ...PERSONALIZATION_DEFAULTS,
        textOnlyVariant: "name",
        letterCountMax: 10,
      },
    });
    // Subtipo "nombre": límites de letras precargados, sin campos de frase.
    expect((screen.getByLabelText(/máximo de letras/i) as HTMLInputElement).value).toBe("10");
    expect(screen.queryByLabelText(/máximo de caracteres/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Subtipo"), { target: { value: "phrase" } });
    expect(screen.getByLabelText(/máximo de caracteres de la frase/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/máximo de letras/i)).not.toBeInTheDocument();
  });

  it("el alert global nombra los campos nuevos con etiqueta humana", async () => {
    const form = renderForm({
      error: "Datos inválidos.",
      fieldErrors: {
        gridColsOverride: ["Máximo 6 columnas"],
        canvasBaseScale: ["Mínimo 0.5 (50%)"],
      },
    });
    fireEvent.submit(form);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Columnas de la grilla");
    expect(alert).toHaveTextContent("Máximo 6 columnas");
    expect(alert).toHaveTextContent("Tamaño base del lienzo");
  });
});
