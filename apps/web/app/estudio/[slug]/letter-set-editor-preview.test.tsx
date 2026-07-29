// @vitest-environment jsdom

/*
 * Test de la VISTA PREVIA pre-carrito del editor de sets de letras (Lucy 2026-07-25).
 *
 * El contrato que blinda: pulsar "¡Listo!" NO puede crear nada — ni diseño, ni archivo subido, ni
 * línea de carrito. Primero se muestra "Así se verá tu pedido" y solo la confirmación dispara la
 * cadena crear → finalizar → agregar. Es la promesa WYSIWYG de la tienda: el cliente aprueba la
 * imagen ANTES de que exista un pedido.
 *
 * jsdom no trae canvas 2D ni toBlob → se stubbean (el dibujo real de la lámina lo cubren los tests
 * puros de letter-tile-textures). Las server actions se mockean: acá se verifica el ORDEN, no el
 * servidor.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

function renderEditor() {
  return render(
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
    />,
  );
}

/** Pulsa "¡Listo!" y espera a que la vista previa esté en pantalla. */
async function openPreview() {
  fireEvent.click(screen.getByRole("button", { name: /¡Listo!/ }));
  await screen.findByText("Así se verá tu pedido");
}

describe("LetterSetEditor — vista previa antes del carrito (Lucy 2026-07-25)", () => {
  it("'¡Listo!' abre la vista previa sin crear diseño ni tocar el carrito", async () => {
    renderEditor();
    await openPreview();

    expect(createLetterSetDesignAction).not.toHaveBeenCalled();
    expect(finalizeDesignAction).not.toHaveBeenCalled();
    expect(addPersonalizedToCartAction).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
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

    // El set se imprime como UNA lámina: preview y producción son el mismo PNG aprobado.
    const fd = finalizeDesignAction.mock.calls[0]![0];
    expect(fd.get("designId")).toBe("design-1");
    expect(fd.get("slotCount")).toBe("1");
    expect(fd.get("preview")).toBeInstanceOf(Blob);
    expect(fd.get("production_0")).toBeInstanceOf(Blob);
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
});
