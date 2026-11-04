"use client";

/*
 * Panel interactivo transversal de CRM Operativo (`Fase 10 · S22`).
 *
 * Se integra en:
 *   - `/admin/clientes/[id]` (Contacto 360)
 *   - `/admin/pedidos/[number]` (Detalle operativo de pedido)
 *   - `/admin/soporte/[id]` (Hilo de ticket posventa)
 *
 * Respeta estrictamente capacidades RBAC:
 *   - `canManageTasks`: crear tareas y marcar estado en 1 clic.
 *   - `canViewActivities` / `canManageActivities`: ver y registrar notas, llamadas,
 *     seguimientos por WhatsApp y correos manuales sobre el `Contact`.
 */

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  Mail,
  MessageSquarePlus,
  NotebookPen,
  PhoneCall,
  PlayCircle,
  Plus,
  RotateCcw,
} from "lucide-react";
import { AdminBadge, AdminCard } from "@/components/admin-page";
import { WhatsAppIcon } from "@/components/icons/brand";
import {
  CONTACT_ACTIVITY_LABELS,
  CONTACT_ACTIVITY_TONES,
  CRM_TASK_PRIORITIES,
  CRM_TASK_PRIORITY_LABELS,
  CRM_TASK_PRIORITY_TONES,
  CRM_TASK_STATUS_LABELS,
  MANUAL_ACTIVITY_KINDS,
  type ContactActivityKind,
  type CrmTaskPriority,
  type CrmTaskStatus,
  type ManualActivityKind,
} from "@/features/crm/constants";
import {
  createContactActivityAction,
  createCrmTaskAction,
  updateCrmTaskStatusAction,
  type CrmActionState,
} from "@/features/crm/actions";

export type CrmActivityItemProps = {
  id: string;
  kind: ContactActivityKind;
  body: string;
  createdAt: Date | string;
  authorEmail: string | null;
  orderNumber: string | null;
  supportTicketId: string | null;
};

export type CrmTaskItemProps = {
  id: string;
  title: string;
  description: string | null;
  status: CrmTaskStatus;
  priority: CrmTaskPriority;
  dueAt: Date | string | null;
  isOverdue: boolean;
  completedAt: Date | string | null;
  ownerAdminId: string | null;
  ownerAdminEmail: string | null;
  orderNumber: string | null;
  supportTicketId: string | null;
};

export type CrmAssignableAdminOption = {
  id: string;
  email: string;
  role: string;
};

type Props = {
  title?: string;
  subtitle?: string;
  contactId?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  supportTicketId?: string | null;
  currentAdminId: string;
  canManageTasks: boolean;
  canViewActivities: boolean;
  canManageActivities: boolean;
  tasks: CrmTaskItemProps[];
  activities: CrmActivityItemProps[];
  assignableAdmins: CrmAssignableAdminOption[];
  compact?: boolean;
};

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const shortDateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function toDate(val: Date | string | null | undefined): Date | null {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ActivityKindIcon({ kind }: { kind: ContactActivityKind }) {
  switch (kind) {
    case "WHATSAPP":
      return <WhatsAppIcon className="h-3.5 w-3.5 text-emerald-700" />;
    case "CALL":
      return <PhoneCall className="h-3.5 w-3.5 text-blue-700" />;
    case "EMAIL":
      return <Mail className="h-3.5 w-3.5 text-amber-700" />;
    default:
      return <NotebookPen className="text-brand-purple h-3.5 w-3.5" />;
  }
}

export function CrmWorkspacePanel({
  title = "Seguimiento CRM y tareas operativas",
  subtitle = "Coordina pendientes con fecha límite y deja contexto claro para todo el equipo.",
  contactId = null,
  orderId = null,
  orderNumber = null,
  supportTicketId = null,
  currentAdminId,
  canManageTasks,
  canViewActivities,
  canManageActivities,
  tasks,
  activities,
  assignableAdmins,
  compact = false,
}: Props) {
  const showActivitiesTab = canViewActivities && Boolean(contactId);
  const [activeTab, setActiveTab] = useState<"tasks" | "activities">("tasks");
  const [showTaskComposer, setShowTaskComposer] = useState(false);
  const [selectedKind, setSelectedKind] = useState<ManualActivityKind>("NOTE");

  const taskFormRef = useRef<HTMLFormElement>(null);
  const activityFormRef = useRef<HTMLFormElement>(null);

  const [taskState, submitTask, taskPending] = useActionState<CrmActionState, FormData>(
    async (prev, fd) => {
      const res = await createCrmTaskAction(prev, fd);
      if (res?.success) {
        taskFormRef.current?.reset();
        setShowTaskComposer(false);
      }
      return res;
    },
    null,
  );
  const [activityState, submitActivity, activityPending] = useActionState<CrmActionState, FormData>(
    async (prev, fd) => {
      const res = await createContactActivityAction(prev, fd);
      if (res?.success) {
        activityFormRef.current?.reset();
      }
      return res;
    },
    null,
  );

  const activeTasksCount = tasks.filter(
    (t) => t.status === "OPEN" || t.status === "IN_PROGRESS",
  ).length;

  return (
    <AdminCard className={compact ? "p-4" : "p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-brand-purple-dark font-display flex items-center gap-2 text-base font-bold">
            <ClipboardList className="text-brand-purple h-4 w-4" />
            {title}
          </h2>
          {!compact && <p className="text-brand-muted mt-0.5 text-xs">{subtitle}</p>}
        </div>

        {showActivitiesTab && (
          <div
            role="tablist"
            aria-label="Secciones de seguimiento CRM"
            className="border-brand-purple/15 inline-flex rounded-xl border bg-[#FFF8F0]/70 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "tasks"}
              onClick={() => setActiveTab("tasks")}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "tasks"
                  ? "bg-brand-purple text-white shadow-sm"
                  : "text-brand-purple-dark hover:bg-brand-purple/10"
              }`}
            >
              Tareas
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  activeTab === "tasks"
                    ? "bg-white/20 text-white"
                    : "bg-brand-purple/15 text-brand-purple-dark"
                }`}
              >
                {activeTasksCount}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "activities"}
              onClick={() => setActiveTab("activities")}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "activities"
                  ? "bg-brand-purple text-white shadow-sm"
                  : "text-brand-purple-dark hover:bg-brand-purple/10"
              }`}
            >
              Bitácora
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  activeTab === "activities"
                    ? "bg-white/20 text-white"
                    : "bg-brand-purple/15 text-brand-purple-dark"
                }`}
              >
                {activities.length}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* SECCIÓN 1: TAREAS */}
      {(activeTab === "tasks" || !showActivitiesTab) && (
        <div className="mt-4 space-y-3">
          {canManageTasks && (
            <div>
              {!showTaskComposer ? (
                <button
                  type="button"
                  onClick={() => setShowTaskComposer(true)}
                  className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-11 items-center gap-1.5 rounded-lg border bg-[#FFF8F0]/60 px-3.5 py-2 text-xs font-semibold transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Nueva tarea de seguimiento
                </button>
              ) : (
                <form
                  ref={taskFormRef}
                  action={submitTask}
                  className="border-brand-purple/20 space-y-3 rounded-xl border bg-[#FFF8F0]/60 p-3.5"
                >
                  {contactId && <input type="hidden" name="contactId" value={contactId} />}
                  {orderId && <input type="hidden" name="orderId" value={orderId} />}
                  {orderNumber && <input type="hidden" name="orderNumber" value={orderNumber} />}
                  {supportTicketId && (
                    <input type="hidden" name="supportTicketId" value={supportTicketId} />
                  )}

                  <div>
                    <label
                      htmlFor={`crm-task-title-${orderId ?? supportTicketId ?? contactId ?? "main"}`}
                      className="text-brand-purple-dark block text-xs font-semibold"
                    >
                      ¿Qué hay que hacer?
                    </label>
                    <input
                      id={`crm-task-title-${orderId ?? supportTicketId ?? contactId ?? "main"}`}
                      name="title"
                      type="text"
                      required
                      minLength={3}
                      maxLength={200}
                      placeholder="Ej. Confirmar foto en alta resolución por WhatsApp"
                      className="border-brand-purple/20 text-brand-purple-dark focus:border-brand-purple mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <div>
                      <label className="text-brand-muted block text-[11px] font-semibold uppercase">
                        Prioridad
                      </label>
                      <select
                        name="priority"
                        defaultValue="NORMAL"
                        className="border-brand-purple/20 text-brand-purple-dark mt-1 min-h-10 w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium"
                      >
                        {CRM_TASK_PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {CRM_TASK_PRIORITY_LABELS[p]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-brand-muted block text-[11px] font-semibold uppercase">
                        Fecha límite
                      </label>
                      <input
                        name="dueAt"
                        type="date"
                        className="border-brand-purple/20 text-brand-purple-dark mt-1 min-h-10 w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium"
                      />
                    </div>

                    <div>
                      <label className="text-brand-muted block text-[11px] font-semibold uppercase">
                        Responsable
                      </label>
                      <select
                        name="ownerAdminId"
                        defaultValue={currentAdminId}
                        className="border-brand-purple/20 text-brand-purple-dark mt-1 min-h-10 w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium"
                      >
                        <option value="UNASSIGNED">Sin asignar</option>
                        {assignableAdmins.map((adm) => (
                          <option key={adm.id} value={adm.id}>
                            {adm.id === currentAdminId ? `Yo (${adm.email})` : adm.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-brand-muted block text-[11px] font-semibold uppercase">
                      Contexto opcional
                    </label>
                    <textarea
                      name="description"
                      rows={2}
                      maxLength={2000}
                      placeholder="Detalles clave para quien tome esta tarea..."
                      className="border-brand-purple/20 text-brand-purple-dark focus:border-brand-purple mt-1 w-full rounded-lg border bg-white px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>

                  {taskState?.error && (
                    <p role="alert" className="text-xs font-semibold text-rose-700">
                      {taskState.error}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="submit"
                      disabled={taskPending}
                      className="bg-brand-purple inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
                    >
                      {taskPending ? "Guardando..." : "Guardar tarea"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTaskComposer(false)}
                      className="text-brand-muted hover:text-brand-purple-dark min-h-10 px-3 py-2 text-xs font-semibold"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
              {taskState?.success && !showTaskComposer && (
                <p role="status" className="mt-2 text-xs font-medium text-emerald-700">
                  {taskState.success}
                </p>
              )}
            </div>
          )}

          {tasks.length === 0 ? (
            <div className="border-brand-purple/10 rounded-xl border border-dashed bg-[#FFF8F0]/40 p-4 text-center">
              <p className="text-brand-muted text-xs">
                No hay tareas registradas aquí todavía. Crea una si necesitas recordar un
                seguimiento en la Bandeja Hoy.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  orderNumber={orderNumber}
                  canManageTasks={canManageTasks}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* SECCIÓN 2: BITÁCORA DE ACTIVIDADES */}
      {showActivitiesTab && activeTab === "activities" && contactId && (
        <div className="mt-4 space-y-3">
          {canManageActivities && (
            <form
              ref={activityFormRef}
              action={submitActivity}
              className="border-brand-purple/20 space-y-2.5 rounded-xl border bg-[#FFF8F0]/60 p-3.5"
            >
              <input type="hidden" name="contactId" value={contactId} />
              {orderId && <input type="hidden" name="orderId" value={orderId} />}
              {orderNumber && <input type="hidden" name="orderNumber" value={orderNumber} />}
              {supportTicketId && (
                <input type="hidden" name="supportTicketId" value={supportTicketId} />
              )}
              <input type="hidden" name="kind" value={selectedKind} />

              <div className="flex flex-wrap items-center gap-1.5">
                {MANUAL_ACTIVITY_KINDS.map((kind) => {
                  const selected = selectedKind === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setSelectedKind(kind)}
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        selected
                          ? "border-brand-purple bg-brand-purple text-white"
                          : "border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/10 bg-white"
                      }`}
                    >
                      {CONTACT_ACTIVITY_LABELS[kind]}
                    </button>
                  );
                })}
              </div>

              <textarea
                name="body"
                required
                minLength={2}
                maxLength={4000}
                rows={2}
                placeholder={
                  selectedKind === "WHATSAPP"
                    ? "Resume el acuerdo o respuesta conversada por WhatsApp..."
                    : selectedKind === "CALL"
                      ? "Resume los puntos clave de la llamada..."
                      : "Escribe una nota interna para el historial 360 del cliente..."
                }
                className="border-brand-purple/20 text-brand-purple-dark focus:border-brand-purple w-full rounded-lg border bg-white px-3 py-2 text-xs focus:outline-none"
              />

              {activityState?.error && (
                <p role="alert" className="text-xs font-semibold text-rose-700">
                  {activityState.error}
                </p>
              )}
              {activityState?.success && (
                <p role="status" className="text-xs font-medium text-emerald-700">
                  {activityState.success}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={activityPending}
                  className="bg-brand-purple inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  {activityPending ? "Registrando..." : "Registrar en bitácora"}
                </button>
              </div>
            </form>
          )}

          {activities.length === 0 ? (
            <div className="border-brand-purple/10 rounded-xl border border-dashed bg-[#FFF8F0]/40 p-4 text-center">
              <p className="text-brand-muted text-xs">
                Aún no hay notas ni seguimientos manuales registrados para este contacto.
              </p>
            </div>
          ) : (
            <ol className="space-y-2">
              {activities.map((act) => {
                const createdAt = toDate(act.createdAt);
                return (
                  <li
                    key={act.id}
                    className="border-brand-purple/10 rounded-xl border bg-white p-3 text-xs shadow-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1">
                          <ActivityKindIcon kind={act.kind} />
                          <AdminBadge tone={CONTACT_ACTIVITY_TONES[act.kind]}>
                            {CONTACT_ACTIVITY_LABELS[act.kind]}
                          </AdminBadge>
                        </span>
                        {act.authorEmail && (
                          <span className="text-brand-purple-dark font-medium">
                            {act.authorEmail}
                          </span>
                        )}
                        {act.orderNumber && (
                          <Link
                            href={`/admin/pedidos/${encodeURIComponent(act.orderNumber)}`}
                            className="text-brand-purple font-mono underline underline-offset-2"
                          >
                            {act.orderNumber}
                          </Link>
                        )}
                      </div>
                      {createdAt && (
                        <span className="text-brand-muted text-[11px]">
                          {dateFmt.format(createdAt)}
                        </span>
                      )}
                    </div>
                    <p className="text-brand-purple-dark/90 mt-1.5 whitespace-pre-wrap">
                      {act.body}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </AdminCard>
  );
}

function TaskRow({
  task,
  orderNumber,
  canManageTasks,
}: {
  task: CrmTaskItemProps;
  orderNumber: string | null;
  canManageTasks: boolean;
}) {
  const [, submitStatus, isPending] = useActionState<CrmActionState, FormData>(
    updateCrmTaskStatusAction,
    null,
  );

  const dueDate = toDate(task.dueAt);
  const isDone = task.status === "DONE" || task.status === "CANCELLED";
  const isOverdue = !isDone && task.isOverdue;

  return (
    <li
      className={`rounded-xl border p-3 transition-colors ${
        isDone
          ? "border-slate-200 bg-slate-50/70 opacity-80"
          : isOverdue
            ? "border-rose-300 bg-rose-50/40"
            : "border-brand-purple/15 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {isDone ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : task.status === "IN_PROGRESS" ? (
              <PlayCircle className="h-4 w-4 shrink-0 text-blue-600" />
            ) : (
              <Circle className="text-brand-purple h-4 w-4 shrink-0" />
            )}
            <span
              className={`text-sm font-semibold ${
                isDone ? "text-slate-500 line-through" : "text-brand-purple-dark"
              }`}
            >
              {task.title}
            </span>
            <AdminBadge tone={CRM_TASK_PRIORITY_TONES[task.priority]}>
              {CRM_TASK_PRIORITY_LABELS[task.priority]}
            </AdminBadge>
            <AdminBadge
              tone={isDone ? "emerald" : task.status === "IN_PROGRESS" ? "blue" : "amber"}
            >
              {CRM_TASK_STATUS_LABELS[task.status]}
            </AdminBadge>
          </div>

          {task.description && (
            <p className="text-brand-purple-dark/80 mt-1 text-xs whitespace-pre-wrap">
              {task.description}
            </p>
          )}

          <div className="text-brand-muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            {dueDate && (
              <span
                className={`inline-flex items-center gap-1 font-medium ${
                  isOverdue ? "font-semibold text-rose-700" : ""
                }`}
              >
                {isOverdue ? (
                  <Clock className="h-3 w-3 text-rose-600" />
                ) : (
                  <CalendarClock className="h-3 w-3" />
                )}
                {isOverdue
                  ? `Vencida (${shortDateFmt.format(dueDate)})`
                  : `Vence ${shortDateFmt.format(dueDate)}`}
              </span>
            )}
            <span>
              Responsable:{" "}
              <strong className="text-brand-purple-dark font-medium">
                {task.ownerAdminEmail ?? "Sin asignar"}
              </strong>
            </span>
            {task.orderNumber && (
              <Link
                href={`/admin/pedidos/${encodeURIComponent(task.orderNumber)}`}
                className="text-brand-purple font-mono underline underline-offset-2"
              >
                {task.orderNumber}
              </Link>
            )}
          </div>
        </div>

        {canManageTasks && (
          <div className="flex flex-wrap items-center gap-1.5">
            {!isDone && task.status === "OPEN" && (
              <form action={submitStatus}>
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="status" value="IN_PROGRESS" />
                {orderNumber && <input type="hidden" name="orderNumber" value={orderNumber} />}
                <button
                  type="submit"
                  disabled={isPending}
                  className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-9 items-center gap-1 rounded-lg border bg-white px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                >
                  En curso
                </button>
              </form>
            )}

            {!isDone ? (
              <form action={submitStatus}>
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="status" value="DONE" />
                {orderNumber && <input type="hidden" name="orderNumber" value={orderNumber} />}
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-emerald-600/30 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Completar
                </button>
              </form>
            ) : (
              <form action={submitStatus}>
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="status" value="OPEN" />
                {orderNumber && <input type="hidden" name="orderNumber" value={orderNumber} />}
                <button
                  type="submit"
                  disabled={isPending}
                  className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-9 items-center gap-1 rounded-lg border bg-white px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reabrir
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
