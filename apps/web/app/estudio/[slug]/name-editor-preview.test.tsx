// @vitest-environment jsdom

/*
 * Test de la VISTA PREVIA pre-carrito del editor de nombre (Lucy 2026-07-25).
 *
 * Blinda el mismo contrato que su hermano del set de letras —pulsar "Vista previa" (antes
 * "¡Listo!", renombrado 2026-09-09) no puede crear nada; la cadena crear → finalizar → agregar
 * solo corre al confirmar— más lo propio de este editor:
 *
 *   1. El precio de la modal es el TOTAL (nº de letras × precio por ficha), no el de una ficha
 *      suelta. Mostrar $3.500 cuando el cliente escribió 7 letras y le van a cobrar $24.500 sería
 *      engañoso justo en la pantalla de confirmación.
 *   2. Reintentar tras un fallo del CARRITO no puede volver a llamar al finalize: el diseño ya
 *      quedó en READY y `finalizeDesign` solo acepta borradores, así que el reintento moría con
 *      «Design is READY — only DRAFT can be finalized» —texto interno en inglés— y no había forma
 *      de salir del callejón (revisión adversarial 2026-07-25).
 *
 * jsdom no trae canvas 2D → se stubbea. Las server actions se mockean: acá se verifica el ORDEN y
 * los datos que se pasan, no el servidor.
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

const createNameDesignAction = vi.fn(
  async (_input: unknown): Promise<ActionResult & { designId: string }> => ({
    ok: true,
    designId: "design-name-1",
  }),
);
const finalizeDesignAction = vi.fn(async (_fd: FormData): Promise<ActionResult> => ({ ok: true }));
const addPersonalizedToCartAction = vi.fn(async (_input: unknown): Promise<ActionResult> => ({
  ok: true,
}));

vi.mock("@/features/personalization/actions", () => ({
  createNameDesignAction: (input: unknown) => createNameDesignAction(input),
  finalizeDesignAction: (fd: FormData) => finalizeDesignAction(fd),
}));
vi.mock("@/app/carrito/actions", () => ({
  addPersonalizedToCartAction: (input: unknown) => addPersonalizedToCartAction(input),
}));

import { NameEditor } from "./name-editor";

const PRICE_PER_TILE = 3_500_00; // centavos COP por ficha

afterEach(() => cleanup());

beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  HTMLCanvasElement.prototype.getContext = (() =>
    ctx) as unknown as HTMLCanvasElement["getContext"];
  HTMLCanvasElement.prototype.toDataURL = (() =>
    "data:image/png;base64,iVBORw0KGgo=") as unknown as HTMLCanvasElement["toDataURL"];
  HTMLCanvasElement.prototype.toBlob = ((cb: BlobCallback) => {
    cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
  }) as unknown as HTMLCanvasElement["toBlob"];
});

beforeEach(() => {
  push.mockClear();
  createNameDesignAction.mockClear();
  finalizeDesignAction.mockClear();
  addPersonalizedToCartAction.mockClear();
  createNameDesignAction.mockResolvedValue({ ok: true, designId: "design-name-1" });
  finalizeDesignAction.mockResolvedValue({ ok: true });
  addPersonalizedToCartAction.mockResolvedValue({ ok: true });
});

function renderEditor(extraProps?: { initialCopies?: number; initialWithBorder?: boolean }) {
  return render(
    <NameEditor
      product={{ id: "prod-1", slug: "nombre-personalizado", name: "Nombre Personalizado" }}
      variantId="var-1"
      config={{ min: 3, max: 10, language: "es" }}
      pricePerTile={PRICE_PER_TILE}
      styles={[]}
      {...extraProps}
    />,
  );
}

/** Escribe un nombre y abre la vista previa. Devuelve el nº de letras escritas. */
async function openPreviewWith(name: string): Promise<number> {
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: name } });
  // Ola 32 — hay DOS botones «Vista previa» (el del header sticky y el grande del
  // panel de controles; misma acción). Se pulsa el del panel: el CTA histórico.
  const ctas = screen.getAllByRole("button", { name: /Vista previa/ });
  fireEvent.click(ctas[ctas.length - 1]!);
  await waitFor(() => expect(screen.getByText(/Así se verá tu pedido/i)).toBeInTheDocument());
  return name.length;
}

describe("NameEditor — vista previa antes del carrito", () => {
  it('"Vista previa" abre la previa SIN crear nada en el servidor', async () => {
    renderEditor();

    await openPreviewWith("LUCIA");

    expect(createNameDesignAction).not.toHaveBeenCalled();
    expect(finalizeDesignAction).not.toHaveBeenCalled();
    expect(addPersonalizedToCartAction).not.toHaveBeenCalled();
  });

  it('"Volver a editar" cierra la previa sin dejar nada creado', async () => {
    renderEditor();
    await openPreviewWith("LUCIA");

    fireEvent.click(screen.getByRole("button", { name: /volver a editar/i }));

    await waitFor(() =>
      expect(screen.queryByText(/Así se verá tu pedido/i)).not.toBeInTheDocument(),
    );
    expect(createNameDesignAction).not.toHaveBeenCalled();
    expect(finalizeDesignAction).not.toHaveBeenCalled();
  });

  it("confirmar encadena crear → finalizar → agregar, y navega al carrito", async () => {
    renderEditor();
    await openPreviewWith("LUCIA");

    fireEvent.click(screen.getByRole("button", { name: /agregar al carrito/i }));

    await waitFor(() => expect(addPersonalizedToCartAction).toHaveBeenCalledTimes(1));
    expect(createNameDesignAction).toHaveBeenCalledTimes(1);
    expect(finalizeDesignAction).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/carrito?personalized=1");
  });

  // El precio es POR FICHA: la modal debe mostrar el total de las letras escritas.
  it("la previa muestra el TOTAL por número de letras, no el precio de una ficha", async () => {
    renderEditor();
    const letras = await openPreviewWith("LUCIA"); // 5 letras

    const totalEsperado = PRICE_PER_TILE * letras; // 5 × $3.500 = $17.500
    const formateado = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(totalEsperado / 100);

    // El importe aparece en la modal; se busca por el número para no atarse al formato exacto.
    const soloDigitos = formateado.replace(/\D/g, "");
    const enPantalla = screen
      .getAllByText(/\$/)
      .map((el) => (el.textContent ?? "").replace(/\D/g, ""));
    expect(enPantalla).toContain(soloDigitos);
  });

  // Regla 2026-09-08b — el stepper "Unidades" de la PDP viaja como ?copies=N y la
  // modal lo confirma tal cual (ya sin stepper propio): la qty del carrito es la
  // que el cliente eligió en la ficha, no 1 por omisión.
  it("las copias de la PDP (?copies=N) se muestran en la modal y llegan al carrito como qty", async () => {
    renderEditor({ initialCopies: 3 });
    await openPreviewWith("LUCIA");

    expect(screen.getByText(/3 copias idénticas/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /agregar al carrito/i }));

    await waitFor(() => expect(addPersonalizedToCartAction).toHaveBeenCalledTimes(1));
    expect(addPersonalizedToCartAction).toHaveBeenCalledWith(
      expect.objectContaining({ designId: "design-name-1", variantId: "var-1", qty: 3 }),
    );
  });

  it("sin ?copies= la confirmación agrega 1 sola unidad", async () => {
    renderEditor();
    await openPreviewWith("LUCIA");

    fireEvent.click(screen.getByRole("button", { name: /agregar al carrito/i }));

    await waitFor(() => expect(addPersonalizedToCartAction).toHaveBeenCalledTimes(1));
    expect(addPersonalizedToCartAction).toHaveBeenCalledWith(expect.objectContaining({ qty: 1 }));
  });

  /*
   * El callejón sin salida: si el CARRITO falla, el diseño ya quedó en READY. Reintentar volvía a
   * llamar al finalize, que rechaza todo lo que no sea DRAFT → el cliente veía un error interno en
   * inglés y no podía completar la compra por más que insistiera.
   */
  it("tras un fallo del carrito, el reintento NO vuelve a finalizar (y puede completarse)", async () => {
    addPersonalizedToCartAction.mockResolvedValueOnce({ ok: false, message: "Algo salió mal." });
    renderEditor();
    await openPreviewWith("LUCIA");

    fireEvent.click(screen.getByRole("button", { name: /agregar al carrito/i }));
    await waitFor(() => expect(addPersonalizedToCartAction).toHaveBeenCalledTimes(1));
    expect(finalizeDesignAction).toHaveBeenCalledTimes(1);

    // Reintento desde la misma modal.
    fireEvent.click(screen.getByRole("button", { name: /agregar al carrito/i }));

    await waitFor(() => expect(addPersonalizedToCartAction).toHaveBeenCalledTimes(2));
    // Lo que rompía: un segundo finalize sobre un diseño ya READY.
    expect(finalizeDesignAction).toHaveBeenCalledTimes(1);
    // Y tampoco se crea un diseño huérfano nuevo.
    expect(createNameDesignAction).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/carrito?personalized=1");
  });
});

/*
 * Opción «Con borde / Sin borde» (Lucy 2026-09-09) — espejo de la regla ya shipped en
 * el set de letras (2026-09-05/08): el selector «Borde de las fichas» SIEMPRE queda
 * habilitado; con «Sin borde» la sección «Elige los colores» se desactiva (las fichas
 * no llevan el marco de color) con aviso del porqué, y al volver a «Con borde» se
 * reactiva conservando la selección (useLetterColors nunca se resetea).
 */
describe("NameEditor — opción «Con borde / Sin borde» (regla del set de letras)", () => {
  it("el selector «Borde de las fichas» aparece y arranca en «Con borde» (default histórico)", () => {
    renderEditor();

    expect(screen.getByRole("radiogroup", { name: "Borde de las fichas" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Con borde" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Sin borde" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    // Con borde: los colores arrancan habilitados y sin aviso.
    expect(screen.getByRole("button", { name: /Arcoíris/ })).toBeEnabled();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("«Sin borde» desactiva «Elige los colores» con aviso, y el selector de borde sigue habilitado", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("radio", { name: "Sin borde" }));

    for (const tema of ["Arcoíris", "Vibrante", "Neutro"]) {
      expect(screen.getByRole("button", { name: new RegExp(tema) })).toBeDisabled();
    }
    expect(screen.getByRole("note")).toHaveTextContent(/los colores se desactivan/);
    // El selector de borde NUNCA se desactiva: es la vía para recuperar los colores.
    expect(screen.getByRole("radio", { name: "Con borde" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Sin borde" })).toBeEnabled();
  });

  it("Ola 26 (owner 2026-09-09) — «Borde de las fichas» va ARRIBA de «Elige los colores»", () => {
    renderEditor();

    const borde = screen.getByRole("radiogroup", { name: "Borde de las fichas" });
    const colores = screen.getByText("Elige los colores");
    // compareDocumentPosition: DOCUMENT_POSITION_FOLLOWING = colores va DESPUÉS de borde.
    expect(borde.compareDocumentPosition(colores) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // La regla de desactivado sigue intacta en el nuevo orden.
    fireEvent.click(screen.getByRole("radio", { name: "Sin borde" }));
    expect(screen.getByRole("button", { name: /Arcoíris/ })).toBeDisabled();
  });

  it("al volver a «Con borde» los colores se reactivan conservando la selección", () => {
    renderEditor();

    // El cliente elige un tema distinto al default…
    fireEvent.click(screen.getByRole("button", { name: /Vibrante/ }));
    expect(screen.getByRole("button", { name: /Vibrante/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // …apaga el borde (colores desactivados) y lo vuelve a encender.
    fireEvent.click(screen.getByRole("radio", { name: "Sin borde" }));
    fireEvent.click(screen.getByRole("radio", { name: "Con borde" }));

    expect(screen.getByRole("button", { name: /Vibrante/ })).toBeEnabled();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    // La selección previa se conserva: el estado de colores nunca se resetea.
    expect(screen.getByRole("button", { name: /Vibrante/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  /*
   * Persistencia (Lucy 2026-09-09) — la elección viaja en Design.metadata.withBorder
   * (espejo del set de letras): se envía al crear el diseño y, al re-abrir uno guardado
   * (?designId=), el toggle arranca con el valor persistido. Sin la clave (diseños
   * previos a la opción) el default es CON borde, lo histórico.
   */
  it("sin tocar el selector, el diseño se crea con withBorder: true (default histórico)", async () => {
    renderEditor();
    await openPreviewWith("LUCIA");

    fireEvent.click(screen.getByRole("button", { name: /agregar al carrito/i }));

    await waitFor(() => expect(addPersonalizedToCartAction).toHaveBeenCalledTimes(1));
    expect(createNameDesignAction).toHaveBeenCalledWith(
      expect.objectContaining({ withBorder: true }),
    );
  });

  it("al elegir «Sin borde», el diseño se crea con withBorder: false", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("radio", { name: "Sin borde" }));
    await openPreviewWith("LUCIA");

    fireEvent.click(screen.getByRole("button", { name: /agregar al carrito/i }));

    await waitFor(() => expect(addPersonalizedToCartAction).toHaveBeenCalledTimes(1));
    expect(createNameDesignAction).toHaveBeenCalledWith(
      expect.objectContaining({ withBorder: false }),
    );
  });

  it("re-abrir un diseño guardado sin borde arranca el toggle en «Sin borde» (round-trip)", () => {
    renderEditor({ initialWithBorder: false });

    expect(screen.getByRole("radio", { name: "Sin borde" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Con borde" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    // …y la sección de colores arranca desactivada, coherente con la elección guardada.
    expect(screen.getByRole("button", { name: /Arcoíris/ })).toBeDisabled();
  });

  it("un diseño viejo SIN la clave withBorder arranca en «Con borde» (retrocompatible)", () => {
    renderEditor({ initialWithBorder: undefined });

    expect(screen.getByRole("radio", { name: "Con borde" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("button", { name: /Arcoíris/ })).toBeEnabled();
  });
});
