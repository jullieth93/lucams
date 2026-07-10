/*
 * /mi-cuenta/direcciones — Direcciones guardadas del cliente (CRUD).
 * Se usan para agilizar el checkout. El aislamiento es por customerId.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentCustomer } from "@/lib/auth";
import { listAddresses } from "@/features/addresses/service";
import { AddressManager, type AddressView } from "./address-manager";

export const metadata: Metadata = {
  title: "Mis direcciones",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DireccionesPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta/direcciones");

  const rows = await listAddresses(session.customer.id);
  const addresses: AddressView[] = rows.map((a) => ({
    id: a.id,
    name: a.name,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    department: a.department,
    zip: a.zip,
    phone: a.phone,
    isDefault: a.isDefault,
  }));

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/mi-cuenta"
        className="text-brand-muted hover:text-brand-purple mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ChevronLeft className="h-3 w-3" />
        Mi cuenta
      </Link>
      <header className="mb-6">
        <h1 className="font-display text-brand-purple-dark text-3xl">Mis direcciones</h1>
        <p className="text-brand-muted mt-1 text-sm">
          Guárdalas para que tu próximo pedido sea más rápido.
        </p>
      </header>

      <AddressManager addresses={addresses} />
    </div>
  );
}
