/*
 * /status — Página pública de estado del sitio.
 *
 * Consulta los endpoints internos /api/health/* y muestra dots
 * verde/amarillo/rojo por servicio. Útil para que clientes puedan
 * verificar si "el sitio está caído" sin esperar respuesta del soporte.
 *
 * Chequea en vivo: /api/health (web), /api/health/db, /api/health/storage,
 * /api/health/resend y — en modo full — /api/health/wompi (pagos) y
 * /api/health/aveonline (envíos). En modo catálogo los pagos en línea aún
 * no aplican (se declaran "Pendiente") y los envíos integrados no se listan.
 * Página PÚBLICA: solo se muestra el estado, nunca los detalles internos
 * de los endpoints (lib/public-status.ts decide el veredicto).
 */

import type { Metadata } from "next";
import { CmsText } from "@/components/cms/cms-text";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCmsBlock } from "@/lib/cms";
import {
  aveonlinePublicVerdict,
  wompiPublicVerdict,
  type HealthBody,
  type PublicHealthVerdict,
  type PublicServiceState,
} from "@/lib/public-status";
import { isCatalogMode } from "@/lib/store-mode";

export const metadata: Metadata = {
  title: "Estado del sitio",
  description: "Estado en tiempo real de los servicios de Lucams_shop.",
};

export const dynamic = "force-dynamic";

type ServiceStatus = {
  name: string;
  description: string;
  status: PublicServiceState;
  latencyMs?: number;
  detail?: string;
};

async function checkService(
  label: string,
  description: string,
  path: string,
): Promise<ServiceStatus> {
  try {
    // El dev server del proyecto corre en :4000 (ver Makefile / playwright.config.ts).
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4000";
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
  } catch {
    // Detalle genérico a propósito (auditoría 2026-08-24, A-6): `err.message` de un
    // fetch server-side puede arrastrar hostnames internos o causas de red
    // ("getaddrinfo ENOTFOUND …") — reconocimiento gratis en una página pública.
    // El error real queda server-side vía instrumentation.ts (onRequestError → ErrorLog).
    return { name: label, description, status: "down", detail: "sin respuesta" };
  }
}

/**
 * Chequeo de un health endpoint que consulta un tercero (Wompi, Aveonline).
 * El veredicto (incl. rate_limited/skipped ≠ caída) lo decide lib/public-status.
 * Timeout más holgado que checkService: el endpoint ya tiene su propio timeout
 * interno (~6s) y conviene esperar SU veredicto en vez de abortar antes.
 */
async function checkThirdParty(
  label: string,
  description: string,
  path: string,
  verdict: (httpStatus: number, body: HealthBody) => PublicHealthVerdict,
): Promise<ServiceStatus> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4000";
    const r = await fetch(`${baseUrl}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const body = (await r.json().catch(() => null)) as HealthBody;
    return { name: label, description, ...verdict(r.status, body) };
  } catch {
    // Mismo criterio que checkService (A-6): detalle genérico en página pública.
    return { name: label, description, status: "down", detail: "sin respuesta" };
  }
}

export default async function StatusPage() {
  const catalog = isCatalogMode();
  const [web, db, storage, resend, wompi, aveonline] = await Promise.all([
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
    // En modo catálogo los pagos en línea llegan con la Etapa 2: se declaran
    // "Pendiente" en vez de sondear un Wompi intencionalmente apagado.
    catalog
      ? Promise.resolve<ServiceStatus>({
          name: "Pagos (Wompi)",
          description: "Procesamiento de tarjetas y PSE",
          status: "pending",
          detail: "Llega con la Etapa 2 (pagos en línea)",
        })
      : checkThirdParty(
          "Pagos (Wompi)",
          "Procesamiento de tarjetas y PSE",
          "/api/health/wompi",
          wompiPublicVerdict,
        ),
    // Los envíos integrados no aplican en modo catálogo: no se listan.
    catalog
      ? Promise.resolve(null)
      : checkThirdParty(
          "Envíos (Aveonline)",
          "Cotización y despacho con transportadoras",
          "/api/health/aveonline",
          aveonlinePublicVerdict,
        ),
  ]);

  const services: ServiceStatus[] = [web, db, storage, resend, wompi];
  if (aveonline) services.push(aveonline);
  const allOk = services.every((s) => s.status === "ok" || s.status === "pending");
  const anyDown = services.some((s) => s.status === "down");

  // Pastilla de resumen: textos editables desde /admin/contenido (página
  // "Errores y estados", sección "Estado del sitio").
  const [summaryOk, summaryDown, summaryChecking] = await Promise.all([
    getCmsBlock("status.summary.ok"),
    getCmsBlock("status.summary.down"),
    getCmsBlock("status.summary.checking"),
  ]);
  const summaryText = anyDown
    ? (summaryDown?.body ?? "Algunos servicios con problemas")
    : allOk
      ? (summaryOk?.body ?? "Todos los servicios operativos")
      : (summaryChecking?.body ?? "Verificando...");

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
              {summaryText}
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
                        : s.status === "warn"
                          ? "bg-amber-500"
                          : "bg-slate-300")
                  }
                  aria-hidden="true"
                />
                <div className="flex-1">
                  <p className="text-brand-purple-dark text-sm font-semibold">{s.name}</p>
                  <p className="text-brand-muted mt-0.5 text-xs">{s.description}</p>
                  {s.detail && (
                    <p
                      className={
                        "mt-1 text-xs " +
                        (s.status === "down"
                          ? "text-red-700"
                          : s.status === "warn"
                            ? "text-amber-700"
                            : "text-slate-500")
                      }
                    >
                      {s.detail}
                    </p>
                  )}
                </div>
                <span className="text-brand-muted text-xs tabular-nums">
                  {s.status === "ok" && s.latencyMs != null && `${s.latencyMs}ms`}
                  {s.status === "down" && "Caído"}
                  {s.status === "warn" && "Intermitente"}
                  {s.status === "pending" && "Pendiente"}
                </span>
              </div>
            ))}
          </div>

          <p className="text-brand-muted mt-6 text-center text-xs">
            <CmsText blockKey="status.verified-note" fallback="Verificado en tiempo real" /> ·{" "}
            {new Date().toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
