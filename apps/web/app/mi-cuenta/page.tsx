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
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/auth/logout/actions";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentCustomer } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Mi cuenta · Lucams_shop",
  description: "Gestiona tu cuenta Lucams_shop.",
};

export default async function MiCuentaPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta");

  const { customer } = session;
  const displayName = customer.firstName ?? customer.email.split("@")[0] ?? "Lucamer";

  return (
    <div className="bg-brand-cream min-h-screen">
      <header className="border-brand-purple/10 border-b bg-white px-6 py-6 sm:px-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <BrandMark size="sm" animated />
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
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <h1 className="font-display text-brand-purple-dark text-3xl">Hola, {displayName} 👋</h1>
            <p className="text-muted-foreground mt-1">Bienvenida a tu espacio Lucams.</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-brand-purple-dark text-xl">
                Tu perfil
              </CardTitle>
              <CardDescription>Esta es la información que tenemos de ti.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ProfileRow label="Nombre">
                {[customer.firstName, customer.lastName].filter(Boolean).join(" ") || "—"}
              </ProfileRow>
              <ProfileRow label="Correo">{customer.email}</ProfileRow>
              <ProfileRow label="Teléfono">{customer.phone ?? "—"}</ProfileRow>
              <ProfileRow label="Puntos Lucams">
                <span className="text-brand-purple font-semibold">{customer.loyaltyPoints}</span>
              </ProfileRow>
              <ProfileRow label="Código de referido">
                <code className="bg-brand-cream text-brand-purple-dark rounded px-2 py-1 font-mono text-sm">
                  {customer.referralCode}
                </code>
              </ProfileRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-brand-purple-dark text-xl">
                Pronto aquí
              </CardTitle>
              <CardDescription>Estamos preparando estas secciones para ti.</CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-2 text-sm">
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

function ProfileRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-brand-purple/10 flex flex-col gap-1 border-b py-2 last:border-0 sm:flex-row sm:items-center sm:gap-4">
      <dt className="text-muted-foreground text-sm sm:w-40">{label}</dt>
      <dd className="text-foreground text-base">{children}</dd>
    </div>
  );
}
