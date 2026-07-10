/*
 * /mi-cuenta/eliminar — Eliminar cuenta (derecho de supresión, Ley 1581).
 * Explica qué se borra y qué se conserva (retención fiscal DIAN) antes de confirmar.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import { getCurrentCustomer } from "@/lib/auth";
import { DeleteAccountForm } from "./delete-account-form";

export const metadata: Metadata = {
  title: "Eliminar cuenta",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EliminarCuentaPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta/seguridad");

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/mi-cuenta/seguridad"
        className="text-brand-muted hover:text-brand-purple mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ChevronLeft className="h-3 w-3" />
        Seguridad
      </Link>
      <header className="mb-6">
        <h1 className="font-display flex items-center gap-2 text-3xl text-rose-800">
          <TriangleAlert className="h-7 w-7" />
          Eliminar mi cuenta
        </h1>
        <p className="text-brand-muted mt-2 text-sm">
          Esta acción es <strong>permanente</strong> y no se puede deshacer.
        </p>
      </header>

      <div className="border-brand-purple/15 mb-6 rounded-2xl border bg-white p-5 text-sm shadow-sm sm:p-6">
        <p className="text-brand-purple-dark font-semibold">Qué pasa cuando eliminas tu cuenta:</p>
        <ul className="text-brand-muted mt-2 space-y-1.5">
          <li>· Borramos tu nombre, teléfono, documento y direcciones guardadas.</li>
          <li>· No podrás volver a iniciar sesión con este correo.</li>
          <li>· Tus reseñas se conservan, pero sin tu nombre.</li>
          <li>
            · Por ley (facturación DIAN) debemos <strong>conservar tus pedidos</strong>, pero quedan
            desligados de tus datos personales.
          </li>
        </ul>
        <p className="text-brand-muted mt-3 text-xs">
          ¿Prefieres que lo hagamos por ti o tienes dudas? Escríbenos a{" "}
          <a href="mailto:habeas-data@lucamsshop.co" className="text-brand-pink-ink font-medium">
            habeas-data@lucamsshop.co
          </a>
          .
        </p>
      </div>

      <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 shadow-sm sm:p-6">
        <DeleteAccountForm />
      </div>
    </div>
  );
}
