/*
 * /ayuda — Centro de ayuda (FAQ).
 *
 * Cada pregunta es un CmsBlock con `category: FAQ` y key
 * `faq.<slug>`. El page itera todos los publicados, ordenándolos por
 * `metadata.order` cuando esté presente o por key alfabético.
 *
 * Si el catálogo de FAQs está vacío, mostramos un set hardcoded de
 * 6 preguntas básicas como fallback editorial inicial (Lucy puede
 * empezar a editar desde el primer click en modo edición — se auto-
 * crean).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, MessageCircle, Mail } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CmsText } from "@/components/cms/cms-text";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { getCmsBlocksByCategory, getSettingValue } from "@/lib/cms";
import { buildWhatsAppUrl } from "@/lib/wa";
import { isCatalogMode } from "@/lib/store-mode";

export const metadata: Metadata = {
  title: "Ayuda",
  description:
    "Preguntas frecuentes sobre personalización, envíos, métodos de pago, garantías y devoluciones en Lucams_shop.",
};

export const dynamic = "force-dynamic";

// Fallback editorial: ~15 preguntas iniciales. Cada vez que Lucy edita
// una desde modo edición, el wrapper auto-crea el CmsBlock con
// category=FAQ. Cuando getCmsBlocksByCategory devuelva blocks, esos
// reemplazan al fallback (orden por key).
//
// `catalog` = Etapa 1 (modo catálogo): sin pago en línea ni envío
// integrado — la compra se cierra por WhatsApp. Los textos de pago/envío
// se condicionan al modo para no prometer lo que no está activo.
// `codEnabled`: el toggle COD del admin (SiteSetting COD_ENABLED) también
// gobierna la mención de contraentrega — apagarlo quita la promesa (2026-07-22).
function buildFallbackFaqs(
  catalog: boolean,
  codEnabled: boolean,
): { slug: string; question: string; answer: string }[] {
  const codCatalog = codEnabled
    ? " Además tienes **contraentrega disponible**: pagas en efectivo al recibir tu pedido."
    : "";
  const codFull = codEnabled
    ? " También aceptamos **pago contraentrega**: pagas en efectivo al recibir tu pedido."
    : "";
  return [
    {
      slug: "como-personalizo",
      question: "¿Cómo personalizo un producto?",
      answer: catalog
        ? "Elige el producto, haz clic en **Personalizar** y lo diseñas en vivo en nuestro Estudio: subes tus fotos, agregas texto y plantillas, y lo ves con vista previa 3D. Al terminar, lo agregas al carrito y confirmas tu pedido por WhatsApp."
        : "Elige el producto, haz clic en **Personalizar** y lo diseñas en vivo en nuestro Estudio: subes tus fotos, agregas texto y plantillas, y lo ves con vista previa 3D. Al terminar, lo agregas al carrito.",
    },
    {
      slug: "cuanto-demora",
      question: "¿Cuánto demora mi pedido?",
      answer: catalog
        ? "Lo producimos a mano y lo **entregamos en máximo 3 días hábiles** (2 de fabricación + 1 de entrega) desde que confirmas. El envío lo coordinamos por WhatsApp con nuestras transportadoras aliadas y te pasamos el número de guía para que sigas tu pedido."
        : "Lo producimos a mano y lo **entregamos en máximo 3 días hábiles** (2 de fabricación + 1 de entrega) desde que confirmas. El tránsito final lo pone la transportadora; al despachar te enviamos el número de guía para que sigas tu pedido.",
    },
    {
      slug: "metodos-pago",
      question: "¿Qué métodos de pago aceptan?",
      answer: catalog
        ? `Los medios de pago se acuerdan por **WhatsApp** al confirmar tu cotización.${codCatalog}`
        : `Tarjetas de crédito y débito, PSE (cuentas bancarias), Nequi, Bancolombia transferencia y Daviplata. Todos los pagos los procesa Wompi de forma segura (pasarela certificada).${codFull}`,
    },
    {
      slug: "envios-cobertura",
      question: "¿Hacen envíos a mi ciudad?",
      answer: catalog
        ? "Llegamos a **1.100+ destinos** en Colombia a través de nuestras transportadoras aliadas. El costo del envío y el tiempo estimado te los confirmamos por **WhatsApp** al cotizar tu pedido."
        : "Llegamos a **1.100+ destinos** en Colombia a través de nuestras transportadoras aliadas. Al hacer el pedido calculamos automáticamente el costo, el tiempo estimado y qué transportadora llega a tu ciudad.",
    },
    {
      slug: "cambios-devoluciones",
      question: "¿Cómo cambio o devuelvo un producto?",
      answer:
        "Tienes **5 días hábiles** desde la entrega para retractarte (Ley 1480 art. 47), excepto en productos personalizados. Para garantía: 1 año desde la entrega. [Más detalles](/legal/devoluciones).",
    },
    {
      slug: "comprobante-venta",
      question: "¿Puedo pedir comprobante de venta de mi compra?",
      answer:
        "Claro. Cuéntanos tus datos de facturación (nombre o razón social, cédula o NIT, y correo) al confirmar tu pedido y te enviamos el comprobante de tu compra a tu correo. Hoy no emitimos factura electrónica de la DIAN; te entregamos el documento equivalente que corresponda según nuestro régimen tributario.",
    },
    {
      slug: "datos-personales",
      question: "¿Cómo manejan mis datos personales?",
      answer:
        "Tratamos tus datos según la **Ley 1581 de 2012** y nuestro [Aviso de Privacidad](/legal/privacidad). Puedes ejercer hábeas data (acceso, rectificación, supresión, revocación) escribiéndonos.",
    },
    {
      slug: "borrar-mis-datos",
      question: "¿Cómo borro mi cuenta y mis datos?",
      answer:
        "Escríbenos a **hola@lucamsshop.com** desde el email registrado. Procesamos la supresión dentro de **10 días hábiles**. Más info en [Hábeas Data](/legal/habeas-data).",
    },
    {
      slug: "newsletter-unsuscripcion",
      question: "¿Cómo me suscribo o desuscribo del newsletter?",
      answer:
        "Suscripción: form en el footer. Desuscripción: link **Cancelar suscripción** al final de cada email que te enviemos, o escríbenos a hola@lucamsshop.com.",
    },
    {
      slug: "regalos-eventos",
      question: "¿Hacen pedidos al por mayor o para eventos corporativos?",
      answer:
        "¡Sí! Bodas, baby showers, eventos corporativos, recordatorios para regalos. Escríbenos por WhatsApp con tu idea y volumen y te pasamos cotización personalizada.",
    },
  ];
}

export default async function AyudaPage() {
  const [faqs, waSupportUrl, contactEmail, codSetting] = await Promise.all([
    getCmsBlocksByCategory("FAQ"),
    buildWhatsAppUrl({ kind: "support" }),
    getSettingValue("CONTACT_EMAIL", "hola@lucamsshop.com"),
    getSettingValue("COD_ENABLED", "true"),
  ]);
  const catalog = isCatalogMode();
  const codEnabled = codSetting === "true";

  // Si hay FAQs en CMS, las usamos. Si no, fallback editorial.
  const items =
    faqs.length > 0
      ? faqs.map((b) => ({
          slug: b.key.replace(/^faq\./, ""),
          question: b.title ?? b.key,
          answer: b.body,
          fromCms: true as const,
        }))
      : buildFallbackFaqs(catalog, codEnabled).map((f) => ({ ...f, fromCms: false as const }));

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />

      <main id="contenido" tabIndex={-1} className="flex-1 px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <header className="mb-8">
            <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
              <CmsText blockKey="support.help.heading" fallback="Centro de ayuda" />
            </h1>
            <p className="text-brand-purple-dark/70 mt-2 max-w-xl text-base">
              <CmsText
                blockKey="support.help.subtext"
                fallback="¿Tienes una pregunta? Acá las respuestas a las dudas más comunes. Si no encuentras lo que buscas, escríbenos."
              />
            </p>
          </header>

          <div className="border-brand-purple/10 mb-8 divide-y rounded-xl border bg-white">
            {items.map((it) => (
              <details
                key={it.slug}
                className="group [&_summary]:list-none [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="text-brand-purple-dark flex cursor-pointer items-center justify-between gap-3 px-5 py-4 text-sm font-semibold sm:text-base">
                  <span className="flex-1">
                    {it.fromCms ? (
                      <CmsText blockKey={`faq.${it.slug}.title`} fallback={it.question} />
                    ) : (
                      it.question
                    )}
                  </span>
                  <ChevronDown className="text-brand-purple h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="text-brand-purple-dark/80 px-5 pb-4 text-sm leading-relaxed">
                  {it.fromCms ? (
                    <CmsMarkdown blockKey={`faq.${it.slug}`} fallback={it.answer} />
                  ) : (
                    <CmsMarkdown blockKey={`faq.${it.slug}`} fallback={it.answer} />
                  )}
                </div>
              </details>
            ))}
          </div>

          <aside className="border-brand-purple/15 from-brand-purple/5 to-brand-pink/5 rounded-2xl border bg-gradient-to-br p-6 text-center">
            <h2 className="font-display text-brand-purple-dark text-xl">
              <CmsText blockKey="support.help.cta.heading" fallback="¿No resolvimos tu duda?" />
            </h2>
            <p className="text-brand-purple-dark/70 mt-1 text-sm">
              <CmsText
                blockKey="support.help.cta.subtext"
                fallback="Escríbenos por WhatsApp o email y te respondemos en menos de 24h."
              />
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <a
                href={waSupportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-brand-purple hover:bg-brand-purple-dark inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
              <a
                href={`mailto:${contactEmail}`}
                className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-2 rounded-full border bg-white px-5 py-2.5 text-sm font-semibold"
              >
                <Mail className="h-4 w-4" />
                {contactEmail}
              </a>
              <Link
                href="/contacto"
                className="text-brand-purple-dark hover:bg-brand-purple/5 rounded-full px-5 py-2.5 text-sm font-semibold"
              >
                Formulario de contacto →
              </Link>
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
