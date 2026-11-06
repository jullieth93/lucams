import type { LifecycleJourney } from "@lucams/db";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const COLOMBIA_OFFSET_MS = 5 * HOUR_MS;

function getBogotaHour(date: Date): number {
  return new Date(date.getTime() - COLOMBIA_OFFSET_MS).getUTCHours();
}

function isQuietHour(hour: number, start: number, end: number): boolean {
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

export function nextAllowedAt(date: Date, journey: LifecycleJourney): Date {
  if (!isQuietHour(getBogotaHour(date), journey.quietStartHour, journey.quietEndHour)) {
    return date;
  }
  const local = new Date(date.getTime() - COLOMBIA_OFFSET_MS);
  const nextDay =
    journey.quietStartHour > journey.quietEndHour && getBogotaHour(date) >= journey.quietStartHour
      ? 1
      : 0;
  return new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + nextDay,
      journey.quietEndHour,
    ) + COLOMBIA_OFFSET_MS,
  );
}

export function nextStepRunAt(
  delayMinutes: number,
  journey: LifecycleJourney,
  now = new Date(),
): Date {
  return nextAllowedAt(new Date(now.getTime() + delayMinutes * 60_000), journey);
}

export function startOfBogotaDay(date: Date): Date {
  const local = new Date(date.getTime() - COLOMBIA_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + COLOMBIA_OFFSET_MS,
  );
}

export function nextBogotaDay(date: Date): Date {
  return new Date(startOfBogotaDay(date).getTime() + DAY_MS);
}
