import type { Metadata } from "next";
import { RegistroForm } from "./registro-form";
import { getAuthTexts } from "../auth-texts.server";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description: "Crea tu cuenta de Lucams_shop para empezar a personalizar tus productos.",
};

// CSP por nonce (C3): requiere render dinámico (los scripts necesitan el nonce).
export const dynamic = "force-dynamic";

export default async function RegistroPage() {
  // Roadmap B7 — textos de la pantalla resueltos del CMS (fallback = defaults).
  const texts = await getAuthTexts();
  return <RegistroForm texts={texts.registro} />;
}
