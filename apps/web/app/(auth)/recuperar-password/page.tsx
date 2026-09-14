import type { Metadata } from "next";
import { RecuperarForm } from "./recuperar-form";
import { getAuthTexts } from "../auth-texts.server";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  description: "Recupera el acceso a tu cuenta Lucams_shop.",
  robots: { index: false, follow: false },
};

// CSP por nonce (C3) requiere render dinámico: una página estática se prerenderea
// sin nonce y sus scripts quedarían bloqueados. Forzamos dinámico.
export const dynamic = "force-dynamic";

export default async function RecuperarPasswordPage() {
  // Roadmap B7 — textos de la pantalla resueltos del CMS (fallback = defaults).
  const texts = await getAuthTexts();
  return <RecuperarForm texts={texts.recuperar} />;
}
