import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "./login-form";
import { getCurrentAdmin } from "@/lib/auth";
import { AuthScene } from "@/components/auth/auth-scene";
import { BrandMark } from "@/components/brand-mark";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Acceso al panel administrativo de Lucams Shop.",
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
    <main
      id="contenido"
      tabIndex={-1}
      className="from-brand-purple-dark via-brand-purple to-brand-pink relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br px-4 py-12"
    >
      <AuthScene variant="dark" />
      {/* El logo va en insignia blanca (mismo patrón del sidebar): el wordmark
          del PNG es oscuro y sobre el gradiente morado no se leería. */}
      <div className="auth-card-in relative z-10 mb-6 rounded-2xl bg-white/95 p-3 shadow-xl ring-1 ring-white/40">
        <BrandMark size="md" animated />
      </div>
      {expired === "1" && (
        <div className="auth-card-in relative z-10 mb-4 w-full max-w-md rounded-xl border border-white/25 bg-white/15 px-4 py-3 text-sm font-medium text-white shadow-lg backdrop-blur-md">
          Cerramos tu sesión por inactividad (30 minutos). Vuelve a iniciar sesión.
        </div>
      )}
      <div className="relative z-10 w-full max-w-md">
        <AdminLoginForm />
      </div>
    </main>
  );
}
