import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "./login-form";
import { getCurrentAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Acceso al panel administrativo de Lucams_shop.",
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Si ya estás autenticado COMO ADMIN, te llevamos al dashboard.
  const session = await getCurrentAdmin();
  if (session) redirect("/admin/dashboard");

  const { expired } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      {expired === "1" && (
        <div className="mb-4 w-full max-w-sm rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Cerramos tu sesión por inactividad (30 minutos). Vuelve a iniciar sesión.
        </div>
      )}
      <AdminLoginForm />
    </main>
  );
}
