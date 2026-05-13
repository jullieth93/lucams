/*
 * <EditModeProvider> — Server component que decide si montar el
 * Visual In-Place Editor.
 *
 * Lee la sesión actual. Si NO es admin → no monta nada (cero costo
 * para visitantes anónimos / clientes). Si es admin → monta el
 * componente cliente con toolbar + overlay + popover.
 *
 * Pensado para colocarse en app/layout.tsx, después de `{children}`.
 */

import { getCurrentAdmin } from "@/lib/auth";
import { EditModeMount } from "./edit-mode-mount";

export async function EditModeProvider() {
  const session = await getCurrentAdmin();
  if (!session) return null;
  return <EditModeMount adminEmail={session.admin.email} />;
}
