/*
 * <CmsSetting> — renderea el valor de un SiteSetting.
 *
 * Para emails, horarios, URLs, números configurables. Si no existe
 * en DB → cae al fallback.
 *
 * Para uso programático (en strings, hrefs, etc), preferir
 * `getSettingValue(key, fallback)` directamente desde lib/cms.
 */

import { getSiteSetting } from "@/lib/cms";

export async function CmsSetting({
  settingKey,
  fallback,
}: {
  settingKey: string;
  fallback: string;
}) {
  const setting = await getSiteSetting(settingKey);
  return <>{setting?.value ?? fallback}</>;
}
