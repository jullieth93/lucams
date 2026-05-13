/*
 * /contacto — Formulario de soporte + WhatsApp CTA prominente.
 *
 * Form server-action driven (ContactForm client component). El email
 * de notificación a hola@lucamsshop.co se difiere a sub-bloque G
 * (cuando esté lib/resend.ts centralizado).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Mail, Clock } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CmsText } from "@/components/cms/cms-text";
import { CmsSetting } from "@/components/cms/cms-setting";
import { getSettingValue } from "@/lib/cms";
import { buildWhatsAppUrl } from "@/lib/wa";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Escribinos por WhatsApp, email o el formulario. Te respondemos en menos de 24 horas hábiles.",
};

export const dynamic = "force-dynamic";

export default async function ContactoPage() {
  const [waSupportUrl, contactEmail] = await Promise.all([
    buildWhatsAppUrl({ kind: "support" }),
    getSettingValue("CONTACT_EMAIL", "hola@lucamsshop.co"),
  ]);

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1 px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-5xl">
          <header className="mb-10">
            <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
              <CmsText blockKey="support.contacto.heading" fallback="Hablemos" />
            </h1>
            <p className="text-brand-purple-dark/70 mt-2 max-w-2xl text-base">
              <CmsText
                blockKey="support.contacto.subtext"
                fallback="¿Una idea, una duda, un pedido especial? Escribinos por el medio que prefieras. Te respondemos en menos de 24h hábiles."
              />
            </p>
          </header>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Columna 1: WhatsApp + email + info */}
            <aside className="space-y-4">
              <div className="border-brand-purple/15 to-brand-turquoise/10 rounded-2xl border bg-gradient-to-br from-emerald-50 p-6">
                <h2 className="font-display text-brand-purple-dark flex items-center gap-2 text-xl">
                  <MessageCircle className="h-5 w-5 text-emerald-600" />
                  WhatsApp
                </h2>
                <p className="text-brand-purple-dark/75 mt-2 text-sm">
                  <CmsText
                    blockKey="support.contacto.wa-copy"
                    fallback="El canal más rápido. Te respondemos en minutos durante horario hábil."
                  />
                </p>
                <a
                  href={waSupportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  Hablanos por WhatsApp →
                </a>
              </div>

              <div className="border-brand-purple/15 rounded-2xl border bg-white p-6">
                <h2 className="font-display text-brand-purple-dark flex items-center gap-2 text-xl">
                  <Mail className="text-brand-purple h-5 w-5" />
                  Email
                </h2>
                <a
                  href={`mailto:${contactEmail}`}
                  className="text-brand-purple-dark hover:text-brand-purple mt-2 inline-block text-sm font-medium"
                >
                  <CmsSetting settingKey="CONTACT_EMAIL" fallback="hola@lucamsshop.co" />
                </a>
                <p className="text-brand-purple-dark/65 mt-2 text-xs">
                  Para temas legales:{" "}
                  <CmsSetting settingKey="SECURITY_EMAIL" fallback="security@lucamsshop.co" />
                </p>
              </div>

              <div className="border-brand-purple/15 rounded-2xl border bg-white p-6">
                <h2 className="font-display text-brand-purple-dark flex items-center gap-2 text-xl">
                  <Clock className="text-brand-purple h-5 w-5" />
                  Horario
                </h2>
                <p className="text-brand-purple-dark/75 mt-2 text-sm">
                  <CmsSetting settingKey="BUSINESS_HOURS" fallback="Lun-Sáb 9am – 7pm COT" />
                </p>
              </div>

              <div className="border-brand-purple/15 rounded-2xl border bg-white p-6">
                <h2 className="font-display text-brand-purple-dark text-lg">¿Preguntas comunes?</h2>
                <p className="text-brand-purple-dark/70 mt-2 text-sm">
                  Antes de escribir, revisá el{" "}
                  <Link href="/ayuda" className="text-brand-purple font-semibold hover:underline">
                    Centro de ayuda
                  </Link>{" "}
                  — quizás ya está respondida.
                </p>
              </div>
            </aside>

            {/* Columna 2: Form */}
            <section className="border-brand-purple/15 rounded-2xl border bg-white p-6 sm:p-8">
              <h2 className="font-display text-brand-purple-dark text-xl">
                <CmsText blockKey="support.contacto.form-heading" fallback="Escribinos por aquí" />
              </h2>
              <p className="text-brand-purple-dark/70 mt-1 mb-5 text-sm">
                <CmsText
                  blockKey="support.contacto.form-subtext"
                  fallback="Te respondemos al email que nos dejes."
                />
              </p>
              <ContactForm />
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
