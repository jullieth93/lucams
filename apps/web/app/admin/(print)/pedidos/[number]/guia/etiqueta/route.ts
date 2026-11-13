import { verifyAdminRouteAccess } from "@/lib/admin-rbac-guard";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { recordAdminAction } from "@/lib/admin-audit";
import { prisma } from "@/lib/db";
import { getProductionAssetSignedUrls } from "@/lib/storage";

function safeAveonlineLabelUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      (hostname !== "aveonline.co" && !hostname.endsWith(".aveonline.co"))
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ number: string }> }) {
  const auth = await verifyAdminRouteAccess({
    roles: ADMIN_ROLE_SETS.SHIPPING_GUIDE_PRINT,
    req,
    checkIdle: true,
  });
  if (!auth.ok) {
    return Response.json(
      { error: "No autorizado.", reason: auth.reason },
      { status: auth.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { number } = await ctx.params;
  const reference = decodeURIComponent(number);
  const order = await prisma.order.findFirst({
    where: { deletedAt: null, OR: [{ id: reference }, { number: reference }] },
    select: { id: true, number: true, labelPath: true, labelUrl: true },
  });
  if (!order) return new Response("Pedido no encontrado", { status: 404 });

  const externalOnly = new URL(req.url).searchParams.get("fuente") === "externa";
  let downloadUrl: string | null = null;
  let source: "storage" | "aveonline" = "storage";

  if (!externalOnly && order.labelPath) {
    downloadUrl =
      (await getProductionAssetSignedUrls([order.labelPath], 900)).get(order.labelPath) ?? null;
  }
  if ((!externalOnly && !downloadUrl) || externalOnly) {
    downloadUrl = safeAveonlineLabelUrl(order.labelUrl);
    source = "aveonline";
  }
  if (!downloadUrl) {
    return new Response("Este pedido no tiene una etiqueta disponible.", { status: 404 });
  }

  await recordAdminAction({
    actorId: auth.session.admin.id,
    action: "order.carrier_label_download",
    entityType: "Order",
    entityId: order.id,
    metadata: {
      orderNumber: order.number,
      role: auth.session.admin.role,
      source,
      archivedLabel: Boolean(order.labelPath),
    },
  });

  return new Response(null, {
    status: 302,
    headers: { Location: downloadUrl, "Cache-Control": "no-store" },
  });
}
