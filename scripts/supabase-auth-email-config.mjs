#!/usr/bin/env node
/*
 * Configura los EMAILS DE AUTENTICACIÓN de un proyecto Supabase cloud (STG o PRD):
 *   1. SMTP custom vía Resend (para que los correos salgan de
 *      "Lucams_shop <hola@mail.lucamsshop.com>" y no de
 *      "Supabase Auth <noreply@mail.app.supabase.io>").
 *   2. Plantillas branded en español con el código OTP visible
 *      (supabase/auth-templates/*.html) — antes llegaba la plantilla genérica
 *      en inglés con un LINK, mientras la app espera un código (feedback Lucy
 *      2026-09-18).
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=sbp_… RESEND_API_KEY=re_… \
 *     node scripts/supabase-auth-email-config.mjs --ref <project-ref>
 *
 * El token también se lee de tmp/.supabase-access-token (gitignored) si no
 * viene en env. Nunca imprime secretos; la verificación final relee la config
 * y muestra solo campos no sensibles.
 *
 * Refs conocidos (2026-09-18): lucams-stg = mjbdiqdkykhsixvqlrrp,
 * lucams-prod = zxkucphbsfygakgxcnik.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
}

const ref = arg("ref");
if (!ref) {
  console.error("✗ falta --ref <project-ref> (stg: mjbdiqdkykhsixvqlrrp, prd: zxkucphbsfygakgxcnik)");
  process.exit(1);
}

let token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  try {
    token = readFileSync(resolve(root, "tmp/.supabase-access-token"), "utf8").trim();
  } catch {
    /* sigue sin token → error abajo */
  }
}
const resendKey = process.env.RESEND_API_KEY?.trim();
if (!token || !resendKey) {
  console.error("✗ faltan SUPABASE_ACCESS_TOKEN (o tmp/.supabase-access-token) y/o RESEND_API_KEY");
  process.exit(1);
}

const confirmation = readFileSync(resolve(root, "supabase/auth-templates/confirmation.html"), "utf8");
const recovery = readFileSync(resolve(root, "supabase/auth-templates/recovery.html"), "utf8");

const body = {
  // SMTP de Resend — el dominio mail.lucamsshop.com está verificado (2026-09-18).
  smtp_host: "smtp.resend.com",
  smtp_port: "587",
  smtp_user: "resend",
  smtp_pass: resendKey,
  smtp_sender: "hola@mail.lucamsshop.com",
  smtp_sender_name: "Lucams_shop",
  // OJO: en gotrue el From real sale de AdminEmail, no de smtp_sender — debe ser
  // el buzón del dominio verificado (@mail.lucamsshop.com), si no Resend rechaza.
  smtp_admin_email: "hola@mail.lucamsshop.com",
  // Estaba en 2/hora (bloqueaba registros reales); 30/hora es el default sano.
  rate_limit_email_sent: 30,
  mailer_subjects_confirmation: "Tu código de confirmación 💜 Lucams_shop",
  mailer_templates_confirmation_content: confirmation,
  mailer_subjects_recovery: "Tu código para restablecer tu contraseña — Lucams_shop",
  mailer_templates_recovery_content: recovery,
};

const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const base = `https://api.supabase.com/v1/projects/${ref}/config/auth`;

const patch = await fetch(base, { method: "PATCH", headers, body: JSON.stringify(body) });
if (!patch.ok) {
  console.error(`✗ PATCH ${patch.status}:`, (await patch.text()).slice(0, 300));
  process.exit(1);
}

// Verificación: releer la config y comprobar lo aplicado (sin imprimir secretos).
const check = await fetch(base, { headers });
const cfg = await check.json();
const ok =
  cfg.smtp_host === "smtp.resend.com" &&
  cfg.smtp_admin_email === body.smtp_admin_email &&
  Number(cfg.rate_limit_email_sent) >= 30 &&
  cfg.mailer_templates_confirmation_content?.includes("{{ .Token }}") &&
  cfg.mailer_templates_recovery_content?.includes("{{ .Token }}");

console.log(`Proyecto ${ref}:`);
console.log(`  smtp_host      = ${cfg.smtp_host}:${cfg.smtp_port} (user ${cfg.smtp_user})`);
console.log(`  remitente      = ${cfg.smtp_sender_name} <${cfg.smtp_admin_email}>`);
console.log(`  asunto confirm = ${cfg.mailer_subjects_confirmation}`);
console.log(`  asunto recup.  = ${cfg.mailer_subjects_recovery}`);
console.log(`  plantillas OTP = ${ok ? "aplicadas ({{ .Token }} presente) ✓" : "✗ NO quedaron aplicadas"}`);
process.exit(ok ? 0 : 1);
