import type { Metadata } from "next";
import { RegistroForm } from "./registro-form";

export const metadata: Metadata = {
  title: "Crear cuenta · Lucams_shop",
  description: "Crea tu cuenta de Lucams_shop para empezar a personalizar tus imanes.",
};

export default function RegistroPage() {
  return <RegistroForm />;
}
