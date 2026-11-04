/*
 * RETIRO DE PLACEHOLDER (`Fase 12 · S26`, `ADR-193`):
 * `/admin/bot` ("Bot WhatsApp IA" autónomo) se descarta por riesgo de promesas
 * comerciales/legales no autorizadas y se reemplaza por el Copiloto ARM
 * Human-in-the-Loop integrado directamente en `/admin/soporte/[id]`.
 */

import { permanentRedirect, redirect } from "next/navigation";

export default function RetiredBotRedirectPage() {
  permanentRedirect("/admin/soporte");
  redirect("/admin/soporte");
}
