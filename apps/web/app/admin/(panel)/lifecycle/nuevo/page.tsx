import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { AdminPage, AdminPageBody, AdminPageHeader } from "@/components/admin-page";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { LifecycleJourneyForm } from "../journey-form";

export const metadata: Metadata = { title: "Nuevo recorrido · Lifecycle" };

export default async function NewLifecycleJourneyPage() {
  await requireAdminAction({ capability: "lifecycle:manage" });
  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Plus className="h-5 w-5" />}
        title="Nuevo recorrido"
        subtitle="Configura el disparador, las reglas de inscripción y cada mensaje antes de activarlo."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Marketing" },
          { label: "Lifecycle", href: "/admin/lifecycle" },
          { label: "Nuevo" },
        ]}
      />
      <AdminPageBody>
        <Link
          href="/admin/lifecycle"
          className="text-brand-purple-dark inline-flex items-center gap-1 text-xs font-semibold"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a recorridos
        </Link>
        <LifecycleJourneyForm />
      </AdminPageBody>
    </AdminPage>
  );
}
