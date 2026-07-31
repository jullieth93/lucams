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
import { getAccountTexts } from "../account-texts.server";

export const metadata: Metadata = {
  title: "Mis direcciones",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DireccionesPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta/direcciones");

  const [rows, texts] = await Promise.all([listAddresses(session.customer.id), getAccountTexts()]);
  const addresses: AddressView[] = rows.map((a) => ({
    id: a.id,
    name: a.name,
    line1: a.line1,
    city: a.city,
    department: a.department,
    phone: a.phone,
    isDefault: a.isDefault,
    structured: (a.structured as Record<string, unknown> | null) ?? null,
  }));

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/mi-cuenta"
        className="text-brand-muted hover:text-brand-purple mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ChevronLeft className="h-3 w-3" />
        {texts.back.miCuenta}
      </Link>
      <header className="mb-6">
        <h1 className="font-display text-brand-purple-dark text-3xl">{texts.address.title}</h1>
        <p className="text-brand-muted mt-1 text-sm">{texts.address.subtitle}</p>
      </header>

      <AddressManager addresses={addresses} texts={texts.address} />
    </div>
  );
}
