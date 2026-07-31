import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RestablecerForm } from "./restablecer-form";
import { getAuthTexts } from "../auth-texts.server";

export const metadata: Metadata = {
  title: "Restablecer contraseña",
  description: "Ingresa el código que te enviamos por correo y tu nueva contraseña.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function RestablecerPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : undefined;

  // Sin email no se puede verificar el OTP. El user debió pasar por
  // /recuperar-password primero, que setea el query param.
  if (!email) {
    redirect("/recuperar-password?error=link-invalido");
  }

  // Roadmap B7 — textos del CMS con interpolación server-side de {email}.
  const texts = await getAuthTexts();
  const restablecer = {
    ...texts.restablecer,
    subtitle: texts.restablecer.subtitle.replace("{email}", email),
  };

  return <RestablecerForm texts={restablecer} email={email} />;
}
