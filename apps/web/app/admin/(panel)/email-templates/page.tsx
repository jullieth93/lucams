/*
 * Admin > Plantillas de correo — listado de CmsBlock con category=EMAIL.
 *
 * Esta página es un atajo amigable hacia el CMS. Internamente reutiliza
 * 100% el editor /admin/contenido/bloques/[id] (mismo schema, mismas
 * acciones, misma versión). Beneficio para Lucy: en vez de filtrar
 * dentro de la página de CMS, accede directamente al subset de templates
 * de email con instrucciones contextuales.
 *
 * Cuando se cree un template nuevo (G — Email + Deliverability sub-bloque),
 * se hace desde el form CMS normal con category=EMAIL.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, Plus } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import { listCmsBlocks } from "@/features/cms/service";

export const metadata: Metadata = {
  title: "Plantillas de correo",
  robots: { index: false, follow: false },
};

export default async function AdminEmailTemplatesPage() {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const blocks = await listCmsBlocks({ category: "EMAIL" });

  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Mail className="h-5 w-5" />}
        title="Plantillas de correo"
        subtitle={
          <>
            {blocks.length} plantilla{blocks.length === 1 ? "" : "s"} editable
            {blocks.length === 1 ? "" : "s"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Configuración" },
          { label: "Plantillas de correo" },
        ]}
        actions={
          <Link
            href="/admin/contenido/bloques/nuevo?category=EMAIL"
            className="bg-gradient-brand inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            Nueva plantilla
          </Link>
        }
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          <strong>¿Qué editás acá?</strong> El asunto + cuerpo + CTA + footer de los emails
          transaccionales (confirmación de pedido, bienvenida, recuperación de password, etc.). Las
          variables tipo{" "}
          <code className="bg-brand-purple/10 rounded px-1.5 py-0.5 font-mono text-xs">
            &#123;&#123;customerName&#125;&#125;
          </code>{" "}
          se reemplazan al enviar. El layout visual (logo, brand) vive en código (
          <code className="bg-brand-purple/10 rounded px-1.5 py-0.5 font-mono text-xs">
            features/emails/templates/
          </code>
          ) y se construye con react-email en Sub-fase G.
        </AdminNotice>

        {blocks.length === 0 ? (
          <AdminEmpty
            icon={<Mail className="h-5 w-5" />}
            title="Aún no hay plantillas seedeadas"
            description="Los templates de email se crean en Sub-fase G (Email + Deliverability). Mientras tanto, podés crear uno manual con el botón de arriba."
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Clave</th>
                <th className="px-4 py-3 text-left font-semibold">Nombre interno</th>
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <th className="px-4 py-3 text-left font-semibold">Última edición</th>
                <th className="px-4 py-3 text-right font-semibold">Acción</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {blocks.map((b) => (
                <AdminTableRow key={b.id}>
                  <td className="px-4 py-3 align-top">
                    <code className="text-brand-purple-dark/85 bg-brand-purple/5 rounded px-1.5 py-0.5 font-mono text-[11px]">
                      {b.key}
                    </code>
                    {b.description && (
                      <p className="text-brand-purple-dark/55 mt-1 text-xs">{b.description}</p>
                    )}
                  </td>
                  <td className="text-brand-purple-dark px-4 py-3 align-top text-xs font-medium">
                    {b.title ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center align-top">
                    {b.isPublished ? (
                      <AdminBadge tone="emerald">Publicada</AdminBadge>
                    ) : (
                      <AdminBadge tone="amber">Borrador</AdminBadge>
                    )}
                  </td>
                  <td className="text-brand-purple-dark/65 px-4 py-3 align-top text-xs">
                    {dateFmt.format(b.updatedAt)}
                  </td>
                  <td className="px-4 py-3 text-right align-top">
                    <Link
                      href={`/admin/contenido/bloques/${b.id}`}
                      className="text-brand-purple hover:text-brand-purple-dark text-xs font-semibold"
                    >
                      Editar →
                    </Link>
                  </td>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}

        <AdminCard className="p-5">
          <h3 className="text-brand-purple-dark font-display mb-2 text-base font-bold">
            Variables disponibles
          </h3>
          <p className="text-brand-purple-dark/75 text-sm">
            Cada template puede usar variables que se reemplazan al enviar el email. Las más comunes
            son:
          </p>
          <ul className="text-brand-purple-dark/75 mt-3 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
            <li>
              <code className="bg-brand-purple/10 rounded px-1 py-0.5 font-mono">
                &#123;&#123;customerName&#125;&#125;
              </code>{" "}
              — Nombre del cliente
            </li>
            <li>
              <code className="bg-brand-purple/10 rounded px-1 py-0.5 font-mono">
                &#123;&#123;orderNumber&#125;&#125;
              </code>{" "}
              — Número de pedido
            </li>
            <li>
              <code className="bg-brand-purple/10 rounded px-1 py-0.5 font-mono">
                &#123;&#123;orderTotal&#125;&#125;
              </code>{" "}
              — Total del pedido
            </li>
            <li>
              <code className="bg-brand-purple/10 rounded px-1 py-0.5 font-mono">
                &#123;&#123;trackingUrl&#125;&#125;
              </code>{" "}
              — Link de tracking
            </li>
            <li>
              <code className="bg-brand-purple/10 rounded px-1 py-0.5 font-mono">
                &#123;&#123;otpCode&#125;&#125;
              </code>{" "}
              — Código de verificación
            </li>
            <li>
              <code className="bg-brand-purple/10 rounded px-1 py-0.5 font-mono">
                &#123;&#123;resetUrl&#125;&#125;
              </code>{" "}
              — Link de recuperación
            </li>
          </ul>
        </AdminCard>
      </AdminPageBody>
    </AdminPage>
  );
}
