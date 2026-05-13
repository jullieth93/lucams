/*
 * GET /api/admin/cms/by-key/[key] — devuelve bloque O setting por key,
 * para el Visual In-Place Editor cuando el admin hace click sobre un
 * elemento con data-cms-key.
 *
 * Requiere admin autenticado. Sin auth devuelve 403.
 *
 * Devuelve:
 *   { kind: "block", block: { id, key, body, title, format, ... } }
 *   { kind: "setting", setting: { id, key, value, valueType, label, ... } }
 *   404 si no existe ni como bloque ni como setting.
 */

import { getCurrentAdmin } from "@/lib/auth";
import { getCmsBlockByKey, getSiteSettingByKey } from "@/features/cms/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<Response> {
  const session = await getCurrentAdmin();
  if (!session) {
    return Response.json(
      {
        type: "https://lucamsshop.co/errors/forbidden",
        title: "Acceso denegado",
        status: 403,
        detail: "Solo administradores pueden consultar este endpoint.",
      },
      { status: 403, headers: { "Content-Type": "application/problem+json" } },
    );
  }

  const { key } = await ctx.params;
  if (!key) {
    return Response.json(
      {
        type: "https://lucamsshop.co/errors/missing-key",
        title: "Key requerida",
        status: 400,
      },
      { status: 400 },
    );
  }

  const block = await getCmsBlockByKey(key);
  if (block) {
    return Response.json({
      kind: "block",
      block: {
        id: block.id,
        key: block.key,
        title: block.publishedVersion?.title ?? block.title,
        body: block.publishedVersion?.body ?? block.body,
        format: block.format,
        category: block.category,
        description: block.description,
        isPublished: block.isPublished,
        publishedVersion: block.publishedVersion?.version ?? null,
      },
    });
  }

  const setting = await getSiteSettingByKey(key);
  if (setting) {
    return Response.json({
      kind: "setting",
      setting: {
        id: setting.id,
        key: setting.key,
        value: setting.value,
        valueType: setting.valueType,
        category: setting.category,
        label: setting.label,
        description: setting.description,
      },
    });
  }

  return Response.json(
    {
      type: "https://lucamsshop.co/errors/cms-key-not-found",
      title: "No encontrado",
      status: 404,
      detail: `No hay bloque ni setting con key "${key}".`,
    },
    { status: 404, headers: { "Content-Type": "application/problem+json" } },
  );
}
