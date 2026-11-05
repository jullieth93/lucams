/*
 * Admin — Detalle de cotización (Etapa 1).
 *
 * Vista COMPLETA de la Quote (getQuoteById incluye internalNotes + WhatsApp
 * del cliente — es vista admin protegida por RBAC, nunca exponer en público).
 * Acciones: abrir WhatsApp al cliente (mensaje contextual con el número de
 * cotización), cambiar estado (con confirmación) y agregar notas internas.
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  FileText,
  Hammer,
  MapPin,
  Sparkles,
  StickyNote,
  User,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/brand";
import { ADMIN_ROLE_SETS, hasCapability } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { formatCOP, formatCityDept } from "@/lib/format";
import { customerWaLink } from "@/lib/wa";
import { getQuoteById } from "@/features/quotes/admin-service";
import { convertQuoteToOpportunityAction } from "@/features/opportunities/actions";
import type { QuoteStatus } from "@lucams/db";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminBadge,
  AdminCard,
} from "@/components/admin-page";
import { QuoteActions } from "../quote-actions";
import { previewRefToAuthorizedUrl } from "@/features/personalization/preview-artifacts";
import { formatDateTimeCO } from "@/lib/datetime";

export const metadata: Metadata = { title: "Detalle cotización" };

type Params = Promise<{ id: string }>;

const STATUS_LABEL: Record<QuoteStatus, string> = {
  PENDING: "Pendiente",
  CONTACTED: "Contactada",
  CLOSED: "Cerrada",
  DISCARDED: "Descartada",
};

const STATUS_TONE: Record<QuoteStatus, "amber" | "blue" | "emerald" | "slate"> = {
  PENDING: "amber",
  CONTACTED: "blue",
  CLOSED: "emerald",
  DISCARDED: "slate",
};

export default async function AdminCotizacionDetallePage({ params }: { params: Params }) {
  const session = await requireRole(ADMIN_ROLE_SETS.OPPORTUNITIES);
  const canManageOpportunities = hasCapability(session.admin.role, "opportunities:manage");
  const canRead360 = hasCapability(session.admin.role, "contacts:read_360");

  const { id } = await params;
  const quote = await getQuoteById(id);
  if (!quote) notFound();
  const linkedOpportunity = quote.convertedOpportunities[0] ?? null;

  // WhatsApp al CLIENTE (vista admin — el número sí está disponible acá).
  // El número se persiste normalizado a 10 dígitos CO; el indicativo 57 que
  // exige wa.me lo pone el helper (lib/wa). null = no parseable → sin botón.
  const waMessage = `Hola ${quote.customerName.split(" ")[0]} 👋 Te escribo de Lucams por tu cotización ${quote.number}. ¿La revisamos juntos para concretar tu pedido? ✨`;
  const waUrl = customerWaLink(quote.customerWhatsapp, waMessage);

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<FileText className="h-5 w-5" />}
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono">{quote.number}</span>
            <AdminBadge tone={STATUS_TONE[quote.status]}>{STATUS_LABEL[quote.status]}</AdminBadge>
          </span>
        }
        subtitle={`Creada ${formatDateTimeCO(quote.createdAt)}`}
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Ventas" },
          { label: "Cotizaciones", href: "/admin/cotizaciones" },
          { label: quote.number },
        ]}
        actions={
          <>
            {/* La hoja de taller es lo que Lucy mira mientras fabrica: qué es cada archivo, cuántas
                piezas son de verdad, con qué color y por dónde se corta. */}
            <Link
              href={`/admin/cotizaciones/${quote.id}/taller`}
              className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-sm font-semibold transition-colors"
            >
              <Hammer className="h-4 w-4" />
              Hoja de taller
            </Link>
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                <WhatsAppIcon className="h-4 w-4" />
                Abrir WhatsApp
              </a>
            )}
          </>
        }
      />

      <AdminPageBody>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Columna principal: items + notas */}
          <div className="space-y-6 lg:col-span-2">
            <AdminCard className="p-5">
              <h2 className="text-brand-purple-dark font-display mb-4 text-base font-bold">
                Productos cotizados
              </h2>
              <ul className="divide-brand-purple/10 divide-y">
                {quote.items.map((item) => {
                  // "Default" es la variante interna de productos sin opciones.
                  const showVariant = item.variantName && item.variantName !== "Default";
                  // Miniatura: preview del diseño si es personalizado; si no, la foto
                  // real del producto (antes: ícono genérico que no decía qué era).
                  // LUC-SEC-001 — el snapshot del diseño se convierte a la URL autorizada
                  // del handler (la sesión admin autoriza; la foto de producto es
                  // de otro bucket y NO pasa por el handler).
                  const designPreviewSrc = item.previewUrl
                    ? previewRefToAuthorizedUrl(item.previewUrl)
                    : null;
                  const thumbSrc = designPreviewSrc ?? item.product?.images?.[0] ?? null;
                  return (
                    <li key={item.id} className="flex items-start gap-3 py-3">
                      <div className="bg-brand-purple/5 relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg">
                        {thumbSrc ? (
                          <Image
                            src={thumbSrc}
                            alt={
                              item.previewUrl
                                ? `Diseño personalizado de ${item.productName}`
                                : item.productName
                            }
                            fill
                            sizes="56px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Sparkles className="text-brand-muted h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-brand-purple-dark text-sm font-medium">
                          {item.productName}
                          {showVariant && (
                            <span className="text-brand-muted font-normal">
                              {" "}
                              · {item.variantName}
                            </span>
                          )}
                        </p>
                        {item.previewUrl && (
                          <p className="text-brand-purple/80 text-[10px] font-semibold">
                            ✨ Personalizado
                          </p>
                        )}
                        <p className="text-brand-muted text-xs tabular-nums">
                          {item.quantity} × {formatCOP(item.unitPrice)}
                        </p>
                      </div>
                      <div className="text-brand-purple-dark flex-shrink-0 text-sm font-semibold tabular-nums">
                        {formatCOP(item.unitPrice * item.quantity)}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="border-brand-purple/10 mt-2 space-y-1.5 border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-brand-purple-dark/70">Subtotal</span>
                  <span className="text-brand-purple-dark font-medium tabular-nums">
                    {formatCOP(quote.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-purple-dark/70">Envío</span>
                  <span className="text-brand-muted text-xs italic">
                    A confirmar por WhatsApp · {formatCityDept(quote.city, quote.department)}
                  </span>
                </div>
                <div className="border-brand-purple/10 mt-1 flex justify-between border-t pt-2">
                  <span className="text-brand-purple-dark font-display text-base font-bold">
                    Total
                  </span>
                  <span className="text-brand-purple-dark font-display text-lg font-bold tabular-nums">
                    {formatCOP(quote.total)}
                  </span>
                </div>
              </div>
            </AdminCard>

            {/* Notas internas (append-only: el service separa entradas con ---) */}
            <AdminCard className="p-5">
              <h2 className="text-brand-purple-dark font-display mb-3 flex items-center gap-2 text-base font-bold">
                <StickyNote className="h-4 w-4" />
                Notas internas
              </h2>
              {quote.internalNotes ? (
                <p className="text-brand-purple-dark/90 rounded-lg bg-amber-50/60 p-3 text-sm whitespace-pre-wrap">
                  {quote.internalNotes}
                </p>
              ) : (
                <p className="text-brand-muted text-sm">
                  Aún no hay notas. Úsalas para dejar rastro de la negociación (precio acordado,
                  fechas, datos de entrega…).
                </p>
              )}
            </AdminCard>
          </div>

          {/* Columna lateral: cliente + acciones */}
          <div className="space-y-6">
            <AdminCard className="p-5">
              <h2 className="text-brand-purple-dark font-display mb-3 flex items-center gap-2 text-base font-bold">
                <User className="h-4 w-4" />
                Cliente
              </h2>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-brand-muted text-[10px] font-semibold tracking-wider uppercase">
                    Nombre
                  </dt>
                  <dd className="text-brand-purple-dark font-medium">{quote.customerName}</dd>
                </div>
                <div>
                  <dt className="text-brand-muted text-[10px] font-semibold tracking-wider uppercase">
                    WhatsApp
                  </dt>
                  <dd className="text-brand-purple-dark tabular-nums">{quote.customerWhatsapp}</dd>
                </div>
                <div>
                  <dt className="text-brand-muted text-[10px] font-semibold tracking-wider uppercase">
                    Email
                  </dt>
                  <dd className="text-brand-purple-dark">{quote.customerEmail ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-brand-muted text-[10px] font-semibold tracking-wider uppercase">
                    Ubicación
                  </dt>
                  <dd className="text-brand-purple-dark flex items-center gap-1">
                    <MapPin className="text-brand-muted h-3.5 w-3.5" />
                    {formatCityDept(quote.city, quote.department)}
                  </dd>
                </div>
              </dl>
              {canRead360 && quote.contactId && (
                <div className="mt-3">
                  <Link
                    href={`/admin/clientes/${encodeURIComponent(quote.contactId)}`}
                    className="text-brand-purple hover:text-brand-purple-dark inline-block text-xs font-semibold underline underline-offset-2"
                  >
                    Abrir Contacto 360 →
                  </Link>
                </div>
              )}
              {quote.notes && (
                <div className="border-brand-purple/10 mt-3 border-t pt-3">
                  <p className="text-brand-muted text-[10px] font-semibold tracking-wider uppercase">
                    Notas del cliente
                  </p>
                  <p className="text-brand-purple-dark/90 mt-1 text-sm whitespace-pre-wrap italic">
                    “{quote.notes}”
                  </p>
                </div>
              )}
            </AdminCard>

            {canManageOpportunities && (
              <AdminCard className="p-5">
                <h2 className="text-brand-purple-dark font-display mb-2 flex items-center gap-2 text-base font-bold">
                  <Building2 className="h-4 w-4" />
                  Pipeline B2B / Eventos
                </h2>
                {linkedOpportunity ? (
                  <div className="space-y-2 text-xs">
                    <p className="text-brand-muted">
                      Esta cotización ya está vinculada a una oportunidad comercial activa:
                    </p>
                    <Link
                      href={`/admin/oportunidades/${encodeURIComponent(linkedOpportunity.id)}`}
                      className="bg-brand-purple inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white hover:brightness-110"
                    >
                      Abrir oportunidad {linkedOpportunity.number} →
                    </Link>
                  </div>
                ) : (
                  <form action={convertQuoteToOpportunityAction} className="space-y-2.5">
                    <input type="hidden" name="quoteId" value={quote.id} />
                    <p className="text-brand-muted text-xs">
                      ¿Es una negociación de volumen, regalo corporativo o evento? Llévala en 1 clic
                      al pipeline comercial con tarea de seguimiento en Bandeja Hoy.
                    </p>
                    <button
                      type="submit"
                      className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border bg-[#FFF8F0]/70 px-3.5 py-2 text-xs font-semibold transition-colors"
                    >
                      <Building2 className="h-4 w-4" />
                      Convertir en Oportunidad B2B
                    </button>
                  </form>
                )}
              </AdminCard>
            )}

            <AdminCard className="p-5">
              <h2 className="text-brand-purple-dark font-display mb-3 text-base font-bold">
                Gestionar cotización
              </h2>
              <QuoteActions id={quote.id} status={quote.status} number={quote.number} />
            </AdminCard>
          </div>
        </div>

        <Link
          href="/admin/cotizaciones"
          className="text-brand-purple-dark/70 hover:text-brand-purple inline-flex items-center gap-1.5 text-sm font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a cotizaciones
        </Link>
      </AdminPageBody>
    </AdminPage>
  );
}
