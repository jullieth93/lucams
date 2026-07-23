/*
 * Admin > Contenido > Configuración del sitio (brand 2026-05-18).
 *
 * Lista todos los SiteSettings agrupados por categoría. Cada fila se
 * edita inline. Cada cambio queda registrado en auditoría.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Mail,
  Globe,
  Hash,
  Clock,
  ExternalLink,
  MessageCircle,
  Copyright,
  Megaphone,
  Cog,
  RefreshCw,
} from "lucide-react";
import { listSiteSettings } from "@/features/cms/service";
import { getCurrentAdmin } from "@/lib/auth";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminButton,
  AdminCard,
  AdminEmpty,
  AdminNotice,
} from "@/components/admin-page";
import { refreshCmsCacheAction } from "../actions";
import { SettingRow } from "./setting-row";

export const metadata: Metadata = {
  title: "Configuración del sitio",
};

const CATEGORY_INFO: Record<string, { label: string; icon: typeof Mail; desc: string }> = {
  CONTACT: {
    label: "📞 Contacto",
    icon: Mail,
    desc: "Email, WhatsApp y forma de contactar al negocio.",
  },
  BUSINESS: {
    label: "🏢 Negocio",
    icon: Clock,
    desc: "Horarios, ubicación, datos generales del comercio.",
  },
  LEGAL: {
    label: "📋 Datos legales y plazos",
    icon: Hash,
    desc: "Plazos de retracto, garantía, versiones de las políticas.",
  },
  COMMERCE: {
    label: "🛒 Comercio",
    icon: Hash,
    desc: "Tiempos de fabricación, cobertura de envío, datos del catálogo.",
  },
  SOCIAL: {
    label: "📱 Redes sociales",
    icon: Globe,
    desc: "Enlaces de Instagram, TikTok, Facebook, etc.",
  },
  EXTERNAL: {
    label: "🔗 Enlaces externos",
    icon: ExternalLink,
    desc: "URLs a procesadores de datos (DPA), gobierno, recursos externos.",
  },
  WHATSAPP: {
    label: "💬 Mensajes de WhatsApp",
    icon: MessageCircle,
    desc: "Plantillas pre-armadas que se envían al hacer click en botones de WhatsApp.",
  },
  COPYRIGHT: {
    label: "©️ Copyright y marca",
    icon: Copyright,
    desc: "Año del copyright, tagline, ubicación que se muestra en el pie.",
  },
  SEO: {
    label: "🔎 SEO",
    icon: Megaphone,
    desc: "Títulos y descripciones por defecto que ven los buscadores.",
  },
};

export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const cacheRefreshed = sp.cache === "refreshed";

  const settings = await listSiteSettings();

  const grouped = settings.reduce(
    (acc, s) => {
      (acc[s.category] ??= []).push(s);
      return acc;
    },
    {} as Record<string, typeof settings>,
  );

  const categories = Object.keys(grouped).sort();

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Cog className="h-5 w-5" />}
        title="Configuración del sitio"
        subtitle="Cambios guardados aquí se reflejan en el sitio inmediatamente y quedan registrados en auditoría."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Configuración" },
          { label: "General" },
        ]}
        actions={
          // Lucy 2026-07-23 — invalidar el caché público del CMS tras editar la DB
          // directo con scripts (los scripts no pueden llamar updateTag).
          <form action={refreshCmsCacheAction}>
            <input type="hidden" name="from" value="configuracion" />
            <AdminButton type="submit" variant="secondary">
              <RefreshCw className="h-4 w-4" />
              Actualizar caché de contenido
            </AdminButton>
          </form>
        }
      />

      <AdminPageBody>
        {cacheRefreshed && (
          <AdminNotice tone="success">
            Caché de contenido actualizado. El sitio público ya sirve la versión más reciente de
            bloques y configuración.
          </AdminNotice>
        )}
        {settings.length === 0 ? (
          <AdminEmpty
            icon={<Cog className="h-5 w-5" />}
            title="Todavía no hay configuraciones cargadas"
            description="Lo normal es que vengan pre-cargadas al instalar el sitio (correo, horario, número de WhatsApp). Pídele a soporte técnico que las cargue desde el seed."
          />
        ) : (
          <>
            <AdminNotice tone="info">
              Hay <strong>{settings.length}</strong> configuraciones disponibles agrupadas en{" "}
              <strong>{categories.length}</strong> categorías.
            </AdminNotice>

            {categories.map((cat) => {
              const info = CATEGORY_INFO[cat] ?? { label: cat, icon: Hash, desc: "" };
              return (
                <section key={cat}>
                  <div className="mb-2.5">
                    <h2 className="text-brand-purple-dark text-sm font-bold">{info.label}</h2>
                    {info.desc && <p className="text-brand-muted text-xs">{info.desc}</p>}
                  </div>
                  <AdminCard className="overflow-hidden">
                    <ul className="divide-brand-purple/10 divide-y">
                      {grouped[cat].map((s) => (
                        <SettingRow
                          key={s.id}
                          setting={{
                            id: s.id,
                            key: s.key,
                            value: s.value,
                            valueType: s.valueType,
                            label: s.label,
                            description: s.description,
                          }}
                        />
                      ))}
                    </ul>
                  </AdminCard>
                </section>
              );
            })}
          </>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
