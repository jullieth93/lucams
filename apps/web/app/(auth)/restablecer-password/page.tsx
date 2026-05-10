import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RestablecerForm } from "./restablecer-form";

export const metadata: Metadata = {
  title: "Nueva contraseña · Lucams_shop",
  description: "Establece una nueva contraseña para tu cuenta Lucams.",
};

export default async function RestablecerPasswordPage() {
  // Esta página requiere sesión activa (la temporal del flujo de recovery).
  // Si llegan acá sin sesión, mandamos a /login con instrucciones.
  const user = await getCurrentUser();
  if (!user) {
    redirect("/recuperar-password?error=link-invalido");
  }

  return <RestablecerForm />;
}
