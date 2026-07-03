// @vitest-environment jsdom
/*
 * Test de componente — CookiesBanner (Ley 1581 / Decreto 1377 CO).
 *
 * Cubre el flujo de consentimiento de cookies:
 *  - Aparece SOLO en primera visita (sin cookie `cookie_consent_v1`).
 *  - Tres acciones del banner: "Solo necesarias" / "Personalizar" / "Aceptar todas".
 *  - Persistencia real de la preferencia en `document.cookie` (lib client REAL,
 *    no mockeada — así verificamos el contrato de escritura/lectura de la cookie)
 *    + audit DB fire-and-forget (server action MOCKEADA).
 *  - Modal de preferencias granulares: toggles por categoría, "necesarias"
 *    locked, guardado de preferencias custom.
 *  - Desaparece tras elegir; reabrible vía evento global (CookiesReopenLink).
 *
 * Notas de setup (heredadas de product-card.test.tsx):
 *  - vitest.config globals:false → cleanup() manual en afterEach.
 *  - next/link mockeado a <a> plano (no hay router de Next en jsdom).
 *  - @/features/consent/actions es un server action ("use server") que importa
 *    next/headers + auth server-only → se mockea a vi.fn() para aislar la UI.
 *  - El banner se muestra dentro de un queueMicrotask en un useEffect, por eso
 *    las aserciones de aparición usan findBy / waitFor.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

// --- Mocks de dependencias ---------------------------------------------------

// next/link → <a> plano (jsdom no tiene contexto de router).
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Server action (audit trail en DB). Fire-and-forget desde el componente.
// La mockeamos para (a) evitar importar next/headers + auth server-only y
// (b) poder aseverar CON QUÉ prefs se invoca.
const persistCookieConsentAction = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/features/consent/actions", () => ({
  persistCookieConsentAction: (...args: unknown[]) => persistCookieConsentAction(...args),
}));

// La lib @/lib/cookie-consent NO se mockea: es lógica client pura (read/write
// de document.cookie) que corre en jsdom. Así testeamos la persistencia REAL.
import {
  CookiesBanner,
  CookiesReopenLink,
  openCookiesPreferences,
} from "./cookies-banner";
import {
  COOKIE_CONSENT_NAME,
  readClientCookiePreferences,
} from "@/lib/cookie-consent";

// --- Helpers -----------------------------------------------------------------

function clearConsentCookie() {
  // Expira la cookie para resetear "primera visita" entre tests.
  document.cookie = `${COOKIE_CONSENT_NAME}=; Max-Age=0; Path=/`;
}

/** Espera a que el banner (role=dialog con el título) esté montado. */
function findBanner() {
  return screen.findByRole("dialog", { name: /Cookies en Lucams_shop/i });
}

beforeEach(() => {
  clearConsentCookie();
  persistCookieConsentAction.mockClear();
});

afterEach(() => {
  cleanup();
  clearConsentCookie();
});

describe("CookiesBanner", () => {
  it("aparece en primera visita (sin cookie persistida)", async () => {
    render(<CookiesBanner />);
    const banner = await findBanner();
    expect(banner).toBeInTheDocument();
    // Las tres acciones primarias presentes y accesibles por su nombre.
    expect(within(banner).getByRole("button", { name: /Solo necesarias/i })).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: /Personalizar/i })).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: /Aceptar todas/i })).toBeInTheDocument();
    // Link accesible al aviso de privacidad (Ley 1581).
    expect(screen.getByRole("link", { name: /Aviso de Privacidad/i })).toHaveAttribute(
      "href",
      "/legal/privacidad",
    );
  });

  it("NO aparece si ya existe una preferencia guardada", async () => {
    // Sembramos una cookie válida v1 → readClientCookiePreferences la encuentra.
    const prefs = {
      v: 1,
      necessary: true,
      functional: true,
      analytics: false,
      marketing: false,
      savedAt: new Date().toISOString(),
    };
    document.cookie = `${COOKIE_CONSENT_NAME}=${encodeURIComponent(JSON.stringify(prefs))}; Path=/`;

    render(<CookiesBanner />);
    // El chequeo corre en un microtask; esperamos un tick y confirmamos que
    // el banner NUNCA aparece.
    await waitFor(() => {
      expect(readClientCookiePreferences()).not.toBeNull();
    });
    // Un microtask más para dejar correr el efecto del componente.
    await Promise.resolve();
    expect(screen.queryByRole("dialog", { name: /Cookies en Lucams_shop/i })).not.toBeInTheDocument();
  });

  it("'Aceptar todas' persiste opt-in completo, cierra el banner y llama a la audit action", async () => {
    render(<CookiesBanner />);
    const banner = await findBanner();

    fireEvent.click(within(banner).getByRole("button", { name: /Aceptar todas/i }));

    // Banner desaparece tras elegir.
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /Cookies en Lucams_shop/i }),
      ).not.toBeInTheDocument();
    });

    // Cookie escrita con TODAS las categorías en true.
    const saved = readClientCookiePreferences();
    expect(saved).toMatchObject({
      necessary: true,
      functional: true,
      analytics: true,
      marketing: true,
    });

    // Audit fire-and-forget invocada con las prefs opt-in.
    expect(persistCookieConsentAction).toHaveBeenCalledTimes(1);
    expect(persistCookieConsentAction).toHaveBeenCalledWith(
      expect.objectContaining({ functional: true, analytics: true, marketing: true }),
    );
  });

  it("'Solo necesarias' persiste rechazo de opcionales", async () => {
    render(<CookiesBanner />);
    const banner = await findBanner();

    fireEvent.click(within(banner).getByRole("button", { name: /Solo necesarias/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /Cookies en Lucams_shop/i }),
      ).not.toBeInTheDocument();
    });

    const saved = readClientCookiePreferences();
    expect(saved).toMatchObject({
      necessary: true,
      functional: false,
      analytics: false,
      marketing: false,
    });
    expect(persistCookieConsentAction).toHaveBeenCalledWith(
      expect.objectContaining({ functional: false, analytics: false, marketing: false }),
    );
  });

  it("'Personalizar' abre el modal con las 4 categorías; 'necesarias' locked", async () => {
    render(<CookiesBanner />);
    const banner = await findBanner();

    fireEvent.click(within(banner).getByRole("button", { name: /Personalizar/i }));

    // Modal (radix Dialog) montado con su título.
    const modalTitle = await screen.findByText("Preferencias de cookies");
    expect(modalTitle).toBeInTheDocument();

    // Las 4 filas de categoría, cada una con su checkbox.
    const necessary = screen.getByRole("checkbox", { name: /Necesarias/i });
    const functional = screen.getByRole("checkbox", { name: /Funcionales/i });
    const analytics = screen.getByRole("checkbox", { name: /Analíticas/i });
    const marketing = screen.getByRole("checkbox", { name: /Marketing/i });

    // Necesarias: siempre marcada y deshabilitada (no se puede desactivar).
    expect(necessary).toBeChecked();
    expect(necessary).toBeDisabled();
    expect(screen.getByText(/Siempre activas/i)).toBeInTheDocument();

    // Opcionales: parten en false (emptyPreferences en primera visita).
    expect(functional).not.toBeChecked();
    expect(analytics).not.toBeChecked();
    expect(marketing).not.toBeChecked();
  });

  it("toggles granulares: activar solo 'Analíticas' persiste esa categoría", async () => {
    render(<CookiesBanner />);
    const banner = await findBanner();
    fireEvent.click(within(banner).getByRole("button", { name: /Personalizar/i }));
    await screen.findByText("Preferencias de cookies");

    // Activa Analíticas y Funcionales; deja Marketing apagado.
    fireEvent.click(screen.getByRole("checkbox", { name: /Analíticas/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Funcionales/i }));

    // El estado del checkbox refleja el toggle inmediatamente.
    expect(screen.getByRole("checkbox", { name: /Analíticas/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Funcionales/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Marketing/i })).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /Guardar mis preferencias/i }));

    const saved = readClientCookiePreferences();
    expect(saved).toMatchObject({
      necessary: true,
      functional: true,
      analytics: true,
      marketing: false,
    });
    expect(persistCookieConsentAction).toHaveBeenCalledWith(
      expect.objectContaining({ functional: true, analytics: true, marketing: false }),
    );
  });

  it("desmarcar un toggle antes de guardar NO persiste esa categoría", async () => {
    render(<CookiesBanner />);
    const banner = await findBanner();
    fireEvent.click(within(banner).getByRole("button", { name: /Personalizar/i }));
    await screen.findByText("Preferencias de cookies");

    const marketing = screen.getByRole("checkbox", { name: /Marketing/i });
    fireEvent.click(marketing); // on
    expect(marketing).toBeChecked();
    fireEvent.click(marketing); // off de nuevo
    expect(marketing).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /Guardar mis preferencias/i }));

    expect(readClientCookiePreferences()).toMatchObject({ marketing: false });
  });

  it("botón 'Solo necesarias' dentro del modal ignora los toggles activados y persiste rechazo", async () => {
    render(<CookiesBanner />);
    const banner = await findBanner();
    fireEvent.click(within(banner).getByRole("button", { name: /Personalizar/i }));
    await screen.findByText("Preferencias de cookies");

    // Aunque el usuario active analytics, "Solo necesarias" en el modal fuerza reject-all.
    fireEvent.click(screen.getByRole("checkbox", { name: /Analíticas/i }));
    fireEvent.click(screen.getByRole("button", { name: /Solo necesarias/i }));

    expect(readClientCookiePreferences()).toMatchObject({
      functional: false,
      analytics: false,
      marketing: false,
    });
  });

  it("no renderiza nada cuando no hay banner ni modal abierto", () => {
    // Sembramos cookie previa → no hay primera visita → componente devuelve null.
    const prefs = {
      v: 1,
      necessary: true,
      functional: false,
      analytics: false,
      marketing: false,
      savedAt: new Date().toISOString(),
    };
    document.cookie = `${COOKIE_CONSENT_NAME}=${encodeURIComponent(JSON.stringify(prefs))}; Path=/`;
    const { container } = render(<CookiesBanner />);
    // Sin cookie de primera visita el árbol arranca vacío (el efecto solo puede
    // AÑADIR el modal, nunca el banner).
    expect(container).toBeEmptyDOMElement();
  });
});

describe("CookiesReopenLink / openCookiesPreferences", () => {
  it("reabre el modal de preferencias vía evento global tras la primera decisión", async () => {
    render(<CookiesBanner />);
    const banner = await findBanner();
    // Cierra el banner con una decisión (Solo necesarias).
    fireEvent.click(within(banner).getByRole("button", { name: /Solo necesarias/i }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /Cookies en Lucams_shop/i }),
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Preferencias de cookies")).not.toBeInTheDocument();

    // El link reabre el modal (footer / página legal) disparando el evento global.
    openCookiesPreferences();
    expect(await screen.findByText("Preferencias de cookies")).toBeInTheDocument();
  });

  it("CookiesReopenLink es un botón accesible que dispara la reapertura", async () => {
    render(
      <>
        <CookiesBanner />
        <CookiesReopenLink>Configurar cookies</CookiesReopenLink>
      </>,
    );
    const banner = await findBanner();
    fireEvent.click(within(banner).getByRole("button", { name: /Aceptar todas/i }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /Cookies en Lucams_shop/i }),
      ).not.toBeInTheDocument();
    });

    const reopen = screen.getByRole("button", { name: "Configurar cookies" });
    fireEvent.click(reopen);
    expect(await screen.findByText("Preferencias de cookies")).toBeInTheDocument();
  });
});
