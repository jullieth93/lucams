import "server-only";

import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db";
import { isSafeInternalPath } from "@/lib/safe-redirect";
import { hashBearerToken, verifyTokenHashTimingSafe } from "@/lib/token-hash";

export function createLifecyclePublicToken(messageId: string): string {
  const secret = process.env.CSRF_SECRET;
  if (!secret) throw new Error("CSRF_SECRET es obligatorio para firmar enlaces Lifecycle.");
  return createHmac("sha256", secret)
    .update(`lifecycle-click:v1:${messageId}`)
    .digest("base64url")
    .slice(0, 32);
}

export async function resolveLifecycleClick(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const message = await prisma.lifecycleMessage.findUnique({
    where: { publicTokenHash: hashBearerToken(token) },
    select: { id: true, publicTokenHash: true, status: true, metadata: true },
  });
  if (
    !message ||
    message.status !== "SENT" ||
    !verifyTokenHashTimingSafe(token, message.publicTokenHash)
  ) {
    return null;
  }
  const metadata = message.metadata as Record<string, unknown>;
  const targetPath = typeof metadata.targetPath === "string" ? metadata.targetPath : null;
  if (!isSafeInternalPath(targetPath)) return null;

  await prisma.lifecycleMessage.updateMany({
    where: { id: message.id, clickedAt: null },
    data: { clickedAt: new Date() },
  });
  return targetPath;
}
