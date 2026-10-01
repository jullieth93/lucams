import type { Metadata, Viewport } from "next";
// 2026-09-25 — next/font/local con los TTF ya vendorizados en assets/fonts
// (los mismos que usa el render de producción 300 DPI): el build ya NO descarga
// fuentes de fonts.googleapis.com, que tumbaba el CI intermitentemente
// (Turbopack: "Can't resolve '@vercel/turbopack-next/internal/font/google/font'").
// Mismas familias, mismas CSS vars → cero cambio visual aguas abajo.
import localFont from "next/font/local";
import { Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { WebVitalsReporter } from "@/components/web-vitals";
import { CookiesBanner } from "@/components/cookies-banner";
import { RouteToasts } from "@/components/route-toasts";
import { getCanonicalSiteUrl } from "@/lib/origin";
import { isCatalogMode } from "@/lib/store-mode";
import { isCmsEditMode } from "@/lib/cms-edit-mode";
import { getSiteSetting } from "@/lib/cms";
import { CmsEditOverlay } from "@/components/cms/cms-edit-overlay";
import "./globals.css";

/*
 * Fuentes de marca GLOBALES (las únicas que paga toda página):
 *   Fredoka (display) — bubble redondeada, encaja con el logo "LUCAMS" multicolor.
 *   Inter (body)      — sans serif estándar e-commerce, con tabular-nums para precios.
 * ADR-021: docs/DECISIONS.md
 *
 * 2026-10-01 (perf) — las 6 tipografías del selector del calendario del Estudio
 * (Caveat, Baloo2, Nunito, Patrick Hand, Playfair, DancingScript; ~2 MB de TTF
 * entre @font-face + preload por página) se movieron al layout de /estudio/*
 * (app/estudio/fonts.ts + app/estudio/layout.tsx) con carga bajo demanda
 * (preload: false — el canvas las pide vía document.fonts.load solo si se usan).
 * Sus CSS vars `--font-*` las define el wrapper `data-studio-fonts` de ese
 * layout; el canvas las resuelve ahí (calendar-card-preview.ts).
 */

const fredoka = localFont({
  src: "../assets/fonts/Fredoka.ttf",
  variable: "--font-fredoka",
  weight: "300 700",
  display: "swap",
});

const inter = localFont({
  src: "../assets/fonts/Inter.ttf",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

/* Meta description del sitio. En modo catálogo (Etapa 1) NO hay checkout de pago ni envío
   calculado: prometer "pago en línea seguro y envío a 1.100+ destinos" en el snippet de Google
   sería información engañosa (Ley 1480, art. 23). Se deriva del flag para que el texto
   transaccional vuelva solo cuando se active el modo full. */
const SITE_DESCRIPTION = isCatalogMode()
  ? "E-commerce colombiano de imanes magnéticos personalizados. Diseñas el tuyo en el Estudio de personalización y pides tu cotización por WhatsApp: ahí acordamos pago y envío contigo."
  : "E-commerce colombiano de imanes magnéticos personalizados. Estudio de personalización en vivo, pago en línea seguro y envío a 1.100+ destinos.";

export const metadata: Metadata = {
  // #28 — misma fuente que sitemap/robots/canonicals (getCanonicalSiteUrl); consolida la URL base.
  metadataBase: new URL(getCanonicalSiteUrl()),
  title: {
    default: "Lucams_shop — Tus recuerdos en imán",
    template: "%s · Lucams_shop",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Lucams_shop",
  authors: [{ name: "Lucams_shop" }],
  generator: "Next.js",
  referrer: "origin-when-cross-origin",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  // OpenGraph para previews al compartir en WhatsApp, Instagram, Facebook.
  // #26 — las imágenes las provee el convention app/opengraph-image.tsx (PNG 1200×630 real). NO
  // declarar `images` aquí: coexistirían con el convention → etiquetas og:image duplicadas.
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: "Lucams_shop",
    title: "Lucams_shop — Tus recuerdos en imán",
    description:
      "Imanes magnéticos personalizados hechos en Colombia. Diseña el tuyo en vivo o elige entre nuestros packs kawaii.",
  },
  twitter: {
    // #26 — imagen vía app/twitter-image.tsx (convention). Sin `images` aquí para no duplicar.
    card: "summary_large_image",
    title: "Lucams_shop — Tus recuerdos en imán",
    description: "Imanes magnéticos personalizados hechos en Colombia.",
  },
};

/* En Next.js 16, themeColor y otros viewport-related metadata
   se exportan separados de `metadata` (breaking change vs Next 15).
   Ref: https://nextjs.org/docs/app/api-reference/functions/generate-viewport */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#7C6AAD" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1530" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Roadmap C1 paso 2 — modo edición in-place: cookie sembrada solo por un
  // admin de contenido; monta el overlay (banner + click → editor del campo).
  // PRIVACY_POLICY_VERSION (cacheada, tag `cms`) alimenta el re-consent del
  // banner de cookies (N-15): si falta el setting, `null` = no re-mostrar.
  const [editMode, privacyPolicy] = await Promise.all([
    isCmsEditMode(),
    getSiteSetting("PRIVACY_POLICY_VERSION"),
  ]);
  return (
    <html lang="es-CO" className={`${fredoka.variable} ${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* Skip-link (WCAG 2.4.1 Bypass Blocks): primer elemento enfocable —
            oculto hasta recibir foco por teclado (Tab), salta al <main id="contenido">
            de cada página evitando repetir el nav. */}
        <a
          href="#contenido"
          className="focus:bg-brand-purple focus:ring-brand-turquoise sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:ring-2 focus:outline-none"
        >
          Saltar al contenido
        </a>
        {children}
        <Toaster position="top-right" richColors closeButton />
        <WebVitalsReporter />
        <Suspense fallback={null}>
          <RouteToasts />
        </Suspense>
        <CookiesBanner policyVersion={privacyPolicy?.value ?? null} />
        {editMode ? <CmsEditOverlay /> : null}
      </body>
    </html>
  );
}
