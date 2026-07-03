/*
 * /status — Página pública de estado del sitio.
 *
 * Consulta los endpoints internos /api/health/* y muestra dots
 * verde/amarillo/rojo por servicio. Útil para que clientes puedan
 * verificar si "el sitio está caído" sin esperar respuesta del soporte.
 *
 * Por ahora solo /api/health/db existe (creado en A). Cuando F sume
 * /api/health/storage + /api/health/resend + /api/health/all, los
 * agregamos a la lista de SERVICES. No bloqueamos el cierre de E:
 * los faltantes muestran "Pendiente" hasta que F los implemente.
 */

import type { Metadata } from "next";
import { CmsText } from "@/components/cms/cms-text";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Estado del sitio",
  description: "Estado en tiempo real de los servicios de Lucams_shop.",
};

export const dynamic = "force-dynamic";

type ServiceStatus = {
  name: string;
  description: string;
  status: "ok" | "down" | "pending";
  latencyMs?: number;
  detail?: string;
};

async function checkService(
  label: string,
  description: string,
  path: string,
): Promise<ServiceStatus> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const r = await fetch(`${baseUrl}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) {
      return { name: label, description, status: "down", detail: `HTTP ${r.status}` };
    }
    const data = (await r.json()) as { latencyMs?: number };
    return {
      name: label,
      description,
      status: "ok",
      latencyMs: typeof data.latencyMs === "number" ? data.latencyMs : undefined,
    };
  } catch (err) {
    return {
      name: label,
      description,
      status: "down",
      detail: err instanceof Error ? err.message.slice(0, 60) : "desconocido",
    };
  }
}

export default async function StatusPage() {
  const [web, db, storage, resend] = await Promise.all([
    checkService("Sitio web (Vercel)", "Storefront público y admin", "/api/health"),
    checkService("Base de datos (Postgres)", "Catálogo, pedidos, contenido CMS", "/api/health/db"),
    checkService(
      "Almacenamiento de imágenes (Supabase Storage)",
      "Fotos de productos",
      "/api/health/storage",
    ),
    checkService(
      "Envío de emails (Resend)",
      "Confirmaciones, OTP, recuperación de password",
      "/api/health/resend",
    ),
  ]);

  // Wompi se mide cuando la integración esté productiva (Fase 3).
  const pending: ServiceStatus[] = [
    {
      name: "Pagos (Wompi)",
      description: "Procesamiento de tarjetas y PSE",
      status: "pending",
      detail: "Integración completa en Fase 3",
    },
  ];

  const services: ServiceStatus[] = [web, db, storage, resend, ...pending];
  const allOk = services.every((s) => s.status === "ok" || s.status === "pending");
  const anyDown = services.some((s) => s.status === "down");

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />

      <main id="contenido" tabIndex={-1} className="flex-1 px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-2xl">
          <header className="mb-8 text-center">
            <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
              <CmsText blockKey="status.heading" fallback="Estado de Lucams_shop" />
            </h1>
            <div
              className={
                "mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold " +
                (anyDown
                  ? "bg-red-100 text-red-800"
                  : allOk
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800")
              }
            >
              <span
                className={
                  "h-2 w-2 rounded-full " +
                  (anyDown ? "bg-red-500" : allOk ? "bg-emerald-500" : "bg-amber-500")
                }
              />
              {anyDown
                ? "Algunos servicios con problemas"
                : allOk
                  ? "Todos los servicios operativos"
                  : "Verificando..."}
            </div>
          </header>

          <div className="border-brand-purple/15 divide-brand-purple/10 divide-y rounded-2xl border bg-white">
            {services.map((s) => (
              <div key={s.name} className="flex items-start gap-3 px-5 py-4">
                <span
                  className={
                    "mt-1 inline-block h-3 w-3 flex-shrink-0 rounded-full " +
                    (s.status === "ok"
                      ? "bg-emerald-500"
                      : s.status === "down"
                        ? "bg-red-500"
                        : "bg-slate-300")
                  }
                  aria-hidden="true"
                />
                <div className="flex-1">
                  <p className="text-brand-purple-dark text-sm font-semibold">{s.name}</p>
                  <p className="text-brand-purple-dark/60 mt-0.5 text-xs">{s.description}</p>
                  {s.detail && (
                    <p
                      className={
                        "mt-1 text-xs " + (s.status === "down" ? "text-red-700" : "text-slate-500")
                      }
                    >
                      {s.detail}
                    </p>
                  )}
                </div>
                <span className="text-brand-purple-dark/60 text-xs tabular-nums">
                  {s.status === "ok" && s.latencyMs != null && `${s.latencyMs}ms`}
                  {s.status === "down" && "Caído"}
                  {s.status === "pending" && "Pendiente"}
                </span>
              </div>
            ))}
          </div>

          <p className="text-brand-purple-dark/55 mt-6 text-center text-xs">
            Verificado en tiempo real ·{" "}
            {new Date().toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
