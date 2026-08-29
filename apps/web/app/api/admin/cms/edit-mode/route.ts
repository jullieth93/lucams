/*
 * POST /api/admin/cms/edit-mode — prende/apaga el modo edición in-place del
 * CMS (roadmap C1 paso 2) con NAVEGACIÓN COMPLETA (form MPA, no fetch SPA).
 *
 * ¿Por qué route handler y no Server Action? Con una action + redirect() el
 * Router Cache del cliente servía la versión VIEJA de la página destino y el
 * banner/anotaciones no reflejaban el cambio de cookie (bug hallado en la
 * verificación E2E: la cookie ya estaba borrada y la página seguía anotada).
 * Un <form> clásico POST → 303 obliga una carga completa: HTML fresco siempre.
 *
 * - op=enable: exige sesión admin + MFA aal2 + rol de contenido (SUPERADMIN |
 *   CMS_EDITOR) vía requireAdminAction — si falla, redirect() a /admin/login,
 *   /admin/login/mfa o al home del rol (NEXT_REDIRECT debe propagarse, no
 *   capturarse). Siembra la cookie (8h, httpOnly, Secure en prod/preview) y
 *   audita. CSRF: el form es same-origin y la cookie de sesión es
 *   SameSite=Lax (un POST cross-site no la adjunta).
 * - op=disable: borra la cookie propia (inofensivo, sin guard — si la sesión
 *   expiró a mitad, «Salir» igual limpia y devuelve al sitio). El redirect
 *   pasa por el mismo validador anti open-redirect (E-1).
 */

import { NextResponse } from "next/server";
import { recordAdminAction } from "@/lib/admin-audit";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { CMS_EDIT_COOKIE } from "@/lib/cms-edit-mode";
import { isSafeInternalPath } from "@/lib/safe-redirect";

// E-1 (auditoría 2026-08-24): delegar en el validador robusto — rechaza "\\",
// caracteres de control y "//" (el check local anterior solo filtraba "//" y
// `next=/\evil.com` producía un 303 con Location: https://evil.com/).
function safeNext(raw: string): string {
  return isSafeInternalPath(raw) ? raw.trim() : "/";
}

export async function POST(request: Request) {
  const form = await request.formData();
  const op = String(form.get("op") ?? "");
  const next = safeNext(String(form.get("next") ?? "/"));

  if (op === "enable") {
    // B-6: sesión + aal2 + rol de contenido (antes getCurrentAdmin, sin aal2).
    const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.CONTENT });
    await recordAdminAction({
      actorId: session.admin.id,
      action: "cms.edit_mode.enable",
      entityType: "CmsEditMode",
      entityId: CMS_EDIT_COOKIE,
    });
    const res = NextResponse.redirect(new URL(next, request.url), 303);
    res.cookies.set(CMS_EDIT_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return res;
  }

  const res = NextResponse.redirect(new URL(next, request.url), 303);
  res.cookies.set(CMS_EDIT_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
