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
 * - op=enable: exige sesión admin con rol de contenido (SUPERADMIN |
 *   CMS_EDITOR), siembra la cookie (8h, httpOnly) y audita. CSRF: el form es
 *   same-origin y la cookie de sesión es SameSite=Lax (un POST cross-site no
 *   la adjunta).
 * - op=disable: borra la cookie propia (inofensivo, sin guard — si la sesión
 *   expiró a mitad, «Salir» igual limpia y devuelve al sitio).
 */

import { NextResponse } from "next/server";
import { recordAdminAction } from "@/lib/admin-audit";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { getCurrentAdmin } from "@/lib/auth";
import { CMS_EDIT_COOKIE } from "@/lib/cms-edit-mode";

function safeNext(raw: string): string {
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export async function POST(request: Request) {
  const form = await request.formData();
  const op = String(form.get("op") ?? "");
  const next = safeNext(String(form.get("next") ?? "/"));

  if (op === "enable") {
    const session = await getCurrentAdmin();
    const contentRoles: readonly string[] = ADMIN_ROLE_SETS.CONTENT;
    if (!session || !contentRoles.includes(session.admin.role)) {
      return NextResponse.redirect(new URL("/admin/login", request.url), 303);
    }
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
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return res;
  }

  const res = NextResponse.redirect(new URL(next, request.url), 303);
  res.cookies.set(CMS_EDIT_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
