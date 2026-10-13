import type { Metadata } from "next";
import { RegistroForm } from "./registro-form";
import { getAuthTexts } from "../auth-texts.server";
import { getReferralSettings } from "@/features/loyalty/settings";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description: "Crea tu cuenta de Lucams Shop para empezar a personalizar tus productos.",
  robots: { index: false, follow: false },
};

// CSP por nonce (C3): requiere render dinámico (los scripts necesitan el nonce).
export const dynamic = "force-dynamic";

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  // Roadmap B7 — textos de la pantalla resueltos del CMS (fallback = defaults).
  const texts = await getAuthTexts();
  // Referidos v1 — prefill del código desde el link de compartir (?ref=LCS-…).
  const { ref } = await searchParams;
  const initialReferralCode =
    typeof ref === "string" && /^[A-Za-z0-9-]{4,20}$/.test(ref.trim())
      ? ref.trim().toUpperCase()
      : undefined;
  // El hint del campo interpola el % VIGENTE del programa (config de
  // /admin/fidelizacion), no un "10" quemado (2026-10-12).
  const referralSettings = await getReferralSettings();
  return (
    <RegistroForm
      texts={texts.registro}
      initialReferralCode={initialReferralCode}
      referralPercent={referralSettings.rewardPercent}
    />
  );
}
