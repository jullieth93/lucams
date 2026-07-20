/*
 * Admin > Finanzas > Bloqueos contra entrega (COD) · ADR-065.
 *
 * Block-list persistente del anti-abuso COD: teléfonos, emails y direcciones vetados que NO pueden
 * pagar contra entrega (sí pueden pagar en línea). Lucy agrega/retira teléfonos/emails desde acá; las
 * direcciones se bloquean desde el pedido (tienen la clave normalizada). SUPERADMIN (política de pago).
 */

import type { Metadata } from "next";
import { ShieldBan } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminNotice,
  AdminEmpty,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
} from "@/components/admin-page";
import { requireRole } from "@/lib/admin-rbac-guard";
import { listBlockedIdentities } from "@/features/anti-abuse/blocklist-service";
import { AddBlockForm, RemoveBlockButton } from "./bloqueos-form";

export const metadata: Metadata = {
  title: "Bloqueos contra entrega",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const KIND_META: Record<string, { label: string; tone: "turquoise" | "pink" | "amber" }> = {
  PHONE: { label: "Teléfono", tone: "turquoise" },
  EMAIL: { label: "Email", tone: "pink" },
  ADDRESS: { label: "Dirección", tone: "amber" },
};

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function BloqueosCodPage() {
  await requireRole(["SUPERADMIN"]);
  const rows = await listBlockedIdentities();

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<ShieldBan className="h-5 w-5" />}
        title="Bloqueos contra entrega"
        subtitle="Teléfonos, emails y direcciones que no pueden pagar contra entrega (sí pueden pagar en línea)"
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Finanzas", href: "/admin/finanzas" },
          { label: "Bloqueos" },
        ]}
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          Cuando alguien abusa del <strong>pago contra entrega</strong> (pide y no recibe, deja
          paquetes devueltos), bloquéalo aquí: sus próximos pedidos tendrán que pagarse{" "}
          <strong>en línea</strong> (tarjeta, PSE o Nequi). No se le avisa que está bloqueado. Las{" "}
          <strong>direcciones</strong> se bloquean desde el detalle del pedido.
        </AdminNotice>

        <AdminCard className="p-4">
          <h2 className="text-brand-purple-dark mb-3 text-sm font-bold">
            Bloquear un teléfono o email
          </h2>
          <AddBlockForm />
        </AdminCard>

        {rows.length === 0 ? (
          <AdminEmpty
            icon={<ShieldBan className="h-8 w-8" />}
            title="Sin bloqueos"
            description="Aún no has bloqueado ninguna identidad. Cuando lo hagas, aparecerá acá."
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Tipo</th>
                <th className="px-4 py-3 text-left font-semibold">Valor</th>
                <th className="px-4 py-3 text-left font-semibold">Motivo</th>
                <th className="px-4 py-3 text-left font-semibold">Bloqueado</th>
                <th className="px-4 py-3 text-right font-semibold">Acción</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {rows.map((r) => {
                const meta = KIND_META[r.kind] ?? { label: r.kind, tone: "amber" as const };
                return (
                  <AdminTableRow key={r.id}>
                    <td className="px-4 py-3 align-top">
                      <AdminBadge tone={meta.tone}>{meta.label}</AdminBadge>
                    </td>
                    <td className="text-brand-purple-dark px-4 py-3 align-top text-sm font-medium break-all">
                      {r.kind === "ADDRESS" ? (
                        <span className="text-brand-muted font-mono text-xs">{r.value}</span>
                      ) : (
                        r.value
                      )}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 align-top text-sm">
                      {r.reason}
                    </td>
                    <td className="text-brand-muted px-4 py-3 align-top text-xs">
                      {dateFmt.format(r.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <RemoveBlockButton id={r.id} label={r.value} />
                    </td>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
