import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión · Lucams_shop",
  description: "Accede a tu cuenta de Lucams_shop.",
};

export default function LoginPage() {
  return <LoginForm />;
}
