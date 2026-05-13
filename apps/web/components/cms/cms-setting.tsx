/*
 * <CmsSetting> — renderea el valor de un SiteSetting.
 *
 * Para emails, horarios, URLs, números configurables. Si no existe
 * en DB → cae al fallback.
 *
 * Marca el DOM con data-cms-key + data-cms-kind="setting" para el
 * Visual In-Place Editor. `display: contents` mantiene transparencia
 * al layout.
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
  return (
    <span data-cms-key={settingKey} data-cms-kind="setting" style={{ display: "contents" }}>
      {setting?.value ?? fallback}
    </span>
  );
}
