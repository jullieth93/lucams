// @vitest-environment jsdom
/*
 * Test de componente — VariantSelector (bug PDP separadores-libros).
 *
 * Regression: las variants de separadores-libros declaran `quantity` y
 * `photoSlots` con valores IDÉNTICOS (1/3/5) y ambas dimensions tenían el
 * label "Cantidad" → la PDP pintaba DOS grupos "CANTIDAD". El selector ahora
 * deduplica dimensions cuyo valor es el mismo en TODAS las variants.
 *
 * Stepper de cantidad (Lucy 2026-07-22): cuando la dimensión de cantidad es
 * 1..N contigua (fotoimanes/separadores 1–6), se muestra stepper +/− con
 * "$X c/u" y total de la línea en vez de chips. Los tests del stepper envuelven
 * el selector en SelectedVariantProvider (la fuente de verdad del buy-box, H12)
 * para ejercitar la interacción real: click +/− → setSelectedId → re-render.
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
  attributes: unknown;
};

function makeVariant(
  id: string,
  attributes: Record<string, unknown>,
  price = 100_000,
): TestVariant {
  return { id, name: id, sku: id.toUpperCase(), price, attributes };
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
  it("no duplica el grupo 'Cantidad' cuando quantity y photoSlots coinciden en todas las variants", () => {
    render(<VariantSelector productBasePrice={100_000} variants={separadoresVariants} />);
    // Un solo grupo "Cantidad" (antes salían dos) + un grupo "Tamaño".
    expect(screen.getAllByRole("group", { name: "Cantidad" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Tamaño" })).toHaveLength(1);
    // Los chips de cantidad y tamaño siguen completos.
    const cantidad = screen.getByRole("group", { name: "Cantidad" });
    expect(within(cantidad).getAllByRole("button")).toHaveLength(3);
    const tamano = screen.getByRole("group", { name: "Tamaño" });
    expect(within(tamano).getAllByRole("button")).toHaveLength(2);
  });

  it("mantiene grupos separados cuando las dimensions NO coinciden (photoSlots vs sizeCm)", () => {
    // Estilo polaroid: cada variant combina fotos y tamaño distintos (no
    // coinciden como strings) → ambos grupos deben seguir apareciendo.
    const variants = [
      makeVariant("v-p6", { photoSlots: 6, sizeCm: "7×9" }),
      makeVariant("v-p12", { photoSlots: 12, sizeCm: "6×8" }),
    ];
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    expect(screen.getAllByRole("group", { name: "Cantidad" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Tamaño" })).toHaveLength(1);
    expect(screen.getByText("6 unidades")).toBeInTheDocument();
    expect(screen.getByText("12 unidades")).toBeInTheDocument();
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

  it("pinta Cantidad/Tamaño/Marco una sola vez en la matriz fotoimanes (size × marco × qty)", () => {
    // Datos reales (2026-07-22) de set-fotoimanes-cuadrados: quantity == photoSlots
    // en todas las variants + frameStyle blanco/negro.
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
    expect(screen.getAllByRole("group", { name: "Cantidad" })).toHaveLength(1);
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
    expect(screen.getAllByRole("group", { name: "Cantidad" })).toHaveLength(1);
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
  it("oculta el grupo Estilo en la Polaroid pero deja Cantidad y Tamaño seleccionables", () => {
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
    expect(screen.getAllByRole("group", { name: "Cantidad" })).toHaveLength(1);
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
 * Stepper de cantidad (Lucy 2026-07-22). Aplica solo cuando la dimensión de
 * cantidad es 1..N contigua; los sets no contiguos conservan chips.
 * Se envuelve en SelectedVariantProvider para ejercitar la interacción real
 * (click → setSelectedId → re-render + router.replace del deep-link).
 */
describe("VariantSelector — stepper de cantidad", () => {
  // Matriz estilo set-fotoimanes-cuadrados (real 2026-07): 2 tamaños × cantidad 1..3.
  // quantity == photoSlots en todas → también cubre el dedupe (un solo grupo Cantidad).
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

  it("reemplaza los chips por un stepper +/− con $ c/u y total cuando la cantidad es 1..N contigua", () => {
    renderWithProvider(stepperVariants, "v-a1");
    const cantidad = screen.getByRole("group", { name: "Cantidad" });
    // Un solo grupo Cantidad (dedupe quantity/photoSlots intacto) y NO hay chips:
    // solo los 2 botones del stepper (−/+).
    expect(screen.getAllByRole("group", { name: "Cantidad" })).toHaveLength(1);
    expect(within(cantidad).getAllByRole("button")).toHaveLength(2);
    expect(within(cantidad).getByLabelText("Disminuir cantidad")).toBeInTheDocument();
    expect(within(cantidad).getByLabelText("Aumentar cantidad")).toBeInTheDocument();
    // Precio unitario y total de la línea visibles para la cantidad seleccionada.
    expect(within(cantidad).getByText("1 unidad")).toBeInTheDocument();
    expect(within(cantidad).getByText(`${cop(1_600_000)} c/u`)).toBeInTheDocument();
    expect(within(cantidad).getByText(`Total: ${cop(1_600_000)}`)).toBeInTheDocument();
  });

  it("el stepper mapea +/− a la variante con esa cantidad (total, c/u y deep-link en sync)", () => {
    renderWithProvider(stepperVariants, "v-a1");
    const cantidad = screen.getByRole("group", { name: "Cantidad" });

    fireEvent.click(within(cantidad).getByLabelText("Aumentar cantidad"));
    // Seleccionó la variante qty=2 del MISMO tamaño: total y c/u recalculados.
    expect(within(cantidad).getByText("2 unidades")).toBeInTheDocument();
    expect(within(cantidad).getByText(`Total: ${cop(1_760_000)}`)).toBeInTheDocument();
    expect(within(cantidad).getByText(`${cop(880_000)} c/u`)).toBeInTheDocument();
    // Deep-link compartible: la URL recibe ?variant=v-a2 como side-effect.
    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining("variant=v-a2"),
      expect.anything(),
    );

    fireEvent.click(within(cantidad).getByLabelText("Disminuir cantidad"));
    expect(within(cantidad).getByText("1 unidad")).toBeInTheDocument();
    expect(within(cantidad).getByText(`Total: ${cop(1_600_000)}`)).toBeInTheDocument();
  });

  it("deshabilita − en el mínimo y + en el máximo del rango", () => {
    renderWithProvider(stepperVariants, "v-a1");
    const cantidad = screen.getByRole("group", { name: "Cantidad" });
    expect(within(cantidad).getByLabelText("Disminuir cantidad")).toBeDisabled();

    fireEvent.click(within(cantidad).getByLabelText("Aumentar cantidad"));
    fireEvent.click(within(cantidad).getByLabelText("Aumentar cantidad"));
    expect(within(cantidad).getByText("3 unidades")).toBeInTheDocument();
    expect(within(cantidad).getByLabelText("Aumentar cantidad")).toBeDisabled();
    expect(within(cantidad).getByLabelText("Disminuir cantidad")).toBeEnabled();
  });

  it("acota el stepper a las cantidades disponibles en la combinación actual (matriz incompleta)", () => {
    // Tamaño A tiene 1..3; tamaño B solo 1..2 → valores globales 1..3 (contiguos →
    // stepper) pero en B no existe qty=3: "+" debe deshabilitarse al llegar a 2 y
    // el total debe ser el de la variante B (no caer a A).
    const variants = [
      makeVariant("v-a1", { sizeCm: "A", quantity: 1, photoSlots: 1 }, 1_000_000),
      makeVariant("v-a2", { sizeCm: "A", quantity: 2, photoSlots: 2 }, 1_900_000),
      makeVariant("v-a3", { sizeCm: "A", quantity: 3, photoSlots: 3 }, 2_700_000),
      makeVariant("v-b1", { sizeCm: "B", quantity: 1, photoSlots: 1 }, 2_000_000),
      makeVariant("v-b2", { sizeCm: "B", quantity: 2, photoSlots: 2 }, 3_800_000),
    ];
    renderWithProvider(variants, "v-b2");
    const cantidad = screen.getByRole("group", { name: "Cantidad" });
    expect(within(cantidad).getByText("2 unidades")).toBeInTheDocument();
    expect(within(cantidad).getByText(`Total: ${cop(3_800_000)}`)).toBeInTheDocument();
    expect(within(cantidad).getByLabelText("Aumentar cantidad")).toBeDisabled();
    expect(within(cantidad).getByLabelText("Disminuir cantidad")).toBeEnabled();
  });

  it("conserva chips (sin stepper) cuando la cantidad NO es 1..N contigua (polaroid 6/9/12/20)", () => {
    const variants = [
      makeVariant("v-p6", { photoSlots: 6, sizeCm: "7×9", variantStyle: "instagram" }),
      makeVariant("v-p9", { photoSlots: 9, sizeCm: "6×8", variantStyle: "instagram" }),
      makeVariant("v-p12", { photoSlots: 12, sizeCm: "6×8", variantStyle: "instagram" }),
      makeVariant("v-p20", { photoSlots: 20, sizeCm: "4×5", variantStyle: "instagram" }),
    ];
    render(<VariantSelector productBasePrice={100_000} variants={variants} />);
    const cantidad = screen.getByRole("group", { name: "Cantidad" });
    expect(within(cantidad).getByText("6 unidades")).toBeInTheDocument();
    expect(within(cantidad).getByText("20 unidades")).toBeInTheDocument();
    expect(within(cantidad).queryByLabelText("Aumentar cantidad")).not.toBeInTheDocument();
  });

  it("usa stepper también con UNA sola dimensión visible (polaroid 7.5×10 qty 1..10, Lucy 2026-07-22)", () => {
    // Datos reales (2026-07-22): pausados los sets, la polaroid queda con tamaño
    // único 7.5×10 y cantidad libre 1..10 → solo la dimensión Cantidad es visible
    // (sizeCm tiene 1 solo valor → no es dimensión). Debe salir el stepper, no la
    // lista vertical de 10 filas.
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
    // Sin lista vertical ni chips de cantidad: solo el stepper +/−.
    expect(screen.queryByText("Elige tu opción")).not.toBeInTheDocument();
    const cantidad = screen.getByRole("group", { name: "Cantidad" });
    expect(within(cantidad).getAllByRole("button")).toHaveLength(2);
    expect(within(cantidad).getByText("1 unidad")).toBeInTheDocument();
    expect(within(cantidad).getByLabelText("Disminuir cantidad")).toBeDisabled();

    // Recorrer hasta el tope: 9 clicks de "+" → 10 unidades y "+" deshabilitado.
    for (let i = 0; i < 9; i++) {
      fireEvent.click(within(cantidad).getByLabelText("Aumentar cantidad"));
    }
    expect(within(cantidad).getByText("10 unidades")).toBeInTheDocument();
    expect(within(cantidad).getByLabelText("Aumentar cantidad")).toBeDisabled();
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
    expect(screen.queryByLabelText("Aumentar cantidad")).not.toBeInTheDocument();
  });
});
