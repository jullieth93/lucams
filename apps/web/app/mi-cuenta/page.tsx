/*
 * Resumen del área de cuenta — /mi-cuenta.
 *
 * Hub: saludo + accesos a cada sección (Pedidos, Direcciones, Reseñas,
 * Seguridad) + resumen del perfil con enlace a editar. El header/nav/logout
 * los aporta el layout compartido. Guard redundante con el layout (barato por
 * el cache() de getCurrentCustomer) para tener el customer sin prop-drilling.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Package, MapPin, Star, ShieldCheck, Pencil, ChevronRight, Gift } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth";
import { getCmsBlock } from "@/lib/cms";
import { resolveCmsTokens } from "@/lib/cms-tokens";
import { getSiteUrl } from "@/features/emails/layout";
import { ReferralCopyButton } from "./referral-copy-button";

// Resuelve un bloque CMS a string plano: mismo patrón que cmsMenuText del
// site-header, para textos que se usan como strings (props, rótulos).
async function cmsAccountText(key: string, fallback: string): Promise<string> {
  const block = await getCmsBlock(key);
  return resolveCmsTokens(block?.body ?? fallback);
}

/** Enmascara un email para listarlo sin exponerlo completo (privacidad). */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local?.slice(0, 2) ?? ""}***@${domain}`;
}

export const metadata: Metadata = {
  title: "Mi cuenta",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Textos de las tarjetas: editables desde /admin/contenido (página "Mi cuenta",
// sección "Resumen de cuenta"). Los fallback son el texto exacto anterior.
const SECTIONS = [
  {
    href: "/mi-cuenta/pedidos",
    icon: Package,
    titleKey: "account.hub.section.pedidos.title",
    titleFallback: "Mis pedidos",
    descKey: "account.hub.section.pedidos.desc",
    descFallback: "Historial de compras y seguimiento de tus envíos.",
  },
  {
    href: "/mi-cuenta/direcciones",
    icon: MapPin,
    titleKey: "account.hub.section.direcciones.title",
    titleFallback: "Mis direcciones",
    descKey: "account.hub.section.direcciones.desc",
    descFallback: "Guárdalas para un checkout más rápido.",
  },
  {
    href: "/mi-cuenta/resenas",
    icon: Star,
    titleKey: "account.hub.section.resenas.title",
    titleFallback: "Mis reseñas",
    descKey: "account.hub.section.resenas.desc",
    descFallback: "Los productos que has calificado.",
  },
  {
    href: "/mi-cuenta/seguridad",
    icon: ShieldCheck,
    titleKey: "account.hub.section.seguridad.title",
    titleFallback: "Seguridad",
    descKey: "account.hub.section.seguridad.desc",
    descFallback: "Cambia tu contraseña o elimina tu cuenta.",
  },
] as const;

export default async function MiCuentaPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta");

  const { customer } = session;
  const displayName = customer.firstName ?? customer.email.split("@")[0] ?? "Lucamer";

  // Conteo de pedidos para el resumen (barato, un count filtrado por cliente).
  const ordersCount = await prisma.order.count({
    where: { customerId: customer.id, deletedAt: null },
  });

  // Referidos v1 (2026-08-11): código propio + estado de los referidos hechos.
  const [siteUrl, referrals] = await Promise.all([
    getSiteUrl(),
    prisma.referral.findMany({
      where: { referrerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { referredEmail: true, status: true, createdAt: true },
    }),
  ]);
  const referralUrl = `${siteUrl}/registro?ref=${encodeURIComponent(customer.referralCode)}`;

  // Textos del hub: editables desde /admin/contenido (página "Mi cuenta",
  // sección "Resumen de cuenta"). Fallback = texto exacto anterior.
  const [greetingRaw, subtext, profileHeading, profileEdit, labelName, labelEmail, labelPhone] =
    await Promise.all([
      cmsAccountText("account.hub.greeting", "Hola, {nombre} 👋"),
      cmsAccountText("account.hub.subtext", "Este es tu espacio Lucams."),
      cmsAccountText("account.hub.profile-heading", "Tu perfil"),
      cmsAccountText("account.hub.profile-edit", "Editar"),
      cmsAccountText("account.hub.profile-name", "Nombre"),
      cmsAccountText("account.hub.profile-email", "Correo"),
      cmsAccountText("account.hub.profile-phone", "Teléfono"),
    ]);
  const sections = await Promise.all(
    SECTIONS.map(async (s) => ({
      href: s.href,
      icon: s.icon,
      title: await cmsAccountText(s.titleKey, s.titleFallback),
      desc: await cmsAccountText(s.descKey, s.descFallback),
    })),
  );
  // {nombre} se interpola a mano (mismo patrón que quote.confirmation.title).
  const greeting = greetingRaw.replaceAll("{nombre}", displayName);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-brand-purple-dark text-3xl">{greeting}</h1>
        <p className="text-brand-muted mt-1">{subtext}</p>
      </div>

      {/* Accesos a secciones */}
      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="group border-brand-purple/15 hover:border-brand-purple/40 flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-sm transition-colors"
            >
              <span className="bg-brand-purple/10 text-brand-purple flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-brand-purple-dark flex items-center gap-1 font-semibold">
                  {s.title}
                  {s.href === "/mi-cuenta/pedidos" && ordersCount > 0 && (
                    <span className="bg-brand-purple/15 text-brand-purple-dark ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                      {ordersCount}
                    </span>
                  )}
                </span>
                <span className="text-brand-muted mt-0.5 block text-sm">{s.desc}</span>
              </span>
              <ChevronRight className="text-brand-muted group-hover:text-brand-purple mt-1 h-4 w-4 flex-shrink-0" />
            </Link>
          );
        })}
      </div>

      {/* Invita y gana — referidos v1 (2026-08-11): tu código + compartir +
          estado de tus referidos. Cuando tu amigo haga su primera compra,
          ambos reciben un cupón de 10% OFF por email. */}
      <section className="border-brand-purple/15 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="bg-brand-turquoise/15 text-brand-purple flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
            <Gift className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-brand-purple-dark text-xl">Invita y gana</h2>
            <p className="text-brand-muted mt-1 text-sm leading-snug">
              Comparte tu código: cuando un amigo se registre con él y haga su primera compra,
              los dos reciben un cupón de <strong>10% OFF</strong>.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="bg-brand-purple/5 text-brand-purple-dark rounded-md px-3 py-1.5 font-mono text-sm font-bold tracking-wider">
                {customer.referralCode}
              </code>
              <ReferralCopyButton value={customer.referralCode} label="Copiar código" />
              <ReferralCopyButton value={referralUrl} label="Copiar link" />
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Regístrate en Lucams con mi código ${customer.referralCode} y los dos ganamos 10% OFF en tu primera compra: ${referralUrl}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600/30 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                Compartir por WhatsApp
              </a>
            </div>
            {referrals.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs">
                {referrals.map((r) => (
                  <li key={r.referredEmail} className="text-brand-muted flex items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-purple/40" aria-hidden />
                    {maskEmail(r.referredEmail)} —{" "}
                    {r.status === "REWARDED"
                      ? "🎁 Cupón entregado"
                      : r.status === "EXPIRED"
                        ? "Ya tenía compras previas"
                        : "Registrado, pendiente su primera compra"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Perfil */}
      <section className="border-brand-purple/15 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-brand-purple-dark text-xl">{profileHeading}</h2>
          <Link
            href="/mi-cuenta/perfil"
            className="text-brand-pink-ink hover:text-brand-coral-ink inline-flex items-center gap-1 text-sm font-semibold"
          >
            <Pencil className="h-3.5 w-3.5" />
            {profileEdit}
          </Link>
        </div>
        <dl className="space-y-1">
          <ProfileRow label={labelName}>
            {[customer.firstName, customer.lastName].filter(Boolean).join(" ") || "—"}
          </ProfileRow>
          <ProfileRow label={labelEmail}>{customer.email}</ProfileRow>
          <ProfileRow label={labelPhone}>{customer.phone ?? "—"}</ProfileRow>
        </dl>
      </section>

      {/* Puntos: SIGUE OCULTO hasta el programa de fidelidad (Fase 5) — loyaltyPoints
          es siempre 0 y mostrar UI muerta contradice el mandato #1. Referidos v1
          (2026-08-11) YA vive en la tarjeta "Invita y gana" de arriba. */}
    </div>
  );
}

function ProfileRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-brand-purple/10 flex flex-col gap-1 border-b py-2 last:border-0 sm:flex-row sm:items-center sm:gap-4">
      <dt className="text-brand-muted text-sm sm:w-32">{label}</dt>
      <dd className="text-foreground text-base">{children}</dd>
    </div>
  );
}
