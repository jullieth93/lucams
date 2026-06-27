/*
 * /unsubscribe?email=...&token=... — Cancelar suscripción al newsletter.
 *
 * P0-005 (Bloque B 2026-06-27) — Ley 1581: el titular puede revocar su
 * consentimiento en cualquier momento de forma sencilla y gratuita.
 *
 * El link llega desde el correo de bienvenida con email + token. Verificamos
 * el token (timing-safe) y registramos la revocación en Consent + marcamos
 * unsubscribed en Resend. Es un Server Component que ejecuta la baja al cargar
 * (un solo click desde el correo, sin pasos extra).
 *
 * robots: noindex — no debe indexarse.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { unsubscribeNewsletter } from "@/features/newsletter/unsubscribe";

export const metadata: Metadata = {
  title: "Cancelar suscripción",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ email?: string; token?: string }>;

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  const token = typeof sp.token === "string" ? sp.token : "";

  let outcome: "ok" | "already" | "invalid" | "missing";
  if (!email || !token) {
    outcome = "missing";
  } else {
    const result = await unsubscribeNewsletter(email, token);
    if (!result.ok) outcome = "invalid";
    else outcome = result.alreadyUnsubscribed ? "already" : "ok";
  }

  const ok = outcome === "ok" || outcome === "already";

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="bg-brand-cream flex flex-1 items-center justify-center px-6 py-16">
        <div className="mx-auto max-w-md text-center">
          <div
            className={
              "inline-flex h-20 w-20 items-center justify-center rounded-full ring-8 " +
              (ok ? "bg-emerald-50 ring-emerald-100" : "bg-rose-50 ring-rose-100")
            }
          >
            {ok ? (
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            ) : (
              <XCircle className="h-12 w-12 text-rose-600" />
            )}
          </div>

          <h1 className="font-display text-brand-purple-dark mt-6 text-3xl font-bold">
            {outcome === "ok" && "Listo, cancelamos tu suscripción"}
            {outcome === "already" && "Ya estabas dado de baja"}
            {outcome === "invalid" && "No pudimos verificar el enlace"}
            {outcome === "missing" && "Enlace incompleto"}
          </h1>

          <p className="text-brand-purple-dark/75 mx-auto mt-3 text-sm sm:text-base">
            {outcome === "ok" &&
              "No volverás a recibir nuestros correos de novedades. Si fue un error, puedes volver a suscribirte cuando quieras desde el sitio."}
            {outcome === "already" &&
              "Tu correo no está en nuestra lista de novedades. No tienes que hacer nada más."}
            {outcome === "invalid" &&
              "El enlace no es válido o ya expiró. Si quieres dejar de recibir nuestros correos, escríbenos a hola@lucamsshop.co y lo hacemos enseguida."}
            {outcome === "missing" &&
              "Abre el enlace completo desde el correo que te enviamos, o escríbenos a hola@lucamsshop.co para darte de baja."}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/">
              <Button
                size="lg"
                variant="outline"
                className="border-brand-purple/30 text-brand-purple-dark"
              >
                Volver al inicio
              </Button>
            </Link>
            {!ok && (
              <Link href="/contacto">
                <Button size="lg" className="bg-gradient-brand text-white hover:brightness-110">
                  Contactar soporte
                </Button>
              </Link>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
