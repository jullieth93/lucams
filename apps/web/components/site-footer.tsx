/*
 * SiteFooter — footer kawaii del storefront.
 *
 * 4 columnas en desktop, accordion en móvil:
 *  1. Lucams: logo + tagline + redes (Instagram/TikTok/Facebook/WhatsApp)
 *  2. Tienda: máx. 6 categorías activas + Ver todo
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
import { CmsText } from "@/components/cms/cms-text";
import { CmsSetting } from "@/components/cms/cms-setting";
import { listStorefrontCategories } from "@/features/products/public-service";
import { getCmsList, getSettingValue } from "@/lib/cms";
import { buildWhatsAppUrl, getWhatsAppNumber } from "@/lib/wa";

type LegalLink = { label: string; href: string };

// Fallback de los enlaces legales: si el campo CMS footer.legal.links no
// existe o trae JSON inválido, el footer se ve idéntico a como estaba
// hardcodeado (REGLA DE ORO del CMS).
const FALLBACK_LEGAL_LINKS: LegalLink[] = [
  { href: "/legal/privacidad", label: "Aviso de Privacidad" },
  { href: "/legal/terminos", label: "Términos y Condiciones" },
  { href: "/legal/cookies", label: "Política de Cookies" },
  { href: "/legal/devoluciones", label: "Devoluciones y Retracto" },
  { href: "/legal/garantias", label: "Garantías" },
  { href: "/legal/habeas-data", label: "Hábeas Data" },
  { href: "/legal/subprocesadores", label: "Subprocesadores" },
  { href: "/legal/security", label: "Seguridad" },
];

// WCAG 2.4.7 — el outline por defecto del navegador queda bajo 3:1 sobre el
// fondo purple-dark del footer, así que TODOS sus enlaces llevan outline blanco
// explícito (blanco sobre purple-dark ≈ 10:1).
const FOCUS_VISIBLE =
  "focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-white";
// Variante para los botones sociales circulares: el outline sigue el rounded-full
// (rounded-sm los descuadraría al enfocarlos).
const FOCUS_VISIBLE_CIRCLE = "focus-visible:outline-2 focus-visible:outline-white";

// Validación de un enlace legal del CMS: solo { label: string, href: string }.
// Cualquier otra cosa hace que getCmsList caiga al fallback hardcoded (la
// columna legal nunca puede quedar vacía por un typo en el admin).
function validateLegalLink(v: unknown): LegalLink | null {
  if (typeof v !== "object" || v === null) return null;
  const item = v as LegalLink;
  if (typeof item.label !== "string" || typeof item.href !== "string") return null;
  return item;
}

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

// Facebook tampoco está en lucide-react 1.14 (brand icons removidos) — glyph
// propio en el mismo estilo que Instagram/TikTok.
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5h1.65V3.6c-.3-.04-1.3-.1-2.45-.1-2.4 0-4.05 1.47-4.05 4.17v2.23H7.5V13h2.7v8h3.3z" />
    </svg>
  );
}

export async function SiteFooter() {
  // Settings que se usan como atributos (href/mailto) los necesitamos
  // como string raw — los display los wrappea <CmsSetting>.
  const [
    categories,
    waSupportUrl,
    contactEmail,
    instagramUrl,
    tiktokUrl,
    facebookUrl,
    waNumber,
    legalLinks,
    appName,
    businessLocation,
    sicUrl,
    instagramEnabled,
    tiktokEnabled,
    facebookEnabled,
  ] = await Promise.all([
    listStorefrontCategories({ topLevelOnly: true }),
    buildWhatsAppUrl({ kind: "support" }),
    getSettingValue("CONTACT_EMAIL", "hola@lucamsshop.com"),
    getSettingValue("SOCIAL_INSTAGRAM_URL", "https://www.instagram.com/lucams_shop"),
    getSettingValue("SOCIAL_TIKTOK_URL", "https://www.tiktok.com/@lucams_shop"),
    getSettingValue("SOCIAL_FACEBOOK_URL", "https://www.facebook.com/lucamsshop"),
    getWhatsAppNumber(),
    getCmsList("footer.legal.links", validateLegalLink, FALLBACK_LEGAL_LINKS),
    getSettingValue("APP_NAME", "Lucams_shop"),
    getSettingValue("BUSINESS_LOCATION", "Bogotá D.C., Colombia"),
    getSettingValue("GOVT_SIC_URL", "https://www.sic.gov.co/"),
    getSettingValue("SOCIAL_INSTAGRAM_ENABLED", "true"),
    getSettingValue("SOCIAL_TIKTOK_ENABLED", "true"),
    getSettingValue("SOCIAL_FACEBOOK_ENABLED", "true"),
  ]);
  const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION ?? "dev";
  const waNumberDisplay = waNumber.replace(/^57(\d{3})(\d{3})(\d{4})$/, "+57 $1 $2 $3");

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
              <CmsText
                blockKey="footer.tagline"
                fallback="Tus recuerdos, en imán. Hechos a mano con cariño en Bogotá."
              />
            </p>
            <div className="mt-4 flex gap-2">
              {/* Cada red se muestra solo si su toggle SOCIAL_*_ENABLED está
                  en "true" (default: visibles, como estaban hardcodeadas). */}
              {instagramEnabled === "true" && (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 ${FOCUS_VISIBLE_CIRCLE}`}
                >
                  <InstagramIcon className="h-4 w-4" />
                </a>
              )}
              {tiktokEnabled === "true" && (
                <a
                  href={tiktokUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="TikTok"
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 ${FOCUS_VISIBLE_CIRCLE}`}
                >
                  <TikTokIcon className="h-4 w-4" />
                </a>
              )}
              {facebookEnabled === "true" && (
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 ${FOCUS_VISIBLE_CIRCLE}`}
                >
                  <FacebookIcon className="h-4 w-4" />
                </a>
              )}
              <a
                href={waSupportUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 ${FOCUS_VISIBLE_CIRCLE}`}
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Col 2 — Tienda */}
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-wider text-white uppercase">
              <CmsText blockKey="footer.column.shop" fallback="Tienda" />
            </h3>
            <ul className="space-y-2 text-sm text-white/80">
              {/* Máximo 6 categorías + "Ver todo" (antes salían TODAS, incluidas
                  categorías obsoletas ya desactivadas en DB). */}
              {categories.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/productos?categoria=${c.slug}`}
                    className={`transition-colors hover:text-white ${FOCUS_VISIBLE}`}
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
              <li className="pt-1">
                {/* a11y contraste: brand-pink sobre purple-dark da 3.69:1 (< 4.5 AA) → los CTAs
                    del footer van en brand-coral (5.02:1) y el hover sube a blanco. */}
                <Link
                  href="/productos"
                  className={`text-brand-coral font-semibold transition-colors hover:text-white ${FOCUS_VISIBLE}`}
                >
                  <CmsText blockKey="footer.shop.cta-all" fallback="Ver todo →" />
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3 — Información (legal) */}
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-wider text-white uppercase">
              <CmsText blockKey="footer.column.info" fallback="Información" />
            </h3>
            <ul className="space-y-2 text-sm text-white/80">
              {legalLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={`transition-colors hover:text-white ${FOCUS_VISIBLE}`}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4 — Atención cliente */}
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-wider text-white uppercase">
              <CmsText blockKey="footer.column.support" fallback="Atención cliente" />
            </h3>
            <ul className="space-y-3 text-sm text-white/80">
              <li>
                <a
                  href={waSupportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 transition-colors hover:text-white ${FOCUS_VISIBLE}`}
                >
                  <MessageCircle className="h-4 w-4" />
                  {waNumberDisplay}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${contactEmail}`}
                  className={`inline-flex items-center gap-1.5 transition-colors hover:text-white ${FOCUS_VISIBLE}`}
                >
                  <Mail className="h-4 w-4" />
                  <CmsSetting settingKey="CONTACT_EMAIL" fallback="hola@lucamsshop.com" />
                </a>
              </li>
              <li className="text-xs text-white/60">
                <CmsSetting settingKey="BUSINESS_HOURS" fallback="Lun-Sáb 9am – 7pm COT" />
              </li>
              <li className="pt-1">
                <Link
                  href="/ayuda"
                  className={`text-brand-coral font-semibold transition-colors hover:text-white ${FOCUS_VISIBLE}`}
                >
                  <CmsText blockKey="footer.help.cta" fallback="Centro de ayuda →" />
                </Link>
              </li>
              <li>
                <Link
                  href="/contacto"
                  className={`text-brand-coral font-semibold transition-colors hover:text-white ${FOCUS_VISIBLE}`}
                >
                  <CmsText blockKey="footer.contact.cta" fallback="Contacto →" />
                </Link>
              </li>
              <li>
                <Link
                  href="/rastrear"
                  className={`text-brand-coral font-semibold transition-colors hover:text-white ${FOCUS_VISIBLE}`}
                >
                  <CmsText blockKey="footer.track.cta" fallback="Rastrear pedido →" />
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
                <CmsText
                  blockKey="footer.newsletter.heading"
                  fallback="Recibe el correo del cariño 💜"
                />
              </h3>
              <p className="mt-1 text-sm text-white/75">
                <CmsText
                  blockKey="footer.newsletter.description"
                  fallback="Lanzamientos, promos y curaduría kawaii. Sin spam — máximo una vez al mes."
                />
              </p>
            </div>
            <NewsletterForm compact variant="dark" />
          </div>
        </div>

        {/* Copyright + ciudad de la marca + autoridad de consumidor (SIC) */}
        <div className="mt-12 border-t border-white/10 pt-6 text-xs text-white/60">
          {/* La identificación legal de la persona natural (nombre completo) va en
              /legal/*, no en el footer. Aquí solo marca + ciudad. */}
          <p className="mb-3 text-center text-[11px] text-white/50 md:text-left">
            {appName} · {businessLocation}
            {" · "}
            <a
              href={sicUrl}
              target="_blank"
              rel="noreferrer"
              className={`underline hover:text-white/80 ${FOCUS_VISIBLE}`}
            >
              <CmsText
                blockKey="footer.legal.sic-label"
                fallback="SIC (protección al consumidor)"
              />
            </a>
          </p>
          <div className="flex flex-col items-center justify-between gap-3 md:flex-row">
            <p>
              © <CmsSetting settingKey="COPYRIGHT_YEAR" fallback="2026" /> Lucams_shop ·{" "}
              <CmsSetting settingKey="COPYRIGHT_TAGLINE" fallback="Hecho con 💜 en Bogotá" />
            </p>
            <p className="font-mono text-[10px] text-white/40">v{buildVersion.slice(0, 7)}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
