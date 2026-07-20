import type { Metadata, Viewport } from "next";
import { Fredoka, Inter } from "next/font/google";
import { Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { WebVitalsReporter } from "@/components/web-vitals";
import { CookiesBanner } from "@/components/cookies-banner";
import { RouteToasts } from "@/components/route-toasts";
import { getCanonicalSiteUrl } from "@/lib/origin";
import "./globals.css";

/*
 * Fredoka (display) — bubble redondeada, encaja con el logo "LUCAMS" multicolor.
 * Inter (body)     — sans serif estándar e-commerce, con tabular-nums para precios.
 * ADR-021: docs/DECISIONS.md
 */

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  // #28 — misma fuente que sitemap/robots/canonicals (getCanonicalSiteUrl); consolida la URL base.
  metadataBase: new URL(getCanonicalSiteUrl()),
  title: {
    default: "Lucams_shop — Tus recuerdos en imán",
    template: "%s · Lucams_shop",
  },
  description:
    "E-commerce colombiano de imanes magnéticos personalizados. Estudio de personalización en vivo, pago en línea seguro y envío a 1.100+ destinos.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        <CookiesBanner />
      </body>
    </html>
  );
}
