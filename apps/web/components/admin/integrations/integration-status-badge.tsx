import { AlertTriangle, CheckCircle2, HelpCircle, MinusCircle, XCircle } from "lucide-react";
import { AdminBadge } from "@/components/admin-page";
import type { PanelStatus } from "@/lib/integration-health";

export function IntegrationStatusBadge({ status }: { status: PanelStatus }) {
  if (status === "ok") {
    return (
      <AdminBadge tone="emerald">
        <CheckCircle2 className="mr-1 -ml-0.5 inline h-3 w-3" />
        Operativo
      </AdminBadge>
    );
  }
  if (status === "warn") {
    return (
      <AdminBadge tone="amber">
        <AlertTriangle className="mr-1 -ml-0.5 inline h-3 w-3" />
        Revisar
      </AdminBadge>
    );
  }
  if (status === "fail") {
    return (
      <AdminBadge tone="rose">
        <XCircle className="mr-1 -ml-0.5 inline h-3 w-3" />
        Caído
      </AdminBadge>
    );
  }
  if (status === "unverified") {
    return (
      <AdminBadge tone="slate">
        <HelpCircle className="mr-1 -ml-0.5 inline h-3 w-3" />
        Sin verificación remota
      </AdminBadge>
    );
  }
  return (
    <AdminBadge tone="slate">
      <MinusCircle className="mr-1 -ml-0.5 inline h-3 w-3" />
      Sin configurar
    </AdminBadge>
  );
}
