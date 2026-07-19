// @vitest-environment jsdom
/*
 * Test de componente — GlobalSearch (palette Cmd+K del header).
 *
 * Mismo estilo/setup que product-card.test.tsx: queries ACCESIBLES
 * (getByRole/getByPlaceholderText → árbol de accesibilidad), cleanup manual
 * (globals:false) y mocks de las deps de Next.
 *
 * Piezas que se mockean:
 *  - `@/app/actions/search` → la server action `searchProductsAction`. Es la
 *    frontera del componente contra el backend (pg_trgm). Un vi.fn() nos deja
 *    controlar resultados/vacío y verificar CON QUÉ query se llamó (post-debounce).
 *  - next/navigation `useRouter().push` → capturamos la navegación al elegir un
 *    resultado.
 *  - next/image → <img> plano (sin optimizer de Next en jsdom).
 *
 * Polyfills: cmdk + radix-dialog usan ResizeObserver y scrollIntoView, ausentes
 * en jsdom → los stubbeamos globalmente o el render explota (ReferenceError).
 *
 * El input de cmdk expone role="combobox" y cada resultado role="option" — por
 * eso NO hace falta buscar por clases CSS. El diálogo radix expone role="dialog"
 * con nombre accesible tomado del <DialogTitle> sr-only ("Buscar productos").
 *
 * Debounce: el effect espera 120ms antes de llamar la action. Usamos timers
 * reales + waitFor (no fake timers) para no pelear con las microtareas de la
 * server action mockeada (async) ni con startTransition.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import type { SearchResult } from "@/features/products/public-service";

// --- Mocks --------------------------------------------------------------
const searchMock = vi.fn<(q: string) => Promise<SearchResult[]>>();
vi.mock("@/app/actions/search", () => ({
  searchProductsAction: (q: string) => searchMock(q),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as Record<string, string>)} />,
}));

// Import DESPUÉS de los vi.mock (hoisted igual, pero deja clara la intención).
import { GlobalSearch } from "./global-search";

// cmdk (via ResizeObserver de radix ScrollArea) y radix-dialog usan APIs de
// layout que jsdom no implementa. Sin estos stubs el primer render tira
// "ResizeObserver is not defined".
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView = () => {};

// vitest.config usa globals:false → sin cleanup manual los renders (y el
// portal del diálogo) se acumulan en document.body entre tests.
afterEach(() => {
  cleanup();
  searchMock.mockReset();
  push.mockReset();
});

function makeResult(over: Partial<SearchResult> = {}): SearchResult {
  return {
    id: "p1",
    slug: "iman-corazon",
    name: "Imán Corazón",
    basePrice: 20_000,
    compareAtPrice: null,
    isPersonalizable: false,
    images: [],
    category: { slug: "fotoimanes", name: "Fotoimanes" },
    variantCount: 1,
    isFeatured: false,
    score: 1,
    ...over,
  };
}

/** Abre el diálogo por el botón del header y devuelve el <input> de búsqueda. */
function openAndGetInput(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
  return screen.getByPlaceholderText("Buscar productos...");
}

describe("GlobalSearch", () => {
  it("el botón del header es accesible y muestra el hint ⌘K", () => {
    render(<GlobalSearch />);
    expect(screen.getByRole("button", { name: "Buscar" })).toBeInTheDocument();
    expect(screen.getByText("⌘K")).toBeInTheDocument();
    // Cerrado: no hay diálogo montado todavía.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("click en el botón abre el diálogo con nombre accesible y combobox", () => {
    render(<GlobalSearch />);
    openAndGetInput();
    // El diálogo toma su nombre del <DialogTitle> sr-only.
    expect(screen.getByRole("dialog", { name: /Buscar productos/i })).toBeInTheDocument();
    // El input de cmdk expone role="combobox" (patrón ARIA de autocompletar).
    const combobox = screen.getByRole("combobox");
    expect(combobox).toHaveAttribute("aria-expanded", "true");
    // Con query vacía, el heading invita a escribir (rama !query.trim()).
    expect(screen.getByText(/Empieza a escribir/i)).toBeInTheDocument();
  });

  it("Ctrl+K alterna la apertura del diálogo", async () => {
    render(<GlobalSearch />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    // Segundo Ctrl+K cierra (setOpen((o) => !o)).
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("escribir >=2 chars llama la action (debounce) con la query trimmeada", async () => {
    searchMock.mockResolvedValue([makeResult()]);
    render(<GlobalSearch />);
    const input = openAndGetInput();
    fireEvent.change(input, { target: { value: "  imán  " } });
    await waitFor(() => expect(searchMock).toHaveBeenCalledTimes(1));
    // Se llama con el valor SIN espacios (trimmed) — no con el raw.
    expect(searchMock).toHaveBeenCalledWith("imán");
  });

  it("query de 1 char NO dispara búsqueda (guard length < 2)", async () => {
    searchMock.mockResolvedValue([makeResult()]);
    render(<GlobalSearch />);
    const input = openAndGetInput();
    fireEvent.change(input, { target: { value: "i" } });
    // Dejamos pasar holgadamente el debounce (120ms) para descartar un disparo tardío.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 260));
    });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("renderiza los resultados como opciones: nombre, categoría y precio COP", async () => {
    searchMock.mockResolvedValue([
      makeResult({ id: "a", name: "Imán Corazón", basePrice: 19_900 }),
    ]);
    render(<GlobalSearch />);
    const input = openAndGetInput();
    fireEvent.change(input, { target: { value: "imán" } });

    // Aparece bajo el heading "Resultados" (rama results normales, no sugerencia).
    await waitFor(() => expect(screen.getByRole("option")).toBeInTheDocument());
    expect(screen.getByText("Resultados")).toBeInTheDocument();
    expect(screen.getByText("Imán Corazón")).toBeInTheDocument();
    expect(screen.getByText("Fotoimanes")).toBeInTheDocument();
    // formatCOP(19900) = "$ 199" (centavos→pesos) con espacio no-separable de Intl
    // → regex tolerante a espacios; confirma 199 y no 19.900.
    expect(screen.getByText(/^\$\s*199$/)).toBeInTheDocument();
  });

  it("estado vacío: query válida con 0 resultados muestra el mensaje kawaii", async () => {
    searchMock.mockResolvedValue([]);
    render(<GlobalSearch />);
    const input = openAndGetInput();
    fireEvent.change(input, { target: { value: "zzzzz" } });
    await waitFor(() => expect(searchMock).toHaveBeenCalled());
    // El texto lleva 'í' acentuada ("Nada por aquí...") → match tolerante.
    await waitFor(() =>
      expect(screen.getByText(/Nada por aqu.* prueba con otra palabra/i)).toBeInTheDocument(),
    );
    // En vacío no hay opciones seleccionables.
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("heading '¿Querías decir...?' cuando el primer resultado es sugerencia", async () => {
    searchMock.mockResolvedValue([makeResult({ isSuggestion: true })]);
    render(<GlobalSearch />);
    const input = openAndGetInput();
    fireEvent.change(input, { target: { value: "imann" } });
    await waitFor(() => expect(screen.getByRole("option")).toBeInTheDocument());
    expect(screen.getByText(/Quer.as decir/i)).toBeInTheDocument();
    expect(screen.queryByText("Resultados")).not.toBeInTheDocument();
  });

  it("elegir un resultado navega a la PDP y cierra el diálogo", async () => {
    searchMock.mockResolvedValue([makeResult({ slug: "iman-corazon" })]);
    render(<GlobalSearch />);
    const input = openAndGetInput();
    fireEvent.change(input, { target: { value: "imán" } });

    const option = await waitFor(() => screen.getByRole("option"));
    fireEvent.click(option);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/producto/iman-corazon"));
    // onSelect hace setOpen(false) → el diálogo se desmonta.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("renderiza <img> cuando el resultado trae imágenes (rama next/image)", async () => {
    searchMock.mockResolvedValue([makeResult({ images: ["https://cdn/x.jpg"] })]);
    render(<GlobalSearch />);
    const input = openAndGetInput();
    fireEvent.change(input, { target: { value: "imán" } });
    await waitFor(() => expect(screen.getByRole("option")).toBeInTheDocument());
    // alt="" → imagen decorativa (no aparece como role="img"); la buscamos por DOM.
    const img = document.querySelector("[role='dialog'] img");
    expect(img).toHaveAttribute("src", "https://cdn/x.jpg");
  });

  it("nueva búsqueda reemplaza los resultados anteriores", async () => {
    searchMock.mockResolvedValueOnce([makeResult({ id: "a", name: "Imán A", slug: "iman-a" })]);
    render(<GlobalSearch />);
    const input = openAndGetInput();
    fireEvent.change(input, { target: { value: "iman a" } });
    await waitFor(() => expect(screen.getByText("Imán A")).toBeInTheDocument());

    searchMock.mockResolvedValueOnce([makeResult({ id: "b", name: "Imán B", slug: "iman-b" })]);
    fireEvent.change(input, { target: { value: "iman b" } });
    await waitFor(() => expect(screen.getByText("Imán B")).toBeInTheDocument());
    // El resultado viejo ya no está montado.
    expect(screen.queryByText("Imán A")).not.toBeInTheDocument();
  });
});
