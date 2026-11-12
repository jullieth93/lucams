"use client";

/*
 * Controles interactivos de autoservicio en /admin/seguridad:
 *   1. <RecoveryCodesPanel> — medidor visual de códigos de emergencia (10 slots)
 *      + generación/regeneración protegida con step-up MFA (`useMfaReauthAction`).
 *   2. <AdminChangePasswordForm> — cambio de contraseña con verificación de clave
 *      actual, fortaleza en vivo, chequeo k-anonymity HIBP, cierre de otras sesiones
 *      y step-up MFA (`useMfaReauthAction`).
 */

import { useState } from "react";
import { CheckCircle2, Circle, KeyRound, Loader2, LockKeyhole, ShieldAlert } from "lucide-react";
import { useMfaReauthAction } from "@/components/admin/mfa-reauth";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { calculatePasswordStrength } from "@/lib/password-strength";
import {
  changeAdminPasswordAction,
  generateRecoveryCodesAction,
  type AdminPasswordChangeState,
  type RecoveryCodesState,
} from "./actions";
import { RecoveryCodesReveal } from "./recovery-codes-reveal";

const TOTAL_RECOVERY_SLOTS = 10;

export function RecoveryCodesPanel({ unusedCount }: { unusedCount: number }) {
  const [state, formAction, pending, reauthModal] = useMfaReauthAction<RecoveryCodesState>(
    async () => generateRecoveryCodesAction(),
  );
  // 2026-11-11 — sin revalidatePath en la acción (ver actions.ts): tras generar,
  // el conteo vivo sale del set recién creado, no del prop del server (stale).
  const displayCount = state?.codes ? state.codes.length : unusedCount;
  const hasCodes = displayCount > 0;
  const lowCodes = displayCount > 0 && displayCount <= 3;

  const slotActiveClass = !hasCodes ? "bg-rose-200" : lowCodes ? "bg-amber-400" : "bg-emerald-500";

  return (
    <div className="space-y-4">
      {reauthModal}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="bg-brand-purple/10 text-brand-purple flex h-8 w-8 items-center justify-center rounded-lg">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-brand-purple-dark text-sm font-bold">Códigos de respaldo</h3>
            <p className="text-brand-muted text-xs">Un solo uso para emergencias sin celular</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
            !hasCodes
              ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
              : lowCodes
                ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          }`}
        >
          {displayCount} / {TOTAL_RECOVERY_SLOTS} disponibles
        </span>
      </div>

      {/* Medidor segmentado de 10 códigos */}
      <div
        className="grid grid-cols-10 gap-1.5"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={TOTAL_RECOVERY_SLOTS}
        aria-valuenow={displayCount}
        aria-label="Códigos de respaldo disponibles"
      >
        {Array.from({ length: TOTAL_RECOVERY_SLOTS }, (_, idx) => {
          const active = idx < displayCount;
          return (
            <div
              key={idx}
              className={`h-2 rounded-full transition-all duration-300 ${
                active ? slotActiveClass : "bg-brand-purple/10"
              }`}
            />
          );
        })}
      </div>

      <p className="text-brand-purple-dark/75 text-xs leading-relaxed">
        {!hasCodes ? (
          <span className="text-brand-coral-ink font-semibold">
            No tienes códigos activos. Genera un set ahora para no quedar bloqueado si pierdes tu
            teléfono.
          </span>
        ) : lowCodes ? (
          <span className="font-semibold text-amber-800">
            Te quedan pocos códigos ({displayCount}). Regenera un set nuevo de 10 y guárdalo en un
            gestor de contraseñas.
          </span>
        ) : (
          <>
            Guárdalos fuera de este equipo (por ejemplo en 1Password o Bitwarden). Al regenerar se
            invalidan los anteriores.
          </>
        )}
      </p>

      {state?.codes && <RecoveryCodesReveal codes={state.codes} />}

      {state?.error && !state.reauthRequired && (
        <p className="flex items-center gap-1.5 text-sm text-rose-600">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}

      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex items-center gap-1.5 rounded-lg border bg-white px-4 py-2 text-xs font-semibold shadow-2xs transition-colors disabled:opacity-60"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {hasCodes ? "Regenerar códigos de respaldo" : "Generar códigos de respaldo"}
        </button>
      </form>
    </div>
  );
}

export function AdminChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [state, formAction, pending, reauthModal] = useMfaReauthAction<AdminPasswordChangeState>(
    async (prev, formData) => {
      const next = await changeAdminPasswordAction(prev, formData);
      if (next?.success) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
      return next;
    },
  );

  const strength = calculatePasswordStrength(newPassword);
  const meetsLength = newPassword.length >= 10;
  const meetsStrength = strength.score >= 2;
  const meetsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;

  return (
    <form action={formAction} className="space-y-4">
      {reauthModal}

      {state?.success && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3.5 py-2.5 text-xs font-medium text-emerald-900"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{state.success}</span>
        </div>
      )}

      {state?.error && !state.fieldErrors && !state.reauthRequired && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label
          htmlFor="admin-current-password"
          className="text-brand-purple-dark text-xs font-semibold"
        >
          Contraseña actual
        </Label>
        <PasswordInput
          id="admin-current-password"
          name="currentPassword"
          autoComplete="current-password"
          required
          disabled={pending}
          value={currentPassword}
          onValueChange={setCurrentPassword}
          aria-invalid={Boolean(state?.fieldErrors?.currentPassword)}
        />
        {state?.fieldErrors?.currentPassword?.[0] && (
          <p className="text-xs text-rose-600">{state.fieldErrors.currentPassword[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="admin-new-password"
          className="text-brand-purple-dark text-xs font-semibold"
        >
          Nueva contraseña
        </Label>
        <PasswordInput
          id="admin-new-password"
          name="newPassword"
          autoComplete="new-password"
          required
          showStrength
          disabled={pending}
          value={newPassword}
          onValueChange={setNewPassword}
          aria-invalid={Boolean(state?.fieldErrors?.newPassword)}
        />
        {state?.fieldErrors?.newPassword?.[0] && (
          <p className="text-xs text-rose-600">{state.fieldErrors.newPassword[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="admin-confirm-password"
          className="text-brand-purple-dark text-xs font-semibold"
        >
          Confirmar nueva contraseña
        </Label>
        <PasswordInput
          id="admin-confirm-password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          disabled={pending}
          value={confirmPassword}
          onValueChange={setConfirmPassword}
          aria-invalid={Boolean(state?.fieldErrors?.confirmPassword)}
        />
        {state?.fieldErrors?.confirmPassword?.[0] && (
          <p className="text-xs text-rose-600">{state.fieldErrors.confirmPassword[0]}</p>
        )}
      </div>

      {/* Checklist interactivo de política administrativa */}
      <ul className="bg-brand-cream/60 border-brand-purple/10 grid grid-cols-1 gap-1.5 rounded-xl border p-3 text-xs sm:grid-cols-3">
        <RuleCheck ok={meetsLength} label="10+ caracteres" />
        <RuleCheck ok={meetsStrength} label="Fuerza razonable+" />
        <RuleCheck ok={meetsMatch} label="Confirmación igual" />
      </ul>

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-brand-muted text-[11px] leading-snug">
          Verificamos filtraciones públicas (HIBP) y cerramos tus otras sesiones activas.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="bg-gradient-brand inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold text-white shadow-xs transition-all hover:brightness-105 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LockKeyhole className="h-3.5 w-3.5" />
          )}
          {pending ? "Actualizando…" : "Actualizar contraseña"}
        </button>
      </div>
    </form>
  );
}

function RuleCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li
      className={`flex items-center gap-1.5 transition-colors duration-200 ${
        ok ? "font-semibold text-emerald-700" : "text-brand-muted"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
      ) : (
        <Circle className="h-3.5 w-3.5 shrink-0 opacity-50" />
      )}
      <span>{label}</span>
    </li>
  );
}
