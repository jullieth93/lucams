"use client";

/*
 * Tarjeta interactiva lado a lado para revisar o auditar un par candidato de fusión (`S20`).
 *
 * UX/UI Lucams:
 *  - Selección interactiva del contacto sobreviviente con resaltado visual (`#7C6AAD` / `#5DD9D1`).
 *  - Si exactamente un lado tiene cuenta autenticada (`Customer`), bloquea el radio a favor
 *    de esa cuenta con explicación clara.
 *  - Si ambos lados tienen cuentas autenticadas activas, bloquea el botón de fusión con aviso
 *    de protección de sesiones y Puntos Lucams, permitiendo descartar el par (`No son la misma persona`).
 *  - Confirmación de marca (`ReauthForm` + `useAdminConfirm`, cero `window.confirm`) + step-up MFA.
 */

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ExternalLink,
  GitMerge,
  Mail,
  Phone,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  UserCheck,
  XCircle,
} from "lucide-react";
import { ReauthForm } from "@/components/admin/mfa-reauth";
import { useAdminConfirm } from "@/components/admin/use-admin-confirm";
import { AdminBadge } from "@/components/admin-page";
import { formatCOP, formatRelativeTime } from "@/lib/format";
import type { MergeCandidateItem, MergeContactSummary } from "@/features/identity/merge-service";
import { approveContactMergeAction, rejectContactMergeAction } from "./actions";

const SOURCE_LABEL: Record<string, string> = {
  CUSTOMER_AUTH: "Cuenta web",
  GUEST_ORDER: "Compra invitado",
  SUPPORT_TICKET: "Soporte",
  QUOTE: "Cotización WA",
  ABANDONED_CART: "Carrito",
  NEWSLETTER: "Newsletter",
  B2B_INQUIRY: "Empresas / Eventos",
  MANUAL: "Manual",
};

function ContactSidePanel({
  contact,
  isSelectedSurvivor,
  isSelectable,
  isForced,
  onSelect,
  statusMode,
  wasMergedSurvivor,
}: {
  contact: MergeContactSummary;
  isSelectedSurvivor: boolean;
  isSelectable: boolean;
  isForced: boolean;
  onSelect: () => void;
  statusMode: "PENDING" | "APPROVED" | "REJECTED";
  wasMergedSurvivor: boolean;
}) {
  const highlight =
    statusMode === "PENDING"
      ? isSelectedSurvivor
      : statusMode === "APPROVED"
        ? wasMergedSurvivor
        : false;

  return (
    <div
      className={`flex flex-col justify-between rounded-xl border p-4 transition-colors ${
        highlight
          ? "border-brand-purple bg-brand-cream/40 ring-brand-purple/20 ring-2"
          : "border-brand-purple/15 bg-white"
      }`}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-brand-purple-dark truncate text-base font-bold">
                {contact.displayName}
              </span>
              {contact.hasActiveCustomerAccount ? (
                <AdminBadge tone="purple">
                  <UserCheck className="mr-1 inline h-3 w-3" />
                  Cuenta activa
                </AdminBadge>
              ) : (
                <AdminBadge tone="slate">
                  {SOURCE_LABEL[contact.source] ?? contact.source}
                </AdminBadge>
              )}
              {contact.deletedAt && <AdminBadge tone="slate">Archivado por fusión</AdminBadge>}
            </div>
            {contact.organizationName && (
              <p className="text-muted-foreground mt-0.5 text-xs font-medium">
                Organización: {contact.organizationName}
              </p>
            )}
          </div>

          {!contact.deletedAt && (
            <Link
              href={`/admin/clientes/${contact.id}`}
              className="text-brand-purple hover:text-brand-purple-dark inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold underline-offset-2 hover:underline"
            >
              Ver 360
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="text-foreground flex items-center gap-2">
            <Mail className="text-brand-purple h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-medium">
              {contact.primaryEmail ?? "Sin correo principal"}
            </span>
          </div>
          <div className="text-foreground flex items-center gap-2">
            <Phone className="text-brand-purple h-3.5 w-3.5 shrink-0" />
            <span className="font-mono">{contact.primaryPhoneE164 ?? "Sin celular comprador"}</span>
          </div>
          {contact.documentLabel && (
            <div className="text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="text-brand-purple h-3.5 w-3.5 shrink-0" />
              <span>Documento: {contact.documentLabel}</span>
            </div>
          )}
        </div>

        {(contact.verifiedEmails.length > 0 || contact.observedEmails.length > 0) && (
          <div className="border-brand-purple/10 space-y-1 border-t pt-2.5 text-xs">
            {contact.verifiedEmails.length > 0 && (
              <p className="text-emerald-800">
                <span className="font-semibold">Verificados:</span>{" "}
                {contact.verifiedEmails.join(", ")}
              </p>
            )}
            {contact.observedEmails.length > 0 && (
              <p className="text-amber-800">
                <span className="font-semibold">Observados sin sesión:</span>{" "}
                {contact.observedEmails.join(", ")}
              </p>
            )}
          </div>
        )}

        <div className="border-brand-purple/10 grid grid-cols-1 gap-2 border-t pt-2.5 text-xs sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
            <p className="text-muted-foreground text-[11px]">Compras pagas</p>
            <p className="text-brand-purple-dark flex items-center gap-1 font-bold">
              <ShoppingBag className="h-3 w-3" />
              {contact.paidOrdersCount}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
            <p className="text-muted-foreground text-[11px]">LTV neto</p>
            <p className="text-brand-purple-dark font-bold">{formatCOP(contact.netLtvCents)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
            <p className="text-muted-foreground text-[11px]">Puntos / Casos</p>
            <p className="text-brand-purple-dark flex items-center gap-1 font-bold">
              <Award className="h-3 w-3" />
              {contact.loyaltyPoints} pts · {contact.openCareCount} casos
            </p>
          </div>
        </div>
      </div>

      {statusMode === "PENDING" && isSelectable && (
        <label
          className={`mt-4 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
            isSelectedSurvivor
              ? "border-brand-purple bg-brand-purple text-white"
              : "border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/5 bg-white"
          } ${isForced && !isSelectedSurvivor ? "cursor-not-allowed opacity-50" : ""}`}
        >
          <input
            type="radio"
            name={`survivor-choice-${contact.id}`}
            checked={isSelectedSurvivor}
            disabled={isForced && !isSelectedSurvivor}
            onChange={onSelect}
            className="accent-brand-turquoise h-4 w-4"
          />
          <span>
            {isSelectedSurvivor
              ? isForced
                ? "Contacto principal obligatorio (tiene cuenta activa)"
                : "Conservar como contacto principal"
              : "Elegir como contacto principal"}
          </span>
        </label>
      )}

      {statusMode === "APPROVED" && (
        <div className="mt-3 text-xs font-semibold">
          {wasMergedSurvivor ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Contacto sobreviviente unificado
            </span>
          ) : (
            <span className="text-muted-foreground">Contacto absorbido en el perfil principal</span>
          )}
        </div>
      )}
    </div>
  );
}

export function MergeCandidateCard({ item }: { item: MergeCandidateItem }) {
  const [selectedSurvivorId, setSelectedSurvivorId] = useState<string>(
    item.recommendedSurvivorContactId,
  );
  const [note, setNote] = useState("");
  const { confirm, confirmDialog } = useAdminConfirm();
  const rejectFormRef = useRef<HTMLFormElement>(null);
  const rejectConfirmedRef = useRef(false);

  const isPending = item.status === "PENDING";
  const canApprove = isPending && !item.bothHaveActiveCustomerAccounts;
  const isForced = Boolean(item.forcedSurvivorContactId);

  const survivorSummary =
    selectedSurvivorId === item.primaryContact.id ? item.primaryContact : item.secondaryContact;
  const absorbedSummary =
    selectedSurvivorId === item.primaryContact.id ? item.secondaryContact : item.primaryContact;

  async function handleRejectSubmit(e: FormEvent<HTMLFormElement>) {
    if (rejectConfirmedRef.current) {
      rejectConfirmedRef.current = false;
      return;
    }
    e.preventDefault();
    const ok = await confirm(
      "Este par quedará marcado permanentemente como personas distintas y el motor de identidad no volverá a sugerir su fusión.",
      {
        title: "¿Descartar sugerencia de duplicado?",
        confirmLabel: "Sí, son personas distintas",
        cancelLabel: "Cancelar",
      },
    );
    if (ok) {
      rejectConfirmedRef.current = true;
      rejectFormRef.current?.requestSubmit();
    }
  }

  return (
    <article className="border-brand-purple/15 space-y-4 rounded-2xl border bg-white p-5 shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {item.reasonCodes.map((r) => (
              <AdminBadge key={r.code} tone="amber">
                {r.label}
              </AdminBadge>
            ))}
            {item.status === "APPROVED" && <AdminBadge tone="emerald">Fusión aprobada</AdminBadge>}
            {item.status === "REJECTED" && (
              <AdminBadge tone="slate">Descartado (no sugerir)</AdminBadge>
            )}
          </div>
          {item.evidenceSummary && (
            <p className="text-muted-foreground text-xs">
              Evidencia detectada: <span className="font-medium">{item.evidenceSummary}</span>
            </p>
          )}
        </div>
        <span className="text-muted-foreground text-xs">
          Detectado {formatRelativeTime(item.createdAt)}
        </span>
      </header>

      {item.bothHaveActiveCustomerAccounts && isPending && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/90 p-3.5 text-xs text-amber-950"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="space-y-1">
            <p className="font-bold">
              Fusión automática bloqueada: ambos perfiles tienen cuentas autenticadas activas
            </p>
            <p>
              Para proteger sesiones, contraseñas y saldos independientes de Puntos Lucams, el
              sistema prohíbe fusionar dos cuentas con inicio de sesión propio. Si pertenecen a
              familiares o compañeros que compartieron celular, descarta esta sugerencia abajo.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ContactSidePanel
          contact={item.primaryContact}
          isSelectedSurvivor={selectedSurvivorId === item.primaryContact.id}
          isSelectable={canApprove}
          isForced={isForced}
          onSelect={() => {
            if (!isForced || item.forcedSurvivorContactId === item.primaryContact.id) {
              setSelectedSurvivorId(item.primaryContact.id);
            }
          }}
          statusMode={item.status}
          wasMergedSurvivor={item.mergedSurvivorContactId === item.primaryContact.id}
        />
        <ContactSidePanel
          contact={item.secondaryContact}
          isSelectedSurvivor={selectedSurvivorId === item.secondaryContact.id}
          isSelectable={canApprove}
          isForced={isForced}
          onSelect={() => {
            if (!isForced || item.forcedSurvivorContactId === item.secondaryContact.id) {
              setSelectedSurvivorId(item.secondaryContact.id);
            }
          }}
          statusMode={item.status}
          wasMergedSurvivor={item.mergedSurvivorContactId === item.secondaryContact.id}
        />
      </div>

      {isPending ? (
        <footer className="border-brand-purple/10 space-y-3 border-t pt-4">
          <div>
            <label
              htmlFor={`merge-note-${item.id}`}
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              Nota de revisión (opcional, queda en auditoría)
            </label>
            <input
              id={`merge-note-${item.id}`}
              type="text"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej. Mismo comprador confirmado en ticket o teléfono propio…"
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-11 w-full rounded-lg border bg-white px-3 text-sm focus:ring-2 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <form
              ref={rejectFormRef}
              action={rejectContactMergeAction}
              onSubmit={handleRejectSubmit}
            >
              <input type="hidden" name="candidateId" value={item.id} />
              <input type="hidden" name="note" value={note} />
              <button
                type="submit"
                className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-11 items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold transition-colors"
              >
                <XCircle className="h-4 w-4 text-rose-600" />
                No son la misma persona (no volver a sugerir)
              </button>
            </form>

            {canApprove ? (
              <ReauthForm
                action={approveContactMergeAction}
                confirmMessage={`¿Unificar «${absorbedSummary.displayName}» dentro de «${survivorSummary.displayName}»? Todos los pedidos, tickets, cotizaciones y consentimientos pasarán al contacto principal y se guardará un snapshot reversible en auditoría.`}
              >
                <input type="hidden" name="candidateId" value={item.id} />
                <input type="hidden" name="survivorContactId" value={selectedSurvivorId} />
                <input type="hidden" name="note" value={note} />
                <button
                  type="submit"
                  className="bg-brand-purple hover:bg-brand-purple-dark inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors"
                >
                  <GitMerge className="h-4 w-4" />
                  Fusionar en «{survivorSummary.displayName}» (requiere MFA)
                </button>
              </ReauthForm>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                Fusión deshabilitada por doble cuenta autenticada
              </span>
            )}
          </div>
        </footer>
      ) : (
        <footer className="border-brand-purple/10 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
          <div className="text-muted-foreground">
            Revisado por{" "}
            <span className="text-foreground font-semibold">
              {item.reviewedByLabel ?? "Administrador"}
            </span>{" "}
            {item.reviewedAt ? formatRelativeTime(item.reviewedAt) : ""}
            {item.reviewNote && (
              <>
                {" "}
                · Nota: <span className="italic">«{item.reviewNote}»</span>
              </>
            )}
          </div>
          {item.status === "APPROVED" && item.mergedSurvivorContactId && (
            <Link
              href={`/admin/clientes/${item.mergedSurvivorContactId}`}
              className="text-brand-purple hover:text-brand-purple-dark inline-flex min-h-9 items-center gap-1 font-semibold underline-offset-2 hover:underline"
            >
              Abrir Contacto 360 unificado
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </footer>
      )}
      {confirmDialog}
    </article>
  );
}
