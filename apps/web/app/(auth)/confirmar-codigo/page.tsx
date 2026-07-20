import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfirmarForm } from "./confirmar-form";

export const metadata: Metadata = {
  title: "Confirma tu cuenta",
  description: "Ingresa el código de 6 dígitos que te enviamos por correo.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function ConfirmarCodigoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : undefined;
  const firstName = typeof sp.firstName === "string" ? sp.firstName : undefined;

  // Sin email no podemos verificar — el flujo solo tiene sentido tras /registro.
  if (!email) {
    redirect("/registro");
  }

  return <ConfirmarForm email={email} {...(firstName && { firstName })} />;
}
