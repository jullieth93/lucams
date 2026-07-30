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
import { Package, MapPin, Star, ShieldCheck, Pencil, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/auth";
import { getCmsBlock } from "@/lib/cms";
import { resolveCmsTokens } from "@/lib/cms-tokens";

// Resuelve un bloque CMS a string plano: mismo patrón que cmsMenuText del
// site-header, para textos que se usan como strings (props, rótulos).
async function cmsAccountText(key: string, fallback: string): Promise<string> {
  const block = await getCmsBlock(key);
  return resolveCmsTokens(block?.body ?? fallback);
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

      {/* Puntos + referido: OCULTO a propósito hasta que existan los programas (Fase 5).
          Hoy loyaltyPoints es siempre 0 (nada los gana) y referralCode no sirve (el registro no
          acepta código entrante ni hay recompensa). Mostrar UI muerta contradice el mandato #1
          (nacer 100% productivo). Se re-activa cuando se implementen fidelidad + referidos.
          Ver docs/ROADMAP.md Fase 5. Los campos customer.loyaltyPoints/referralCode siguen en el
          modelo, solo no se pintan. */}
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
