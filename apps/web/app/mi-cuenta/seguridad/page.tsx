/*
 * /mi-cuenta/seguridad — Cambiar contraseña + zona de peligro (eliminar cuenta).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ShieldCheck, TriangleAlert } from "lucide-react";
import { getCurrentCustomer } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = {
  title: "Seguridad",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SeguridadPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta/seguridad");

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/mi-cuenta"
        className="text-brand-muted hover:text-brand-purple mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ChevronLeft className="h-3 w-3" />
        Mi cuenta
      </Link>
      <header className="mb-6">
        <h1 className="font-display text-brand-purple-dark text-3xl">Seguridad</h1>
        <p className="text-brand-muted mt-1 text-sm">Administra el acceso a tu cuenta.</p>
      </header>

      <section className="border-brand-purple/15 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-brand-purple-dark font-display mb-4 flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5" />
          Cambiar contraseña
        </h2>
        <ChangePasswordForm />
      </section>

      {/* Zona de peligro */}
      <section className="mt-6 rounded-2xl border border-rose-200 bg-rose-50/50 p-5 shadow-sm sm:p-6">
        <h2 className="font-display mb-1 flex items-center gap-2 text-lg text-rose-900">
          <TriangleAlert className="h-5 w-5" />
          Eliminar mi cuenta
        </h2>
        <p className="text-sm text-rose-800/90">
          Borra tus datos personales de forma permanente (Ley 1581). Tus pedidos se conservan
          anonimizados por obligación fiscal.
        </p>
        <Link
          href="/mi-cuenta/eliminar"
          className="mt-4 inline-flex items-center gap-1 rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
        >
          Continuar a eliminar cuenta
        </Link>
      </section>
    </div>
  );
}
