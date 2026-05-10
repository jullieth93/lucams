/*
 * Página de cuenta del cliente — /mi-cuenta.
 *
 * Acceso restringido: redirige a /login si no hay sesión o si el user no
 * tiene fila en Customer (excluye admins puros sin perfil cliente).
 *
 * Versión inicial: solo muestra datos del perfil + logout. En siguientes
 * iteraciones se añaden secciones:
 *   - Mis órdenes (tabla con histórico)
 *   - Mis direcciones (CRUD)
 *   - Mis puntos Lucams (loyalty)
 *   - Cambiar contraseña
 *   - Borrar cuenta (Ley 1581 art. 8 — derecho de supresión)
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/auth/logout/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentCustomer } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Mi cuenta · Lucams_shop",
  description: "Gestiona tu cuenta Lucams_shop.",
};

export default async function MiCuentaPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta");

  const { customer } = session;
  const displayName =
    customer.firstName ?? customer.email.split("@")[0] ?? "Lucamer";

  return (
    <div className="min-h-screen bg-brand-cream">
      <header className="px-6 py-6 sm:px-10 border-b border-brand-purple/10 bg-white">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-baseline gap-2 group"
            aria-label="Inicio Lucams_shop"
          >
            <span className="font-display text-2xl font-bold tracking-tight text-brand-purple-dark group-hover:text-brand-purple transition-colors">
              Lucams
            </span>
            <span className="font-display text-lg text-brand-pink group-hover:text-brand-coral transition-colors">
              shop
            </span>
          </Link>
          <form action={logoutAction}>
            <Button
              type="submit"
              variant="ghost"
              className="text-brand-purple-dark hover:text-brand-purple"
            >
              Cerrar sesión
            </Button>
          </form>
        </div>
      </header>

      <main className="px-4 py-10 sm:py-14">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="font-display text-3xl text-brand-purple-dark">
              Hola, {displayName} 👋
            </h1>
            <p className="text-muted-foreground mt-1">
              Bienvenida a tu espacio Lucams.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-xl text-brand-purple-dark">
                Tu perfil
              </CardTitle>
              <CardDescription>
                Esta es la información que tenemos de ti.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ProfileRow label="Nombre">
                {[customer.firstName, customer.lastName]
                  .filter(Boolean)
                  .join(" ") || "—"}
              </ProfileRow>
              <ProfileRow label="Correo">{customer.email}</ProfileRow>
              <ProfileRow label="Teléfono">{customer.phone ?? "—"}</ProfileRow>
              <ProfileRow label="Puntos Lucams">
                <span className="font-semibold text-brand-purple">
                  {customer.loyaltyPoints}
                </span>
              </ProfileRow>
              <ProfileRow label="Código de referido">
                <code className="rounded bg-brand-cream px-2 py-1 text-sm font-mono text-brand-purple-dark">
                  {customer.referralCode}
                </code>
              </ProfileRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-xl text-brand-purple-dark">
                Pronto aquí
              </CardTitle>
              <CardDescription>
                Estamos preparando estas secciones para ti.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>· Mis órdenes — histórico de compras + tracking.</p>
              <p>· Mis direcciones — guardadas para checkout rápido.</p>
              <p>· Mis reseñas — productos que has calificado.</p>
              <p>· Cambiar contraseña.</p>
              <p>· Borrar mi cuenta (Ley 1581).</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function ProfileRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2 border-b border-brand-purple/10 last:border-0">
      <dt className="text-sm text-muted-foreground sm:w-40">{label}</dt>
      <dd className="text-base text-foreground">{children}</dd>
    </div>
  );
}
