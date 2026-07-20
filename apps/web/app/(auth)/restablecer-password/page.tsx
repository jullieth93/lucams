import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RestablecerForm } from "./restablecer-form";

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

  return <RestablecerForm email={email} />;
}
