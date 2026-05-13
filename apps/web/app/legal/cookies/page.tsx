import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";
import { CookiesReopenLink } from "@/components/cookies-banner";

export const metadata: Metadata = {
  title: "Política de Cookies",
};

const FALLBACK = `Usamos cookies para que el sitio funcione (autenticación, carrito) y para mejorar tu experiencia.

Detallamos cada cookie y su propósito en cumplimiento de la **Ley 1581 de 2012**.

## Cookies usadas

| Nombre | Propósito | Duración | Tipo |
|---|---|---|---|
| \`sb-access-token\` | Sesión de Supabase Auth | 1 hora | Necesaria |
| \`sb-refresh-token\` | Renovar sesión sin re-login | 7 días | Necesaria |
| \`cart_session\` | Carrito anónimo persistente | 30 días | Necesaria |
| \`cookie_consent_v1\` | Tus preferencias de cookies | 1 año | Necesaria |

Cuando agreguemos analíticas o marketing en el futuro, vas a poder optar (opt-in) desde el banner.

## Cambiar mis preferencias

Podés cambiar tu elección en cualquier momento haciendo click acá abajo.`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.cookies.heading" defaultTitle="Política de Cookies" />
      <CmsMarkdown blockKey="legal.cookies" fallback={FALLBACK} className="mt-6" />
      <div className="border-brand-purple/15 from-brand-purple/5 to-brand-pink/5 mt-8 rounded-2xl border bg-gradient-to-br p-5">
        <p className="text-brand-purple-dark/80 text-sm">
          ¿Querés cambiar qué cookies aceptás?{" "}
          <CookiesReopenLink>Abrir preferencias</CookiesReopenLink>
        </p>
      </div>
    </>
  );
}
