import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión · Lucams_shop",
  description: "Accede a tu cuenta de Lucams_shop.",
};

const ERROR_MESSAGES: Record<string, string> = {
  "link-invalido": "El link que abriste no es válido. Por favor inicia sesión.",
  "link-expirado": "El link expiró. Por favor solicita uno nuevo.",
};

const SUCCESS_MESSAGES: Record<string, string> = {
  ok: "Contraseña actualizada. Inicia sesión con la nueva.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const errorParam = typeof sp.error === "string" ? sp.error : undefined;
  const resetParam = typeof sp.reset === "string" ? sp.reset : undefined;
  const nextParam = typeof sp.next === "string" ? sp.next : undefined;

  const initialError = errorParam ? ERROR_MESSAGES[errorParam] : undefined;
  const initialSuccess = resetParam ? SUCCESS_MESSAGES[resetParam] : undefined;

  return (
    <LoginForm
      {...(initialError && { initialError })}
      {...(initialSuccess && { initialSuccess })}
      {...(nextParam && { next: nextParam })}
    />
  );
}
