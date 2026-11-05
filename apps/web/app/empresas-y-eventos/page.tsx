/*
 * `/empresas-y-eventos` — Landing y captación consultiva B2B / Eventos (`Fase 12 · S24`).
 *
 * Separa limpiamente la venta consultiva por volumen (regalos corporativos, bodas,
 * colegios, merchandising magnético) del checkout self-service B2C.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Award, Building2, CheckCircle2, Gift, HeartHandshake, PackageCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { WhatsAppIcon } from "@/components/icons/brand";
import { buildWhatsAppUrl } from "@/lib/wa";
import { B2bInquiryForm } from "./b2b-inquiry-form";

export const metadata: Metadata = {
  title: "Regalos Corporativos y Eventos | Lucams Shop",
  description:
    "Fotoimanes personalizados, calendarios y detalles magnéticos por volumen para empresas, bodas, grados y eventos en toda Colombia.",
  alternates: { canonical: "/empresas-y-eventos" },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}>;

const BENEFITS = [
  {
    icon: Gift,
    title: "Personalización con tu marca o evento",
    detail:
      "Integramos tu logotipo, paleta corporativa, mensaje de agradecimiento o diseños individuales por invitado.",
  },
  {
    icon: Award,
    title: "Calidad fotográfica laminada 300 DPI",
    detail:
      "Impresión de alta definición con protección UV y respaldo magnético completo que perdura por años.",
  },
  {
    icon: PackageCheck,
    title: "Tarifas escalonadas y envío nacional",
    detail:
      "Precios preferenciales desde 25, 50, 100 y +500 unidades, con despacho asegurado a cualquier ciudad de Colombia.",
  },
  {
    icon: HeartHandshake,
    title: "Acompañamiento humano de principio a fin",
    detail:
      "Validamos juntos tu muestra digital antes de pasar a producción y emitimos facturación para empresas.",
  },
] as const;

export default async function EmpresasYEventosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [waSupportUrl, sp] = await Promise.all([
    buildWhatsAppUrl({ kind: "support" }),
    searchParams,
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-[#FFF8F0]">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero cálido de marca */}
        <section className="from-brand-purple-dark via-brand-purple to-brand-purple-dark relative overflow-hidden bg-gradient-to-br py-14 text-white sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1 text-xs font-semibold tracking-wide text-[#5DD9D1]">
                <Building2 className="h-3.5 w-3.5" />
                Proyectos especiales · Empresas, Bodas y Colegios
              </span>
              <h1 className="font-display mt-4 text-3xl leading-tight font-bold sm:text-5xl">
                Detalles magnéticos que tus clientes e invitados sí conservan
              </h1>
              <p className="mt-4 max-w-2xl text-base text-white/85 sm:text-lg">
                Creamos fotoimanes, calendarios y recordatorios personalizados en volumen con
                acabado artesanal colombiano, tiempos claros de taller y atención dedicada.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-white/90">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                  <CheckCircle2 className="h-4 w-4 text-[#5DD9D1]" />
                  Desde 10 hasta +5.000 unidades
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                  <CheckCircle2 className="h-4 w-4 text-[#5DD9D1]" />
                  Propuesta en menos de 24h hábiles
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                  <CheckCircle2 className="h-4 w-4 text-[#5DD9D1]" />
                  Envíos a toda Colombia
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Contenido principal: Beneficios + Formulario consultivo */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            {/* Columna izquierda: beneficios y acompañamiento */}
            <div className="space-y-6 lg:col-span-5">
              <div>
                <h2 className="font-display text-brand-purple-dark text-2xl font-bold">
                  ¿Por qué elegir Lucams para tu evento o empresa?
                </h2>
                <p className="text-brand-purple-dark/75 mt-2 text-sm">
                  Si necesitas pocas unidades listas para diseñar hoy mismo, puedes comprarlas
                  directo en nuestro{" "}
                  <Link
                    href="/productos"
                    className="text-brand-purple font-semibold underline underline-offset-2"
                  >
                    catálogo online
                  </Link>
                  . Si planeas un pedido por volumen o empaque corporativo, te acompañamos paso a
                  paso.
                </p>
              </div>

              <div className="space-y-3.5">
                {BENEFITS.map((b) => {
                  const Icon = b.icon;
                  return (
                    <div
                      key={b.title}
                      className="border-brand-purple/10 rounded-2xl border bg-white p-4 shadow-xs"
                    >
                      <div className="flex items-start gap-3">
                        <div className="bg-brand-purple/10 text-brand-purple flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-brand-purple-dark text-sm font-bold">{b.title}</h3>
                          <p className="text-brand-purple-dark/75 mt-1 text-xs leading-relaxed">
                            {b.detail}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-brand-purple/15 rounded-2xl border bg-white p-5">
                <p className="text-brand-purple-dark text-sm font-bold">
                  ¿Prefieres conversar directo con nosotros?
                </p>
                <p className="text-brand-muted mt-1 text-xs">
                  También podemos ayudarte por WhatsApp en horario de atención (Lun–Sáb).
                </p>
                <a
                  href={waSupportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                >
                  <WhatsAppIcon className="h-4 w-4 text-emerald-700" />
                  Escribir por WhatsApp
                </a>
              </div>
            </div>

            {/* Columna derecha: Formulario estructurado */}
            <div className="lg:col-span-7">
              <div className="border-brand-purple/15 rounded-3xl border bg-white p-6 shadow-sm sm:p-8">
                <h2 className="font-display text-brand-purple-dark text-xl font-bold sm:text-2xl">
                  Cuéntanos sobre tu pedido por volumen
                </h2>
                <p className="text-brand-muted mt-1 mb-6 text-sm">
                  Completa estos datos en 1 minuto y prepararemos opciones ideales según tu fecha y
                  cantidad.
                </p>

                <B2bInquiryForm
                  waSupportUrl={waSupportUrl}
                  initialUtmSource={sp.utm_source ?? ""}
                  initialUtmMedium={sp.utm_medium ?? ""}
                  initialUtmCampaign={sp.utm_campaign ?? ""}
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
