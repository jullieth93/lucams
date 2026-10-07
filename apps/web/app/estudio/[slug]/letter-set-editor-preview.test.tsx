// @vitest-environment jsdom

/*
 * Test de la VISTA PREVIA pre-carrito del editor de sets de letras (Lucy 2026-07-25).
 *
 * El contrato que blinda: pulsar "Vista previa" (antes "¡Listo!", renombrado 2026-09-09) NO puede
 * crear nada — ni diseño, ni archivo subido, ni línea de carrito. Primero se muestra "Así se verá
 * tu pedido" y solo la confirmación dispara la cadena crear → finalizar → agregar. Es la promesa
 * WYSIWYG de la tienda: el cliente aprueba la imagen ANTES de que exista un pedido.
 *
 * jsdom no trae canvas 2D ni toBlob → se stubbean (el dibujo real de la lámina lo cubren los tests
 * puros de letter-tile-textures). Las server actions se mockean: acá se verifica el ORDEN, no el
 * servidor.
 */

import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as Record<string, string>)} />,
}));

type ActionResult = { ok: boolean; message?: string };

const createLetterSetDesignAction = vi.fn(
  async (_input: unknown): Promise<ActionResult & { designId: string }> => ({
    ok: true,
    designId: "design-1",
  }),
);
const finalizeDesignAction = vi.fn(async (_fd: FormData): Promise<ActionResult> => ({ ok: true }));
const addPersonalizedToCartAction = vi.fn(async (_input: unknown): Promise<ActionResult> => ({
  ok: true,
}));

vi.mock("@/features/personalization/actions", () => ({
  createLetterSetDesignAction: (input: unknown) => createLetterSetDesignAction(input),
  finalizeDesignAction: (fd: FormData) => finalizeDesignAction(fd),
}));
vi.mock("@/app/carrito/actions", () => ({
  addPersonalizedToCartAction: (input: unknown) => addPersonalizedToCartAction(input),
}));

import { LetterSetEditor } from "./letter-set-editor";
import { TooltipProvider } from "@/components/ui/tooltip";

afterEach(() => cleanup());

beforeAll(() => {
  // Stub mínimo del contexto 2D: renderLetterSetBlob solo dibuja (no lee del canvas).
  const ctx = new Proxy(
    {},
    {
      get: () => () => undefined,
      set: () => true,
    },
  );
  HTMLCanvasElement.prototype.getContext = (() =>
    ctx) as unknown as HTMLCanvasElement["getContext"];
  HTMLCanvasElement.prototype.toBlob = ((cb: BlobCallback) => {
    cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
  }) as unknown as HTMLCanvasElement["toBlob"];
});

beforeEach(() => {
  push.mockClear();
  createLetterSetDesignAction.mockClear();
  finalizeDesignAction.mockClear();
  addPersonalizedToCartAction.mockClear();
});

function renderEditor(
  extraProps?: Partial<
    Pick<
      ComponentProps<typeof LetterSetEditor>,
      | "themeOptions"
      | "stylesByLanguage"
      | "initialTheme"
      | "initialUnits"
      | "initialStyleId"
      | "initialWithBorder"
      | "initialColorTheme"
      | "initialUnitColors"
      | "replacesCartDesignId"
    >
  >,
) {
  return render(
    // TooltipProvider: el tooltip de marca (Hint, radix) lo exige — en la app
    // lo monta app/layout.tsx.
    <TooltipProvider delayDuration={0}>
      <LetterSetEditor
        product={{ id: "prod-1", slug: "pack-vocales", name: "Pack Vocales" }}
        variantId="var-1"
        variants={[{ id: "var-1", price: 45_000, sizeCm: "7×10", magnet: true, language: "es" }]}
        basePrice={40_000}
        letterSet="vowels"
        alphabets={{ es: ["A", "B"], en: ["A", "B"] }}
        availableLanguages={["es"]}
        initialLanguage="es"
        themeOptions={{ es: [], en: [] }}
        initialTheme={null}
        stylesByLanguage={{ es: [], en: [] }}
        {...extraProps}
      />
    </TooltipProvider>,
  );
}

/** Tema ILUSTRADO completo de prueba (5 vocales): con él activo la paleta se
 *  desactiva con «Sin borde» (Fase 1B — el apagado solo aplica a temas con
 *  ilustración; en «Solo letra» el color pinta el relleno y la paleta sigue viva). */
const VOWEL_TILES = Object.fromEntries(
  ["A", "E", "I", "O", "U"].map((c) => [c, { imageUrl: `/tiles/${c}.png`, label: null }]),
);
const ILLUSTRATED_PROPS = {
  themeOptions: {
    es: [{ id: "set-animales", name: "Animales", theme: "animales", language: "es", tileCount: 5 }],
    en: [],
  },
  stylesByLanguage: { es: [{ id: "set-animales", name: "Animales", tiles: VOWEL_TILES }], en: [] },
  initialTheme: "animales",
};

/** Pulsa "Vista previa" (antes "¡Listo!") y espera a que la vista previa esté en pantalla. */
async function openPreview() {
  // QA 1.6 (2026-10-07) — el botón «Vista previa» es ÚNICO (el del panel de
  // controles): el CTA del header sticky se diferenció como «Ver diseño» para
  // no leer dos botones idénticos en pantalla.
  fireEvent.click(screen.getByRole("button", { name: /Vista previa/ }));
  await screen.findByText("Así se verá tu pedido");
}

describe("LetterSetEditor — vista previa antes del carrito (Lucy 2026-07-25)", () => {
  it("móvil: los controles (Tema → Idioma → Borde → Colores) van ARRIBA del lienzo; en lg se mantiene controles-izquierda/lienzo-derecha", () => {
    const { container } = renderEditor();
    const aside = container.querySelector("aside");
    const section = container.querySelector("section");
    expect(aside).toHaveClass("order-1", "lg:order-1");
    expect(section).toHaveClass("order-2", "lg:order-2");
  });

  it("'Vista previa' abre la vista previa sin crear diseño ni tocar el carrito", async () => {
    renderEditor();
    await openPreview();

    expect(createLetterSetDesignAction).not.toHaveBeenCalled();
    expect(finalizeDesignAction).not.toHaveBeenCalled();
    expect(addPersonalizedToCartAction).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("QA 1.6: el CTA del header sticky dice «Ver diseño» (no duplica «Vista previa») y abre la MISMA vista previa", async () => {
    renderEditor();
    // Un solo «Vista previa» en pantalla (el del panel); el header se diferencia.
    expect(screen.getAllByRole("button", { name: /Vista previa/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Ver diseño/ }));
    await screen.findByText("Así se verá tu pedido");
    expect(createLetterSetDesignAction).not.toHaveBeenCalled();
    expect(addPersonalizedToCartAction).not.toHaveBeenCalled();
  });

  it("la vista previa cuenta las FICHAS del set (5 vocales), no el archivo de producción", async () => {
    renderEditor();
    await openPreview();

    expect(screen.getByText(/5 imanes que vas a recibir/)).toBeInTheDocument();
    expect(screen.getByText(/5 imanes personalizados/)).toBeInTheDocument();
    // El tamaño real de la variante viaja al cliente (qué va a recibir físicamente).
    // El catálogo guarda "7×10" SIN unidad (restructure-abecedario.mjs); es el editor el que
    // agrega " cm". El fixture usaba "7×10 cm", un valor que ninguna variante real tiene, así que
    // el test pasaba mientras la modal mostraba "Cada imán mide 7×10." (revisión 2026-07-25).
    expect(screen.getAllByText("7×10 cm").length).toBeGreaterThan(0);
  });

  it("'Volver a editar' cierra la vista previa sin haber creado nada", async () => {
    renderEditor();
    await openPreview();

    fireEvent.click(screen.getByRole("button", { name: /Volver a editar/ }));
    await waitFor(() =>
      expect(screen.queryByText("Así se verá tu pedido")).not.toBeInTheDocument(),
    );
    expect(createLetterSetDesignAction).not.toHaveBeenCalled();
    expect(addPersonalizedToCartAction).not.toHaveBeenCalled();
  });

  it("al confirmar: crea el diseño, sube la lámina aprobada y agrega al carrito", async () => {
    renderEditor();
    await openPreview();

    fireEvent.click(screen.getByRole("button", { name: /Sí, agregar al carrito/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/carrito?personalized=1"));
    expect(createLetterSetDesignAction).toHaveBeenCalledTimes(1);
    expect(finalizeDesignAction).toHaveBeenCalledTimes(1);
    expect(addPersonalizedToCartAction).toHaveBeenCalledWith({
      designId: "design-1",
      qty: 1,
      variantId: "var-1",
    });
    // Default retrocompatible: sin tocar el selector, el diseño se crea CON borde (Lucy 2026-09-05).
    expect(createLetterSetDesignAction).toHaveBeenCalledWith(
      expect.objectContaining({ withBorder: true }),
    );

    // El set se imprime como UNA lámina: preview y producción son el mismo PNG aprobado.
    const fd = finalizeDesignAction.mock.calls[0]![0];
    expect(fd.get("designId")).toBe("design-1");
    expect(fd.get("slotCount")).toBe("1");
    expect(fd.get("preview")).toBeInstanceOf(Blob);
    expect(fd.get("production_0")).toBeInstanceOf(Blob);
  });

  // Edición desde el carrito (?designId=, 2026-10-05): el editor propaga el designId
  // ORIGINAL como replaceDesignId → el carrito REEMPLAZA la línea vieja en sitio en
  // vez de agregar una nueva (sin duplicar — mismo resultado UX que la superficie foto).
  it("con replacesCartDesignId («Editar» desde el carrito): confirma con replaceDesignId", async () => {
    renderEditor({ replacesCartDesignId: "design-original-1" });
    await openPreview();

    fireEvent.click(screen.getByRole("button", { name: /Sí, agregar al carrito/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/carrito?personalized=1"));
    expect(addPersonalizedToCartAction).toHaveBeenCalledWith({
      designId: "design-1",
      qty: 1,
      variantId: "var-1",
      replaceDesignId: "design-original-1",
    });
  });

  it("si el carrito falla, el mensaje se muestra DENTRO de la vista previa", async () => {
    addPersonalizedToCartAction.mockResolvedValueOnce({ ok: false, message: "Sin stock" });
    renderEditor();
    await openPreview();

    fireEvent.click(screen.getByRole("button", { name: /Sí, agregar al carrito/ }));

    expect(
      await screen.findByText(/no pudimos agregarlo al carrito: Sin stock/),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    // La vista previa sigue abierta para reintentar sin perder el diseño de la pantalla.
    expect(screen.getByText("Así se verá tu pedido")).toBeInTheDocument();
  });

  describe("opción Con borde / Sin borde (Lucy 2026-09-05)", () => {
    it("el selector aparece junto al picker de tema y arranca en «Con borde»", () => {
      renderEditor();
      const con = screen.getByRole("radio", { name: /Con borde/ });
      expect(con).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("radio", { name: /Sin borde/ })).toHaveAttribute(
        "aria-checked",
        "false",
      );
    });

    it("al elegir «Sin borde», el diseño se crea con withBorder: false", async () => {
      renderEditor();
      fireEvent.click(screen.getByRole("radio", { name: /Sin borde/ }));
      await openPreview();

      fireEvent.click(screen.getByRole("button", { name: /Sí, agregar al carrito/ }));

      await waitFor(() => expect(push).toHaveBeenCalledWith("/carrito?personalized=1"));
      expect(createLetterSetDesignAction).toHaveBeenCalledWith(
        expect.objectContaining({ withBorder: false }),
      );
    });

    // Lucy 2026-09-08 — con «Sin borde» las fichas no llevan el marco de color: la sección
    // «Elige los colores» se desactiva (visible + inerte, con el porqué) y el selector de
    // borde SIEMPRE queda habilitado para poder volver.
    // Fase 1B — el apagado SOLO aplica con tema ILUSTRADO activo (styleId !== null).
    it("«Sin borde» con tema ilustrado desactiva «Elige los colores» con aviso, y el selector de borde sigue habilitado", () => {
      renderEditor(ILLUSTRATED_PROPS);

      fireEvent.click(screen.getByRole("radio", { name: /Sin borde/ }));

      for (const tema of ["Arcoíris", "Vibrante", "Neutro"]) {
        expect(screen.getByRole("button", { name: new RegExp(tema) })).toBeDisabled();
      }
      expect(screen.getByRole("note")).toHaveTextContent(/los colores se desactivan/);
      // El selector de borde NUNCA se desactiva: es la vía para recuperar los colores.
      expect(screen.getByRole("radio", { name: /Con borde/ })).toBeEnabled();
      expect(screen.getByRole("radio", { name: /Sin borde/ })).toBeEnabled();
    });

    it("Fase 1B — «Solo letra» + «Sin borde» mantiene la paleta ACTIVA (el color pinta el relleno de la letra)", () => {
      renderEditor(); // sin tema ilustrado → «Solo letra» (styleId === null)

      fireEvent.click(screen.getByRole("radio", { name: /Sin borde/ }));

      for (const tema of ["Arcoíris", "Vibrante", "Neutro"]) {
        expect(screen.getByRole("button", { name: new RegExp(tema) })).toBeEnabled();
      }
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
      // …y el pintado ficha a ficha también sigue activo (hint visible + fichas seleccionables).
      expect(screen.getByText(/Toca una ficha para darle el color/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Pintar la ficha A" })).toBeEnabled();
    });

    it("al volver a «Con borde» los colores se reactivan conservando la selección", () => {
      renderEditor(ILLUSTRATED_PROPS);

      // El cliente elige un tema distinto al default…
      fireEvent.click(screen.getByRole("button", { name: /Vibrante/ }));
      expect(screen.getByRole("button", { name: /Vibrante/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      // …apaga el borde (tema ilustrado → colores desactivados, Fase 1B) y lo vuelve a encender.
      fireEvent.click(screen.getByRole("radio", { name: /Sin borde/ }));
      expect(screen.getByRole("button", { name: /Vibrante/ })).toBeDisabled();
      fireEvent.click(screen.getByRole("radio", { name: /Con borde/ }));

      expect(screen.getByRole("button", { name: /Vibrante/ })).toBeEnabled();
      // La selección previa se conserva: el estado de colores nunca se resetea.
      expect(screen.getByRole("button", { name: /Vibrante/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
    });
  });
});

/*
 * Recover flow (?designId= — «Editar» desde el carrito) — el Estudio debe devolver al
 * editor la selección persistida del diseño: idioma, estilo ilustrado, borde, nº de sets
 * y los colores por ficha de CADA set (Design.metadata de createLetterSetDesign). Antes
 * esta superficie ni siquiera leía el designId: el Estudio abría siempre en blanco.
 */
describe("LetterSetEditor — recover flow (?designId=)", () => {
  // El montaje multi-set de la vista previa (montageLaminaBlobs) usa Image +
  // URL.createObjectURL + canvas.toDataURL, que jsdom no implementa. Stubs mínimos
  // acotados a esta suite (los tests de UN set no pasan por el montaje).
  const RealImage = globalThis.Image;
  const realCreateObjectURL = URL.createObjectURL;
  const realRevokeObjectURL = URL.revokeObjectURL;
  const realToDataURL = HTMLCanvasElement.prototype.toDataURL;
  beforeAll(() => {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      naturalWidth = 100;
      naturalHeight = 100;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    globalThis.Image = FakeImage as unknown as typeof Image;
    URL.createObjectURL = () => "blob:fake";
    URL.revokeObjectURL = () => {};
    HTMLCanvasElement.prototype.toDataURL = (() =>
      "data:image/png;base64,iVBORw0KGgo=") as unknown as HTMLCanvasElement["toDataURL"];
  });
  afterAll(() => {
    globalThis.Image = RealImage;
    URL.createObjectURL = realCreateObjectURL;
    URL.revokeObjectURL = realRevokeObjectURL;
    HTMLCanvasElement.prototype.toDataURL = realToDataURL;
  });

  it("arranca con la opción de borde persistida («Sin borde»)", () => {
    renderEditor({ initialWithBorder: false });

    expect(screen.getByRole("radio", { name: /Sin borde/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: /Con borde/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("el estilo ilustrado persistido arranca seleccionado (manda sobre la preselección de la PDP)", () => {
    renderEditor({ ...ILLUSTRATED_PROPS, initialTheme: null, initialStyleId: "set-animales" });

    expect(screen.getByRole("radio", { name: /Animales/ })).toHaveAttribute("aria-checked", "true");
  });

  it("los colores por set persistidos llegan intactos al crear el diseño (multi-unidad)", async () => {
    const colorsA = ["#FF0000", "#00FF00", "#0000FF", "#123456", "#654321"];
    const colorsB = ["#AAAAAA", "#BBBBBB", "#CCCCCC", "#DDDDDD", "#EEEEEE"];
    renderEditor({
      initialUnits: 2,
      initialColorTheme: "nino",
      initialUnitColors: [colorsA, colorsB],
    });
    // Multi-unidad: el pager de sets refleja el nº guardado en el diseño.
    expect(screen.getByRole("button", { name: /Set 2 de 2/ })).toBeInTheDocument();
    await openPreview();

    fireEvent.click(screen.getByRole("button", { name: /Sí, agregar al carrito/ }));

    await waitFor(() => expect(createLetterSetDesignAction).toHaveBeenCalledTimes(1));
    expect(createLetterSetDesignAction).toHaveBeenCalledWith(
      expect.objectContaining({
        unitCount: 2,
        frameTheme: "nino",
        colors: colorsA,
        units: [{ colors: colorsA }, { colors: colorsB }],
      }),
    );
    // Y se sube UNA lámina de producción por set (2 sets = 2 archivos).
    const fd = finalizeDesignAction.mock.calls[0]![0];
    expect(fd.get("slotCount")).toBe("2");
    expect(fd.get("production_0")).toBeInstanceOf(Blob);
    expect(fd.get("production_1")).toBeInstanceOf(Blob);
  });

  it("diseño de UN set: los colores raíz (metadata.colors) se restauran en el set único", async () => {
    const colors = ["#111111", "#222222", "#333333", "#444444", "#555555"];
    renderEditor({ initialUnitColors: [colors] });
    await openPreview();

    fireEvent.click(screen.getByRole("button", { name: /Sí, agregar al carrito/ }));

    await waitFor(() => expect(createLetterSetDesignAction).toHaveBeenCalledTimes(1));
    expect(createLetterSetDesignAction).toHaveBeenCalledWith(
      expect.objectContaining({ unitCount: 1, colors }),
    );
  });
});
