/*
 * SiteFooter — footer kawaii del storefront.
 *
 * 4 columnas en desktop, accordion en móvil:
 *  1. Lucams: logo + tagline + redes (Instagram/TikTok/WhatsApp)
 *  2. Tienda: 7 categorías activas + Ver todo
 *  3. Información: links a /legal/*
 *  4. Atención cliente: WhatsApp CTA + email + /ayuda
 *
 * Newsletter form ancho completo bajo las columnas.
 * Mascote pequeño esquina inferior + copyright + version build.
 *
 * NO usar en /(auth)/* ni /mi-cuenta ni /admin — esos layouts traen su
 * propio chrome.
 */

import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import { NewsletterForm } from "@/components/newsletter-form";
import { listStorefrontCategories } from "@/features/products/public-service";
import { buildWhatsAppUrl, getWhatsAppNumber } from "@/lib/wa";

const LEGAL_LINKS = [
  { href: "/legal/privacidad", label: "Aviso de Privacidad" },
  { href: "/legal/terminos", label: "Términos y Condiciones" },
  { href: "/legal/cookies", label: "Política de Cookies" },
  { href: "/legal/devoluciones", label: "Devoluciones y Retracto" },
  { href: "/legal/garantias", label: "Garantías" },
  { href: "/legal/habeas-data", label: "Hábeas Data" },
  { href: "/legal/subprocesadores", label: "Subprocesadores" },
  { href: "/legal/security", label: "Seguridad" },
];

// SVG inline — Instagram + TikTok no están en la versión actual de
// lucide-react. Estos son simplified glyphs propios para el footer.
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.31a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.74z" />
    </svg>
  );
}

export async function SiteFooter() {
  const categories = await listStorefrontCategories();
  const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION ?? "dev";
  const waNumberDisplay = getWhatsAppNumber().replace(/^57(\d{3})(\d{3})(\d{4})$/, "+57 $1 $2 $3");

  return (
    <footer className="from-brand-purple-dark via-brand-purple-dark to-brand-purple relative overflow-hidden bg-gradient-to-br text-white">
      {/* Blobs decorativos */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-brand-pink/15 absolute -top-20 -right-20 h-72 w-72 rounded-full blur-3xl" />
        <div className="bg-brand-turquoise/15 absolute -bottom-20 -left-20 h-80 w-80 rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
        {/* 4 columnas */}
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          {/* Col 1 — Lucams */}
          <div>
            <p className="font-display text-2xl text-white">
              Lucams<span className="text-brand-pink">_shop</span>
            </p>
            <p className="mt-2 text-sm text-white/80">
              Tus recuerdos, en imán. Hechos a mano con cariño en Bogotá.
            </p>
            <div className="mt-4 flex gap-2">
              <a
                href="https://www.instagram.com/lucams_shop"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
              >
                <InstagramIcon className="h-4 w-4" />
              </a>
              <a
                href="https://www.tiktok.com/@lucams_shop"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
              >
                <TikTokIcon className="h-4 w-4" />
              </a>
              <a
                href={buildWhatsAppUrl({ kind: "support" })}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Col 2 — Tienda */}
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-wider text-white uppercase">
              Tienda
            </h3>
            <ul className="space-y-2 text-sm text-white/80">
              {categories.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/productos?categoria=${c.slug}`}
                    className="transition-colors hover:text-white"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
              <li className="pt-1">
                <Link
                  href="/productos"
                  className="text-brand-pink hover:text-brand-coral font-semibold transition-colors"
                >
                  Ver todo →
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3 — Información (legal) */}
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-wider text-white uppercase">
              Información
            </h3>
            <ul className="space-y-2 text-sm text-white/80">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4 — Atención cliente */}
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-wider text-white uppercase">
              Atención cliente
            </h3>
            <ul className="space-y-3 text-sm text-white/80">
              <li>
                <a
                  href={buildWhatsAppUrl({ kind: "support" })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
                >
                  <MessageCircle className="h-4 w-4" />
                  {waNumberDisplay}
                </a>
              </li>
              <li>
                <a
                  href="mailto:hola@lucamsshop.co"
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
                >
                  <Mail className="h-4 w-4" />
                  hola@lucamsshop.co
                </a>
              </li>
              <li className="text-xs text-white/60">Lun-Sáb 9am – 7pm COT</li>
              <li className="pt-1">
                <Link
                  href="/ayuda"
                  className="text-brand-pink hover:text-brand-coral font-semibold transition-colors"
                >
                  Centro de ayuda →
                </Link>
              </li>
              <li>
                <Link
                  href="/contacto"
                  className="text-brand-pink hover:text-brand-coral font-semibold transition-colors"
                >
                  Contacto →
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Newsletter band */}
        <div className="mt-12 rounded-2xl bg-white/5 p-6 backdrop-blur sm:p-8">
          <div className="grid items-center gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-display text-xl text-white sm:text-2xl">
                Recibe el correo del cariño 💜
              </h3>
              <p className="mt-1 text-sm text-white/75">
                Lanzamientos, promos y curaduría kawaii. Sin spam — máximo una vez al mes.
              </p>
            </div>
            <NewsletterForm compact />
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/60 md:flex-row">
          <p>© 2026 Lucams_shop · Hecho con 💜 en Bogotá</p>
          <p className="font-mono text-[10px] text-white/40">v{buildVersion.slice(0, 7)}</p>
        </div>
      </div>
    </footer>
  );
}
