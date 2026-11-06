import "server-only";

import type { LifecycleJourneyStep, LifecycleMessage, Prisma } from "@lucams/db";
import {
  getEmailOverrides,
  interpolateOverrideTokens,
  replaceHeading,
  replacePreheader,
  type EmailOverrideMap,
} from "@/features/emails/overrides";
import {
  lifecycleMessageEmail,
  type LifecycleMessageData,
} from "@/features/emails/templates/lifecycle-message";

export function buildMessageMetadata(
  step: LifecycleJourneyStep,
  overrides: EmailOverrideMap,
): Prisma.InputJsonObject {
  return {
    targetPath: step.ctaPath,
    subject: step.subject,
    heading: step.heading,
    preheader: step.preheader,
    body: step.body,
    ctaLabel: step.ctaLabel,
    commercial: step.commercial,
    overrides: overrides as Prisma.InputJsonObject,
  };
}

function textMetadata(metadata: Prisma.JsonValue, key: string, fallback: string): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return fallback;
  const value = (metadata as Prisma.JsonObject)[key];
  return typeof value === "string" ? value : fallback;
}

export async function renderStoredLifecycleMessage(
  message: Pick<LifecycleMessage, "metadata" | "ctaUrl">,
  step: LifecycleJourneyStep,
  input: { recipientName: string | null; productNames: string[]; unsubscribeUrl?: string },
) {
  const storedOverrides =
    message.metadata &&
    typeof message.metadata === "object" &&
    !Array.isArray(message.metadata) &&
    message.metadata.overrides &&
    typeof message.metadata.overrides === "object" &&
    !Array.isArray(message.metadata.overrides)
      ? (message.metadata.overrides as EmailOverrideMap)
      : null;
  const overrides = storedOverrides ?? (await getEmailOverrides("lifecycle-message"));
  const data: LifecycleMessageData = {
    subject: textMetadata(message.metadata, "subject", step.subject),
    heading: textMetadata(message.metadata, "heading", step.heading),
    preheader: textMetadata(message.metadata, "preheader", step.preheader),
    body: textMetadata(message.metadata, "body", step.body),
    ctaLabel: textMetadata(message.metadata, "ctaLabel", step.ctaLabel),
    ctaUrl: message.ctaUrl,
    recipientName: input.recipientName,
    productNames: input.productNames,
    unsubscribeUrl: input.unsubscribeUrl,
  };
  const rendered = await lifecycleMessageEmail(data);
  let { subject, html } = rendered;
  if (overrides.SUBJECT) subject = interpolateOverrideTokens(overrides.SUBJECT, data);
  if (overrides.PREHEADER) {
    html = replacePreheader(html, interpolateOverrideTokens(overrides.PREHEADER, data));
  }
  if (overrides.HEADING) {
    html = replaceHeading(html, interpolateOverrideTokens(overrides.HEADING, data));
  }
  return { ...rendered, subject, html };
}
