import type { Metadata } from "next";
import { RecuperarForm } from "./recuperar-form";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  description: "Recupera el acceso a tu cuenta Lucams_shop.",
};

// CSP por nonce (C3) requiere render dinámico: una página estática se prerenderea
// sin nonce y sus scripts quedarían bloqueados. Forzamos dinámico.
export const dynamic = "force-dynamic";

export default function RecuperarPasswordPage() {
  return <RecuperarForm />;
}
