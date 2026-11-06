import "server-only";

import { prisma } from "@/lib/db";

export type LifecycleSuppressionReason =
  "CONSENT_REVOKED" | "EMAIL_BOUNCED" | "EMAIL_COMPLAINED" | "EMAIL_SUPPRESSED";

type LifecycleDb = Pick<typeof prisma, "contact" | "lifecycleEnrollment" | "lifecycleMessage">;

export async function suppressLifecycleForEmails(
  emails: string[],
  reason: LifecycleSuppressionReason,
  at = new Date(),
  db: LifecycleDb = prisma,
): Promise<number> {
  const normalized = [
    ...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  ];
  if (normalized.length === 0) return 0;
  const contacts = await db.contact.findMany({
    where: { primaryEmail: { in: normalized } },
    select: { id: true },
  });
  if (contacts.length === 0) return 0;

  const enrollments = await db.lifecycleEnrollment.findMany({
    where: {
      contactId: { in: contacts.map((contact) => contact.id) },
      status: "ACTIVE",
      ...(reason === "CONSENT_REVOKED" ? { journey: { requireOptIn: true } } : {}),
    },
    select: { id: true },
  });
  if (enrollments.length === 0) return 0;
  const enrollmentIds = enrollments.map((enrollment) => enrollment.id);

  await db.lifecycleMessage.updateMany({
    where: { enrollmentId: { in: enrollmentIds }, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "CANCELLED", error: reason },
  });
  await db.lifecycleEnrollment.updateMany({
    where: { id: { in: enrollmentIds }, status: "ACTIVE" },
    data: {
      status: reason === "CONSENT_REVOKED" ? "EXITED" : "SUPPRESSED",
      exitReason: reason,
      completedAt: at,
      lastRunAt: at,
    },
  });
  return enrollments.length;
}
