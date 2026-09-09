// @vitest-environment jsdom
/*
 * Test de componente — VariantSelector (bug PDP separadores-libros).
 *
 * Regression: las variants de separadores-libros declaran `quantity` y
 * `photoSlots` con valores IDÉNTICOS (1/3/5) y ambas dimensions tenían el
 * label "Cantidad" → la PDP pintaba DOS grupos "CANTIDAD". El selector deduplica
 * dimensions cuyo valor es el mismo en TODAS las variants.
 *
 * Lucy 2026-09-05 (bug en vivo: "hay cantidad y a la vez unidades"): cuando el
 * dedupe aplica (quantity == photoSlots en todas las variants, como en todos
 * los fotoimanes/separadores del catálogo), el grupo visible conserva photoSlots
 * (va antes en VISIBLE_DIMENSIONS) — es la COMPOSICIÓN del pack. Regla
 * 2026-09-08b: la PDP RENOMBRA ese grupo a "Unidades" por familia
 * (PDP_DIMENSION_LABEL_OVERRIDES — un concepto, un label); los tests del pack
 * size ejercitan el override tal como lo pasa la página. El stepper dice
 * "{qty} foto(s)"/"{qty} unidad(es)" y NO muestra "Total: $X" (ese total lo
 * fija el carrito; el precio del pack está en el bloque PRECIO). Se mantiene
 * el "$X c/u".
 *
 * Stepper de cantidad (Lucy 2026-07-22): cuando la dimensión de cantidad es
 * 1..N contigua (fotoimanes/separadores 1–6), se muestra stepper +/− con
 * "$X c/u" en vez de chips. Los tests del stepper envuelven el selector en
 * SelectedVariantProvider (la fuente de verdad del buy-box, H12) para ejercitar
 * la interacción real: click +/− → setSelectedId → re-render.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { formatCOP } from "@/lib/format";

// Mock de next/navigation (SelectedVariantProvider hace router.replace al cambiar
// la variante: side-effect del deep-link ?variant=). El factory solo cierra sobre
// `replace`; el acceso real ocurre en render, cuando el const ya se inicializó.
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));

import { VariantSelector } from "./variant-selector";
import { SelectedVariantProvider } from "./variant-actions";

// formatCOP usa NBSP (U+00A0) tras el "$"; el DOM lo colapsa a espacio normal al
// comparar textContent. Helper: esperado con espacios normales, como queda en el DOM.
const cop = (centavos: number) => formatCOP(centavos).replace(/\s+/g, " ");

// vitest.config usa globals:false → cleanup manual entre tests.
afterEach(() => cleanup());
beforeEach(() => replace.mockClear());

type TestVariant = {
  id: string;
  name: string;
  sku: string;
  price: number | null;
  stock: number;
  attributes: unknown;
};

function makeVariant(
  id: string,
  attributes: Record<string, unknown>,
  price = 100_000,
  stock = 100,
): TestVariant {
  return { id, name: id, sku: id.toUpperCase(), price, stock, attributes };
}

// Datos reales (2026-07) de separadores-libros: quantity == photoSlots en
// cada variant (cada separador lleva 1 foto) + 2 tamaños.
const separadoresVariants: TestVariant[] = [
  makeVariant("v-c1", { shape: "rectangle", sizeCm: "6×6", quantity: 1, photoSlots: 1 }),
  makeVariant("v-c3", { shape: "rectangle", sizeCm: "6×6", quantity: 3, photoSlots: 3 }),
  makeVariant("v-c5", { shape: "rectangle", sizeCm: "6×6", quantity: 5, photoSlots: 5 }),
  makeVariant("v-r1", { shape: "rectangle", sizeCm: "5×14", quantity: 1, photoSlots: 1 }),
  makeVariant("v-r3", { shape: "rectangle", sizeCm: "5×14", quantity: 3, photoSlots: 3 }),
  makeVariant("v-r5", { shape: "rectangle", sizeCm: "5×14", quantity: 5, photoSlots: 5 }),
];

describe("VariantSelector", () => {
  it("no duplica el grupo de composición cuando quantity y photoSlots coinciden en todas las variants", () => {
    render(<VariantSelector productBasePrice={100_000} variants={separadoresVariants} />);
    // Un solo grupo (antes salían dos "Cantidad"); al coincidir quantity y
    // photoSlots, el dedupe conserva photoSlots → el grupo se etiqueta "Fotos".
    expect(screen.getAllByRole("group", { name: "Fotos" })).toHaveLength(1);
    expect(screen.queryByRole("group", { name: "Cantidad" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: "Tamaño" })).toHaveLength(1);
    // Los chips de fotos y tamaño siguen completos.
    const fotos = screen.getByRole("group", { name: "Fotos" });
    expect(within(fotos).getAllByRole("button")).toHaveLength(3);
    const tamano = screen.getByRole("group", { name: "Tamaño" });
    expect(within(tamano).getAllByRole("button")).toHaveLength(2);
  });

  it("mantiene grupos separados cuando las dimensions NO coinciden (photoSlots vs sizeCm)", () => {
    // Estilo polaroid: cada variant combina fotos y tamaño distintos (no
    // coinciden como strings) → ambos grupos deben seguir apareciendo.
    // Ola 18 — photoSlots se etiqueta "Fotos" (fotos por unidad; las cantidades
    // de unidades usan `quantity` → "Cantidad").
    const variants = [
      makeVariant("v-p6", { photoSlots: 6, sizeCm: "7×9" }),
      makeVariant("v-p12", { photoSlots: 12, sizeCm: "6×8" }),
    ];
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    expect(screen.getAllByRole("group", { name: "Fotos" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Tamaño" })).toHaveLength(1);
    expect(screen.getByText("6 fotos")).toBeInTheDocument();
    expect(screen.getByText("12 fotos")).toBeInTheDocument();
  });

  it("muestra la dimensión Forma cuando shape tiene más de un valor", () => {
    // 2 formas × 2 tamaños → modo multi-dim (con 1 sola dimensión el selector
    // renderiza la lista vertical "Elige tu opción", sin grupos de chips).
    const variants = [
      makeVariant("v-s1", { shape: "rectangle", sizeCm: "6×6" }),
      makeVariant("v-s2", { shape: "heart", sizeCm: "6×6" }),
      makeVariant("v-s3", { shape: "rectangle", sizeCm: "5×14" }),
      makeVariant("v-s4", { shape: "heart", sizeCm: "5×14" }),
    ];
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    expect(screen.getAllByRole("group", { name: "Forma" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Tamaño" })).toHaveLength(1);
  });

  it("pinta Fotos/Tamaño/Marco una sola vez en la matriz fotoimanes (size × marco × qty)", () => {
    // Datos reales (2026-07-22) de set-fotoimanes-cuadrados: quantity == photoSlots
    // en todas las variants + frameStyle blanco/negro → el grupo de composición
    // se etiqueta "Fotos" (dedupe, Lucy 2026-09-05).
    const variants: TestVariant[] = [];
    for (const sizeCm of ["6.5×6.5", "7.5×10"]) {
      for (const frameStyle of ["blanco", "negro"]) {
        for (const qty of [1, 2]) {
          variants.push(
            makeVariant(`v-${sizeCm}-${frameStyle}-${qty}`, {
              shape: "rectangle",
              sizeCm,
              frameStyle,
              quantity: qty,
              photoSlots: qty,
              aspectRatio: sizeCm === "6.5×6.5" ? "1:1" : "3:4",
            }),
          );
        }
      }
    }
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    expect(screen.getAllByRole("group", { name: "Fotos" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Tamaño" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Marco" })).toHaveLength(1);
    const marco = screen.getByRole("group", { name: "Marco" });
    expect(within(marco).getByText("Blanco")).toBeInTheDocument();
    expect(within(marco).getByText("Negro")).toBeInTheDocument();
  });

  it("no pinta un grupo cuyo valor es único en todas las variants (marco fijo)", () => {
    // Si todas las variants tienen frameStyle "blanco", el grupo Marco no debe
    // aparecer (regla: solo dimensions con >1 valor distinto se muestran).
    const variants = [
      makeVariant("v-b1", { sizeCm: "6.5×6.5", frameStyle: "blanco", quantity: 1, photoSlots: 1 }),
      makeVariant("v-b2", { sizeCm: "6.5×6.5", frameStyle: "blanco", quantity: 2, photoSlots: 2 }),
      makeVariant("v-r1", { sizeCm: "7.5×10", frameStyle: "blanco", quantity: 1, photoSlots: 1 }),
      makeVariant("v-r2", { sizeCm: "7.5×10", frameStyle: "blanco", quantity: 2, photoSlots: 2 }),
    ];
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    expect(screen.queryByRole("group", { name: "Marco" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: "Fotos" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Tamaño" })).toHaveLength(1);
  });

  it("muestra el grupo Estilo (polaroid) con sus 3 opciones en orden", () => {
    // 2 sets × 3 estilos → modo multi-dim (con 1 sola dimensión el selector
    // renderiza la lista vertical "Elige tu opción", sin grupos de chips).
    const variants = [
      makeVariant("v-p6-bc", { photoSlots: 6, sizeCm: "7×9", variantStyle: "blanco-clasico" }),
      makeVariant("v-p6-pas", { photoSlots: 6, sizeCm: "7×9", variantStyle: "pasteles" }),
      makeVariant("v-p6-ig", { photoSlots: 6, sizeCm: "7×9", variantStyle: "instagram" }),
      makeVariant("v-p12-bc", { photoSlots: 12, sizeCm: "6×8", variantStyle: "blanco-clasico" }),
      makeVariant("v-p12-pas", { photoSlots: 12, sizeCm: "6×8", variantStyle: "pasteles" }),
      makeVariant("v-p12-ig", { photoSlots: 12, sizeCm: "6×8", variantStyle: "instagram" }),
    ];
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    const estilo = screen.getByRole("group", { name: "Estilo" });
    const chips = within(estilo)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(chips).toEqual(["Blanco clásico", "Pasteles", "Instagram"]);
  });

  it("muestra los grupos Tema e Idioma (pack vocales) sin duplicados", () => {
    // Matriz real (2026-07-22): 2 temas × 2 idiomas × 1 tamaño × imán sí/no.
    const variants: TestVariant[] = [];
    for (const theme of ["animales", "frutas"]) {
      for (const language of ["es", "en"]) {
        for (const magnet of [true, false]) {
          variants.push(
            makeVariant(`v-${theme}-${language}-${magnet}`, {
              size: "mini",
              sizeCm: "5×7",
              magnet,
              theme,
              language,
            }),
          );
        }
      }
    }
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    expect(screen.getAllByRole("group", { name: "Tema" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Idioma" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "¿Con imán?" })).toHaveLength(1);
    const tema = screen.getByRole("group", { name: "Tema" });
    expect(within(tema).getByText("Animales")).toBeInTheDocument();
    expect(within(tema).getByText("Frutas")).toBeInTheDocument();
  });
});

/*
 * Ola 2A (Lucy 2026-07-22) — dimensiones ocultas: Estilo/Marco/Tema/Idioma ya no se
 * muestran como grupo de chips en la PDP (se eligen dentro del Estudio). Las variantes
 * siguen intactas; solo se filtra el grupo del UI y la selección sigue funcionando.
 */
describe("VariantSelector — dimensiones ocultas (Ola 2A)", () => {
  it("oculta el grupo Estilo en la Polaroid pero deja Fotos y Tamaño seleccionables", () => {
    const variants = [
      makeVariant("v-p6-bc", { photoSlots: 6, sizeCm: "7×9", variantStyle: "blanco-clasico" }),
      makeVariant("v-p6-pas", { photoSlots: 6, sizeCm: "7×9", variantStyle: "pasteles" }),
      makeVariant("v-p6-ig", { photoSlots: 6, sizeCm: "7×9", variantStyle: "instagram" }),
      makeVariant("v-p12-bc", { photoSlots: 12, sizeCm: "6×8", variantStyle: "blanco-clasico" }),
      makeVariant("v-p12-pas", { photoSlots: 12, sizeCm: "6×8", variantStyle: "pasteles" }),
      makeVariant("v-p12-ig", { photoSlots: 12, sizeCm: "6×8", variantStyle: "instagram" }),
    ];
    render(
      <VariantSelector
        productBasePrice={100_000}
        variants={variants}
        hiddenDimensions={["variantStyle"]}
      />,
    );
    expect(screen.queryByRole("group", { name: "Estilo" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: "Fotos" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Tamaño" })).toHaveLength(1);
  });

  it("oculta Tema e Idioma en Pack Vocales; la combinación tamaño+imán sigue seleccionable", () => {
    const variants: TestVariant[] = [];
    for (const theme of ["animales", "frutas"]) {
      for (const language of ["es", "en"]) {
        for (const sizeCm of ["5×7", "7×10"]) {
          for (const magnet of [true, false]) {
            variants.push(
              makeVariant(`v-${theme}-${language}-${sizeCm}-${magnet}`, {
                size: "mini",
                sizeCm,
                magnet,
                theme,
                language,
              }),
            );
          }
        }
      }
    }
    render(
      <SelectedVariantProvider variantIds={variants.map((v) => v.id)} initialId={variants[0]!.id}>
        <VariantSelector
          productBasePrice={100_000}
          variants={variants}
          hiddenDimensions={["theme", "language"]}
        />
      </SelectedVariantProvider>,
    );
    expect(screen.queryByRole("group", { name: "Tema" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Idioma" })).not.toBeInTheDocument();
    // Quedan las dimensiones visibles y los chips siguen cambiando la variante.
    const magnetGroup = screen.getByRole("group", { name: "¿Con imán?" });
    fireEvent.click(within(magnetGroup).getByText("✨ Sin imán"));
    expect(replace).toHaveBeenCalled();
  });

  it("sin la prop hiddenDimensions todo se muestra como antes (retro-compat)", () => {
    const variants = [
      makeVariant("v-b1", { sizeCm: "6.5×6.5", frameStyle: "blanco", quantity: 1, photoSlots: 1 }),
      makeVariant("v-n1", { sizeCm: "6.5×6.5", frameStyle: "negro", quantity: 1, photoSlots: 1 }),
      makeVariant("v-b2", { sizeCm: "7.5×10", frameStyle: "blanco", quantity: 1, photoSlots: 1 }),
      makeVariant("v-n2", { sizeCm: "7.5×10", frameStyle: "negro", quantity: 1, photoSlots: 1 }),
    ];
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    expect(screen.getAllByRole("group", { name: "Marco" })).toHaveLength(1);
  });
});

/*
 * Regla 2026-09-08b (Lucy) — los packs de fotoimanes muestran el pack size en la
 * PDP como "Unidades" (stepper si 1..N contiguo): ya NO se ocultan
 * photoSlots/quantity. Lo único oculto es la dimensión de ESTILO que se elige
 * dentro del Estudio (variantStyle/frameStyle). Elegir tamaño ancla a la
 * variante N=1 de ese tamaño (deep-link ?variant= → el Estudio abre con ese N).
 */
describe("VariantSelector — packs: 'Unidades' visible, estilo oculto (regla 2026-09-08b)", () => {
  it("pack multi-tamaño (cuadrados): stepper Unidades + Tamaño, Marco oculto", () => {
    // Réplica set-fotoimanes-cuadrados: 2 tamaños × photoSlots 1..2 contiguos.
    const variants = [
      makeVariant("v-65-1", {
        sizeCm: "6.5×6.5",
        quantity: 1,
        photoSlots: 1,
        frameStyle: "blanco",
      }),
      makeVariant("v-65-2", {
        sizeCm: "6.5×6.5",
        quantity: 2,
        photoSlots: 2,
        frameStyle: "blanco",
      }),
      makeVariant("v-10-1", { sizeCm: "10×10", quantity: 1, photoSlots: 1, frameStyle: "blanco" }),
      makeVariant("v-10-2", { sizeCm: "10×10", quantity: 2, photoSlots: 2, frameStyle: "blanco" }),
    ];
    render(
      <VariantSelector
        productBasePrice={100_000}
        variants={variants}
        hiddenDimensions={["frameStyle"]}
        dimensionLabels={{ photoSlots: "Unidades" }}
        singleDimAsChips
      />,
    );
    expect(screen.queryByRole("group", { name: "Marco" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Cantidad" })).not.toBeInTheDocument();
    const unidades = screen.getByRole("group", { name: "Unidades" });
    // 1..2 contiguo → stepper +/− (no chips).
    expect(within(unidades).getByLabelText("Aumentar unidades")).toBeInTheDocument();
    expect(within(unidades).getByLabelText("Disminuir unidades")).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: "Tamaño" })).toHaveLength(1);
  });

  it("pack de tamaño único (polaroid): stepper Unidades 1..N + chip estático de Tamaño", () => {
    const variants = [1, 2, 3].map((n) =>
      makeVariant(`v-pol-${n}`, { sizeCm: "7.5×10", quantity: n, photoSlots: n }),
    );
    render(
      <VariantSelector
        productBasePrice={100_000}
        variants={variants}
        hiddenDimensions={["variantStyle"]}
        dimensionLabels={{ photoSlots: "Unidades" }}
      />,
    );
    const unidades = screen.getByRole("group", { name: "Unidades" });
    expect(within(unidades).getByLabelText("Aumentar unidades")).toBeInTheDocument();
    // Dimensión de tamaño único → chip estático no clicable con la medida.
    const tamano = screen.getByRole("group", { name: "Tamaño" });
    expect(within(tamano).getByText("7.5×10 cm")).toBeInTheDocument();
  });

  it("elegir tamaño ancla a la variante N=1 de ese tamaño (menor precio del tamaño)", () => {
    const variants = [
      makeVariant("v-65-1", { sizeCm: "6.5×6.5", quantity: 1, photoSlots: 1 }, 160_000),
      makeVariant("v-65-2", { sizeCm: "6.5×6.5", quantity: 2, photoSlots: 2 }, 176_000),
      makeVariant("v-10-1", { sizeCm: "10×10", quantity: 1, photoSlots: 1 }, 219_000),
      makeVariant("v-10-2", { sizeCm: "10×10", quantity: 2, photoSlots: 2 }, 241_000),
    ];
    render(
      <SelectedVariantProvider variantIds={variants.map((v) => v.id)} initialId={null}>
        <VariantSelector
          productBasePrice={160_000}
          variants={variants}
          hiddenDimensions={["frameStyle"]}
          dimensionLabels={{ photoSlots: "Unidades" }}
          singleDimAsChips
        />
      </SelectedVariantProvider>,
    );
    fireEvent.click(within(screen.getByRole("group", { name: "Tamaño" })).getByText("10×10 cm"));
    // La primera variante con stock de ese tamaño es v-10-1 (N=1) → el deep-link
    // fija tamaño + N para el Estudio.
    expect(decodeURIComponent(String(replace.mock.calls[0]?.[0]))).toContain("variant=v-10-1");
  });
});

/*
 * Regla 2026-09-08b (Lucy) — la PDP de separadores/tiras muestra UN concepto de
 * cantidad: "Unidades" (pack size: cuántos separadores / cuántas fotos trae la
 * tira). El N elegido viaja en ?variant= → el Estudio abre con ese N (merge de
 * la variante sobre el schema).
 */
describe("VariantSelector — pack size 'Unidades' en la PDP (regla 2026-09-08b)", () => {
  it("separadores: photoSlots oculta NO tapa a quantity idéntica — queda el stepper 'Unidades'", () => {
    // Regresión del orden dedupe/filtro: quantity == photoSlots 1:1 en TODAS las
    // variants. Si el dedupe corriera ANTES del filtro de ocultas, conservaría
    // photoSlots (primera en VISIBLE_DIMENSIONS), descartaría quantity como
    // duplicada y luego ocultaría photoSlots → la PDP se quedaba sin Unidades
    // (bug reportado por Lucy: solo se veían tamaño y precio).
    const variants: TestVariant[] = [];
    for (const sizeCm of ["2×6", "4×4.2"]) {
      for (const qty of [1, 2, 3, 4, 5, 6]) {
        variants.push(
          makeVariant(`v-${sizeCm}-${qty}`, {
            shape: "rectangle",
            sizeCm,
            quantity: qty,
            photoSlots: qty,
          }),
        );
      }
    }
    render(
      <VariantSelector
        productBasePrice={400_000}
        variants={variants}
        hiddenDimensions={["photoSlots"]}
        dimensionLabels={{ quantity: "Unidades" }}
      />,
    );
    expect(screen.queryByRole("group", { name: "Fotos" })).not.toBeInTheDocument();
    const unidades = screen.getByRole("group", { name: "Unidades" });
    // 1..6 contiguo → stepper +/− (no chips), sustantivo "unidades".
    expect(within(unidades).getByLabelText("Aumentar unidades")).toBeInTheDocument();
    expect(within(unidades).getByLabelText("Disminuir unidades")).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: "Tamaño" })).toHaveLength(1);
  });

  it("separadores: elegir Unidades=3 fija la variante de 3 unidades (deep-link ?variant= para el Estudio)", () => {
    const variants: TestVariant[] = [];
    for (const qty of [1, 2, 3]) {
      variants.push(
        makeVariant(
          `v-sep-${qty}`,
          { shape: "rectangle", sizeCm: "2×6", quantity: qty, photoSlots: qty },
          400_000 * qty,
        ),
      );
    }
    render(
      <SelectedVariantProvider variantIds={variants.map((v) => v.id)} initialId="v-sep-1">
        <VariantSelector
          productBasePrice={400_000}
          variants={variants}
          hiddenDimensions={["photoSlots"]}
          dimensionLabels={{ quantity: "Unidades" }}
        />
      </SelectedVariantProvider>,
    );
    const unidades = screen.getByRole("group", { name: "Unidades" });
    fireEvent.click(within(unidades).getByLabelText("Aumentar unidades"));
    fireEvent.click(within(unidades).getByLabelText("Aumentar unidades"));
    expect(within(unidades).getByText("3 unidades")).toBeInTheDocument();
    // El deep-link lleva la variante qty=3 → el Estudio abre con N=3.
    expect(replace).toHaveBeenLastCalledWith(
      expect.stringContaining("variant=v-sep-3"),
      expect.anything(),
    );
  });

  it("tiras (híbrido 2026-09-09): photoSlots visible con label 'Fotos por tira' (chips 3/4) y quantity oculta", () => {
    // Catálogo real (fix-tiras 2026-09-07): 2 variantes de 1 unidad, 3 y 4 fotos
    // (1:1 con el tamaño 6.5×20 / 6.5×26.5). quantity=1 en ambas → no es elección.
    // 2026-09-09 (owner): photoSlots es COMPOSICIÓN → "Fotos por tira"; "Unidades"
    // pasa a ser el stepper de copias del buy-box (CopiesQtyInput, fuera de este
    // componente) → acá NO debe quedar ningún grupo "Unidades".
    const variants = [
      makeVariant(
        "v-tira-3",
        { sizeCm: "6.5×20", quantity: 1, photoSlots: 3, aspectRatio: "1:1" },
        1_900_000,
      ),
      makeVariant(
        "v-tira-4",
        { sizeCm: "6.5×26.5", quantity: 1, photoSlots: 4, aspectRatio: "3:4" },
        2_400_000,
      ),
    ];
    render(
      <VariantSelector
        productBasePrice={1_900_000}
        variants={variants}
        hiddenDimensions={["quantity"]}
        dimensionLabels={{ photoSlots: "Fotos por tira" }}
      />,
    );
    const fotosPorTira = screen.getByRole("group", { name: "Fotos por tira" });
    // No contiguo desde 1 (3..4) → chips, no stepper.
    expect(within(fotosPorTira).getByText("3 fotos")).toBeInTheDocument();
    expect(within(fotosPorTira).getByText("4 fotos")).toBeInTheDocument();
    expect(within(fotosPorTira).queryByLabelText("Aumentar unidades")).not.toBeInTheDocument();
    // El tamaño sigue visible aunque correlacione 1:1 con la cantidad (elección real).
    expect(screen.getByRole("group", { name: "Tamaño" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Fotos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Unidades" })).not.toBeInTheDocument();
  });
});

/*
 * Dedupe por correlación 1:1 con el idioma (Lucy 2026-09-03 — abecedario-completo):
 * la cantidad del set la DEFINE el idioma (es=27 con Ñ, en=26) — no es elección del
 * cliente. El grupo "Cantidad" se oculta como selector y su valor se describe como
 * texto bajo el grupo "Idioma". Requiere el dato normalizado en TODAS las variants
 * (packages/db/scripts/normalize-letterset-quantity.mjs); si falta en alguna, la
 * correlación se rompe y el grupo vuelve a mostrarse (degradación segura).
 * Otras correlaciones 1:1 del catálogo (photoSlots↔sizeCm en polaroid/tiras) son
 * elección real del cliente y SIGUEN visibles — el gate es solo language.
 */
describe("VariantSelector — cantidad determinada por el idioma (correlación 1:1)", () => {
  // Espejo de abecedario-completo tras normalizar: 2 tamaños × imán sí/no × idioma,
  // quantity 27 (es) / 26 (en) en TODAS las variants.
  const abecedarioVariants: TestVariant[] = [];
  for (const language of ["es", "en"]) {
    for (const sizeCm of ["5×7", "7×10"]) {
      for (const magnet of [true, false]) {
        abecedarioVariants.push(
          makeVariant(`abc-${language}-${sizeCm}-${magnet}`, {
            sizeCm,
            magnet,
            language,
            quantity: language === "es" ? 27 : 26,
          }),
        );
      }
    }
  }

  it("oculta 'Cantidad' como selector y la describe bajo Idioma cuando correlaciona 1:1", () => {
    render(<VariantSelector productBasePrice={100_000} variants={abecedarioVariants} />);
    expect(screen.queryByRole("group", { name: "Cantidad" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Idioma" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Tamaño" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "¿Con imán?" })).toBeInTheDocument();
    expect(screen.getByText("Cantidad: 27 en Español · 26 en Inglés")).toBeInTheDocument();
  });

  it("elegir idioma sigue seleccionando la variante con la cantidad correcta", () => {
    render(
      <SelectedVariantProvider variantIds={abecedarioVariants.map((v) => v.id)} initialId={null}>
        <VariantSelector productBasePrice={100_000} variants={abecedarioVariants} />
      </SelectedVariantProvider>,
    );
    fireEvent.click(within(screen.getByRole("group", { name: "Idioma" })).getByText("Inglés"));
    // Sin otras dimensiones elegidas, el click ancla a la primera variante con
    // stock en inglés (abc-en-5×7-true, quantity 26) — la cantidad viaja con ella.
    expect(replace).toHaveBeenCalled();
    expect(decodeURIComponent(String(replace.mock.calls[0]?.[0]))).toContain(
      "variant=abc-en-5×7-true",
    );
  });

  it("si una variant no trae quantity la correlación se rompe y 'Cantidad' vuelve a mostrarse", () => {
    const variants = abecedarioVariants.map((v) =>
      v.id === "abc-en-5×7-true"
        ? makeVariant(v.id, { sizeCm: "5×7", magnet: true, language: "en" })
        : v,
    );
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    expect(screen.getByRole("group", { name: "Cantidad" })).toBeInTheDocument();
    expect(screen.queryByText(/en Español · /)).not.toBeInTheDocument();
  });

  it("NO oculta correlaciones 1:1 ajenas al idioma (photoSlots↔sizeCm, polaroid)", () => {
    const variants = [
      makeVariant("v-p6", { photoSlots: 6, sizeCm: "7×9" }),
      makeVariant("v-p12", { photoSlots: 12, sizeCm: "6×8" }),
    ];
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    expect(screen.getByRole("group", { name: "Fotos" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Tamaño" })).toBeInTheDocument();
  });
});

/*
 * Stepper de cantidad (Lucy 2026-07-22). Aplica solo cuando la dimensión de
 * cantidad es 1..N contigua; los sets no contiguos conservan chips.
 * Se envuelve en SelectedVariantProvider para ejercitar la interacción real
 * (click → setSelectedId → re-render + router.replace del deep-link).
 */
describe("VariantSelector — stepper de cantidad", () => {
  // Matriz estilo set-fotoimanes-cuadrados (real 2026-07): 2 tamaños × cantidad 1..3.
  // quantity == photoSlots en todas → también cubre el dedupe: el grupo de
  // composición se etiqueta "Fotos" (Lucy 2026-09-05), no "Cantidad".
  const stepperVariants: TestVariant[] = [
    makeVariant(
      "v-a1",
      { shape: "rectangle", sizeCm: "6.5×6.5", quantity: 1, photoSlots: 1 },
      1_600_000,
    ),
    makeVariant(
      "v-a2",
      { shape: "rectangle", sizeCm: "6.5×6.5", quantity: 2, photoSlots: 2 },
      1_760_000,
    ),
    makeVariant(
      "v-a3",
      { shape: "rectangle", sizeCm: "6.5×6.5", quantity: 3, photoSlots: 3 },
      1_920_000,
    ),
    makeVariant(
      "v-b1",
      { shape: "rectangle", sizeCm: "7.5×10", quantity: 1, photoSlots: 1 },
      1_930_000,
    ),
    makeVariant(
      "v-b2",
      { shape: "rectangle", sizeCm: "7.5×10", quantity: 2, photoSlots: 2 },
      2_130_000,
    ),
    makeVariant(
      "v-b3",
      { shape: "rectangle", sizeCm: "7.5×10", quantity: 3, photoSlots: 3 },
      2_320_000,
    ),
  ];

  function renderWithProvider(variants: TestVariant[], initialId: string, basePrice = 100_000) {
    return render(
      <SelectedVariantProvider variantIds={variants.map((v) => v.id)} initialId={initialId}>
        <VariantSelector productBasePrice={basePrice} variants={variants} />
      </SelectedVariantProvider>,
    );
  }

  it("reemplaza los chips por un stepper +/− con $ c/u (y SIN 'Total:') cuando la cantidad es 1..N contigua", () => {
    renderWithProvider(stepperVariants, "v-a1");
    const fotos = screen.getByRole("group", { name: "Fotos" });
    // Un solo grupo Fotos (dedupe quantity/photoSlots intacto) y NO hay chips:
    // solo los 2 botones del stepper (−/+).
    expect(screen.getAllByRole("group", { name: "Fotos" })).toHaveLength(1);
    expect(within(fotos).getAllByRole("button")).toHaveLength(2);
    expect(within(fotos).getByLabelText("Disminuir unidades")).toBeInTheDocument();
    expect(within(fotos).getByLabelText("Aumentar unidades")).toBeInTheDocument();
    // Composición del pack ("1 foto") y precio por foto visibles. Regresión
    // (Lucy 2026-09-05): el stepper ya NO muestra "Total: $X" — ese total lo
    // fija el carrito (o la modal del Estudio), no la composición del pack.
    expect(within(fotos).getByText("1 foto")).toBeInTheDocument();
    expect(within(fotos).getByText(`${cop(1_600_000)} c/u`)).toBeInTheDocument();
    expect(within(fotos).queryByText(/Total:/)).not.toBeInTheDocument();
  });

  it("el stepper mapea +/− a la variante con esa cantidad (c/u y deep-link en sync)", () => {
    renderWithProvider(stepperVariants, "v-a1");
    const fotos = screen.getByRole("group", { name: "Fotos" });

    fireEvent.click(within(fotos).getByLabelText("Aumentar unidades"));
    // Seleccionó la variante qty=2 del MISMO tamaño: c/u recalculado (sin "Total:").
    expect(within(fotos).getByText("2 fotos")).toBeInTheDocument();
    expect(within(fotos).queryByText(/Total:/)).not.toBeInTheDocument();
    expect(within(fotos).getByText(`${cop(880_000)} c/u`)).toBeInTheDocument();
    // Deep-link compartible: la URL recibe ?variant=v-a2 como side-effect.
    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining("variant=v-a2"),
      expect.anything(),
    );

    fireEvent.click(within(fotos).getByLabelText("Disminuir unidades"));
    expect(within(fotos).getByText("1 foto")).toBeInTheDocument();
    expect(within(fotos).getByText(`${cop(1_600_000)} c/u`)).toBeInTheDocument();
  });

  it("deshabilita − en el mínimo y + en el máximo del rango", () => {
    renderWithProvider(stepperVariants, "v-a1");
    const fotos = screen.getByRole("group", { name: "Fotos" });
    expect(within(fotos).getByLabelText("Disminuir unidades")).toBeDisabled();

    fireEvent.click(within(fotos).getByLabelText("Aumentar unidades"));
    fireEvent.click(within(fotos).getByLabelText("Aumentar unidades"));
    expect(within(fotos).getByText("3 fotos")).toBeInTheDocument();
    expect(within(fotos).getByLabelText("Aumentar unidades")).toBeDisabled();
    expect(within(fotos).getByLabelText("Disminuir unidades")).toBeEnabled();
  });

  it("acota el stepper a las cantidades disponibles en la combinación actual (matriz incompleta)", () => {
    // Tamaño A tiene 1..3; tamaño B solo 1..2 → valores globales 1..3 (contiguos →
    // stepper) pero en B no existe qty=3: "+" debe deshabilitarse al llegar a 2 y
    // el c/u debe ser el de la variante B (no caer a A). SIN "Total:" (Lucy 2026-09-05).
    const variants = [
      makeVariant("v-a1", { sizeCm: "A", quantity: 1, photoSlots: 1 }, 1_000_000),
      makeVariant("v-a2", { sizeCm: "A", quantity: 2, photoSlots: 2 }, 1_900_000),
      makeVariant("v-a3", { sizeCm: "A", quantity: 3, photoSlots: 3 }, 2_700_000),
      makeVariant("v-b1", { sizeCm: "B", quantity: 1, photoSlots: 1 }, 2_000_000),
      makeVariant("v-b2", { sizeCm: "B", quantity: 2, photoSlots: 2 }, 3_800_000),
    ];
    renderWithProvider(variants, "v-b2");
    const fotos = screen.getByRole("group", { name: "Fotos" });
    expect(within(fotos).getByText("2 fotos")).toBeInTheDocument();
    expect(within(fotos).getByText(`${cop(1_900_000)} c/u`)).toBeInTheDocument();
    expect(within(fotos).queryByText(/Total:/)).not.toBeInTheDocument();
    expect(within(fotos).getByLabelText("Aumentar unidades")).toBeDisabled();
    expect(within(fotos).getByLabelText("Disminuir unidades")).toBeEnabled();
  });

  it("conserva chips (sin stepper) cuando la cantidad NO es 1..N contigua (polaroid 6/9/12/20)", () => {
    // Ola 18 — photoSlots se etiqueta "Fotos" (fotos por unidad).
    const variants = [
      makeVariant("v-p6", { photoSlots: 6, sizeCm: "7×9", variantStyle: "instagram" }),
      makeVariant("v-p9", { photoSlots: 9, sizeCm: "6×8", variantStyle: "instagram" }),
      makeVariant("v-p12", { photoSlots: 12, sizeCm: "6×8", variantStyle: "instagram" }),
      makeVariant("v-p20", { photoSlots: 20, sizeCm: "4×5", variantStyle: "instagram" }),
    ];
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    const fotos = screen.getByRole("group", { name: "Fotos" });
    expect(within(fotos).getByText("6 fotos")).toBeInTheDocument();
    expect(within(fotos).getByText("20 fotos")).toBeInTheDocument();
    expect(within(fotos).queryByLabelText("Aumentar unidades")).not.toBeInTheDocument();
  });

  it("usa stepper también con UNA sola dimensión de elección (polaroid 7.5×10 qty 1..10, Lucy 2026-07-22)", () => {
    // Datos reales (2026-07-22): pausados los sets, la polaroid queda con tamaño
    // único 7.5×10 y cantidad libre 1..10 (quantity == photoSlots → el grupo se
    // etiqueta "Fotos", Lucy 2026-09-05). La composición sale como stepper (no
    // lista vertical de 10 filas) y el tamaño único se muestra como chip estático
    // preseleccionado (regla SINGLE_VALUE_VISIBLE_DIMS, mismo feedback de Lucy).
    const variants: TestVariant[] = [];
    for (let qty = 1; qty <= 10; qty++) {
      variants.push(
        makeVariant(
          `v-pol-${qty}`,
          {
            shape: "rectangle",
            sizeCm: "7.5×10",
            quantity: qty,
            photoSlots: qty,
            aspectRatio: "400:580",
          },
          1_830_000 + (qty - 1) * 183_300,
        ),
      );
    }
    renderWithProvider(variants, "v-pol-1");
    // Sin lista vertical ni chips de fotos: solo el stepper +/−.
    expect(screen.queryByText("Elige tu opción")).not.toBeInTheDocument();
    const fotos = screen.getByRole("group", { name: "Fotos" });
    expect(within(fotos).getAllByRole("button")).toHaveLength(2);
    expect(within(fotos).getByText("1 foto")).toBeInTheDocument();
    expect(within(fotos).getByLabelText("Disminuir unidades")).toBeDisabled();

    // Recorrer hasta el tope: 9 clicks de "+" → 10 fotos y "+" deshabilitado.
    for (let i = 0; i < 9; i++) {
      fireEvent.click(within(fotos).getByLabelText("Aumentar unidades"));
    }
    expect(within(fotos).getByText("10 fotos")).toBeInTheDocument();
    expect(within(fotos).getByLabelText("Aumentar unidades")).toBeDisabled();
    // Deep-link a la variante qty=10.
    expect(replace).toHaveBeenLastCalledWith(
      expect.stringContaining("variant=v-pol-10"),
      expect.anything(),
    );
    // Y el card de Precio refleja el total de la línea (modo multi-dim).
    expect(screen.getByText("Precio")).toBeInTheDocument();
  });

  it("mantiene la lista vertical cuando la única dimensión NO es de cantidad (retro-compat)", () => {
    const variants = [
      makeVariant("v-s1", { sizeCm: "6×6" }, 1_000_000),
      makeVariant("v-s2", { sizeCm: "5×14" }, 1_500_000),
    ];
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    expect(screen.getByText("Elige tu opción")).toBeInTheDocument();
    expect(screen.queryByLabelText("Aumentar unidades")).not.toBeInTheDocument();
  });
});

/*
 * Dimensión de 1 SOLO valor visible (Lucy 2026-07-22). Regla: visible si la
 * dimensión está en VISIBLE_DIMENSIONS y (tiene >1 valor O es sizeCm). El chip
 * único sale preseleccionado y NO clicable (dato del producto, no opción);
 * Forma/otras claves con 1 valor siguen ocultas por redundantes.
 */
describe("VariantSelector — dimensión de 1 valor visible (Tamaño fijo)", () => {
  it("muestra 'Tamaño: 6.5×20 cm' aunque el producto tenga 1 sola variante (tiras)", () => {
    // Tiras Magnéticas (real 2026-07-22): UNA variante, tamaño único 6.5×20.
    // Antes: variants.length < 2 → selector null (sin tamaño en la PDP).
    const variants = [
      makeVariant("v-tira", { sizeCm: "6.5×20", photoSlots: 3, aspectRatio: "1:1" }, 1_900_000),
    ];
    render(<VariantSelector productBasePrice={1_900_000} variants={variants} />);
    const tamano = screen.getByRole("group", { name: "Tamaño" });
    const chip = within(tamano).getByRole("button", { name: "6.5×20 cm" });
    // Preseleccionado y no clicable (dato, no opción).
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toBeDisabled();
    // No es la lista vertical ni hay stepper (photoSlots tiene 1 solo valor → oculto).
    expect(screen.queryByText("Elige tu opción")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Cantidad" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Aumentar unidades")).not.toBeInTheDocument();
  });

  it("muestra 'Tamaño: 7.5×10 cm' como chip estático junto al stepper (polaroid qty 1..N)", () => {
    const variants = [
      makeVariant("v-p1", { shape: "rectangle", sizeCm: "7.5×10", quantity: 1, photoSlots: 1 }),
      makeVariant("v-p2", { shape: "rectangle", sizeCm: "7.5×10", quantity: 2, photoSlots: 2 }),
    ];
    render(
      <SelectedVariantProvider variantIds={variants.map((v) => v.id)} initialId="v-p1">
        <VariantSelector productBasePrice={100_000} variants={variants} />
      </SelectedVariantProvider>,
    );
    const tamano = screen.getByRole("group", { name: "Tamaño" });
    const chip = within(tamano).getByRole("button", { name: "7.5×10 cm" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toBeDisabled();
    // La composición (fotos por unidad) sigue interactiva: stepper 1..2 contiguo
    // en el grupo "Fotos" (dedupe quantity/photoSlots, Lucy 2026-09-05).
    const fotos = screen.getByRole("group", { name: "Fotos" });
    fireEvent.click(within(fotos).getByLabelText("Aumentar unidades"));
    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining("variant=v-p2"),
      expect.anything(),
    );
  });

  it("mantiene oculta la Forma cuando es igual en todas las variants (redundante)", () => {
    // Misma regla de siempre para claves fuera de SINGLE_VALUE_VISIBLE_DIMS:
    // shape "rectangle" en todas → el grupo Forma NO se pinta, aunque sizeCm
    // de 1 valor sí salga. Solo Fotos (composición del pack) queda como
    // elección real — quantity/photoSlots coinciden → dedupe a "Fotos".
    const variants = [
      makeVariant("v-r1", { shape: "rectangle", sizeCm: "6×6", quantity: 1, photoSlots: 1 }),
      makeVariant("v-r2", { shape: "rectangle", sizeCm: "6×6", quantity: 3, photoSlots: 3 }),
    ];
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    expect(screen.queryByRole("group", { name: "Forma" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: "Fotos" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Tamaño" })).toHaveLength(1);
  });
});

/*
 * Stock por variante (Fase 1, 2026-08-08): un valor cuya combinación con la
 * selección actual existe pero está AGOTADA se deshabilita con el sufijo
 * "· Agotado" (mismo término del badge de las cards). Antes el gate era solo
 * a nivel producto: con UNA variante repuesta, TODAS parecían comprables.
 */
describe("VariantSelector — stock por variante (Fase 1)", () => {
  function renderWithProvider(variants: TestVariant[], initialId: string) {
    return render(
      <SelectedVariantProvider variantIds={variants.map((v) => v.id)} initialId={initialId}>
        <VariantSelector productBasePrice={100_000} variants={variants} />
      </SelectedVariantProvider>,
    );
  }

  // Matriz size A/B × qty 1/3 (chips: qty NO contigua). v-b1 agotada. Al
  // coincidir quantity y photoSlots, el grupo de cantidad se etiqueta "Fotos".
  const matrix = () => [
    makeVariant("v-a1", { sizeCm: "A", quantity: 1, photoSlots: 1 }),
    makeVariant("v-a3", { sizeCm: "A", quantity: 3, photoSlots: 3 }),
    makeVariant("v-b1", { sizeCm: "B", quantity: 1, photoSlots: 1 }, 100_000, 0),
    makeVariant("v-b3", { sizeCm: "B", quantity: 3, photoSlots: 3 }),
  ];

  it("el valor cuya combinación exacta está agotada re-ancla a otra variante con stock (sin tachado)", () => {
    // Selección A+1: la combinación B+1 (v-b1) está en 0, pero v-b3 (B+3) SÍ
    // tiene stock → el chip "B" queda habilitado SIN tachado (no engaña: hay
    // stock con ese valor) y el click re-ancla a v-b3 (selección guiada,
    // Lucy 2026-08-12).
    renderWithProvider(matrix(), "v-a1");
    const tamano = screen.getByRole("group", { name: "Tamaño" });
    const chipB = within(tamano).getByRole("button", { name: "B cm" });
    expect(chipB).toBeEnabled();
    expect(chipB.className).not.toContain("line-through");
    fireEvent.click(chipB);
    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining("variant=v-b3"),
      expect.anything(),
    );
  });

  it("deshabilita tachado con '· Agotado' el valor sin stock en NINGUNA de sus variantes", () => {
    // TODAS las variantes con size B agotadas → el chip "B" se deshabilita tachado.
    const allOut = matrix().map((v) => (v.id.startsWith("v-b") ? { ...v, stock: 0 } : v));
    renderWithProvider(allOut, "v-a1");
    const tamano = screen.getByRole("group", { name: "Tamaño" });
    const chipB = within(tamano).getByRole("button", { name: /B cm · Agotado/ });
    expect(chipB).toBeDisabled();
    expect(chipB.className).toContain("line-through");
    expect(within(tamano).getByRole("button", { name: "A cm" })).toBeEnabled();
  });

  it("sin selección inicial los chips reflejan disponibilidad global por valor", () => {
    // UX selección guiada: la página abre SIN variante elegida. Cada chip se
    // habilita si ALGÚN variant con ese valor tiene stock (independiente de
    // las otras dimensiones); los sin stock en ninguna variante quedan tachados.
    render(
      <SelectedVariantProvider variantIds={matrix().map((v) => v.id)} initialId={null}>
        <VariantSelector productBasePrice={100_000} variants={matrix()} />
      </SelectedVariantProvider>,
    );
    const tamano = screen.getByRole("group", { name: "Tamaño" });
    // A tiene stock (v-a1/v-a3) y B tiene stock en v-b3 → ambos habilitados.
    expect(within(tamano).getByRole("button", { name: "A cm" })).toBeEnabled();
    expect(within(tamano).getByRole("button", { name: "B cm" })).toBeEnabled();
    // Elegir B re-ancla a la variante con stock (v-b3) aunque v-b1 esté en 0.
    fireEvent.click(within(tamano).getByRole("button", { name: "B cm" }));
    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining("variant=v-b3"),
      expect.anything(),
    );
  });

  it("mantiene habilitado el valor si SU combinación actual sí tiene stock", () => {
    // Selección A+3: el chip "B" combina con qty=3 → v-b3 (stock>0) → habilitado,
    // aunque v-b1 (B+1) esté agotada. El stock se evalúa por combinación exacta.
    renderWithProvider(matrix(), "v-a3");
    const tamano = screen.getByRole("group", { name: "Tamaño" });
    const chipB = within(tamano).getByRole("button", { name: "B cm" });
    expect(chipB).toBeEnabled();
    fireEvent.click(chipB);
    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining("variant=v-b3"),
      expect.anything(),
    );
  });

  it("el stepper salta la cantidad agotada y avisa '· Agotado'", () => {
    // qty 1..3 contigua con v-s2 agotada: desde 1, "+" apunta a 3 (salta la 2)
    // y se muestra el aviso junto al stepper. Grupo "Fotos" (dedupe
    // quantity/photoSlots, Lucy 2026-09-05).
    const variants = [
      makeVariant("v-s1", { shape: "rectangle", sizeCm: "6×6", quantity: 1, photoSlots: 1 }),
      makeVariant(
        "v-s2",
        { shape: "rectangle", sizeCm: "6×6", quantity: 2, photoSlots: 2 },
        100_000,
        0,
      ),
      makeVariant("v-s3", { shape: "rectangle", sizeCm: "6×6", quantity: 3, photoSlots: 3 }),
    ];
    renderWithProvider(variants, "v-s1");
    const fotos = screen.getByRole("group", { name: "Fotos" });
    expect(within(fotos).getByText("· Agotado")).toBeInTheDocument();
    fireEvent.click(within(fotos).getByLabelText("Aumentar unidades"));
    expect(within(fotos).getByText("3 fotos")).toBeInTheDocument();
    expect(replace).toHaveBeenLastCalledWith(
      expect.stringContaining("variant=v-s3"),
      expect.anything(),
    );
  });

  it("el stepper bloquea '+' cuando TODAS las cantidades superiores están agotadas", () => {
    const variants = [
      makeVariant("v-t1", { shape: "rectangle", sizeCm: "6×6", quantity: 1, photoSlots: 1 }),
      makeVariant(
        "v-t2",
        { shape: "rectangle", sizeCm: "6×6", quantity: 2, photoSlots: 2 },
        100_000,
        0,
      ),
      makeVariant(
        "v-t3",
        { shape: "rectangle", sizeCm: "6×6", quantity: 3, photoSlots: 3 },
        100_000,
        0,
      ),
    ];
    renderWithProvider(variants, "v-t1");
    const fotos = screen.getByRole("group", { name: "Fotos" });
    expect(within(fotos).getByLabelText("Aumentar unidades")).toBeDisabled();
    expect(within(fotos).getByText("· Agotado")).toBeInTheDocument();
  });

  it("marca '· Agotado' y deshabilita la fila en la lista vertical de una sola dimensión", () => {
    const variants = [
      makeVariant("v-l1", { sizeCm: "6×6" }, 1_000_000),
      makeVariant("v-l2", { sizeCm: "5×14" }, 1_500_000, 0),
    ];
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    const row = screen.getByRole("button", { name: /v-l2 · Agotado/ });
    expect(row).toBeDisabled();
    // La fila con stock sigue clicable.
    expect(screen.getByRole("button", { name: /v-l1/ })).toBeEnabled();
  });
});

/*
 * Default "Con imán" (regla 2026-09-08b — ¿Con imán? en TODOS los productos):
 * el selector ordena las variantes con imán primero (sort estable), así que
 * TODO anclaje guiado ("primera compatible con stock") resuelve a Con imán
 * salvo que el cliente elija Sin imán a propósito. El grupo muestra las dos
 * opciones con Con imán primero.
 */
describe("VariantSelector — ¿Con imán? default Con imán (regla 2026-09-08b)", () => {
  it("el grupo lista Con imán primero y elegir otra dimensión ancla a la variante Con imán", () => {
    // Espejo del catálogo con la opción Sin imán PRIMERO en el array (orden de
    // llegada de la DB): sin el sort, el re-anchor caería en Sin imán.
    const variants = [
      makeVariant("v-min-nomag", { sizeCm: "5×7", magnet: false }),
      makeVariant("v-min-mag", { sizeCm: "5×7", magnet: true }),
      makeVariant("v-clas-nomag", { sizeCm: "7×10", magnet: false }),
      makeVariant("v-clas-mag", { sizeCm: "7×10", magnet: true }),
    ];
    render(
      <SelectedVariantProvider variantIds={variants.map((v) => v.id)} initialId={null}>
        <VariantSelector productBasePrice={100_000} variants={variants} />
      </SelectedVariantProvider>,
    );
    const iman = screen.getByRole("group", { name: "¿Con imán?" });
    const chips = within(iman)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(chips).toEqual(["🧲 Con imán", "✨ Sin imán"]);

    // Elegir tamaño 7×10 ancla a la variante CON imán de ese tamaño (default),
    // aunque la Sin imán llegó primero en el array.
    fireEvent.click(within(screen.getByRole("group", { name: "Tamaño" })).getByText("7×10 cm"));
    expect(decodeURIComponent(String(replace.mock.calls[0]?.[0]))).toContain("variant=v-clas-mag");
  });

  it("la elección explícita de Sin imán se respeta al cambiar otra dimensión", () => {
    const variants = [
      makeVariant("v-min-nomag", { sizeCm: "5×7", magnet: false }),
      makeVariant("v-min-mag", { sizeCm: "5×7", magnet: true }),
      makeVariant("v-clas-nomag", { sizeCm: "7×10", magnet: false }),
      makeVariant("v-clas-mag", { sizeCm: "7×10", magnet: true }),
    ];
    render(
      <SelectedVariantProvider variantIds={variants.map((v) => v.id)} initialId={null}>
        <VariantSelector productBasePrice={100_000} variants={variants} />
      </SelectedVariantProvider>,
    );
    // Cliente elige Sin imán y luego cambia el tamaño: la combinación compatible
    // conserva magnet=false (currentValues manda sobre el default).
    fireEvent.click(
      within(screen.getByRole("group", { name: "¿Con imán?" })).getByText("✨ Sin imán"),
    );
    expect(decodeURIComponent(String(replace.mock.calls[0]?.[0]))).toContain("variant=v-min-nomag");
    fireEvent.click(within(screen.getByRole("group", { name: "Tamaño" })).getByText("7×10 cm"));
    expect(decodeURIComponent(String(replace.mock.calls[1]?.[0]))).toContain(
      "variant=v-clas-nomag",
    );
  });
});
