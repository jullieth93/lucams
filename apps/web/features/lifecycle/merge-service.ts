import "server-only";

import type { LifecycleEnrollmentStatus, Prisma } from "@lucams/db";

export async function moveLifecycleEnrollmentsForMergeTx(
  tx: Prisma.TransactionClient,
  absorbedContactId: string,
  survivorContactId: string,
  now: Date,
): Promise<string[]> {
  const [absorbed, survivor] = await Promise.all([
    tx.lifecycleEnrollment.findMany({
      where: { contactId: absorbedContactId },
      select: { id: true, journeyId: true, cycle: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    tx.lifecycleEnrollment.findMany({
      where: { contactId: survivorContactId },
      select: { journeyId: true, cycle: true, status: true },
    }),
  ]);
  const survivorCycles = new Map(survivor.map((item) => [`${item.journeyId}:${item.cycle}`, item]));
  const nextCycles = new Map<string, number>();
  for (const item of survivor) {
    nextCycles.set(item.journeyId, Math.max(nextCycles.get(item.journeyId) ?? 0, item.cycle));
  }
  const activeJourneys = new Set(
    survivor.filter((item) => item.status === "ACTIVE").map((item) => item.journeyId),
  );
  const movedIds: string[] = [];

  for (const enrollment of absorbed) {
    const key = `${enrollment.journeyId}:${enrollment.cycle}`;
    const active = enrollment.status === "ACTIVE";
    if (active && activeJourneys.has(enrollment.journeyId)) {
      await tx.lifecycleEnrollment.update({
        where: { id: enrollment.id },
        data: { status: "EXITED", exitReason: "CONTACT_MERGED", completedAt: now },
      });
      continue;
    }
    if (survivorCycles.has(key) && !active) continue;

    const nextCycle = survivorCycles.has(key)
      ? (nextCycles.get(enrollment.journeyId) ?? enrollment.cycle) + 1
      : enrollment.cycle;
    await tx.lifecycleEnrollment.update({
      where: { id: enrollment.id },
      data: { contactId: survivorContactId, cycle: nextCycle },
    });
    await tx.lifecycleMessage.updateMany({
      where: { enrollmentId: enrollment.id },
      data: { contactId: survivorContactId },
    });
    survivorCycles.set(`${enrollment.journeyId}:${nextCycle}`, {
      journeyId: enrollment.journeyId,
      cycle: nextCycle,
      status: enrollment.status as LifecycleEnrollmentStatus,
    });
    nextCycles.set(
      enrollment.journeyId,
      Math.max(nextCycles.get(enrollment.journeyId) ?? 0, nextCycle),
    );
    if (active) activeJourneys.add(enrollment.journeyId);
    movedIds.push(enrollment.id);
  }
  return movedIds;
}
