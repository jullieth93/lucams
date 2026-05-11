import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "./login-form";
import { getCurrentAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Acceso al panel administrativo de Lucams_shop.",
};

export default async function AdminLoginPage() {
  // Si ya estás autenticado COMO ADMIN, te llevamos al dashboard.
  const session = await getCurrentAdmin();
  if (session) redirect("/admin/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12 bg-slate-50">
      <AdminLoginForm />
    </main>
  );
}
