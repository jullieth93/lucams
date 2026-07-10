/*
 * /mi-cuenta/perfil — Editar datos del perfil (nombre + teléfono).
 * El correo no es editable acá (es la identidad de la cuenta).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentCustomer } from "@/lib/auth";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "Editar perfil",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta/perfil");
  const { customer } = session;

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
        <h1 className="font-display text-brand-purple-dark text-3xl">Editar perfil</h1>
        <p className="text-brand-muted mt-1 text-sm">
          Tu correo <span className="font-medium">{customer.email}</span> es tu identidad y no se
          cambia aquí.
        </p>
      </header>

      <div className="border-brand-purple/15 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <ProfileForm
          initial={{
            firstName: customer.firstName ?? "",
            lastName: customer.lastName ?? "",
            phone: customer.phone ?? "",
          }}
        />
      </div>
    </div>
  );
}
