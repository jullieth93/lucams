import type { Metadata } from "next";
import { RecuperarForm } from "./recuperar-form";

export const metadata: Metadata = {
  title: "Recuperar contraseña · Lucams_shop",
  description: "Recupera el acceso a tu cuenta Lucams_shop.",
};

export default function RecuperarPasswordPage() {
  return <RecuperarForm />;
}
