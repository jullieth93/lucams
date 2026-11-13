import type { Prisma } from "@lucams/db";
import { formatIsoDateCO } from "@/lib/datetime";

export function orderNumberPrefix(now: Date): string {
  return `LCM-${formatIsoDateCO(now).slice(0, 4)}-`;
}

export async function generateOrderNumber(
  tx: Prisma.TransactionClient,
  now: Date = new Date(),
): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(918273)`;
  const prefix = orderNumberPrefix(now);
  const lastRows = await tx.$queryRaw<{ number: string }[]>`
    SELECT "number"
    FROM "Order"
    WHERE "number" LIKE ${`${prefix}%`}
    ORDER BY length("number") DESC, "number" DESC
    LIMIT 1
  `;
  const last = lastRows[0] ?? null;
  const lastSeq = last ? Number.parseInt(last.number.slice(prefix.length), 10) : 0;
  const nextSeq = (Number.isNaN(lastSeq) ? 0 : lastSeq) + 1;
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}
