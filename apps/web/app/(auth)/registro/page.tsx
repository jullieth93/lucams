import type { Metadata } from "next";
import { RegistroForm } from "./registro-form";

export const metadata: Metadata = {
  title: "Crear cuenta · Lucams_shop",
  description: "Crea tu cuenta de Lucams_shop para empezar a personalizar tus imanes.",
};

// CSP por nonce (C3): requiere render dinámico (los scripts necesitan el nonce).
export const dynamic = "force-dynamic";

export default function RegistroPage() {
  return <RegistroForm />;
}
