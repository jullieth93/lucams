"use server";

import { revalidatePath } from "next/cache";
import { recordAdminAction } from "@/lib/admin-audit";
import { getCurrentAdmin } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Desactiva (unenroll) los factores TOTP del admin actual. */
export async function disableMfaAction(): Promise<void> {
  const session = await getCurrentAdmin();
  if (!session) return;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.listFactors();
  for (const f of data?.all ?? []) {
    if (f.factor_type === "totp") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  logger.info({ event: "security.admin_mfa_disabled", adminId: session.admin.id });
  await recordAdminAction({
    actorId: session.admin.id,
    action: "admin.mfa.disable",
    entityType: "AdminUser",
    entityId: session.admin.id,
  });
  revalidatePath("/admin/seguridad");
}
