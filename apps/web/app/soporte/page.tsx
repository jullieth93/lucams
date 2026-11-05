/*
 * `/soporte` — Entrada pública unificada al soporte de Lucams Shop.
 *
 * - Si el visitante tiene sesión de cliente activa (y NO es miembro del equipo
 *   interno `AdminUser`), lo lleva directo a su bandeja autenticada `/mi-cuenta/soporte`.
 * - Si es invitado o miembro del staff navegando la tienda, lo lleva a `/contacto`
 *   para radicar una solicitud (y seguirla luego vía `/soporte/[token]`).
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAdmin, getCurrentCustomer } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Soporte al cliente",
  description: "Crea o haz seguimiento a tus solicitudes de atención en Lucams Shop.",
};

export const dynamic = "force-dynamic";

export default async function PublicSupportIndexPage() {
  const [customerSession, admin] = await Promise.all([getCurrentCustomer(), getCurrentAdmin()]);

  if (customerSession && !admin) {
    redirect("/mi-cuenta/soporte");
  }

  redirect("/contacto");
}
