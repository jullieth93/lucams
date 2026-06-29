/*
 * Break-glass: desactiva la verificación en 2 pasos (MFA/TOTP) de un admin
 * que perdió su teléfono. Lucy 2026-06-27 (Bloque C / A6).
 *
 * Usa el service role de Supabase (auth.admin) para borrar los factores TOTP
 * del usuario. Luego el admin puede volver a entrar solo con contraseña y
 * re-enrolar desde /admin/seguridad.
 *
 * Uso (vía Makefile, desde la VM con .env.local):
 *   EMAIL=lucy@ejemplo.com make admin-mfa-reset
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY en el entorno.
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const email = process.env.EMAIL?.toLowerCase().trim();
const supabaseUrl = stripQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceKey = stripQuotes(process.env.SUPABASE_SECRET_KEY);

if (!email) {
  console.error("❌ Falta EMAIL. Uso: EMAIL=lucy@ejemplo.com make admin-mfa-reset");
  process.exit(1);
}
if (!supabaseUrl || !serviceKey) {
  console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en el entorno.");
  process.exit(1);
}

const prisma = new PrismaClient();
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // El AdminUser guarda el supabaseUserId; lo usamos para el admin API.
  const admin = await prisma.adminUser.findFirst({
    where: { email },
    select: { supabaseUserId: true, email: true },
  });
  if (!admin?.supabaseUserId) {
    console.error(`❌ No encontré un admin con email ${email}.`);
    process.exit(1);
  }

  const userId = admin.supabaseUserId;
  const { data, error } = await supabase.auth.admin.mfa.listFactors({ userId });
  if (error) {
    console.error("❌ Error listando factores MFA:", error.message);
    process.exit(1);
  }

  const factors = data?.factors ?? [];
  if (factors.length === 0) {
    console.log(`ℹ️  ${email} no tiene factores MFA. Nada que hacer.`);
    return;
  }

  for (const f of factors) {
    const { error: delErr } = await supabase.auth.admin.mfa.deleteFactor({
      id: f.id,
      userId,
    });
    if (delErr) {
      console.error(`❌ Error borrando factor ${f.id}:`, delErr.message);
    } else {
      console.log(`✅ Factor MFA borrado (${f.factor_type}, ${f.id}).`);
    }
  }
  console.log(
    `\n✅ Listo. ${email} ya puede entrar solo con contraseña y re-activar la verificación en 2 pasos desde /admin/seguridad.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
