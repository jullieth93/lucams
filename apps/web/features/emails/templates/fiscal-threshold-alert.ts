/*
 * Template: Alerta INTERNA de vigilancia fiscal (ADR-196) al owner cuando una
 * regla cruza el 90 % o el 100 % de su umbral DIAN (tope de facturación
 * electrónica 3 500 UVT, condición de IVA por ventas con tarjeta).
 *
 * La dispara runFiscalWatch (cron diario 07:00 COT) UNA vez por cruce de nivel
 * y por año (dedup `emailedLevel` en AlertState["fiscal-watch:<regla>:<año>"]).
 * Es correo de ACCIÓN, no informativo: incluye la ruta de habilitación DIAN.
 */

import { renderEmailLayout, escapeHtml, ctaButton, getSiteUrl } from "../layout";
import { formatCOP } from "@/lib/format";

export type FiscalThresholdAlertData = {
  ruleName: string;
  legalBasis: string;
  action: string;
  year: number;
  /** "90 %" o "100 %" — el nivel recién cruzado. */
  levelLabel: string;
  thresholdUvt: number;
  currentCop: number;
  thresholdCop: number;
  currentPct: number;
  projectedCop: number;
  projectedPct: number;
  uvtCop: number;
};

export async function fiscalThresholdAlertEmail(data: FiscalThresholdAlertData) {
  const siteUrl = await getSiteUrl();
  const metricsUrl = `${siteUrl}/admin/metricas`;
  const crossed = data.levelLabel === "100 %";

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:20px;color:#3D2E5C;">${crossed ? "🚨" : "⚠️"} Vigilancia fiscal: ${escapeHtml(data.ruleName)}</h1>
<p style="margin:0 0 12px 0;font-size:14px;color:#3D2E5C;">El acumulado del año <strong>${data.year}</strong> cruzó el <strong>${escapeHtml(data.levelLabel)}</strong> del umbral normativo (${escapeHtml(data.legalBasis)}).</p>
<table cellpadding="0" cellspacing="0" border="0" style="font-size:14px;width:100%;border-collapse:collapse;">
  <tr><td style="color:#3D2E5C;opacity:0.6;padding:5px 0;width:170px;">Acumulado ${data.year}:</td><td style="padding:5px 0;"><strong>${formatCOP(data.currentCop)}</strong> (${data.currentPct} %)</td></tr>
  <tr><td style="color:#3D2E5C;opacity:0.6;padding:5px 0;">Umbral (${data.thresholdUvt.toLocaleString("es-CO")} UVT):</td><td style="padding:5px 0;">${formatCOP(data.thresholdCop)}</td></tr>
  <tr><td style="color:#3D2E5C;opacity:0.6;padding:5px 0;">Proyección de cierre:</td><td style="padding:5px 0;"><strong>${formatCOP(data.projectedCop)}</strong> (${data.projectedPct} %)</td></tr>
  <tr><td style="color:#3D2E5C;opacity:0.6;padding:5px 0;">UVT ${data.year} aplicada:</td><td style="padding:5px 0;">$${data.uvtCop.toLocaleString("es-CO")} COP</td></tr>
</table>

<p style="background:#FFF8F0;padding:12px 14px;border-radius:8px;font-size:14px;line-height:1.6;margin:14px 0 0 0;"><strong>Qué hacer:</strong> ${escapeHtml(data.action)}</p>

${ctaButton(metricsUrl, "Ver vigilancia fiscal en /admin/metricas →")}

<p style="font-size:13px;color:#3D2E5C;opacity:0.75;margin-top:14px;">Esta alerta sale una sola vez por cruce de nivel (90 % / 100 %) y por año. El seguimiento diario queda en /admin/hoy y /admin/notificaciones.</p>
`;

  const text = `Vigilancia fiscal: ${data.ruleName} — cruce del ${data.levelLabel} (${data.legalBasis})

Acumulado ${data.year}: ${formatCOP(data.currentCop)} (${data.currentPct} %)
Umbral (${data.thresholdUvt.toLocaleString("es-CO")} UVT): ${formatCOP(data.thresholdCop)}
Proyección de cierre: ${formatCOP(data.projectedCop)} (${data.projectedPct} %)
UVT ${data.year} aplicada: $${data.uvtCop.toLocaleString("es-CO")} COP

Qué hacer: ${data.action}

Ver el detalle: ${metricsUrl}`;

  return {
    subject: `${crossed ? "🚨" : "⚠️"} Vigilancia fiscal ${data.year}: ${data.ruleName} al ${data.levelLabel} del tope`,
    html: await renderEmailLayout({
      preview: `${data.ruleName} al ${data.levelLabel} del tope · acumulado ${formatCOP(data.currentCop)} de ${formatCOP(data.thresholdCop)}`,
      bodyHtml,
    }),
    text,
  };
}
