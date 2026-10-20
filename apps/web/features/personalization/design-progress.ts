type ProgressSlot = {
  assetId?: unknown;
  assetUrl?: unknown;
  profileAssetId?: unknown;
  profileAssetUrl?: unknown;
  textOverrides?: unknown;
};

function hasTextOverrides(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, Record<string, unknown>>).some((override) =>
    Object.values(override ?? {}).some(
      (field) => field !== undefined && field !== null && field !== "",
    ),
  );
}

export function designHasMeaningfulProgress(opts: {
  canvasData: unknown;
  metadata?: unknown;
}): boolean {
  const canvas = opts.canvasData as
    { version?: unknown; clientRev?: unknown; slots?: ProgressSlot[] } | null | undefined;
  const metadata = opts.metadata as
    | { surface?: unknown; letters?: unknown; colors?: unknown; frameTheme?: unknown }
    | null
    | undefined;

  if (metadata?.surface === "name" || metadata?.surface === "letterset") {
    if (Array.isArray(metadata.letters) && metadata.letters.length > 0) return true;
    if (Array.isArray(metadata.colors) && metadata.colors.length > 0) return true;
    if (typeof metadata.frameTheme === "string" && metadata.frameTheme.trim()) return true;
  }

  if (canvas?.version !== 2) return false;
  if (typeof canvas.clientRev === "number" && canvas.clientRev > 0) return true;
  return (canvas.slots ?? []).some(
    (slot) =>
      !!slot.assetId ||
      !!slot.assetUrl ||
      !!slot.profileAssetId ||
      !!slot.profileAssetUrl ||
      hasTextOverrides(slot.textOverrides),
  );
}
