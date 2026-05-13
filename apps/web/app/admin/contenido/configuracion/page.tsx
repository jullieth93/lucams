/*
 * Admin > Contenido > Configuración del sitio.
 *
 * Lista todos los SiteSettings agrupados por categoría. Cada fila se
 * edita inline (sin abrir formulario aparte). Edit pone toast al
 * guardar.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Mail,
  Phone,
  Globe,
  Hash,
  Clock,
  ExternalLink,
  MessageCircle,
  Copyright,
  Megaphone,
} from "lucide-react";
import { listSiteSettings } from "@/features/cms/service";
import { getCurrentAdmin } from "@/lib/auth";
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

export default async function ConfiguracionPage() {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const settings = await listSiteSettings();

  if (settings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <Mail className="mx-auto h-8 w-8 text-slate-400" />
        <p className="mt-3 font-medium text-slate-700">Todavía no hay configuraciones cargadas.</p>
        <p className="mt-1 text-sm text-slate-500">
          Lo normal es que vengan pre-cargadas al instalar el sitio (correo, horario, número de
          WhatsApp). Pídele a soporte técnico que las cargue desde el seed de configuración.
        </p>
      </div>
    );
  }

  // Agrupar por categoría
  const grouped = settings.reduce(
    (acc, s) => {
      (acc[s.category] ??= []).push(s);
      return acc;
    },
    {} as Record<string, typeof settings>,
  );

  const categories = Object.keys(grouped).sort();

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Cambios guardados aquí se reflejan en el sitio inmediatamente. Cada cambio queda registrado
        en el historial de admin.
      </p>

      {categories.map((cat) => {
        const info = CATEGORY_INFO[cat] ?? {
          label: cat,
          icon: Hash,
          desc: "",
        };
        return (
          <section key={cat}>
            <div className="mb-2">
              <h2 className="text-sm font-semibold text-slate-700">{info.label}</h2>
              {info.desc && <p className="text-xs text-slate-500">{info.desc}</p>}
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <ul className="divide-y divide-slate-100">
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
            </div>
          </section>
        );
      })}
    </div>
  );
}
