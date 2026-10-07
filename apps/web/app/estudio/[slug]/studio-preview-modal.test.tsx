// @vitest-environment jsdom

/*
 * Test de la modal de vista previa pre-carrito — SIN stepper "Copias"
 * (regla 2026-09-08b, Lucy: UN concepto de cantidad, "Unidades", elegido en
 * la PDP). Las copias llegan ya decididas vía `initialCopies` (?copies=N de
 * la PDP — solo productos de composición fija) y la modal solo CONFIRMA.
 * Blinda:
 *   1. No hay stepper ni grupo "Copias" (la cantidad viene de la PDP; el
 *      carrito ya no tiene stepper para líneas personalizadas — 2026-09-25).
 *   2. El total mostrado es unitario × copias de la PDP (mismo cálculo del carrito).
 *   3. onConfirm recibe las copias de la PDP (van como qty al carrito) — 1 por defecto.
 *   4. Con >1 copia se muestra el dato ("N copias idénticas") para que el total no sorprenda.
 *   5. initialCopies fuera de rango se acota a 1..99 (la URL la puede editar cualquiera).
 *
 * La modal usa el mismo Radix Dialog de StudioSlotEditModal (ya testeado en
 * jsdom) y los textos CMS caen al DEFAULT_STUDIO_TEXTS sin provider.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { formatCOP } from "@/lib/format";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as Record<string, string>)} />,
}));

import { StudioPreviewModal } from "./studio-preview-modal";

afterEach(() => cleanup());

// formatCOP usa NBSP (U+00A0) tras el "$"; el comparador de testing-library
// colapsa whitespace. Helper: esperado con espacios normales.
const cop = (centavos: number) => formatCOP(centavos).replace(/\s+/g, " ");

const UNIT_PRICE = 2_400_000; // centavos COP

function baseProps() {
  return {
    isOpen: true,
    previewUrl: "data:image/png;base64,xyz",
    productName: "Fotoimanes cuadrados",
    slotCount: 6,
    unitPrice: UNIT_PRICE,
    isFinalizing: false,
    errorMessage: null,
    onEdit: vi.fn(),
    onConfirm: vi.fn(),
  };
}

describe("StudioPreviewModal — sin stepper de copias (regla 2026-09-08b)", () => {
  it("NO muestra stepper ni grupo 'Copias' (la cantidad viene de la PDP)", () => {
    render(<StudioPreviewModal {...baseProps()} initialCopies={4} />);
    expect(screen.queryByRole("group", { name: "Copias" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Aumentar copias")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Disminuir copias")).not.toBeInTheDocument();
  });

  it("con 1 copia (default): total = precio unitario, sin desglose de copias ni c/u", () => {
    render(<StudioPreviewModal {...baseProps()} />);
    expect(screen.getByText(cop(UNIT_PRICE))).toBeInTheDocument();
    expect(screen.queryByText(/c\/u/)).not.toBeInTheDocument();
    expect(screen.queryByText(/copias idénticas/)).not.toBeInTheDocument();
  });

  it("con N copias de la PDP: total = unitario × N, con c/u y el dato de copias", () => {
    render(<StudioPreviewModal {...baseProps()} initialCopies={4} />);
    expect(screen.getByText(cop(UNIT_PRICE * 4))).toBeInTheDocument();
    expect(screen.getByText(`${cop(UNIT_PRICE)} c/u`)).toBeInTheDocument();
    expect(screen.getByText(/4 copias idénticas de tu diseño/)).toBeInTheDocument();
    // 2026-09-25 — la nota ya no dice "ajusta la cantidad en el carrito"
    // (las líneas personalizadas no tienen stepper en el carrito).
    expect(
      screen.getByText("La cantidad la elegiste en la página del producto."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ajustar la cantidad en el carrito/i)).not.toBeInTheDocument();
  });

  it("onConfirm recibe las copias de la PDP (van como qty al carrito)", () => {
    const props = baseProps();
    render(<StudioPreviewModal {...props} initialCopies={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Sí, agregar al carrito" }));
    expect(props.onConfirm).toHaveBeenCalledWith(3, { qualityAcknowledged: false });
  });

  it("sin initialCopies, onConfirm recibe 1 (default del carrito)", () => {
    const props = baseProps();
    render(<StudioPreviewModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Sí, agregar al carrito" }));
    expect(props.onConfirm).toHaveBeenCalledWith(1, { qualityAcknowledged: false });
  });

  it("acota initialCopies fuera de rango a 1..99 (la URL la puede editar cualquiera)", () => {
    const propsAlto = baseProps();
    const { unmount } = render(<StudioPreviewModal {...propsAlto} initialCopies={150} />);
    fireEvent.click(screen.getByRole("button", { name: "Sí, agregar al carrito" }));
    expect(propsAlto.onConfirm).toHaveBeenCalledWith(99, { qualityAcknowledged: false });
    unmount();

    const propsBajo = baseProps();
    render(<StudioPreviewModal {...propsBajo} initialCopies={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Sí, agregar al carrito" }));
    expect(propsBajo.onConfirm).toHaveBeenCalledWith(1, { qualityAcknowledged: false });
  });
});

describe("StudioPreviewModal — modelo MULTI-UNIDAD (unitCount: las unidades van EN el diseño)", () => {
  it("con N unidades: total = unitario × N, dato de unidades y onConfirm recibe 1 (qty del carrito)", () => {
    const props = baseProps();
    render(<StudioPreviewModal {...props} unitCount={2} />);
    expect(screen.getByText(cop(UNIT_PRICE * 2))).toBeInTheDocument();
    expect(screen.getByText(`${cop(UNIT_PRICE)} c/u`)).toBeInTheDocument();
    // La línea dice unidades DISEÑADAS, no "copias idénticas" (concepto eliminado).
    expect(screen.getByText(/2 unidades — cada una con su propio diseño/)).toBeInTheDocument();
    expect(screen.queryByText(/copias idénticas/)).not.toBeInTheDocument();
    // 2026-09-25 — sin nota "ajusta en el carrito": las líneas personalizadas ya
    // no tienen stepper; las unidades se cambian en el editor («Volver a editar»).
    expect(screen.queryByText(/cantidad/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, agregar al carrito" }));
    expect(props.onConfirm).toHaveBeenCalledWith(1, { qualityAcknowledged: false });
  });

  it("con 1 unidad (unitCount=1): total = precio unitario, sin desglose", () => {
    render(<StudioPreviewModal {...baseProps()} unitCount={1} />);
    expect(screen.getByText(cop(UNIT_PRICE))).toBeInTheDocument();
    expect(screen.queryByText(/c\/u/)).not.toBeInTheDocument();
    expect(screen.queryByText(/unidades — cada una/)).not.toBeInTheDocument();
  });

  it("tiras (productKind=strips): la descripción habla de tiras y fotos por tira, no de imanes", () => {
    render(
      <StudioPreviewModal
        {...baseProps()}
        productKind="strips"
        slotCount={2}
        slotsPerUnit={3}
        unitCount={2}
      />,
    );
    expect(
      screen.getByText(
        /Esta es la vista previa de las 2 tiras que vas a recibir — cada una con 3 fotos\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("2 tiras personalizadas · 3 fotos c/u")).toBeInTheDocument();
    expect(screen.queryByText(/imanes que vas a recibir/)).not.toBeInTheDocument();
  });

  it("una tira (strips, 1 unidad): singular", () => {
    render(
      <StudioPreviewModal {...baseProps()} productKind="strips" slotCount={1} slotsPerUnit={4} />,
    );
    expect(
      screen.getByText(/Esta es la vista previa de la tira que vas a recibir — con 4 fotos\./),
    ).toBeInTheDocument();
    expect(screen.getByText("1 tira personalizada · 4 fotos")).toBeInTheDocument();
  });

  it("calendarios ×2: la descripción y el resumen hablan de 2 calendarios de 12 páginas", () => {
    render(
      <StudioPreviewModal
        {...baseProps()}
        productKind="calendar"
        slotCount={2}
        slotsPerUnit={12}
        unitCount={2}
        calendarYear={2027}
      />,
    );
    expect(
      screen.getByText(/vista previa de tus 2 calendarios 2027 — cada uno con 12 páginas\./),
    ).toBeInTheDocument();
    expect(screen.getByText("2 calendarios personalizados · 12 páginas c/u")).toBeInTheDocument();
  });

  it("unitCount manda sobre initialCopies cuando llegan ambos (modelo nuevo > legacy)", () => {
    const props = baseProps();
    render(<StudioPreviewModal {...props} unitCount={2} initialCopies={5} />);
    expect(screen.getByText(cop(UNIT_PRICE * 2))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, agregar al carrito" }));
    expect(props.onConfirm).toHaveBeenCalledWith(1, { qualityAcknowledged: false });
  });

  // 2026-09-22 — bug $62.500: la variante de separadores YA es el pack (5
  // unidades por $12.500). priceMultiplier (mismo cálculo del servidor) manda
  // sobre unitCount para el total.
  it("pack (separadores): priceMultiplier=1 con unitCount=5 → total = pack, sin 'c/u'", () => {
    const props = baseProps();
    render(
      <StudioPreviewModal
        {...props}
        productKind="bookmarks"
        slotCount={5}
        unitCount={5}
        priceMultiplier={1}
      />,
    );
    // Total = precio del pack (no ×5), sin la etiqueta de precio "c/u" engañosa
    // (el "(2 caras c/u)" del resumen de separadores es legítimo y se mantiene).
    expect(screen.getByText(cop(UNIT_PRICE))).toBeInTheDocument();
    expect(screen.queryByText(`${cop(UNIT_PRICE)} c/u`)).not.toBeInTheDocument();
    // Las unidades del diseño se siguen anunciando.
    expect(screen.getByText(/5 unidades — cada una con su propio diseño/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, agregar al carrito" }));
    expect(props.onConfirm).toHaveBeenCalledWith(1, { qualityAcknowledged: false });
  });

  it("priceMultiplier > 1 (calendario ×2): total ×2 con c/u", () => {
    render(
      <StudioPreviewModal
        {...baseProps()}
        productKind="calendar"
        slotCount={2}
        slotsPerUnit={12}
        unitCount={2}
        priceMultiplier={2}
      />,
    );
    expect(screen.getByText(cop(UNIT_PRICE * 2))).toBeInTheDocument();
    expect(screen.getByText(`${cop(UNIT_PRICE)} c/u`)).toBeInTheDocument();
  });
});

describe("StudioPreviewModal — aceptación explícita de calidad de fotos (Paquete C)", () => {
  const WARNING = {
    assetId: "asset-1",
    signedUrl: "https://signed.example/foto-baja.jpg",
    level: "warning-strong" as const,
    message: "Se va a ver pixelada al imprimir a tamaño real (5×5 cm).",
    recommendation: "Una foto más grande va a quedar mejor al imprimir.",
    requiresAck: true,
  };

  it("sin avisos: no muestra la sección ni el checkbox y el confirmar queda habilitado", () => {
    const props = baseProps();
    render(<StudioPreviewModal {...props} />);
    expect(screen.queryByText("Calidad de tus fotos")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const cta = screen.getByRole("button", { name: "Sí, agregar al carrito" });
    expect(cta).toBeEnabled();
    fireEvent.click(cta);
    expect(props.onConfirm).toHaveBeenCalledWith(1, { qualityAcknowledged: false });
  });

  it("con avisos: lista cada foto con su mensaje y la recomendación específica", () => {
    render(<StudioPreviewModal {...baseProps()} qualityWarnings={[WARNING]} />);
    expect(screen.getByText("Calidad de tus fotos")).toBeInTheDocument();
    expect(
      screen.getByText("Se va a ver pixelada al imprimir a tamaño real (5×5 cm)."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Una foto más grande va a quedar mejor al imprimir."),
    ).toBeInTheDocument();
  });

  it("el confirmar queda DESHABILITADO hasta marcar el checkbox de aceptación", () => {
    const props = baseProps();
    render(<StudioPreviewModal {...props} qualityWarnings={[WARNING]} />);
    const cta = screen.getByRole("button", { name: "Sí, agregar al carrito" });
    expect(cta).toBeDisabled();
    fireEvent.click(cta);
    expect(props.onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(cta).toBeEnabled();
    fireEvent.click(cta);
    expect(props.onConfirm).toHaveBeenCalledWith(1, { qualityAcknowledged: true });
  });

  it("desmarcar el checkbox vuelve a bloquear el confirmar", () => {
    render(<StudioPreviewModal {...baseProps()} qualityWarnings={[WARNING]} />);
    const checkbox = screen.getByRole("checkbox");
    const cta = screen.getByRole("button", { name: "Sí, agregar al carrito" });
    fireEvent.click(checkbox);
    expect(cta).toBeEnabled();
    fireEvent.click(checkbox);
    expect(cta).toBeDisabled();
  });
});

describe("StudioPreviewModal — avisos informativos de brillo suave (fase 2, 2026-10-02)", () => {
  // requiresAck:false = el ÚNICO problema de la foto es brillo soft (hoy solo
  // sobreexposición; el aviso de foto oscura se eliminó 2026-10) — se muestra
  // en la lista pero NO exige aceptación.
  const INFO_WARNING = {
    assetId: "asset-sobreexpuesta",
    signedUrl: "https://signed.example/foto-sobreexpuesta.jpg",
    level: "warning-soft" as const,
    message: "La foto está sobreexpuesta. Algunos detalles podrían perderse al imprimir.",
    recommendation:
      "Una foto con menos exposición (menos quemada) conserva mejor los detalles al imprimir.",
    requiresAck: false,
  };

  it("solo avisos informativos: la sección se muestra SIN checkbox y el confirmar queda habilitado", () => {
    const props = baseProps();
    render(<StudioPreviewModal {...props} qualityWarnings={[INFO_WARNING]} />);
    expect(screen.getByText("Calidad de tus fotos")).toBeInTheDocument();
    expect(
      screen.getByText(
        "La foto está sobreexpuesta. Algunos detalles podrían perderse al imprimir.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const cta = screen.getByRole("button", { name: "Sí, agregar al carrito" });
    expect(cta).toBeEnabled();
    fireEvent.click(cta);
    expect(props.onConfirm).toHaveBeenCalledWith(1, { qualityAcknowledged: false });
  });

  it("mixto (informativo + exigible): el checkbox aparece y bloquea el confirmar", () => {
    const props = baseProps();
    const ACK_WARNING = {
      assetId: "asset-pixelada",
      signedUrl: "https://signed.example/foto-pixelada.jpg",
      level: "warning-strong" as const,
      message: "Se va a ver pixelada al imprimir a tamaño real (5×5 cm).",
      requiresAck: true,
    };
    render(<StudioPreviewModal {...props} qualityWarnings={[INFO_WARNING, ACK_WARNING]} />);
    const cta = screen.getByRole("button", { name: "Sí, agregar al carrito" });
    expect(cta).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(cta).toBeEnabled();
    fireEvent.click(cta);
    expect(props.onConfirm).toHaveBeenCalledWith(1, { qualityAcknowledged: true });
  });
});

describe("StudioPreviewModal — Vista Previa PAGINADA por unidad (Fase 2 · item 2.2)", () => {
  const PAGES = [
    { dataUrl: "data:image/png;base64,set1", label: "Set 1 de 3" },
    { dataUrl: "data:image/png;base64,set2", label: "Set 2 de 3" },
    { dataUrl: "data:image/png;base64,set3", label: "Set 3 de 3" },
  ];

  it("con varias páginas: pager con indicador, dots y flechas; NO la imagen única", () => {
    render(<StudioPreviewModal {...baseProps()} pages={PAGES} unitCount={3} />);
    // Abre en la primera unidad, indicador anunciado.
    expect(screen.getByText("Set 1 de 3")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Set 1 de 3/ })).toBeInTheDocument();
    // 3 dots + 2 flechas con sus arias CMS.
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Unidad anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unidad siguiente" })).toBeEnabled();
  });

  it("flechas y dots navegan; la flecha se deshabilita en los extremos (sin wrap)", () => {
    render(<StudioPreviewModal {...baseProps()} pages={PAGES} unitCount={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Unidad siguiente" }));
    expect(screen.getByText("Set 2 de 3")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Set 2 de 3/ })).toBeInTheDocument();
    // Dot directo a la última → "siguiente" queda deshabilitada (no envuelve).
    fireEvent.click(screen.getAllByRole("tab")[2]!);
    expect(screen.getByText("Set 3 de 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unidad siguiente" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unidad anterior" })).toBeEnabled();
  });

  it("teclado ← → sobre el pager cambia de unidad", () => {
    render(<StudioPreviewModal {...baseProps()} pages={PAGES} unitCount={3} />);
    const pager = screen.getByRole("group", { name: "Set 1 de 3" });
    fireEvent.keyDown(pager, { key: "ArrowRight" });
    expect(screen.getByText("Set 2 de 3")).toBeInTheDocument();
    fireEvent.keyDown(pager, { key: "ArrowLeft" });
    expect(screen.getByText("Set 1 de 3")).toBeInTheDocument();
  });

  it("swipe horizontal cambia de unidad; el vertical NO (sigue el scroll del diálogo)", () => {
    render(<StudioPreviewModal {...baseProps()} pages={PAGES} unitCount={3} />);
    const pager = screen.getByRole("group", { name: "Set 1 de 3" });
    // Swipe a la izquierda → siguiente unidad.
    fireEvent.touchStart(pager, {
      touches: [{ clientX: 300, clientY: 100 }],
      changedTouches: [{ clientX: 300, clientY: 100 }],
    });
    fireEvent.touchEnd(pager, { changedTouches: [{ clientX: 120, clientY: 108 }] });
    expect(screen.getByText("Set 2 de 3")).toBeInTheDocument();
    // Gesto casi vertical → no cambia.
    fireEvent.touchStart(pager, {
      touches: [{ clientX: 300, clientY: 100 }],
      changedTouches: [{ clientX: 300, clientY: 100 }],
    });
    fireEvent.touchEnd(pager, { changedTouches: [{ clientX: 250, clientY: 400 }] });
    expect(screen.getByText("Set 2 de 3")).toBeInTheDocument();
    // Swipe corto (< umbral) → no cambia.
    fireEvent.touchStart(pager, {
      touches: [{ clientX: 300, clientY: 100 }],
      changedTouches: [{ clientX: 300, clientY: 100 }],
    });
    fireEvent.touchEnd(pager, { changedTouches: [{ clientX: 290, clientY: 100 }] });
    expect(screen.getByText("Set 2 de 3")).toBeInTheDocument();
  });

  it("UNA sola página (o sin pages): imagen única de siempre, sin pager", () => {
    const { unmount } = render(
      <StudioPreviewModal {...baseProps()} pages={[PAGES[0]!]} unitCount={1} />,
    );
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unidad siguiente" })).not.toBeInTheDocument();
    unmount();
    render(<StudioPreviewModal {...baseProps()} />);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Vista previa de 6 imanes/ })).toBeInTheDocument();
  });
});
